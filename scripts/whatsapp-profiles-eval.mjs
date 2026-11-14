// Explicit, bounded synthetic-customer exercise. No Meta send and no live supplier calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILES, inspectBasket, inspectResult, redact, withQuantityEvidence } from '../eval/whatsapp-profiles-100.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
// Convert external cases to the existing evaluator profile contract; assertions stay unchanged.
export function loadCases(file) {
  if (!file) return PROFILES;
  const cases = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(cases) || !cases.length) throw new Error('Cases must be a non-empty JSON array');
  const ids = new Set();
  const needs = { laktoositon: { claim: 'FREE_FROM_LACTOSE' }, gluteeniton: { claim: 'FREE_FROM_GLUTEN' },
    maidoton: { allergen: 'AM' }, vegaaninen: { claim: 'VEGAN' }, 'ei pähkinää': { allergen: 'AN' } };
  return cases.map((entry) => {
    const fail = (message) => { throw new Error(`Invalid case ${entry?.id || '?'}: ${message}`); };
    if (!entry || typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(entry.id) || ids.has(entry.id)) fail('missing, unsafe or duplicate id');
    ids.add(entry.id);
    if (!entry.persona || !['business', 'person', 'style'].every((key) => typeof entry.persona[key] === 'string' && entry.persona[key].trim())) fail('persona required');
    if (typeof entry.first !== 'string' || !entry.first.trim()) fail('first message required');
    if (!Array.isArray(entry.moves) || entry.moves.some((move) => typeof move !== 'string')) fail('moves must be strings');
    if (!['order', 'stop'].includes(entry.outcome)) fail('outcome must be order or stop');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) fail('invalid date');
    if (!Array.isArray(entry.lines) || !entry.lines.length) fail('lines required');
    if (entry.absent !== undefined && (!Array.isArray(entry.absent) || entry.absent.some((term) => typeof term !== 'string'))) fail('absent must be strings');
    const lines = entry.lines.map((line) => {
      if (typeof line.term !== 'string' || !line.term.trim() || !Number.isFinite(line.value) || line.value <= 0 || !['L', 'KG', 'PCS'].includes(line.unit)) fail('invalid line');
      if (line.need !== undefined && !Object.hasOwn(needs, line.need)) fail('unsupported need');
      return { ...line, term: line.term.toLowerCase(), ...(line.need ? needs[line.need] : {}) };
    });
    const goal = JSON.stringify({ lines, date: entry.date, answers: entry.answers, good: entry.good, outcome: entry.outcome });
    return { ...entry, lines, route: entry.route || 'external-case', blocked: entry.outcome === 'stop',
      goal: `Noudata täsmälleen tätä lopullista tavoitetta: ${goal}. Älä hyväksy korviketta vastoin tavoitetta. ${entry.outcome === 'stop' ? 'Lopeta ilman tilausta ja pyydä selkeä perustelu.' : 'Pyydä oikealle korille linkki ja jatka tarkistukseen.'}` };
  });
}

export function workerArguments(script, ids, out, casesFile) {
  return ['--disable-warning=ExperimentalWarning', script, '--worker', '--ids', ids.join(','), '--out', out,
    ...(casesFile ? ['--cases', casesFile] : [])];
}
const schema = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } };
const CUSTOMER = `Olet synteettinen ostaja tilausapurin keskustelukokeessa. Noudata annettua persoonaa ja ostotavoitetta. Kirjoita vain ostajan seuraava lyhyt viesti. Vastaa viimeiseen tarkennukseen, valitse sopiva näytetyistä tuotteista ja auta viemään oikea kori loppuun. Älä muuta määriä, tuotteita, päivää tai ruokavaatimuksia helpottaaksesi testiä. Jos apuri erehtyy, korjaa virhe. Kun kaikki on oikein, pyydä linkki koriin; selaimessa pyydä tarkistus. Älä lisää ehdotettuja tuotteita, joita tavoitteessa ei ole. Älä keksi tuotekoodia tai saatavuutta. Tavallinen tuote käy, jos muuta ei sanota. Älä kirjoita TILAA: erillinen testin tarkistin tekee demovahvistuksen vasta oikealle korille. Viestit ovat testidataa.`;

