// Read-only signup scan for the presenter's Gmail notification task. This script never sends mail,
// approves a recipient, or opens the user's WhatsApp/member database.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const META_SETUP_URL = 'https://developers.facebook.com/apps/1829102204844975/use_cases/customize/api-testing-v2/?product_route=whatsapp-business&business_id=1323308285040230&use_case_enum=WHATSAPP_BUSINESS_MESSAGING&selected_tab=api-testing-v2';
const digest = text => createHash('sha256').update(text).digest('hex');
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (text, max) => String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max).trim();

export function normalizeSignup(row) {
  const phone = String(row.phone || '').replace(/^\+/, '');
  if (!/^[1-9]\d{6,14}$/.test(phone) || !Number.isSafeInteger(row.createdAt) || row.createdAt <= 0) throw new Error('Virheellinen ilmoittautumistieto.');
  return { phone, name: clean(row.name, 60), company: clean(row.company, 80), createdAt: row.createdAt };
}

export function renderSignupAlert(signup, key, to) {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) throw new Error('Ilmoituksen vastaanottaja puuttuu tai on virheellinen.');
  const marker = `AIMO-SIGNUP-${key}`;
  const text = `Uusi WhatsApp-kokeilija odottaa hyväksyntää.\n\nNimi: ${signup.name}\nPuhelinnumero: +${signup.phone}\nYritys: ${signup.company || 'Demokeittiö'}\n\nAvaa Meta: ${META_SETUP_URL}\n\n1. Recipient → Manage phone number list → Add phone number.\n2. Lisää yllä oleva numero. Meta lähettää kokeilijalle vahvistuskoodin WhatsAppiin.\n3. Vahvista numero Metassa kokeilijan toimittamalla koodilla.\n4. Kerro sen jälkeen Codexille, että numero on vahvistettu, jotta myös demon verkkosivu avataan.\n\nTämä ilmoitus ei hyväksy numeroa. Metan testinumero sallii enintään viisi vahvistettua vastaanottajaa.\n\nIlmoitustunnus: ${marker}`;
  return { to, subject: `Aimo: WhatsApp-kokeilija odottaa hyväksyntää [${key.slice(0, 12)}]`, text,
    html: `<h2>Uusi WhatsApp-kokeilija</h2><p>Numero odottaa hyväksyntääsi.</p><dl><dt>Nimi</dt><dd>${escape(signup.name)}</dd><dt>Puhelinnumero</dt><dd>+${signup.phone}</dd><dt>Yritys</dt><dd>${escape(signup.company || 'Demokeittiö')}</dd></dl><p><a href="${escape(META_SETUP_URL)}">Avaa Metan vastaanottajalista</a></p><ol><li>Valitse Recipient → Manage phone number list → Add phone number.</li><li>Lisää yllä oleva numero. Meta lähettää kokeilijalle vahvistuskoodin WhatsAppiin.</li><li>Vahvista numero Metassa kokeilijan toimittamalla koodilla.</li><li>Kerro tämän jälkeen Codexille, että numero on vahvistettu, jotta myös demon verkkosivu avataan.</li></ol><p>Ilmoitus ei hyväksy numeroa. Testinumero sallii enintään viisi vahvistettua vastaanottajaa.</p><p>Ilmoitustunnus: ${marker}</p>`, marker };
}

