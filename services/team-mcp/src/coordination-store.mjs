import crypto from 'node:crypto';
import { dispatchAssignments } from './dispatch.mjs';

const error = (code) => Object.assign(new Error(code), { code });
export function createCoordinationStore(store) {
  const { db, now, tx } = store;
  db.exec(`
    CREATE TABLE IF NOT EXISTS coord_presence(project TEXT NOT NULL,member TEXT NOT NULL,last_seen INTEGER NOT NULL,last_tool TEXT NOT NULL,PRIMARY KEY(project,member));
    CREATE TABLE IF NOT EXISTS coord_services(member TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS coord_runtime(project TEXT PRIMARY KEY,actor TEXT NOT NULL,mode TEXT NOT NULL,last_tick INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS coord_offsets(project TEXT NOT NULL,actor TEXT NOT NULL,cursor INTEGER NOT NULL,PRIMARY KEY(project,actor));
    CREATE TABLE IF NOT EXISTS coord_jobs(id TEXT PRIMARY KEY,project TEXT NOT NULL,actor TEXT NOT NULL,requester TEXT NOT NULL,source_seq INTEGER UNIQUE NOT NULL,input TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 0,lease_owner TEXT,lease_until INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,summary TEXT,reply TEXT,error_code TEXT);
    CREATE INDEX IF NOT EXISTS coord_jobs_due ON coord_jobs(project,actor,status,due);
    CREATE TABLE IF NOT EXISTS coord_attempts(job TEXT NOT NULL,project TEXT NOT NULL,actor TEXT NOT NULL,started INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS coord_attempts_window ON coord_attempts(project,actor,started);
  `);
  function owns(job, worker) {
    const row = db.prepare('SELECT * FROM coord_jobs WHERE id=? AND status=? AND lease_owner=? AND version=? AND lease_until>?').get(job.id, 'running', worker, job.version, now());
    if (!row) throw error('JOB_LEASE_LOST');
    return row;
  }
  function heartbeat({ project, actor, mode }) {
    store.access(actor, project);
    db.prepare('INSERT INTO coord_runtime VALUES(?,?,?,?) ON CONFLICT(project) DO UPDATE SET actor=excluded.actor,mode=excluded.mode,last_tick=excluded.last_tick').run(project, actor, mode, now());
  }
  function replyToJob(job, body) {
    const inserted = db.prepare('INSERT INTO messages(project,sender,recipient,subject,body,request_key,created) VALUES(?,?,?,?,?,?,?)')
      .run(job.project, job.actor, job.requester, 'Koordinaattorin vastaus', body, `coord-reply:${job.id}`, now());
    db.prepare('INSERT INTO events(project,actor,type,data,created) VALUES(?,?,?,?,?)')
      .run(job.project, job.actor, 'message_sent', JSON.stringify({ messageSeq: Number(inserted.lastInsertRowid), recipient: job.requester }), now());
  }
  function failedReply(job, code) {
    if (store.member(job.actor)?.projects.includes(job.project) && store.member(job.requester)?.projects.includes(job.project)) {
      replyToJob(job, `Koordinaattori ei saanut työpyyntöä käsiteltyä (${code}). Pyydä ylläpitäjää tarkistamaan koordinaattorin tila. Uuden yrityksen voi pyytää uutena viestinä.`);
    }
  }
  return {
    heartbeat,
    touch(actor, project, tool) {
      store.access(actor, project);
      db.prepare('INSERT INTO coord_presence VALUES(?,?,?,?) ON CONFLICT(project,member) DO UPDATE SET last_seen=excluded.last_seen,last_tool=excluded.last_tool').run(project, actor, now(), tool);
    },
    snapshot(viewer, project) {
      const state = store.state(viewer, { project });
      const runtime = db.prepare('SELECT * FROM coord_runtime WHERE project=?').get(project) || null;
      return {
        project, serverTime: now(), coordinator: runtime && { ...runtime, online: now() - runtime.last_tick < 10000 },
        agents: state.members.map((m) => ({ ...m,
          lastSeen: db.prepare('SELECT last_seen,last_tool FROM coord_presence WHERE project=? AND member=?').get(project, m.id) || null,
          lastReport: db.prepare("SELECT MAX(created) AS at FROM events WHERE project=? AND actor=? AND type IN ('task_claimed','task_updated','task_handed_off','board_updated')").get(project, m.id).at,
          tasks: state.tasks.filter((t) => t.owner === m.id && !['done', 'released'].includes(t.status)),
        })),
        events: state.events,
        // A direct job's prompt/result is private to requester and service identity.
        jobs: db.prepare(`SELECT id,requester,source_seq,status,attempts,created,updated,summary,reply,error_code FROM coord_jobs
          WHERE project=? AND (requester=? OR actor=?) ORDER BY created DESC,id LIMIT 50`).all(project, viewer, viewer),
      };
    },
    ingest({ project, actor, mode }) {
      store.access(actor, project);
      return tx(() => {
        heartbeat({ project, actor, mode });
        const cursor = db.prepare('SELECT cursor FROM coord_offsets WHERE project=? AND actor=?').get(project, actor)?.cursor || 0;
        const events = db.prepare('SELECT seq,actor,type,created FROM events WHERE project=? AND seq>? ORDER BY seq LIMIT 200').all(project, cursor);
        for (const e of events) {
          if (e.type !== 'message_sent' || e.actor === actor) continue;
          const message = db.prepare('SELECT * FROM messages WHERE project=? AND sender=? AND recipient=? AND seq=(SELECT json_extract(data,\'$.messageSeq\') FROM events WHERE seq=?)').get(project, e.actor, actor, e.seq);
          if (!message) continue; // broadcasts and other members' private messages never trigger runs
          const requester = store.member(message.sender);
          if (!requester?.projects.includes(project)) continue;
          const pending = db.prepare("SELECT COUNT(*) AS n FROM coord_jobs WHERE project=? AND actor=? AND status IN ('queued','running')").get(project, actor).n;
          const ownPending = db.prepare("SELECT COUNT(*) AS n FROM coord_jobs WHERE project=? AND actor=? AND requester=? AND status IN ('queued','running')").get(project, actor, message.sender).n;
          const queueError = ownPending >= 5 ? 'REQUESTER_QUEUE_FULL' : pending >= 100 ? 'QUEUE_FULL' : null;
          const id = crypto.randomUUID();
          const created = db.prepare('INSERT OR IGNORE INTO coord_jobs(id,project,actor,requester,source_seq,input,status,due,created,updated,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            .run(id, project, actor, message.sender, message.seq, JSON.stringify({ subject: message.subject, body: message.body }), queueError ? 'failed' : 'queued', now(), now(), now(), queueError);
          if (created.changes && queueError) failedReply({ id, project, actor, requester: message.sender }, queueError);
        }
        db.prepare('INSERT INTO coord_offsets VALUES(?,?,?) ON CONFLICT(project,actor) DO UPDATE SET cursor=excluded.cursor').run(project, actor, events.at(-1)?.seq || cursor);
        return events;
      });
    },
    claim({ project, actor, worker, maxPerHour = 12, leaseMs = 120000 }) {
      store.access(actor, project);
      return tx(() => {
        const expired = db.prepare(`UPDATE coord_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,error_code='LEASE_EXPIRED',lease_owner=NULL,updated=?
          WHERE project=? AND actor=? AND status='running' AND lease_until<=? RETURNING *`).all(now(), project, actor, now());
        for (const job of expired) if (job.status === 'failed') failedReply(job, 'LEASE_EXPIRED');
        if (db.prepare("SELECT id FROM coord_jobs WHERE project=? AND actor=? AND status='running' AND lease_until>?").get(project, actor, now())) return null;
        const calls = db.prepare('SELECT COUNT(*) AS n FROM coord_attempts WHERE project=? AND actor=? AND started>?').get(project, actor, now() - 3600000).n;
        if (calls >= maxPerHour) return null;
        let job;
        for (const candidate of db.prepare("SELECT * FROM coord_jobs WHERE project=? AND actor=? AND status='queued' AND due<=? ORDER BY created,id LIMIT 100").all(project, actor, now())) {
          if (store.member(candidate.requester)?.projects.includes(project)) { job = candidate; break; }
          db.prepare("UPDATE coord_jobs SET status='cancelled',error_code='REQUESTER_UNAVAILABLE',updated=? WHERE id=?").run(now(), candidate.id);
        }
        if (!job) return null;
        db.prepare("UPDATE coord_jobs SET status='running',attempts=attempts+1,version=version+1,lease_owner=?,lease_until=?,updated=? WHERE id=?").run(worker, now() + leaseMs, now(), job.id);
        db.prepare('INSERT INTO coord_attempts VALUES(?,?,?,?)').run(job.id, project, actor, now());
        return { ...db.prepare('SELECT * FROM coord_jobs WHERE id=?').get(job.id), input: JSON.parse(job.input) };
      });
    },
    complete(job, worker, result, policy) {
      return tx(() => {
        const current = owns(job, worker);
        store.access(current.actor, current.project); store.access(current.requester, current.project);
        const tasks = dispatchAssignments(store, { ...current, input: JSON.parse(current.input) }, result, policy);
        const dispatchNote = tasks.length ? '\n\nLuovutetut tehtävät:\n' + tasks.map((t) => `${t.id} -> ${t.owner}: ${t.title}`).join('\n') : '';
        replyToJob(current, `OpenAI-koordinaattorin vastaus\n\n${result.reply}${dispatchNote}`);
        db.prepare("UPDATE coord_jobs SET status='succeeded',summary=?,reply=?,error_code=NULL,lease_owner=NULL,lease_until=0,updated=? WHERE id=?")
          .run(result.summary, result.reply, now(), job.id);
      });
    },
    fail(job, worker, code, retryable, retryAfterMs = 0) {
      return tx(() => {
        const current = owns(job, worker);
        if (retryAfterMs > 900000) { retryable = false; code = 'OPENAI_RETRY_TOO_LONG'; retryAfterMs = 0; }
        const retry = retryable && job.attempts < 3;
        db.prepare('UPDATE coord_jobs SET status=?,error_code=?,lease_owner=NULL,lease_until=0,due=?,updated=? WHERE id=?')
          .run(retry ? 'queued' : 'failed', code, now() + Math.max(retryAfterMs, Math.min(60000, 5000 * 2 ** (job.attempts - 1))), now(), job.id);
        if (!retry) failedReply(current, code);
      });
    },
  };
}