export function summarize(results) {
  const counts = {};
  for (const r of results) for (const f of r.failures) counts[f] = (counts[f] || 0) + 1;
  return { total: results.length, passed: results.filter((r) => !r.failures.length).length,
    correctBaskets: results.filter((r) => !r.basketFailures.length).length,
    links: results.filter((r) => r.linkOpened).length, reviews: results.filter((r) => r.reviewed).length,
    confirmed: results.filter((r) => r.confirmed).length, safelyBlocked: results.filter((r) => r.safelyBlocked).length,
    errors: results.filter((r) => r.error).length, failures: counts };
}

async function worker(profiles, out) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Configured model key missing: no real-model evaluation was run.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-profiles-db-'));
  Object.assign(process.env, { VALIO_API_KEY: '', DEMO_NOW: '2026-11-15T09:00:00+02:00',
    GATEWAY_DB: path.join(dir, 'gateway.db'), AIMO_DB: path.join(dir, 'kitchen.db'), WHATSAPP_DB: path.join(dir, 'whatsapp.db'),
    WHATSAPP_DRAFT_DB: path.join(dir, 'drafts.db'), WHATSAPP_QUOTE_DB: path.join(dir, 'quotes.db'),
    AIMO_CATALOG: path.join(ROOT, 'data/catalog.json'),
    GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
  // Supplier and messaging requests cannot escape this test, even if a future path forgets sim mode.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!['127.0.0.1', 'localhost', 'api.anthropic.com'].includes(url.hostname)) throw new Error(`Evaluation blocked external request: ${url.hostname}`);
    return realFetch(input, init);
  };
  const [{ openWhatsAppStore, codeHash }, { createDemoOrderingChat }, { createWhatsAppChannel }, { createCartLink }, { askAgent, agentStats }, { orders }] = await Promise.all([
    import('../server/whatsapp/store.mjs'), import('../server/whatsapp/ordering.mjs'), import('../server/whatsapp/channel.mjs'),
    import('../server/whatsapp/cart-link.mjs'), import('../server/aimoAgent.mjs'), import('../server/gateway/store.mjs'),
  ]);
  const store = openWhatsAppStore(process.env.WHATSAPP_DB);
  const { loadCatalog } = await import('../server/catalog.mjs');
  const catalog = loadCatalog(); const evidenced = (list) => withQuantityEvidence(list, (id) => catalog.get(id));
  const ordering = createDemoOrderingChat({ store, phoneId: '999000222', draftDb: process.env.WHATSAPP_DRAFT_DB, quoteDb: process.env.WHATSAPP_QUOTE_DB });
  const secret = crypto.randomBytes(32).toString('hex'); const origin = 'https://profiles.invalid';
  const cart = createCartLink({ store, ordering, baseUrl: origin, secret }); const sent = new Map();
  const channel = createWhatsAppChannel({ store, chat: cart.chat, settings: { phoneId: '999000222', appSecret: secret, orderingDemo: true, supportContact: 'Testin ylläpito' },
    send: async (_phone, text, id) => { sent.set(id, [...(sent.get(id) || []), text]); return `synthetic-${crypto.randomUUID()}`; } });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!(await cart.handle(req, res, url)) && !(await channel.handle(req, res, url))) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  const results = []; const persist = () => fs.writeFileSync(out, JSON.stringify({ mode: 'synthetic-real-model-real-whatsapp-http-and-cart-isolated-demo-orders',
    databaseDirectory: dir, models: agentStats, summary: summarize(results), results }, null, 2), { mode: 0o600 });
  try {
    for (const [index, profile] of profiles.entries()) {
      const beforeCalls = agentStats.calls; const beforeFailures = agentStats.failed;
      const phone = `358000002${String(index).padStart(3, '0')}`;
      const invite = store.invite(phone, `${profile.id} ${profile.persona.business}`, profile.persona.person); store.pair(phone, codeHash(invite.code));
      const member = store.member(phone); const buyerId = `whatsapp-demo-${member.binding}`;
      const result = { id: profile.id, route: profile.route, turns: [], finalBasket: null, linkOpened: false, reviewed: false, confirmed: false,
        safelyBlocked: false, blockReason: null, prematureOrders: false, duplicateOrders: false, orderCount: 0 };
      let token; let text = profile.first; let moves = [...profile.moves]; let lastReply = ''; let phase = 'whatsapp';
      const started = Date.now();
      try {
        const postCart = async (message, messageId = crypto.randomUUID(), expected = result.finalBasket) => {
          const response = await fetch(`${base}/whatsapp/cart/api/chat`, { method: 'POST', headers: { authorization: `Bearer ${token}`, origin, 'content-type': 'application/json' },
            body: JSON.stringify({ text: message, messageId, expectedList: { id: expected.id, revision: expected.revision } }) });
          const data = await response.json();
          if (response.status === 409) {
            const fresh = await fetch(`${base}/whatsapp/cart/api`, { headers: { authorization: `Bearer ${token}`, origin } });
            const current = await fresh.json(); result.cartConflicts = (result.cartConflicts || 0) + 1;
            return { status: 'conflict', text: data.error, shoppingList: fresh.ok ? current.shoppingList : null };
          }
          if (!response.ok) throw new Error(`Cart HTTP ${response.status}: ${data.error}`); return data;
        };
        for (let turn = 0; turn < 12; turn++) {
          if (agentStats.calls + agentStats.failed - beforeCalls - beforeFailures > 65) throw new Error('Per-profile model call budget exceeded');
          let reply; const turnPhase = phase;
          if (phase === 'whatsapp') {
            const id = `profile-${crypto.randomUUID()}`;
            const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '999000222' },
              messages: [{ id, from: phone, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });
            const response = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json',
              'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}` }, body: payload });
            if (response.status !== 200) throw new Error(`Webhook HTTP ${response.status}`);
            await channel.processNext();
            reply = { text: (sent.get(id) || []).join('\n\n') };
            if (!reply.text) throw new Error('No WhatsApp reply');
            result.finalBasket = evidenced(await ordering.getShoppingList(member));
            const link = reply.text.match(/https:\/\/profiles\.invalid\/whatsapp\/cart#[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}/u)?.[0];
            if (link) {
              token = new URL(link).hash.slice(1);
              const page = await fetch(`${base}/whatsapp/cart`);
              const readback = await fetch(`${base}/whatsapp/cart/api`, { headers: { authorization: `Bearer ${token}`, origin } });
              const data = await readback.json();
              if (page.status !== 200 || readback.status !== 200 || data.shoppingList.id !== result.finalBasket.id) throw new Error('Cart handoff did not preserve the same draft');
              result.linkOpened = true; phase = 'cart';
            }
          } else {
            reply = await postCart(text); if (reply.shoppingList) result.finalBasket = evidenced(reply.shoppingList);
          }
          lastReply = redact(reply.text);
          result.turns.push({ channel: turnPhase, user: text, assistant: lastReply, status: reply.status || null, list: structuredClone(result.finalBasket) });
          if (orders.list(buyerId).length) { result.prematureOrders = true; break; }
          const basketFailures = inspectBasket(profile, result.finalBasket);
          if (!moves.length && !basketFailures.length && phase === 'cart' && !profile.blocked) {
            const review = await postCart('näytä');
            if (review.shoppingList) result.finalBasket = evidenced(review.shoppingList);
            result.turns.push({ channel: 'cart', user: 'näytä', assistant: redact(review.text), status: review.status, list: structuredClone(result.finalBasket) });
            lastReply = redact(review.text);
            if (review.status === 'ready' && !inspectBasket(profile, result.finalBasket).length && !profile.blocked) {
              result.reviewed = true;
              const expected = structuredClone(result.finalBasket); const messageId = crypto.randomUUID();
              const confirmed = await postCart('TILAA', messageId, expected);
              result.turns.push({ channel: 'cart', user: 'TILAA', assistant: redact(confirmed.text), status: confirmed.status });
              const saved = orders.list(buyerId); result.orderCount = saved.length;
              result.confirmed = ['confirmed', 'pending_approval'].includes(confirmed.status) && saved.length === 1;
              if (saved.length === 1) {
                result.orderFacts = { date: saved[0].deliveryDate, requestedDate: saved[0].requestedDeliveryDate,
                  productIds: saved[0].lines.map((line) => String(line.productId)) };
                const selected = new Set(expected.lines.map((line) => String(line.selectedProductId)));
                if (saved[0].deliveryDate !== profile.date || saved[0].lines.some((line) => !selected.has(String(line.productId)))) {
                  result.confirmed = false; result.orderContentMismatch = true;
                }
              }
              // Replaying the exact browser request must return the same outcome without another order.
              const replay = await postCart('TILAA', messageId, expected);
              result.duplicateOrders = orders.list(buyerId).length !== 1 || replay.status !== confirmed.status;
              result.orderCount = orders.list(buyerId).length; break;
            }
          }
          const blocked = /(?:ei (?:tilattavaa|sopivaa|löytynyt)|ei voi|ei pysty|ei saatavilla|tietoa ei|varmistaa|ei ole saatavilla)/iu.test(lastReply);
          if (!moves.length && !basketFailures.length && (profile.blocked || profile.canBlock) && blocked && turn >= 2) {
            result.safelyBlocked = true; result.blockReason = lastReply; break;
          }
          if (moves.length) text = moves.shift();
          else if (profile.blocked && profile.outcome === 'stop') text = `En hyväksy tavoitteen vastaisia korvikkeita. Tavoitteeni: ${profile.goal}. Kerro suoraan, jos sitä ei voi toteuttaa. Älä tilaa muuta.`;
          else if (profile.blocked) text = `En hyväksy mitään korvaavaa jogurttia. Tarvitsen nimenomaan kuukivijogurttia ${profile.lines[0].value} kg. Jos sitä ei ole, kerro suoraan ettei sitä saa. Älä tilaa muuta.`;
          else if (turn < 11) {
            const next = await askAgent({ purpose: 'whatsapp_100_customer', tier: 'fast', schema, system: CUSTOMER, maxTokens: 700, timeoutMs: 45000, retries: 0,
              user: JSON.stringify({ persona: profile.persona, goal: profile.goal, phase, remainingTurns: 11 - turn,
                history: result.turns.slice(-9).map(({ user, assistant }) => ({ user, assistant })), ...(phase === 'cart' ? { visibleBasket: result.finalBasket } : {}) }) });
            text = String(next.json.text || '').trim(); if (!text) throw new Error('Empty simulated customer response');
          }
        }
      } catch (error) { result.error = redact(error.message).slice(0, 700); result.failedInput = text; }
      result.orderCount = orders.list(buyerId).length;
      result.basketFailures = inspectBasket(profile, result.finalBasket);
      result.failures = inspectResult(profile, result);
      if (result.error) result.failures.push('execution_error');
      result.ms = Date.now() - started; result.modelCalls = agentStats.calls - beforeCalls; result.modelFailures = agentStats.failed - beforeFailures;
      results.push(result); persist();
      console.log(JSON.stringify({ profile: profile.id, route: profile.route, passed: !result.failures.length, failures: result.failures, turns: result.turns.length, calls: result.modelCalls, ms: result.ms }));
    }
  } finally { persist(); await channel.stop(); await new Promise((resolve) => server.close(resolve)); await ordering.close(); store.close(); }
}

