// Links WhatsApp demo sign-ups from the public landing page to this machine's WhatsApp member DB.
// Runs next to the WhatsApp server and polls the Worker; the Worker never connects to this machine.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.whatsapp --env-file=deploy/cloudflare/.env.publisher \
//     scripts/whatsapp-signups.mjs [watch | list | approve --phone +358… | remove --phone +358…]
//
// With Meta's test number every new number must also be added as a test recipient in Meta by hand.
// "watch" links the number and waits; "approve" tells the landing page that WhatsApp is ready.
// Set WHATSAPP_SIGNUP_AUTO_READY=true once the assistant has its own registered number.
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { openWhatsAppStore, codeHash, phoneNumber } from '../server/whatsapp/store.mjs';

export const START_TEXT = 'Moi! Opeta mua tilaamaan tämän kautta.';
export const COMMAND = 'node --env-file-if-exists=.env --env-file-if-exists=.env.whatsapp --env-file=deploy/cloudflare/.env.publisher scripts/whatsapp-signups.mjs';
const DEFAULT_COMPANY = 'Demokeittiö';
// Accepts the number as the presenter types it, for example +358 40 123 4567.
const typed = value => phoneNumber(String(value || '').replace(/[\s().-]/g, ''));

export function createSignupApi({ baseUrl, token, fetch = globalThis.fetch }) {
  const origin = new URL(baseUrl).origin;
  if (!token || token.length < 32) throw new Error('CLOUDFLARE_DEMO_SYNC_TOKEN puuttuu.');
  const call = async (path, init = {}) => {
    const response = await fetch(origin + path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Worker ${response.status}: ${body.error || 'virhe'}`);
    return body;
  };
  return {
    list: (status = 'pending') => call(`/api/signups?status=${status}`).then(b => b.signups),
    report: (phone, status, chatUrl) => call('/api/signups/result', { method: 'POST', body: JSON.stringify({ phone, status, ...(chatUrl ? { chatUrl } : {}) }) }),
  };
}

// The chat link opens a WhatsApp chat with the assistant, pre-filled with the agreed first message.
export function chatUrlFor(displayPhone, text = START_TEXT) {
  const digits = String(displayPhone || '').replace(/\D/g, '');
  if (!/^[1-9]\d{6,14}$/.test(digits)) throw new Error('Apurin numeroa ei saatu.');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function resolveChatUrl(env = process.env, fetch = globalThis.fetch) {
  if (env.WHATSAPP_CHAT_URL) {
    const url = new URL(env.WHATSAPP_CHAT_URL);
    if (url.protocol !== 'https:' || !['wa.me', 'api.whatsapp.com'].includes(url.hostname)) throw new Error('WHATSAPP_CHAT_URL ei ole WhatsApp-linkki.');
    return url.href;
  }
  // Read-only lookup of the assistant's own number with the server's existing Meta credentials.
  const { WHATSAPP_PHONE_NUMBER_ID: id, WHATSAPP_ACCESS_TOKEN: accessToken, WHATSAPP_API_VERSION: version = 'v25.0' } = env;
  if (!id || !accessToken) throw new Error('Aseta WHATSAPP_CHAT_URL tai WhatsAppin numerotunniste ja token.');
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(id)}?fields=display_phone_number`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Meta ${response.status}: apurin numeroa ei saatu.`);
  return chatUrlFor((await response.json()).display_phone_number);
}

export function createSignupLinker({ store, api, chatUrl, autoReady = false, log = console.log, notify = () => {}, now = Date.now }) {
  // Numbers linked from the landing page, and whether the presenter has approved them in Meta.
  // A number paired earlier with YHDISTA is not here: it already talks to the assistant.
  store.db.exec('CREATE TABLE IF NOT EXISTS landing_signups (phone TEXT PRIMARY KEY, linked_at INTEGER NOT NULL, approved_at INTEGER)');
  const landing = phone => store.db.prepare('SELECT * FROM landing_signups WHERE phone=?').get(phone);
  const time = () => new Date(now()).toLocaleTimeString('fi-FI');
  const shownCodes = new Map();
  const announced = new Map();
  const announce = (signup, phone) => {
    if (announced.has(phone) && announced.get(phone) === signup.createdAt) return;
    announced.set(phone, signup.createdAt);
    log(`\n[${time()}] Odottaa Meta-vahvistusta: ${signup.name} (${signup.company}) +${phone}\n`
      + '  Lomake ei lähetä vahvistuskoodia. Käynnistä se itse Metassa:\n'
      + '  1. Step 1. Try it out → Recipient → Manage phone number list → Add phone number.\n'
      + '  2. Kokeilija saa koodin WhatsAppiin ja kirjoittaa sen sivulle. Syötä koodi Metaan.\n'
      + `  3. Kun numero näkyy Metassa hyväksyttynä: ${COMMAND} approve --phone +${phone}`);
    notify(`Demokokeilija +${phone} odottaa: käynnistä vahvistus Metassa.`);
  };
  return {
    // One pass over the waiting sign-ups. Reporting again is harmless, so a lost report is simply retried.
    async tick() {
      const results = [];
      for (const signup of await api.list('pending')) {
        let phone;
        try { phone = phoneNumber(signup.phone); } catch { await api.report(signup.phone, 'failed'); results.push({ phone: signup.phone, status: 'failed' }); continue; }
        const known = landing(phone);
        let status;
        if (known) status = known.approved_at ? 'ready' : 'linked';
        else if (store.member(phone)) status = 'ready';
        else {
          const invitation = store.invite(phone, signup.company || DEFAULT_COMPANY, signup.name);
          if (!store.pair(phone, codeHash(invitation.code))) { await api.report(phone, 'failed'); results.push({ phone, status: 'failed' }); continue; }
          store.db.prepare('INSERT INTO landing_signups VALUES(?,?,?)').run(phone, now(), autoReady ? now() : null);
          status = autoReady ? 'ready' : 'linked';
        }
        await api.report(phone, status, status === 'ready' ? chatUrl : undefined);
        results.push({ phone, status, name: signup.name, company: signup.company });
        if (status === 'linked') announce(signup, phone);
        else if (status === 'ready') log(`[${time()}] +${phone}: valmis, WhatsApp-linkki näkyy sivulla`);
      }
      // Meta's code typed on the landing page: shown once per new code, to be entered in Meta by hand.
      for (const signup of await api.list('linked')) {
        const phone = phoneNumber(signup.phone);
        // Recover an approval whose Worker report failed, including after a watcher restart.
        if (landing(phone)?.approved_at && store.member(phone)) {
          await api.report(phone, 'ready', chatUrl);
          results.push({ phone, status: 'ready' });
          continue;
        }
        // Linked rows used to disappear from the operator's view on restart or repeat registration.
        if (!signup.code) { announce(signup, phone); continue; }
        if (!signup.code || shownCodes.get(signup.phone) === signup.codeAt) continue;
        shownCodes.set(signup.phone, signup.codeAt);
        log(`\n[${time()}] Metan vahvistuskoodi ${signup.phone} (${signup.name}): ${signup.code}\n`
          + '  Syötä koodi Metan Manage phone number list -ikkunaan. Kun numero näkyy vahvistettuna:\n'
          + `  ${COMMAND} approve --phone ${signup.phone}`);
        notify(`Koodi ${signup.code} numerolle ${signup.phone}: syötä Metaan ja hyväksy.`);
        results.push({ phone: signup.phone, status: 'code', code: signup.code });
      }
      return results;
    },
    // Only after the number is a verified Meta test recipient: the landing page then shows "Avaa WhatsApp".
    async approve(value) {
      const phone = typed(value);
      if (!store.member(phone)) throw new Error(`+${phone} ei ole testiasiakas. Odota, että watch liittää sen, tai tarkista numero.`);
      store.db.prepare('INSERT INTO landing_signups VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET approved_at=excluded.approved_at').run(phone, now(), now());
      const result = await api.report(phone, 'ready', chatUrl);
      return { phone, updated: result.updated };
    },
    // Removes the test customer, its conversation and the landing page rows. The Meta recipient is removed in Meta.
    async remove(value) {
      const phone = typed(value);
      store.revoke(phone);
      store.db.prepare('DELETE FROM landing_signups WHERE phone=?').run(phone);
      const result = await api.report(phone, 'removed');
      return { phone, updated: result.updated };
    },
  };
}

// A macOS notification so the presenter sees a new sign-up without watching the terminal.
// Only digits and fixed text reach AppleScript.
function macNotify(text) {
  if (process.platform !== 'darwin') return;
  const safe = text.replace(/[^0-9A-Za-zÅÄÖåäö +:,.]/g, '');
  execFile('osascript', ['-e', `display notification "${safe}" with title "Aimo-demo"`], () => {});
}

async function main() {
  const [command = 'watch', ...args] = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const { whatsappDbPath } = await import('../server/whatsapp/runtime.mjs');
  const api = createSignupApi({ baseUrl: process.env.CLOUDFLARE_DEMO_URL, token: process.env.CLOUDFLARE_DEMO_SYNC_TOKEN });
  const store = openWhatsAppStore(whatsappDbPath());
  try {
    if (command === 'list') {
      for (const status of ['pending', 'linked', 'ready']) {
        const rows = await api.list(status);
        console.log(`${status}: ${rows.length ? '' : '-'}`);
        for (const r of rows) console.log(`  ${r.phone}  ${r.name}, ${r.company}${r.code ? `  koodi ${r.code}` : ''}${store.member(r.phone.replace(/^\+/, '')) ? '' : '  (ei vielä testiasiakas)'}`);
      }
      return;
    }
    if (command === 'remove') { console.log(await createSignupLinker({ store, api, chatUrl: null }).remove(option('--phone'))); return; }
    const chatUrl = await resolveChatUrl();
    const linker = createSignupLinker({ store, api, chatUrl, autoReady: process.env.WHATSAPP_SIGNUP_AUTO_READY === 'true', notify: macNotify });
    if (command === 'approve') { const r = await linker.approve(option('--phone')); console.log(`+${r.phone} hyväksytty: landing page näyttää nyt Avaa WhatsApp -napin.`); return; }
    if (command !== 'watch') throw new Error('Käyttö: watch | list | approve --phone +358… | remove --phone +358…');
    console.log(`Seurataan ilmoittautumisia: ${new URL(process.env.CLOUDFLARE_DEMO_URL).origin} (Ctrl+C lopettaa)`);
    let failing = '';
    for (;;) {
      try { await linker.tick(); if (failing) console.log('Yhteys Workeriin palasi.'); failing = ''; }
      catch (err) { if (err.message !== failing) console.error(`Ilmoittautumisten haku epäonnistui: ${err.message}`); failing = err.message; }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } finally { store.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => { console.error(err.message); process.exitCode = 1; });
}
