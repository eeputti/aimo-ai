// Links WhatsApp demo sign-ups from the public landing page to this machine's WhatsApp member DB.
// Runs next to the WhatsApp server and polls the Worker; the Worker never connects to this machine.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.whatsapp --env-file=deploy/cloudflare/.env.publisher \
//     scripts/whatsapp-signups.mjs [watch | list | approve --phone +358… | remove --phone +358…]
//
// With Meta's test number every new number must also be added as a test recipient in Meta by hand.
// "watch" prepares an invitation for each sign-up's link code and waits; "approve" tells the landing page
// that WhatsApp is ready. The number becomes a customer only when a WhatsApp message "YHDISTA <code>"
// arrives from that same number (audit #14): a form alone never proves who owns a number.
// Set WHATSAPP_SIGNUP_AUTO_READY=true once the assistant has its own registered number.
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { openWhatsAppStore, phoneNumber } from '../server/whatsapp/store.mjs';

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
    // Link code hashes not yet turned into invitations. null = a Worker from before audit #14 without the route.
    invites: () => call('/api/signups/invites').then(b => b.invites, err => { if (/^Worker 404/.test(err.message)) return null; throw err; }),
    markInvited: ids => call('/api/signups/invites', { method: 'POST', body: JSON.stringify({ ids }) }),
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
  // Numbers seen from the landing page, whether the presenter has approved them in Meta, and whether the
  // Worker has been told that the number is verified (it sent its code, or Meta verified it for the presenter).
  store.db.exec('CREATE TABLE IF NOT EXISTS landing_signups (phone TEXT PRIMARY KEY, linked_at INTEGER NOT NULL, approved_at INTEGER)');
  if (!store.db.prepare('PRAGMA table_info(landing_signups)').all().some(c => c.name === 'verified_at')) store.db.exec('ALTER TABLE landing_signups ADD COLUMN verified_at INTEGER');
  const landing = phone => store.db.prepare('SELECT * FROM landing_signups WHERE phone=?').get(phone);
  const remember = (phone, approved) => store.db.prepare('INSERT INTO landing_signups(phone,linked_at,approved_at) VALUES(?,?,?) ON CONFLICT(phone) DO NOTHING').run(phone, now(), approved ? now() : null);
  // A member has proven the number when it paired with a landing code, or when the presenter approved it in Meta
  // (Meta's code goes to that number's WhatsApp). Before audit #14 the watcher paired numbers straight from the
  // form; those members stay as they are but are not reported as verified until the presenter approves them.
  const proven = phone => {
    const member = store.member(phone);
    if (!member) return false;
    const row = landing(phone);
    return store.memberSource(member.binding) === 'landing' || !row || !!row.approved_at;
  };
  const time = () => new Date(now()).toLocaleTimeString('fi-FI');
  const shownCodes = new Map();
  const announced = new Map();
  let warnedOldWorker = false;
  const repeats = signup => signup.signups > 1
    ? `\n  Huom: numerolla on ${signup.signups} ilmoittautumista eri selaimista. Nimi on ensimmäisen. Varmista puhelussa, kenen numero on.` : '';
  const announce = (signup, phone) => {
    if (announced.has(phone) && announced.get(phone) === signup.createdAt) return;
    announced.set(phone, signup.createdAt);
    log(`\n[${time()}] Odottaa Meta-vahvistusta: ${signup.name} (${signup.company}) +${phone}${repeats(signup)}\n`
      + '  Lomake ei lähetä vahvistuskoodia. Käynnistä se itse Metassa:\n'
      + '  1. Step 1. Try it out → Recipient → Manage phone number list → Add phone number.\n'
      + '  2. Kokeilija saa koodin WhatsAppiin ja kirjoittaa sen sivulle. Syötä koodi Metaan.\n'
      + `  3. Kun numero näkyy Metassa hyväksyttynä: ${COMMAND} approve --phone +${phone}\n`
      + '  4. Numero liittyy apuriin vasta, kun kokeilija lähettää WhatsAppissa valmiin viestin, jonka lopussa on YHDISTA-koodi.');
    notify(`Demokokeilija +${phone} odottaa: käynnistä vahvistus Metassa.`);
  };
  return {
    // One pass over the waiting sign-ups. Reporting again is harmless, so a lost report is simply retried.
    async tick() {
      const results = [];
      // Every browser's own link code becomes an invitation for that number. No member is created here.
      const invites = await api.invites();
      if (invites === null && !warnedOldWorker) {
        warnedOldWorker = true;
        log('Workerin ilmoittautumisreitti on vanha (ei /api/signups/invites): aja deploy/cloudflare/signup-verify.sql ja julkaise Worker. Uusia numeroita ei liitetä ennen sitä.');
      }
      const done = [];
      for (const invite of invites || []) {
        try {
          const phone = phoneNumber(invite.phone);
          // A number that is already a member keeps its binding: a new sign-up cannot replace it.
          if (!store.member(phone)) store.inviteLanding(phone, invite.company || DEFAULT_COMPANY, invite.name, invite.codeHash, invite.expiresAt);
        } catch { /* a malformed row is acknowledged and dropped */ }
        done.push(invite.id);
      }
      if (done.length) await api.markInvited(done);
      for (const signup of await api.list('pending')) {
        let phone;
        try { phone = phoneNumber(signup.phone); } catch { await api.report(signup.phone, 'failed'); results.push({ phone: signup.phone, status: 'failed' }); continue; }
        // Without the invitation route a new number could never prove itself, so it keeps waiting.
        if (!invites && !store.member(phone)) continue;
        // A number that already talks to the assistant is ready at once and keeps its cart and history.
        remember(phone, autoReady || !!store.member(phone));
        const status = landing(phone).approved_at ? 'ready' : 'linked';
        await api.report(phone, status, status === 'ready' ? chatUrl : undefined);
        results.push({ phone, status, name: signup.name, company: signup.company });
        if (status === 'linked') announce(signup, phone);
        else if (status === 'ready') log(`[${time()}] +${phone}: valmis, WhatsApp-linkki näkyy sivulla`);
      }
      // Meta's code typed on the landing page: shown once per new code, to be entered in Meta by hand.
      for (const signup of await api.list('linked')) {
        const phone = phoneNumber(signup.phone);
        // Recover an approval whose Worker report failed, including after a watcher restart.
        if (landing(phone)?.approved_at) {
          await api.report(phone, 'ready', chatUrl);
          results.push({ phone, status: 'ready' });
          continue;
        }
        // Linked rows used to disappear from the operator's view on restart or repeat registration.
        if (!signup.code) { announce(signup, phone); continue; }
        if (!signup.code || shownCodes.get(signup.phone) === signup.codeAt) continue;
        shownCodes.set(signup.phone, signup.codeAt);
        const several = signup.codeSignups > 1 ? `\n  Huom: ${signup.codeSignups} selainta kirjoitti koodin tälle numerolle. Tämä on uusin; varmista puhelussa.` : '';
        log(`\n[${time()}] Metan vahvistuskoodi ${signup.phone} (${signup.name}): ${signup.code}${several}\n`
          + '  Syötä koodi Metan Manage phone number list -ikkunaan. Kun numero näkyy vahvistettuna:\n'
          + `  ${COMMAND} approve --phone ${signup.phone}`);
        notify(`Koodi ${signup.code} numerolle ${signup.phone}: syötä Metaan ja hyväksy.`);
        results.push({ phone: signup.phone, status: 'code', code: signup.code });
      }
      // The number has proven itself: the landing page can say so, and new sign-ups need no code.
      if (invites) for (const { phone } of store.db.prepare('SELECT phone FROM landing_signups WHERE verified_at IS NULL').all()) {
        if (!proven(phone)) continue;
        await api.report(phone, 'verified');
        store.db.prepare('UPDATE landing_signups SET verified_at=? WHERE phone=?').run(now(), phone);
        results.push({ phone, status: 'verified' });
        log(`[${time()}] +${phone}: yhdistetty WhatsAppissa`);
      }
      return results;
    },
    // Only after the number is a verified Meta test recipient: the landing page then shows "Avaa WhatsApp".
    // The number still becomes a customer only with its own YHDISTA message.
    async approve(value) {
      const phone = typed(value);
      if (!landing(phone) && !store.member(phone)) throw new Error(`+${phone} ei ole ilmoittautunut eikä testiasiakas. Odota, että watch näkee ilmoittautumisen, tai tarkista numero.`);
      store.db.prepare('INSERT INTO landing_signups(phone,linked_at,approved_at) VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET approved_at=excluded.approved_at').run(phone, now(), now());
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
        for (const r of rows) {
          const member = store.member(r.phone.replace(/^\+/, ''));
          const state = !member ? '  (ei vielä testiasiakas: odottaa YHDISTA-viestiä)' : r.verified ? '' : '  (testiasiakas ilman WhatsApp-vahvistusta)';
          console.log(`  ${r.phone}  ${r.name}, ${r.company}${r.signups > 1 ? `  ${r.signups} ilmoittautumista` : ''}${r.code ? `  koodi ${r.code}` : ''}${state}`);
        }
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
