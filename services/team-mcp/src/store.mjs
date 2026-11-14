import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const secret = () => crypto.randomBytes(32).toString('base64url');
export class TeamError extends Error { constructor(code, message) { super(message); this.code = code; } }
const deny = (code, message) => { throw new TeamError(code, message); };
export const slug = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value);
export function resourcePath(value) {
  const clean = value.replace(/^\.\//, '').replace(/\/$/, '');
  if (!clean || clean.length > 240 || /[\\:*?\x00-\x1f]/.test(clean) || clean.startsWith('/') || clean.split('/').some((x) => !x || x === '.' || x === '..')) deny('INVALID_PATH', 'Use a relative file or directory path, without wildcards or ..');
  return clean;
}
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
export function openStore(filename, now = Date.now) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,name TEXT NOT NULL,key_hash TEXT UNIQUE NOT NULL,projects TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,key_expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY,project TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT,subject TEXT NOT NULL,body TEXT NOT NULL,request_key TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(project,sender,request_key));
    CREATE INDEX IF NOT EXISTS messages_project ON messages(project,seq);
    CREATE TABLE IF NOT EXISTS cursors(project TEXT NOT NULL,member TEXT NOT NULL,seq INTEGER NOT NULL,PRIMARY KEY(project,member));
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,project TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,owner TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL,revision INTEGER NOT NULL,lease_until INTEGER NOT NULL,updated INTEGER NOT NULL,commit_sha TEXT,paths_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project,updated);
    CREATE TABLE IF NOT EXISTS leases(project TEXT NOT NULL,path TEXT NOT NULL,task TEXT NOT NULL,owner TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(project,path));
    CREATE TABLE IF NOT EXISTS boards(project TEXT PRIMARY KEY,summary TEXT NOT NULL,revision INTEGER NOT NULL,actor TEXT NOT NULL,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,project TEXT NOT NULL,actor TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_records(kind TEXT NOT NULL,key_hash TEXT NOT NULL,data TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(kind,key_hash));`);
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (err) { db.exec('ROLLBACK'); throw err; } };
  const member = (id) => { const m = db.prepare('SELECT * FROM members WHERE id=? AND disabled=0 AND key_expires>?').get(id, now()); return m ? { id: m.id, name: m.name, projects: JSON.parse(m.projects), keyExpires: m.key_expires } : null; };
  const access = (actor, project) => { const m = member(actor); if (!m || !m.projects.includes(project)) deny('FORBIDDEN', 'Project not available to this identity'); return m; };
  const event = (project, actor, type, data) => db.prepare('INSERT INTO events(project,actor,type,data,created) VALUES(?,?,?,?,?)').run(project, actor, type, JSON.stringify(data), now());
  // Must run inside a transaction. recipient undefined = project broadcast.
  const notify = (project, actor, recipient, subject, body, requestKey) => {
    const r = db.prepare('INSERT OR IGNORE INTO messages(project,sender,recipient,subject,body,request_key,created) VALUES(?,?,?,?,?,?,?)').run(project, actor, recipient || null, subject.slice(0, 200), body.slice(0, 12000), requestKey, now());
    if (r.changes) event(project, actor, 'message_sent', { messageSeq: Number(r.lastInsertRowid), recipient: recipient || 'project' });
  };
  const taskView =({ paths_json, ...task }) => ({ ...task, requestedResources: JSON.parse(paths_json), resources: db.prepare('SELECT path,expires FROM leases WHERE task=? AND expires>?').all(task.id, now()).map((r) => ({ ...r })), leaseExpired: ['in_progress', 'blocked'].includes(task.status) && task.lease_until <= now() });
  const store = {
    db, now, tx, member, access, close: () => db.close(),
    addMember(id, name, projects) {
      if (!slug(id) || !name?.trim() || !projects.length || !projects.every(slug)) deny('INVALID_MEMBER', 'Use a member id, display name and project ids');
      if (db.prepare('SELECT id FROM members WHERE id=?').get(id)) deny('EXISTS', 'Member already exists; rotate its key explicitly');
      const key = secret(); db.prepare('INSERT INTO members(id,name,key_hash,projects,key_expires) VALUES(?,?,?,?,?)').run(id, name.trim().slice(0, 100), digest(key), JSON.stringify([...new Set(projects)]), now() + 90 * 86400_000); return key;
    },
    rotateMember(id) {
      if (!db.prepare('SELECT id FROM members WHERE id=? AND disabled=0').get(id)) deny('NOT_FOUND', 'Member not found');
      const key = secret(); db.prepare('UPDATE members SET key_hash=?,key_expires=? WHERE id=?').run(digest(key), now() + 90 * 86400_000, id);
      // OAuth grants bind to the current key hash; a key rotation invalidates them too.
      return key;
    },
    revokeMember(id) { tx(() => { db.prepare('UPDATE members SET disabled=1 WHERE id=?').run(id); db.prepare('DELETE FROM leases WHERE owner=?').run(id); }); },
    authenticate(key) { if (typeof key !== 'string' || key.length < 30 || key.length > 300) return null; const row = db.prepare('SELECT id,key_hash FROM members WHERE key_hash=? AND disabled=0 AND key_expires>?').get(digest(key), now()); return row ? { ...member(row.id), keyHash: row.key_hash } : null; },
    currentKeyHash(id) { return db.prepare('SELECT key_hash FROM members WHERE id=? AND disabled=0 AND key_expires>?').get(id, now())?.key_hash; },
    records: {
      get(kind, key) { const r = db.prepare('SELECT data FROM auth_records WHERE kind=? AND key_hash=? AND expires>?').get(kind, digest(key), now()); return r ? JSON.parse(r.data) : null; },
      set(kind, key, data, expires) { db.prepare('INSERT OR REPLACE INTO auth_records VALUES(?,?,?,?)').run(kind, digest(key), JSON.stringify(data), expires); },
      delete(kind, key) { db.prepare('DELETE FROM auth_records WHERE kind=? AND key_hash=?').run(kind, digest(key)); },
      prune() { db.prepare('DELETE FROM auth_records WHERE expires<=?').run(now()); },
    },
    sendMessage(actor, { project, recipient, subject, body, requestKey }) {
      access(actor, project);
      if (recipient) access(recipient, project);
      return tx(() => {
        const existing = db.prepare('SELECT * FROM messages WHERE project=? AND sender=? AND request_key=?').get(project, actor, requestKey);
        if (existing) {
          if (existing.recipient !== (recipient || null) || existing.subject !== subject || existing.body !== body) deny('IDEMPOTENCY_CONFLICT', 'This request key was already used for a different message');
          return { ...existing, duplicate: true };
        }
        const r = db.prepare('INSERT INTO messages(project,sender,recipient,subject,body,request_key,created) VALUES(?,?,?,?,?,?,?)').run(project, actor, recipient || null, subject, body, requestKey, now());
        event(project, actor, 'message_sent', { messageSeq: Number(r.lastInsertRowid), recipient: recipient || 'project' });
        return { ...db.prepare('SELECT * FROM messages WHERE seq=?').get(r.lastInsertRowid), duplicate: false };
      });
    },
    readMessages(actor, { project, after, limit = 50 }) {
      access(actor, project);
      const cursor = after ?? db.prepare('SELECT seq FROM cursors WHERE project=? AND member=?').get(project, actor)?.seq ?? 0;
      const rows = db.prepare('SELECT * FROM messages WHERE project=? AND seq>? AND (recipient IS NULL OR recipient=? OR sender=?) ORDER BY seq LIMIT ?').all(project, cursor, actor, actor, limit + 1);
      const page = rows.slice(0, limit).map((r) => ({ ...r }));
      return { messages: page, nextCursor: page.at(-1)?.seq ?? cursor, hasMore: rows.length > limit };
    },
    ack(actor, { project, through }) {
      access(actor, project);
      if (through !== 0 && !db.prepare('SELECT seq FROM messages WHERE project=? AND seq=? AND (recipient IS NULL OR recipient=? OR sender=?)').get(project, through, actor, actor)) deny('INVALID_CURSOR', 'Acknowledge only a visible message cursor');
      db.prepare('INSERT INTO cursors VALUES(?,?,?) ON CONFLICT(project,member) DO UPDATE SET seq=MAX(cursors.seq,excluded.seq)').run(project, actor, through);
      return { acknowledged: through };
    },
    claim(actor, { project, taskId, title, description = '', resources = [], leaseMinutes = 30 }) {
      access(actor, project); const paths = [...new Set(resources.map(resourcePath))];
      return tx(() => {
        const old = taskId ? db.prepare('SELECT * FROM tasks WHERE id=? AND project=?').get(taskId, project) : null;
        if (taskId && !old) deny('NOT_FOUND', 'Task not found in this project');
        if (old && ['done', 'released'].includes(old.status)) deny('CLOSED_TASK', 'Create a new task for closed work');
        if (old && old.owner !== actor && member(old.owner) && old.lease_until > now()) deny('TASK_BUSY', 'Another member owns this task until its lease expires');
        const id = old?.id || crypto.randomUUID();
        const wanted = paths.length ? paths : old ? JSON.parse(old.paths_json) : [];
        const locks = db.prepare('SELECT * FROM leases WHERE project=? AND expires>? AND task<>?').all(project, now(), id);
        const conflict = locks.find((lock) => wanted.some((file) => overlaps(file, lock.path)));
        if (conflict) deny('FILE_BUSY', `${conflict.path} is reserved by ${conflict.owner} for task ${conflict.task}`);
        if (!old && !title?.trim()) deny('TITLE_REQUIRED', 'Give a title when creating a task');
        const expires = now() + leaseMinutes * 60_000;
        db.prepare('DELETE FROM leases WHERE task=?').run(id);
        for (const file of wanted) db.prepare('INSERT OR REPLACE INTO leases VALUES(?,?,?,?,?)').run(project, file, id, actor, expires);
        db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, project, old?.title || title, old?.description || description, actor, 'in_progress', old?.note || '', (old?.revision || 0) + 1, expires, now(), old?.commit_sha || null, JSON.stringify(wanted));
        event(project, actor, 'task_claimed', { taskId: id, resources: wanted });
        return taskView(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
      });
    },
    progress(actor, { project, taskId, expectedRevision, status = 'in_progress', note, commitSha, leaseMinutes = 30, blockedOn }) {
      access(actor, project);
      if (blockedOn) access(blockedOn, project);
      return tx(() => {
        const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project=?').get(taskId, project);
        if (!task || task.owner !== actor) deny('FORBIDDEN', 'Only the task owner can update it');
        if (task.revision !== expectedRevision) deny('REVISION_CONFLICT', 'Read the latest task revision before updating');
        if (task.status === 'done' || task.status === 'released') deny('CLOSED_TASK', 'Task is already closed');
        if (task.status === 'handed_off' && status !== 'released') deny('NOT_ACCEPTED', 'Claim the handed-off task with its taskId before updating it');
        if (status !== 'released' && task.lease_until <= now()) deny('LEASE_EXPIRED', 'Claim the task again before updating');
        // A blocker must reach the others' inboxes, not only the task list: one message per blocked report.
        if (status === 'blocked') notify(project, actor, blockedOn, `Este: ${task.title}`, note, `blocked:${taskId}:${task.revision}`);
        const closed = status === 'done' || status === 'released';
        const expiry = closed ? now() : now() + leaseMinutes * 60_000;
        db.prepare('UPDATE tasks SET status=?,note=?,revision=revision+1,lease_until=?,updated=?,commit_sha=? WHERE id=?').run(status, note, expiry, now(), commitSha || task.commit_sha, taskId);
        if (closed) db.prepare('DELETE FROM leases WHERE task=?').run(taskId);
        else db.prepare('UPDATE leases SET expires=? WHERE task=?').run(expiry, taskId);
        event(project, actor, 'task_updated', { taskId, status, commitSha: commitSha || null });
        return taskView(db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId));
      });
    },
    // Hand a finished part to another member: ownership moves, file reservations are freed and the
    // recipient gets a direct message in the same transaction. The recipient accepts with claim(taskId).
    handoff(actor, { project, taskId, expectedRevision, to, note, commitSha, holdMinutes = 120 }) {
      access(actor, project); access(to, project);
      if (to === actor) deny('INVALID_RECIPIENT', 'Hand off to another member');
      return tx(() => {
        const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project=?').get(taskId, project);
        if (!task || task.owner !== actor) deny('FORBIDDEN', 'Only the task owner can hand it off');
        if (task.revision !== expectedRevision) deny('REVISION_CONFLICT', 'Read the latest task revision before updating');
        if (['done', 'released', 'handed_off'].includes(task.status)) deny('CLOSED_TASK', 'Task is closed or already handed off');
        const sha = commitSha || task.commit_sha;
        db.prepare('UPDATE tasks SET owner=?,status=?,note=?,revision=revision+1,lease_until=?,updated=?,commit_sha=? WHERE id=?').run(to, 'handed_off', note, now() + holdMinutes * 60_000, now(), sha, taskId);
        db.prepare('DELETE FROM leases WHERE task=?').run(taskId);
        event(project, actor, 'task_handed_off', { taskId, from: actor, to, commitSha: sha || null });
        const paths = JSON.parse(task.paths_json);
        notify(project, actor, to, `Luovutus: ${task.title}`, `${note}\n\nTehtävä: ${taskId}\nCommit: ${sha || 'ei commitia, työ ei ole GitHubissa'}${paths.length ? `\nTiedostot: ${paths.join(', ')}` : ''}\nOta vastaan: claim_task taskId=${taskId}`, `handoff:${taskId}:${task.revision}`);
        return taskView(db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId));
      });
    },
    state(actor, { project }) {
      access(actor, project);
      return {
        project, serverTime: now(), board: db.prepare('SELECT * FROM boards WHERE project=?').get(project) || { project, summary: '', revision: 0 },
        tasks: db.prepare('SELECT * FROM tasks WHERE project=? ORDER BY updated DESC LIMIT 100').all(project).map(taskView),
        members: db.prepare('SELECT id,name,projects FROM members WHERE disabled=0 AND key_expires>?').all(now()).filter((m) => JSON.parse(m.projects).includes(project)).map(({ id, name }) => ({ id, name })),
        events: db.prepare("SELECT seq,actor,type,data,created FROM events WHERE project=? AND type<>'message_sent' ORDER BY seq DESC LIMIT 30").all(project).map((r) => ({ ...r, data: JSON.parse(r.data) })),
      };
    },
    updateBoard(actor, { project, expectedRevision, summary }) {
      access(actor, project);
      return tx(() => {
        const old = db.prepare('SELECT revision FROM boards WHERE project=?').get(project)?.revision || 0;
        if (old !== expectedRevision) deny('REVISION_CONFLICT', 'Read the current project summary before replacing it');
        db.prepare('INSERT OR REPLACE INTO boards VALUES(?,?,?,?,?)').run(project, summary, old + 1, actor, now());
        event(project, actor, 'board_updated', { revision: old + 1 });
        return db.prepare('SELECT * FROM boards WHERE project=?').get(project);
      });
    },
  };
  return store;
}
