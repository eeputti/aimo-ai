import crypto from 'node:crypto';
import { validPath } from './dispatch.mjs';

export function createRunnerStore(store, { deny, digest, resourcePath, overlaps }) {
  const { db, now, tx } = store;
  db.exec(`CREATE TABLE IF NOT EXISTS runner_runs(
    id TEXT PRIMARY KEY,project TEXT NOT NULL,task_id TEXT NOT NULL,member TEXT NOT NULL,source TEXT NOT NULL,
    handoff_revision INTEGER NOT NULL,instance TEXT NOT NULL,token_hash TEXT NOT NULL,state TEXT NOT NULL,
    lease_until INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,receipt TEXT,
    UNIQUE(task_id,handoff_revision));
    CREATE INDEX IF NOT EXISTS runner_active ON runner_runs(task_id,state,lease_until);`);
  function checked(actor, args) {
    store.access(actor, args.project);
    const row = db.prepare('SELECT * FROM runner_runs WHERE id=? AND project=? AND member=? AND instance=? AND token_hash=?').get(args.runId, args.project, actor, args.instanceId, digest(args.leaseToken));
    if (!row) deny('RUN_NOT_FOUND', 'Runner token or identity does not match');
    return row;
  }
  function active(row) {
    if (row.state !== 'active' || row.lease_until <= now()) deny('RUN_LEASE_LOST', 'Runner lease expired or was closed');
    const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project=?').get(row.task_id, row.project);
    if (!task || task.owner !== row.member || task.status !== 'in_progress') deny('RUN_LEASE_LOST', 'Task is no longer owned by this runner');
    return task;
  }
  return {
    guard(taskId) {
      const row = db.prepare("SELECT * FROM runner_runs WHERE task_id=? AND state='active'").get(taskId);
      if (!row) return;
      if (row.lease_until > now() && store.member(row.member)) deny('RUNNER_ACTIVE', 'Use runner heartbeat/finish; an interrupted run must be reconciled first');
      db.prepare("UPDATE runner_runs SET state='interrupted',lease_until=0,updated=? WHERE id=?").run(now(), row.id);
      db.prepare('DELETE FROM leases WHERE task=?').run(taskId);
    },
    claim(actor, args) {
      store.access(actor, args.project);
      return tx(() => {
        const previous = db.prepare('SELECT * FROM runner_runs WHERE task_id=? AND handoff_revision=? AND member=? AND instance=? AND token_hash=?').get(args.taskId, args.expectedRevision, actor, args.instanceId, digest(args.claimKey));
        if (previous) { active(previous); return { runId: previous.id, leaseToken: args.claimKey, leaseUntil: previous.lease_until, sourceMember: previous.source, task: store.state(actor, { project: args.project }).tasks.find((t) => t.id === args.taskId) }; }
        if (db.prepare("SELECT id FROM runner_runs WHERE project=? AND member=? AND state='active' AND lease_until>?").get(args.project, actor, now())) deny('MEMBER_BUSY', 'This member already has an active CLI run');
        if (db.prepare('SELECT COUNT(*) AS n FROM runner_runs WHERE project=? AND member=? AND created>?').get(args.project, actor, now() - 3600000).n >= 12) deny('RUN_RATE_LIMIT', 'At most 12 CLI runs per hour per member');
        const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project=?').get(args.taskId, args.project);
        if (!task || task.owner !== actor || task.status !== 'handed_off' || task.lease_until <= now()) deny('NOT_ASSIGNED', 'A fresh handoff to this member is required');
        if (task.revision !== args.expectedRevision) deny('REVISION_CONFLICT', 'Read the latest handoff before claiming');
        this.guard(task.id);
        const event = db.prepare("SELECT actor,data FROM events WHERE project=? AND type='task_handed_off' AND json_extract(data,'$.taskId')=? ORDER BY seq DESC LIMIT 1").get(args.project, task.id);
        const source = event?.actor;
        if (!source || !args.allowedSenders.includes(source) || JSON.parse(event.data).to !== actor) deny('SENDER_NOT_ALLOWED', 'Handoff sender is not allowed on this machine');
        store.access(source, args.project);
        const paths = JSON.parse(task.paths_json).map(resourcePath);
        const roots = args.allowedPaths.map(resourcePath);
        if (!paths.length || [...paths, ...roots].some((p) => !validPath(p)) || paths.some((p) => !roots.some((root) => p === root || p.startsWith(root + '/')))) deny('PATH_NOT_ALLOWED', 'Every task path must be inside a locally allowed path');
        const locks = db.prepare('SELECT * FROM leases WHERE project=? AND expires>? AND task<>?').all(args.project, now(), task.id);
        if (locks.some((l) => paths.some((p) => overlaps(p, l.path)))) deny('FILE_BUSY', 'A task path is reserved by another task');
        const id = crypto.randomUUID(); const token = args.claimKey; const until = now() + 120000;
        db.prepare('INSERT INTO runner_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, args.project, task.id, actor, source, task.revision, args.instanceId, digest(token), 'active', until, now(), now(), null);
        db.prepare('DELETE FROM leases WHERE task=?').run(task.id);
        for (const p of paths) db.prepare('INSERT INTO leases VALUES(?,?,?,?,?)').run(args.project, p, task.id, actor, until);
        db.prepare("UPDATE tasks SET status='in_progress',revision=revision+1,lease_until=?,updated=? WHERE id=?").run(until, now(), task.id);
        db.prepare('INSERT INTO events(project,actor,type,data,created) VALUES(?,?,?,?,?)').run(args.project, actor, 'runner_started', JSON.stringify({ taskId: task.id, runId: id }), now());
        return { runId: id, leaseToken: token, leaseUntil: until, sourceMember: source, task: store.state(actor, { project: args.project }).tasks.find((t) => t.id === task.id) };
      });
    },
    heartbeat(actor, args) {
      return tx(() => {
        const row = checked(actor, args); active(row);
        const until = now() + 120000;
        db.prepare('UPDATE runner_runs SET lease_until=?,updated=? WHERE id=?').run(until, now(), row.id);
        db.prepare('UPDATE tasks SET lease_until=?,updated=? WHERE id=?').run(until, now(), row.task_id);
        db.prepare('UPDATE leases SET expires=? WHERE task=?').run(until, row.task_id);
        return { runId: row.id, leaseUntil: until };
      });
    },
    finish(actor, args) {
      return tx(() => {
        const row = checked(actor, args);
        const fingerprint = digest(JSON.stringify({ outcome: args.outcome, note: args.note, commitSha: args.commitSha || null }));
        if (row.state !== 'active') {
          const receipt = JSON.parse(row.receipt || 'null');
          if (receipt?.fingerprint !== fingerprint) deny('FINISH_CONFLICT', 'This run was already finished with different content');
          return receipt.result;
        }
        if (args.outcome !== 'interrupted') active(row);
        const task = db.prepare('SELECT * FROM tasks WHERE id=? AND owner=?').get(row.task_id, actor);
        if (!task) deny('RUN_LEASE_LOST', 'Task owner changed');
        const sourceAvailable = store.member(row.source)?.projects.includes(row.project);
        const note = `CLI-ajo: ${args.outcome}\n${args.note}`;
        const status = sourceAvailable ? 'handed_off' : 'blocked';
        db.prepare('DELETE FROM leases WHERE task=?').run(task.id);
        db.prepare('UPDATE tasks SET owner=?,status=?,note=?,revision=revision+1,lease_until=?,updated=?,commit_sha=? WHERE id=?')
          .run(sourceAvailable ? row.source : actor, status, note, now() + 7200000, now(), args.commitSha || task.commit_sha, task.id);
        if (sourceAvailable) {
          const message = db.prepare('INSERT INTO messages(project,sender,recipient,subject,body,request_key,created) VALUES(?,?,?,?,?,?,?)')
            .run(row.project, actor, row.source, `Runnerin tulos: ${task.title}`.slice(0, 200), `${note}\n\nTehtävä: ${task.id}`, `runner-result:${row.id}`, now());
          db.prepare('INSERT INTO events(project,actor,type,data,created) VALUES(?,?,?,?,?)').run(row.project, actor, 'message_sent', JSON.stringify({ messageSeq: Number(message.lastInsertRowid), recipient: row.source }), now());
          db.prepare('INSERT INTO events(project,actor,type,data,created) VALUES(?,?,?,?,?)').run(row.project, actor, 'task_handed_off', JSON.stringify({ taskId: task.id, from: actor, to: row.source, commitSha: args.commitSha || null }), now());
        }
        const result = { runId: row.id, taskId: task.id, outcome: args.outcome, status, owner: sourceAvailable ? row.source : actor };
        db.prepare("UPDATE runner_runs SET state='finished',lease_until=0,updated=?,receipt=? WHERE id=?").run(now(), JSON.stringify({ fingerprint, result }), row.id);
        return result;
      });
    },
  };
}
