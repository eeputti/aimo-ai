import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Viestikatto numeroa kohden webhookin uusille viesteille: 10 minuutissa (60 s), 120 tunnissa ja 400 vuorokaudessa.
export const MESSAGES_PER_HOUR = 120;
export const MESSAGES_PER_DAY = 400;
export const codeHash = (code) => crypto.createHash('sha256').update(code.trim()).digest('hex');
export function phoneNumber(value) {
  const phone = String(value || '').replace(/^\+/, '');
  if (!/^[1-9]\d{6,14}$/.test(phone)) throw new Error('Anna puhelinnumero kansainvälisessä muodossa, esimerkiksi +358401234567.');
  return phone;
}

// One worker process per database. This database is independent of all demo order databases.
export function openWhatsAppStore(filename, now = Date.now) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS members (phone TEXT PRIMARY KEY, company TEXT NOT NULL, person TEXT NOT NULL, binding TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (phone TEXT PRIMARY KEY, company TEXT NOT NULL, person TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, phone TEXT NOT NULL, text TEXT NOT NULL, kind TEXT NOT NULL,
      binding TEXT, received INTEGER NOT NULL, sent_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, reply TEXT, reply_id TEXT, error TEXT);
    CREATE INDEX IF NOT EXISTS inbox_queue ON inbox(state, next_at, received);
    CREATE INDEX IF NOT EXISTS inbox_phone ON inbox(phone, received);
    CREATE TABLE IF NOT EXISTS reply_parts (message_id TEXT NOT NULL, part INTEGER NOT NULL, text TEXT NOT NULL, reply_id TEXT,
      PRIMARY KEY(message_id,part));
    CREATE TABLE IF NOT EXISTS turns (seq INTEGER PRIMARY KEY, binding TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS turns_binding ON turns(binding, seq);`);
  // A process may have died during a read-only model call or delivery. Saved replies are reused.
  const member = (phone) => db.prepare('SELECT * FROM members WHERE phone=?').get(phone);
  return {
    db, close: () => db.close(), member,
    recover() { db.exec("UPDATE inbox SET state='pending' WHERE state='processing'"); },
    invite(phone, company, person) {
      phone = phoneNumber(phone);
      if (!company?.trim() || !person?.trim()) throw new Error('Yritys ja henkilö vaaditaan.');
      const code = crypto.randomBytes(12).toString('base64url');
      const expires = now() + 10 * 60_000;
      db.prepare('INSERT OR REPLACE INTO invites VALUES(?,?,?,?,?)').run(phone, company.trim().slice(0, 120), person.trim().slice(0, 120), codeHash(code), expires);
      return { code, expires };
    },
    revoke(phone) {
      phone = phoneNumber(phone);
      const old = member(phone);
      db.prepare('DELETE FROM members WHERE phone=?').run(phone);
      db.prepare('DELETE FROM invites WHERE phone=?').run(phone);
      if (old) db.prepare('DELETE FROM turns WHERE binding=?').run(old.binding);
      if (old && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_dialogue'").get()) {
        db.prepare('DELETE FROM wa_dialogue WHERE binding=?').run(old.binding);
        db.prepare('DELETE FROM wa_dialogue_results WHERE binding=?').run(old.binding);
      }
      db.prepare("DELETE FROM reply_parts WHERE message_id IN (SELECT id FROM inbox WHERE phone=? AND state IN ('pending','processing'))").run(phone);
      db.prepare("UPDATE inbox SET state='cancelled', reply=NULL, text='' WHERE phone=? AND state IN ('pending','processing')").run(phone);
    },
    pair(phone, hash, jobId) {
      // Includes failed attempts; a new invitation does not bypass the attempt limit.
      const attempts = db.prepare("SELECT count(*) n FROM inbox WHERE phone=? AND kind='pair' AND received>=?").get(phone, now() - 15 * 60_000).n;
      const invitation = db.prepare('SELECT * FROM invites WHERE phone=? AND hash=? AND expires>?').get(phone, hash, now());
      if (!invitation || attempts > 5) return null;
      const binding = crypto.randomUUID();
      const old = member(phone);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT OR REPLACE INTO members VALUES(?,?,?,?)').run(phone, invitation.company, invitation.person, binding);
        db.prepare('DELETE FROM invites WHERE phone=?').run(phone);
        if (jobId) db.prepare('UPDATE inbox SET binding=? WHERE id=?').run(binding, jobId);
        if (old) db.prepare('DELETE FROM turns WHERE binding=?').run(old.binding);
        db.exec('COMMIT');
      } catch (err) { db.exec('ROLLBACK'); throw err; }
      return member(phone);
    },
    enqueue(message) {
      if (db.prepare('SELECT id FROM inbox WHERE id=?').get(message.id)) return false;
      const count = (ms) => db.prepare('SELECT count(*) n FROM inbox WHERE phone=? AND received>=?').get(message.phone, now() - ms).n;
      // Kustannusraja: yksi numero ei voi käynnistää loputtomasti mallikutsuja. Tavallinen keskustelu ei osu näihin.
      if (count(60_000) >= 10 || count(3600_000) >= MESSAGES_PER_HOUR || count(86400_000) >= MESSAGES_PER_DAY) return false;
      const pair = message.text.match(/^yhdist[aä]\s+(\S+)\s*$/iu);
      db.prepare('INSERT INTO inbox(id,phone,text,kind,binding,received,sent_at) VALUES(?,?,?,?,?,?,?)').run(
        message.id, message.phone, pair ? codeHash(pair[1]) : message.text,
        pair ? 'pair' : message.kind || 'text', member(message.phone)?.binding || null, now(), message.sentAt);
      return true;
    },
    next() {
      const job = db.prepare("SELECT * FROM inbox WHERE state='pending' AND next_at<=? AND NOT EXISTS (SELECT 1 FROM inbox prior WHERE prior.phone=inbox.phone AND prior.state IN ('pending','processing') AND prior.rowid<inbox.rowid) ORDER BY received,rowid LIMIT 1").get(now());
      if (job) db.prepare("UPDATE inbox SET state='processing', attempts=attempts+1 WHERE id=?").run(job.id);
      return job ? { ...job, attempts: job.attempts + 1 } : null;
    },
    history(binding) {
      return db.prepare('SELECT role,content FROM (SELECT seq,role,content FROM turns WHERE binding=? ORDER BY seq DESC LIMIT 18) ORDER BY seq').all(binding).map((r) => ({ ...r }));
    },
    saveReply(job, reply, binding, parts = [reply]) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE inbox SET reply=? WHERE id=?').run(reply, job.id);
        const insertPart = db.prepare('INSERT OR IGNORE INTO reply_parts(message_id,part,text) VALUES(?,?,?)');
        parts.forEach((text, part) => insertPart.run(job.id, part, text));
        if (binding) {
          const insert = db.prepare('INSERT INTO turns(binding,role,content,created) VALUES(?,?,?,?)');
          insert.run(binding, 'user', job.text, now()); insert.run(binding, 'assistant', reply, now());
          db.prepare('DELETE FROM turns WHERE binding=? AND seq NOT IN (SELECT seq FROM turns WHERE binding=? ORDER BY seq DESC LIMIT 20)').run(binding, binding);
        }
        db.exec('COMMIT');
      } catch (err) { db.exec('ROLLBACK'); throw err; }
    },
    replyParts(id, fallback) {
      let parts = db.prepare('SELECT * FROM reply_parts WHERE message_id=? ORDER BY part').all(id);
      if (!parts.length) {
        db.prepare('INSERT INTO reply_parts(message_id,part,text) VALUES(?,0,?)').run(id, fallback);
        parts = db.prepare('SELECT * FROM reply_parts WHERE message_id=? ORDER BY part').all(id);
      }
      return parts;
    },
    saveReplyPart(id, part, replyId) { db.prepare('UPDATE reply_parts SET reply_id=? WHERE message_id=? AND part=?').run(replyId, id, part); },
    finish(id, state, replyId = null) { db.prepare('UPDATE inbox SET state=?,reply_id=? WHERE id=?').run(state, replyId, id); },
    retry(job, error) {
      db.prepare('UPDATE inbox SET state=?,next_at=?,error=? WHERE id=?').run(job.attempts >= 3 ? 'failed' : 'pending', now() + job.attempts * 30_000, error, job.id);
    },
    prune() {
      db.prepare('DELETE FROM invites WHERE expires<=?').run(now());
      db.prepare('DELETE FROM turns WHERE created<?').run(now() - 7 * 86400_000);
      db.prepare('DELETE FROM inbox WHERE received<?').run(now() - 7 * 86400_000);
      db.exec('DELETE FROM reply_parts WHERE message_id NOT IN (SELECT id FROM inbox)');
    },
  };
}
