// Read-only startup checks. Never import an application store, open SQLite, or call an API here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createConfiguredTranscriber } from '../server/whatsapp/transcribe.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

function canonical(filename) {
  const tail = []; let parent = filename;
  while (!fs.existsSync(parent)) {
    tail.unshift(path.basename(parent));
    const next = path.dirname(parent);
    if (next === parent) throw new Error('NO_PARENT');
    parent = next;
  }
  return path.join(fs.realpathSync(parent), ...tail);
}

function writableTarget(filename) {
  if (fs.existsSync(filename)) {
    if (!fs.statSync(filename).isFile()) throw new Error('NOT_FILE');
    fs.accessSync(filename, fs.constants.R_OK | fs.constants.W_OK);
  }
  let parent = path.dirname(filename);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  if (!fs.statSync(parent).isDirectory()) throw new Error('NOT_DIRECTORY');
  fs.accessSync(parent, fs.constants.W_OK | fs.constants.X_OK); // SQLite also writes WAL/SHM next to the DB.
}

export function checkWhatsAppEnvironment(env = process.env, { cwd = process.cwd(), root = ROOT, nodeVersion = process.versions.node } = {}) {
  const errors = []; const warnings = [];
  const add = (list, code, message) => list.push({ code, message });
  const error = (code, message) => add(errors, code, message);
  const warn = (code, message) => add(warnings, code, message);
  const value = (key) => String(env[key] || '').trim();
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (!(major > 22 || major === 22 && minor >= 13)) error('NODE_VERSION', 'Tarvitaan Node.js 22.13 tai uudempi.');
  for (const key of ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_API_VERSION', 'WHATSAPP_SUPPORT_CONTACT']) {
    if (!value(key)) error('MISSING_SETTING', `${key} puuttuu.`);
  }
  if (value('WHATSAPP_PHONE_NUMBER_ID') && !/^\d+$/.test(value('WHATSAPP_PHONE_NUMBER_ID'))) error('PHONE_ID', 'WHATSAPP_PHONE_NUMBER_ID tarvitsee Metan teknisen numerotunnisteen.');
  if (value('WHATSAPP_API_VERSION') && !/^v\d+\.\d+$/.test(value('WHATSAPP_API_VERSION'))) error('API_VERSION', 'WHATSAPP_API_VERSION tarvitsee muodon vXX.X.');
  if (env.WHATSAPP_ORDERING_ENABLED && !['true', 'false'].includes(env.WHATSAPP_ORDERING_ENABLED)) error('ORDERING_FLAG', 'WHATSAPP_ORDERING_ENABLED on true tai false ilman välilyöntejä.');
  const ordering = env.WHATSAPP_ORDERING_ENABLED === 'true';
  const portText = String(env.WHATSAPP_PORT || env.PORT || '4748');
  const validPort = /^\d+$/.test(portText) && Number(portText) >= 1 && Number(portText) <= 65535;
  if (!validPort) error('PORT', 'WHATSAPP_PORT tai PORT tarvitsee portin väliltä 1–65535.');
  if (env.WHATSAPP_DEMO_PHONE && !/^\+?[1-9]\d{6,14}$/.test(env.WHATSAPP_DEMO_PHONE)) error('DEMO_PHONE', 'WHATSAPP_DEMO_PHONE tarvitsee kansainvälisen puhelinnumeron ilman välilyöntejä.');

  const defaults = { WHATSAPP_DB: 'whatsapp.db', WHATSAPP_DRAFT_DB: 'whatsapp-drafts.db', WHATSAPP_QUOTE_DB: 'whatsapp-quotes.db', GATEWAY_DB: 'gateway.db', AIMO_DB: 'aimo.db' };
  const keys = ordering ? Object.keys(defaults) : ['WHATSAPP_DB'];
  const databasePaths = {};
  const seen = new Map(); const inodes = new Map();
  const sharedPaths = ['gateway.db', 'aimo.db'].map((name) => path.join(root, 'data', name));
  const shared = new Set(sharedPaths.map(canonical));
  const sharedInodes = new Set(sharedPaths.filter(fs.existsSync).map((filename) => {
    const stat = fs.statSync(filename); return `${stat.dev}:${stat.ino}`;
  }));
  for (const key of keys) {
    if (env[key] && env[key] !== value(key)) error('PATH_WHITESPACE', `${key}: poista polun alku- ja loppuvälilyönnit.`);
    if (ordering && ['GATEWAY_DB', 'AIMO_DB'].includes(key) && !value(key)) error('ISOLATED_DB_REQUIRED', `${key} tarvitsee WhatsAppille erillisen pysyvän kantapolun.`);
    if (value(key) === ':memory:') { error('VOLATILE_DB', `${key} ei voi olla muistissa käynnistyspaketissa.`); continue; }
    const filename = value(key) ? path.resolve(cwd, value(key)) : path.join(root, 'data', defaults[key]);
    databasePaths[key] = filename;
    try {
      const actual = canonical(filename);
      if (shared.has(actual)) error('SHARED_DB', `${key} osoittaa verkkokaupan keittiö- tai gateway-kantaan.`);
      if (seen.has(actual)) error('DB_COLLISION', `${key} ja ${seen.get(actual)} osoittavat samaan kantaan.`);
      seen.set(actual, key);
      if (fs.existsSync(filename)) {
        const stat = fs.statSync(filename); const inode = `${stat.dev}:${stat.ino}`;
        if (sharedInodes.has(inode) && !shared.has(actual)) error('SHARED_DB', `${key} on verkkokaupan keittiö- tai gateway-kannan linkki.`);
        if (inodes.has(inode) && inodes.get(inode) !== key && !errors.some((e) => e.code === 'DB_COLLISION' && e.message.startsWith(key))) error('DB_COLLISION', `${key} ja ${inodes.get(inode)} ovat saman kantatiedoston linkkejä.`);
        inodes.set(inode, key);
      }
      writableTarget(filename);
    } catch { error('DB_NOT_WRITABLE', `${key}: kantatiedoston ja sen hakemiston pitää olla kirjoitettavissa.`); }
  }

  let catalogProducts;
  if (ordering) {
    if (env.AIMO_CATALOG && env.AIMO_CATALOG !== value('AIMO_CATALOG')) error('PATH_WHITESPACE', 'AIMO_CATALOG: poista polun alku- ja loppuvälilyönnit.');
    const catalog = value('AIMO_CATALOG') ? path.resolve(cwd, value('AIMO_CATALOG')) : path.join(root, 'data', 'catalog.json');
    try {
      const products = JSON.parse(fs.readFileSync(catalog, 'utf8'));
      if (!Array.isArray(products) || !products.length || !products.every((p) => p && p.id != null && typeof p.name === 'string')) throw new Error('BAD_CATALOG');
      catalogProducts = products.length;
    } catch { error('CATALOG', 'AIMO_CATALOG tai data/catalog.json puuttuu tai ei ole kelvollinen tuotekatalogi. Aja npm run catalog.'); }
    try {
      if (env.GATEWAY_PRIVATE_KEY_PEM && !value('GATEWAY_PRIVATE_KEY_PEM')) throw new Error('EMPTY_KEY');
      const keyFile = path.join(root, 'data', 'gateway-ed25519.pem');
      const pem = value('GATEWAY_PRIVATE_KEY_PEM') || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '');
      if (pem) {
        if (crypto.createPrivateKey(pem.replace(/\\n/g, '\n')).asymmetricKeyType !== 'ed25519') throw new Error('KEY_TYPE');
      } else writableTarget(keyFile); // The gateway generates its first key on the persistent data volume.
    } catch { error('SIGNING_KEY', 'GATEWAY_PRIVATE_KEY_PEM tai pysyvän data-hakemiston Ed25519-avain ei ole käyttökelpoinen.'); }
    if (!value('ANTHROPIC_API_KEY')) warn('RULE_INTERPRETER', 'Kielimalli ei ole asetettu: keskustelu tulkitaan säännöillä.');
    if (!value('VALIO_API_KEY')) warn('SIMULATED_PRICES', 'VALIO_API_KEY puuttuu: hinnat ja saatavuus simuloidaan.');
    if (env.WHATSAPP_MEDIA && !['true', 'false'].includes(env.WHATSAPP_MEDIA)) error('MEDIA_FLAG', 'WHATSAPP_MEDIA on true tai false ilman välilyöntejä.');
    // Litterointiasetus tarkistetaan ennen käynnistystä ilman verkkokutsua: puuttuva avain pysäyttäisi botin (transcribe.mjs).
    if (env.WHATSAPP_MEDIA !== 'false') {
      try {
        if (!createConfiguredTranscriber(env)) warn('NO_VOICE', 'WHATSAPP_TRANSCRIBE puuttuu: ääniviestejä ei litteroida, botti pyytää kirjoittamaan.');
      } catch (err) { error('TRANSCRIBE', err.message); }
    }
    if (value('DEMO_NOW')) {
      const normalized = value('DEMO_NOW').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
      if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(normalized) || Number.isNaN(Date.parse(normalized))) error('DEMO_CLOCK', 'DEMO_NOW tarvitsee ISO-päivämäärän tai aikaleiman.');
      else warn('SIMULATED_CLOCK', 'DEMO_NOW on asetettu: demon kello on simuloitu.');
    }
  } else if (!['ANTHROPIC_API_KEY', 'ASSISTANT_MCP_URL', 'ASSISTANT_MCP_TOKEN'].every((key) => value(key))) {
    warn('READ_ONLY_AGENT_NOT_READY', 'Vain lukevan tuotehaun malli-/MCP-asetukset puuttuvat. Yhdistäminen ja tuki toimivat ilman niitä.');
  }
  return { ok: errors.length === 0, mode: ordering ? 'ordering-demo' : 'read-only-test', port: validPort ? Number(portText) : null, catalogProducts, errors, warnings, databasePaths };
}

// Only this summary is public output; database paths and all environment values stay private.
export function formatPreflight(result, json = false) {
  const { databasePaths: _private, ...safe } = result;
  if (json) return JSON.stringify(safe, null, 2);
  return [`WhatsApp-käynnistys: ${safe.ok ? 'asetukset kunnossa' : 'ESTYY'}`, `Tila: ${safe.mode}; portti: ${safe.port ?? 'virheellinen'}`,
    ...safe.errors.map((e) => `VIRHE [${e.code}] ${e.message}`), ...safe.warnings.map((w) => `HUOMIO [${w.code}] ${w.message}`),
    'Paikallinen tarkistus: ei avaa kantoja, tee verkkokutsuja tai todista Metan lähetysoikeutta.'].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkWhatsAppEnvironment();
  console.log(formatPreflight(result, process.argv.includes('--json')));
  if (!result.ok) process.exitCode = 1;
}
