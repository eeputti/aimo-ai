import { openSqlite, isRemoteDatabase } from '../sqlite.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Viestikatto numeroa kohden webhookin uusille viesteille: 10 minuutissa (60 s), 120 tunnissa ja 400 vuorokaudessa.
export const MESSAGES_PER_HOUR = 120;
export const MESSAGES_PER_DAY = 400;
// Pilven yksi kutsu kestää enintään 300 s; tätä vanhempi käsittelyvaraus on keskeytynyt.
export const PROCESSING_LEASE_MS = 6 * 60_000;
export const codeHash = (code) => crypto.createHash('sha256').update(code.trim()).digest('hex');
// Landing page link code: 8 symbols without I, L, O, 0, 1. The landing sign-up API that issued these codes was removed on 17.11.2026.
// "abcd-efgh" and "ABCD EFGH" are the same code. Returns the canonical form, or null for anything else.
export function landingCode(value) {
  const code = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJKMNP-Z2-9]{8}$/.test(code) ? code : null;
}
// Itse ilmoittautuneen kutsu on voimassa yhtä kauan kuin ilmoittautuminen Workerissa.
export const LANDING_INVITE_MAX_MS = 7 * 24 * 3600_000;
export const LANDING_INVITES_PER_PHONE = 5;
export function phoneNumber(value) {
  const phone = String(value || '').replace(/^\+/, '');
  if (!/^[1-9]\d{6,14}$/.test(phone)) throw new Error('Anna puhelinnumero kansainvälisessä muodossa, esimerkiksi +358401234567.');
  return phone;
}