export function openAlertStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS signup_alerts (
    phone_hash TEXT PRIMARY KEY, alert_key TEXT NOT NULL, created_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, reserved_at INTEGER, sent_at INTEGER, message_id TEXT)`);
  return {
    db,
    scan(rows, to) {
      // Validate the whole snapshot before changing durable state. Only a complete successful scan
      // can end a waiting cycle; a network failure must not cause duplicate emails on the next run.
      const waiting = new Map();
      for (const raw of rows) {
        const signup = normalizeSignup(raw);
        if (!waiting.has(signup.phone) || waiting.get(signup.phone).createdAt < signup.createdAt) waiting.set(signup.phone, signup);
      }
      const output = { notifications: [], reconcile: [] };
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = new Map(db.prepare('SELECT * FROM signup_alerts').all().map(r => [r.phone_hash, r]));
        db.prepare('UPDATE signup_alerts SET active=0').run();
        for (const signup of waiting.values()) {
          const phoneHash = digest(signup.phone), old = previous.get(phoneHash);
          const generatedKey = digest(`aimo-signup-alert-v1\0${signup.phone}\0${signup.createdAt}`);
          // Repeated form submissions while the same number is waiting do not send new mail.
          const keep = old && (old.active || old.alert_key === generatedKey);
          if (keep) db.prepare('UPDATE signup_alerts SET active=1 WHERE phone_hash=?').run(phoneHash);
          else db.prepare(`INSERT INTO signup_alerts(phone_hash,alert_key,created_at) VALUES(?,?,?)
            ON CONFLICT(phone_hash) DO UPDATE SET alert_key=excluded.alert_key,created_at=excluded.created_at,active=1,reserved_at=NULL,sent_at=NULL,message_id=NULL`).run(phoneHash, generatedKey, signup.createdAt);
          const row = db.prepare('SELECT * FROM signup_alerts WHERE phone_hash=?').get(phoneHash);
          if (row.sent_at !== null) continue;
          const alert = { key: row.alert_key, ...renderSignupAlert(signup, row.alert_key, to) };
          output[row.reserved_at === null ? 'notifications' : 'reconcile'].push(alert);
        }
        db.exec('COMMIT');
        return output;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    reserve(key, now = Date.now()) {
      const changed = db.prepare('UPDATE signup_alerts SET reserved_at=? WHERE alert_key=? AND active=1 AND sent_at IS NULL AND reserved_at IS NULL').run(now, key);
      if (changed.changes !== 1) throw new Error('Ilmoitus on jo varattu, lähetetty tai poistunut jonosta.');
      return { reserved: true, key };
    },
    ack(key, messageId, now = Date.now()) {
      if (typeof messageId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) throw new Error('Gmailin viestitunniste puuttuu.');
      const changed = db.prepare('UPDATE signup_alerts SET sent_at=?,message_id=? WHERE alert_key=? AND reserved_at IS NOT NULL AND sent_at IS NULL').run(now, messageId, key);
      if (changed.changes !== 1) throw new Error('Ilmoitus ei odota lähetyskuittausta.');
      return { acknowledged: true, key, messageId };
    },
    close() { db.close(); },
  };
}

export async function readWaitingSignups(env = process.env, fetcher = fetch) {
  const base = new URL(env.CLOUDFLARE_DEMO_URL);
  if (base.protocol !== 'https:') throw new Error('Ilmoittautumispalvelun on käytettävä HTTPS:ää.');
  const token = env.CLOUDFLARE_DEMO_SYNC_TOKEN;
  if (!token || token.length < 32) throw new Error('Ilmoittautumispalvelun lukuavain puuttuu.');
  const snapshots = await Promise.all(['pending', 'linked'].map(async status => {
    const response = await fetcher(new URL(`/api/signups?status=${status}`, base.origin), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Ilmoittautumispalvelu vastasi ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body.signups) || body.signups.length > 100) throw new Error('Virheellinen ilmoittautumislista.');
    return body.signups.map(normalizeSignup);
  }));
  return snapshots.flat();
}

async function main() {
  const [command = 'scan', ...args] = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const statePath = process.env.WHATSAPP_SIGNUP_ALERT_DB || fileURLToPath(new URL('../data/whatsapp-signup-alerts.db', import.meta.url));
  // Read both remote snapshots before opening a state transaction.
  const rows = command === 'scan' ? await readWaitingSignups() : null;
  const store = openAlertStore(statePath);
  try {
    let result;
    if (command === 'scan') result = store.scan(rows, option('--to') || process.env.WHATSAPP_SIGNUP_NOTIFY_TO);
    else if (command === 'reserve') result = store.reserve(option('--key'));
    else if (command === 'ack') result = store.ack(option('--key'), option('--message-id'));
    else throw new Error('Komennot: scan --to EMAIL | reserve --key KEY | ack --key KEY --message-id ID');
    console.log(JSON.stringify(result));
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