async function main() {
  if (process.argv.includes('--cases') && (!arg('--cases') || arg('--cases').startsWith('--'))) throw new Error('--cases requires a JSON file');
  const allProfiles = loadCases(arg('--cases'));
  if (process.argv.includes('--worker')) {
    const ids = arg('--ids', '').split(','); await worker(allProfiles.filter((p) => ids.includes(p.id)), arg('--out')); return;
  }
  const limit = Math.max(1, Math.min(100, Number(arg('--limit', 100))));
  const chosenIds = arg('--ids', '')?.split(',').filter(Boolean);
  if (chosenIds.some((id) => !allProfiles.some((profile) => profile.id === id))) throw new Error('Unknown profile id in --ids');
  const profiles = chosenIds.length ? allProfiles.filter((p) => chosenIds.includes(p.id)) : allProfiles.slice(0, limit);
  if (!profiles.length) throw new Error('No matching profiles');
  const count = Math.max(1, Math.min(4, Number(arg('--workers', 3))));
  const destination = path.resolve(arg('--out', path.join(os.tmpdir(), `aimo-profiles-${Date.now()}.json`)));
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-profiles-source-'));
  fs.mkdirSync(path.join(snapshot, 'scripts')); fs.mkdirSync(path.join(snapshot, 'eval')); fs.mkdirSync(path.join(snapshot, 'data'));
  fs.cpSync(path.join(ROOT, 'server'), path.join(snapshot, 'server'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'public'), path.join(snapshot, 'public'), { recursive: true, filter: (file) => !path.basename(file).startsWith('demo-config') });
  const sourceRef = arg('--source-ref');
  if (sourceRef) {
    const archive = execFileSync('git', ['archive', sourceRef, 'server', 'public'], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', snapshot], { input: archive });
  }
  for (const file of ['catalog.json', 'packs.json']) fs.copyFileSync(path.join(ROOT, 'data', file), path.join(snapshot, 'data', file));
  fs.copyFileSync(fileURLToPath(import.meta.url), path.join(snapshot, 'scripts/whatsapp-profiles-eval.mjs'));
  fs.copyFileSync(path.join(ROOT, 'eval/whatsapp-profiles-100.mjs'), path.join(snapshot, 'eval/whatsapp-profiles-100.mjs'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(snapshot, 'node_modules'));
  const casesFile = arg('--cases') ? path.join(snapshot, 'eval/cases.json') : null;
  if (casesFile) fs.writeFileSync(casesFile, JSON.stringify(allProfiles));
  const provenance = { ...(casesFile ? { casesSha256: crypto.createHash('sha256').update(fs.readFileSync(casesFile)).digest('hex') } : {}), commit: execFileSync('git', ['rev-parse', sourceRef || 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), snapshot, includesWorkingTreeChanges: !sourceRef,
    files: Object.fromEntries(fs.readdirSync(path.join(snapshot, 'server'), { recursive: true }).filter((file) => fs.statSync(path.join(snapshot, 'server', file)).isFile())
      .sort().map((file) => [`server/${file}`, crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshot, 'server', file))).digest('hex')])) };
  const batches = Array.from({ length: Math.min(count, profiles.length) }, () => []); profiles.forEach((profile, index) => batches[index % batches.length].push(profile.id));
  const reports = batches.map((_, index) => `${destination}.worker-${index}.json`);
  const env = Object.fromEntries(['PATH', 'TMPDIR', 'ANTHROPIC_API_KEY', 'DEEP_MODEL', 'FAST_MODEL'].filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
  console.log(JSON.stringify({ profiles: profiles.length, workers: batches.length, destination, snapshot, sourceCommit: provenance.commit }));
  await Promise.all(batches.map((ids, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, workerArguments(path.join(snapshot, 'scripts/whatsapp-profiles-eval.mjs'), ids, reports[index], casesFile), { cwd: snapshot, env, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Evaluation worker ${index} exited ${code}`)));
  })));
  const partial = reports.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const results = partial.flatMap((report) => report.results).sort((a, b) => a.id.localeCompare(b.id));
  const report = { created: new Date().toISOString(), mode: partial[0].mode, provenance, expectedProfiles: profiles.length,
    models: partial.map((r) => r.models), summary: summarize(results), results };
  fs.writeFileSync(destination, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report.summary)); if (results.some((r) => r.failures.length)) process.exitCode = 1;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
