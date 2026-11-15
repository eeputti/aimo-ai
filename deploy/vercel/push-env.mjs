// Vie WhatsApp-palvelimen asetukset Vercel-projektin tuotantoympäristöön salaisina muuttujina.
// Lähteet: Macin .env, .env.whatsapp ja deploy/cloudflare/.env.publisher sekä pilven omat arvot
// deploy/vercel/.env.cloud-tiedostosta (Turso-osoitteet, Turso-avain, tick-salaisuus, julkinen osoite).
// Arvot kulkevat Vercelin komentorivityökalulle stdinin kautta, eivät komentoriville tai lokiin.
// Käyttö projektikansiosta, kun projekti on linkitetty (vercel link): node deploy/vercel/push-env.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.env.AIMO_ENV_ROOT || process.cwd();
const read = (file) => {
  const values = new Map();
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
};

const values = new Map();
for (const name of ['.env', '.env.whatsapp', 'deploy/cloudflare/.env.publisher']) for (const [k, v] of read(path.join(root, name))) values.set(k, v);
const cloud = read(path.join(root, 'deploy/vercel/.env.cloud'));
for (const [k, v] of cloud) values.set(k, v);
// Paikallisen ajon asetuksia, joilla ei ole merkitystä pilvessä.
for (const key of ['PORT', 'WHATSAPP_PORT', 'WHATSAPP_ENABLED', 'AIMO_CATALOG']) values.delete(key);
values.set('WHATSAPP_ORDERING_ENABLED', 'true');
values.set('AIMO_LEARNED', '/tmp/aimo-learned.json');
values.set('NODEJS_HELPERS', '0');
if (!values.get('DEMO_NOW_ANCHOR') && values.get('DEMO_NOW')) values.set('DEMO_NOW_ANCHOR', new Date().toISOString());

const required = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_VERSION',
  'WHATSAPP_SUPPORT_CONTACT', 'WHATSAPP_DEMO_PHONE', 'WHATSAPP_PUBLIC_URL', 'ANTHROPIC_API_KEY', 'VALIO_API_KEY', 'VALIO_API_BASE',
  'GATEWAY_PRIVATE_KEY_PEM', 'CLOUDFLARE_DEMO_URL', 'CLOUDFLARE_DEMO_SYNC_TOKEN', 'TURSO_AUTH_TOKEN', 'TICK_SECRET',
  'WHATSAPP_DB', 'WHATSAPP_DRAFT_DB', 'WHATSAPP_QUOTE_DB', 'GATEWAY_DB', 'AIMO_DB'];
const missing = required.filter((k) => !values.get(k));
if (missing.length) { console.error(`Puuttuvat asetukset: ${missing.join(', ')}`); process.exit(1); }
const notRemote = ['WHATSAPP_DB', 'WHATSAPP_DRAFT_DB', 'WHATSAPP_QUOTE_DB', 'GATEWAY_DB', 'AIMO_DB'].filter((k) => !/^libsql:\/\//.test(values.get(k)));
if (notRemote.length) { console.error(`Kannan pitää olla Turso-osoite (libsql://): ${notRemote.join(', ')}`); process.exit(1); }
const local = [...values].filter(([, v]) => /\/(Users|private|var\/folders)\//.test(v)).map(([k]) => k);
if (local.length) { console.error(`Macin paikallinen polku jäisi asetukseen: ${local.join(', ')}`); process.exit(1); }

const dryRun = process.argv.includes('--dry-run');
for (const [key, value] of values) {
  if (dryRun) { console.log(`${key} (${value.length} merkkiä)`); continue; }
  const result = spawnSync('npx', ['--yes', 'vercel@latest', 'env', 'add', key, '--environment', 'production', '--force', '--sensitive', '--yes'],
    { input: value, encoding: 'utf8', cwd: root, stdio: ['pipe', 'ignore', 'pipe'] });
  if (result.status !== 0) { console.error(`${key}: epäonnistui. ${String(result.stderr).split('\n').filter(Boolean).slice(-2).join(' ')}`); process.exit(1); }
  console.log(`${key}: asetettu`);
}