// One worker process per database. This database is independent of all demo order databases.
export function openWhatsAppStore(filename, now = Date.now) {
  const local = filename !== ':memory:' && !isRemoteDatabase(filename);
  if (local) fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = openSqlite(filename);
  if (local) fs.chmodSync(filename, 0o600);
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
    CREATE INDEX IF NOT EXISTS turns_binding ON turns(binding, seq);
    -- Landing page sign-ups: several browsers may have signed up the same number, each with its own code.
    -- Only a WhatsApp message from that number with one of the codes makes it a member (audit #14).
    CREATE TABLE IF NOT EXISTS landing_invites (phone TEXT NOT NULL, hash TEXT NOT NULL, company TEXT NOT NULL, person TEXT NOT NULL,
      expires INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(phone, hash));
    -- How a binding was made. No row = an administrator's invitation (YHDISTA code given by the team).
    CREATE TABLE IF NOT EXISTS member_sources (binding TEXT PRIMARY KEY, source TEXT NOT NULL, created INTEGER NOT NULL);`);
  // A process may have died during a read-only model call or delivery. Saved replies are reused.
  const member = (phone) => db.prepare('SELECT * FROM members WHERE phone=?').get(phone);
  return {
    db, close: () => db.close(), member,
    recover() { db.exec("UPDATE inbox SET state='pending', next_at=0 WHERE state='processing'"); },
    // Pilvessä ei ole yhtä pysyvää prosessia: vain varauksen aikarajan ylittäneet käsittelyt palautetaan jonoon.
    recoverStale() { return db.prepare("UPDATE inbox SET state='pending' WHERE state='processing' AND next_at<=?").run(now()).changes; },
    invite(phone, company, person) {
      phone = phoneNumber(phone);
      if (!company?.trim() || !person?.trim()) throw new Error('Yritys ja henkilö vaaditaan.');
      const code = crypto.randomBytes(12).toString('base64url');
      const expires = now() + 10 * 60_000;
      db.prepare('INSERT OR REPLACE INTO invites VALUES(?,?,?,?,?)').run(phone, company.trim().slice(0, 120), person.trim().slice(0, 120), codeHash(code), expires);
      return { code, expires };
    },
    // The landing page sign-up's code arrives only as its hash. Until a WhatsApp message from this number
    // carries the code, the number is not a member and cannot order.
    inviteLanding(phone, company, person, hash, expires) {
      phone = phoneNumber(phone);
      if (!/^[a-f0-9]{64}$/.test(String(hash || ''))) throw new Error('Kutsun tiiviste puuttuu.');
      if (!company?.trim() || !person?.trim()) throw new Error('Yritys ja henkilö vaaditaan.');
      if (!Number.isSafeInteger(expires) || expires <= now()) return false;
      db.prepare('INSERT OR REPLACE INTO landing_invites VALUES(?,?,?,?,?,?)').run(phone, hash, company.trim().slice(0, 120), person.trim().slice(0, 120),
        Math.min(expires, now() + LANDING_INVITE_MAX_MS), now());
      // A flood of sign-ups for one number keeps only the newest few codes.
      db.prepare(`DELETE FROM landing_invites WHERE phone=? AND hash NOT IN (SELECT hash FROM landing_invites WHERE phone=? ORDER BY created DESC, rowid DESC LIMIT ${LANDING_INVITES_PER_PHONE})`).run(phone, phone);
      return true;
    },
    memberSource(binding) { return db.prepare('SELECT source FROM member_sources WHERE binding=?').get(binding || '')?.source || 'admin'; },
    revoke(phone) {
      phone = phoneNumber(phone);
      const old = member(phone);
      db.prepare('DELETE FROM members WHERE phone=?').run(phone);
      db.prepare('DELETE FROM invites WHERE phone=?').run(phone);
      db.prepare('DELETE FROM landing_invites WHERE phone=?').run(phone);
      if (old) db.prepare('DELETE FROM member_sources WHERE binding=?').run(old.binding);
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
      const attempts = db.prepare("SELECT count(*) n FROM inbox WHERE phone=? AND kind IN ('pair','signup') AND received>=?").get(phone, now() - 15 * 60_000).n;
      // The code must match an invitation for this very number: a code typed from another number never pairs.
      const invitation = db.prepare('SELECT * FROM invites WHERE phone=? AND hash=? AND expires>?').get(phone, hash, now());
      const landing = !invitation && db.prepare('SELECT * FROM landing_invites WHERE phone=? AND hash=? AND expires>?').get(phone, hash, now());
      if (!(invitation || landing) || attempts > 5) return null;
      const chosen = invitation || landing;
      const binding = crypto.randomUUID();
      const old = member(phone);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT OR REPLACE INTO members VALUES(?,?,?,?)').run(phone, chosen.company, chosen.person, binding);
        db.prepare('DELETE FROM invites WHERE phone=?').run(phone);
        db.prepare('DELETE FROM landing_invites WHERE phone=?').run(phone);
        if (landing) db.prepare('INSERT OR REPLACE INTO member_sources VALUES(?,?,?)').run(binding, 'landing', now());
        if (jobId) db.prepare('UPDATE inbox SET binding=? WHERE id=?').run(binding, jobId);
        if (old) db.prepare('DELETE FROM turns WHERE binding=?').run(old.binding);
        if (old) db.prepare('DELETE FROM member_sources WHERE binding=?').run(old.binding);
        db.exec('COMMIT');
      } catch (err) { db.exec('ROLLBACK'); throw err; }
      return member(phone);
    },
    enqueue(message) {
      if (db.prepare('SELECT id FROM inbox WHERE id=?').get(message.id)) return false;
      const count = (ms) => db.prepare('SELECT count(*) n FROM inbox WHERE phone=? AND received>=?').get(message.phone, now() - ms).n;
      // Kustannusraja: yksi numero ei voi käynnistää loputtomasti mallikutsuja. Tavallinen keskustelu ei osu näihin.
      if (count(60_000) >= 10 || count(3600_000) >= MESSAGES_PER_HOUR || count(86400_000) >= MESSAGES_PER_DAY) return false;
      // The landing page's chat link ends with "YHDISTA ABCD-EFGH" on its own line after the greeting.
      // An administrator's code is still the whole message. Only the code's hash is stored.
      // Only a typed text message can carry a code; an image or voice note is never a pairing.
      const text = message.text || '';
      const typed = !message.kind || message.kind === 'text';
      const signup = typed && /(?:^|\s)yhdist[aä]\s+([a-z0-9]{4}[ \t-]?[a-z0-9]{4})\s*$/iu.exec(text);
      const code = signup && landingCode(signup[1]);
      const pair = typed && !code && /^yhdist[aä]\s+(\S+)\s*$/iu.exec(text);
      db.prepare('INSERT INTO inbox(id,phone,text,kind,binding,received,sent_at) VALUES(?,?,?,?,?,?,?)').run(
        message.id, message.phone, code ? codeHash(code) : pair ? codeHash(pair[1]) : text,
        code ? 'signup' : pair ? 'pair' : message.kind || 'text', member(message.phone)?.binding || null, now(), message.sentAt);
      return true;
    },
    // Atominen varaus yhdellä lauseella (audit #12): valinta ja varaus tapahtuvat samassa kirjoituksessa, joten
    // kaksi rinnakkaista käsittelijää (sama prosessi, toinen prosessi tai toinen pilvi-instanssi) eivät saa samaa
    // viestiä eivätkä saman numeron seuraavaa viestiä, ennen kuin edellinen on valmis. Eri numerot kulkevat rinnakkain.
    // next_at on käsittelyn aikaraja (recoverStale).
    next() {
      const at = now();
      // An idle poll stays a plain read, as before: only a waiting message starts a write.
      if (!db.prepare("SELECT 1 FROM inbox WHERE state='pending' AND next_at<=? LIMIT 1").get(at)) return null;
      const job = db.prepare(`UPDATE inbox SET state='processing', attempts=attempts+1, next_at=? WHERE id=(
        SELECT id FROM inbox WHERE state='pending' AND next_at<=? AND NOT EXISTS (SELECT 1 FROM inbox prior WHERE prior.phone=inbox.phone
          AND prior.state IN ('pending','processing') AND prior.rowid<inbox.rowid) ORDER BY received,rowid LIMIT 1
      ) AND state='pending' RETURNING *`).get(at + PROCESSING_LEASE_MS, at);
      return job ? { ...job } : null;
    },
    // Recent messages still waiting behind another message: their sender should keep seeing "typing".
    waiting(since) {
      return db.prepare("SELECT id, phone, sent_at FROM inbox WHERE state='pending' AND received>=? ORDER BY received,rowid LIMIT 50").all(since).map((r) => ({ ...r }));
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
    retry(job, error, max = 3) {
      db.prepare('UPDATE inbox SET state=?,next_at=?,error=? WHERE id=?').run(job.attempts >= max ? 'failed' : 'pending', now() + job.attempts * 30_000, error, job.id);
    },
    prune() {
      db.prepare('DELETE FROM invites WHERE expires<=?').run(now());
      db.prepare('DELETE FROM landing_invites WHERE expires<=?').run(now());
      db.exec('DELETE FROM member_sources WHERE binding NOT IN (SELECT binding FROM members)');
      db.prepare('DELETE FROM turns WHERE created<?').run(now() - 7 * 86400_000);
      db.prepare('DELETE FROM inbox WHERE received<?').run(now() - 7 * 86400_000);
      db.exec('DELETE FROM reply_parts WHERE message_id NOT IN (SELECT id FROM inbox)');
    },
  };
}
