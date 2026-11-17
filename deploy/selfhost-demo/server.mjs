import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { demoSettings, ownState } from './settings.mjs';
import { PRODUCTS, demoTools } from './catalog.mjs';
// Import application modules only after start.mjs has created the isolated child environment.
if (process.env.DEMO_CHILD !== 'true' || process.env.AIMO_MODEL_PROVIDER !== 'ollama') throw new Error('Käynnistä demo start.mjs-tiedostolla.');
const cfg = demoSettings(); ownState(cfg.stateDir);
const lock = path.join(cfg.stateDir, '.running');
try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); }
catch { throw new Error('Demotila on jo varattu. Pysäytä toinen demo ennen samaan tilaan käynnistämistä.'); }
process.on('exit', () => { fs.rmSync(lock, { force: true }); });
fs.writeFileSync(process.env.AIMO_CATALOG, JSON.stringify(PRODUCTS), { mode: 0o600 });
const [{ openDraftStore }, { createOrderingConversation }, { createModelInterpreter }, { shoppingListView }, { askOllama }] = await Promise.all([
  import('../../server/order-conversation/store.mjs'), import('../../server/order-conversation/index.mjs'),
  import('../../server/order-conversation/interpret.mjs'), import('../../server/shopping-list/index.mjs'), import('../../server/ollama-agent.mjs'),
]);
const store = openDraftStore(path.join(cfg.stateDir, 'drafts.db'));
const tools = demoTools(); let modelCalls = 0;
const interpret = createModelInterpreter({
  ask: async (args) => {
    modelCalls++;
    const msg = await askOllama({ ...args, settings: cfg, model: cfg.ollamaModel, timeoutMs: cfg.timeout,
      // CPU demo weights can be memory-mapped; no copy of a multi-GB model is required in RAM.
      fetchImpl: (url, opts) => { const body = JSON.parse(opts.body); body.options.use_mmap = true; return fetch(url, { ...opts, body: JSON.stringify(body) }); } });
    const text = msg.content[0].text;
    return { text, json: args.schema ? JSON.parse(text) : null };
  },
  fallback: () => { throw new Error('Mallin vastaus ei valmistunut.'); },
});
const handleTurn = createOrderingConversation({ store, tools, interpretTurn: interpret });
const queues = new Map();
const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
function session(req, res) {
  const sid = req.headers.cookie?.match(/(?:^|;\s*)selfhost_demo=([a-f0-9-]{36})(?:;|$)/)?.[1] || crypto.randomUUID();
  res.setHeader('set-cookie', `selfhost_demo=${sid}; HttpOnly; SameSite=Strict; Path=/`);
  const customer = { customerId: `demo:${sid}`, buyerId: `demo:${sid}`, bindingVersion: sid,
    companyName: 'Demokeittiö', personName: 'Testaaja', deliverySites: [{ id: 'demo-site', label: 'Demokeittiö' }],
    permissions: { readProducts: true, placeOrders: false } };
  const conversationId = `selfhost:${sid}`;
  return { sid, customer, conversationId, cart: () => shoppingListView(store.active(conversationId), customer) };
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16000) throw new Error(); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function modelStatus() {
  try {
    const r = await fetch(`${cfg.ollamaUrl}/api/tags`, { redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: cfg.ollamaToken ? { authorization: `Bearer ${cfg.ollamaToken}` } : {} });
    if (!r.ok) throw new Error();
    const data = await r.json();
    const ready = data.models?.some((m) => m.name === cfg.ollamaModel || m.model === cfg.ollamaModel) === true;
    return { ready, model: cfg.ollamaModel, message: ready ? 'Malli ladattu. Voit kokeilla ostoslistaa.' : 'Lataa valittu malli Ollama-palvelimelle ennen kokeilua.' };
  } catch { return { ready: false, model: cfg.ollamaModel, message: 'Yhteyttä mallipalvelimeen ei saatu.' }; }
}
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
      || ['forwarded', 'x-forwarded-for', 'cf-connecting-ip', 'cf-ray', 'x-real-ip'].some((k) => req.headers[k])) return json(res, 403, { error: 'Demo avataan paikallisesta osoitteesta tai SSH-porttivälityksellä.' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Pyyntö hylätty.' });
    const url = new URL(req.url, `http://${host}`);
    if (req.method === 'GET' && url.pathname === '/') {
      session(req, res);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' });
      return res.end(fs.readFileSync(new URL('page.html', import.meta.url)));
    }
    if (req.method === 'GET' && ['/app.js', '/style.css'].includes(url.pathname)) {
      res.writeHead(200, { 'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
      return res.end(fs.readFileSync(new URL(url.pathname.slice(1), import.meta.url)));
    }
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ...await modelStatus(), modelCalls,
      isolated: true, sendsOrders: false, products: PRODUCTS.map(({ name }) => name) });
    if (req.method === 'GET' && url.pathname === '/api/cart') return json(res, 200, { cart: session(req, res).cart() });
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Tarvitaan JSON.' });
      let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Virheellinen viesti.' }); }
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000 || !/^[a-f0-9-]{36}$/.test(input.id || '')) return json(res, 400, { error: 'Kirjoita enintään 2000 merkkiä.' });
      const s = session(req, res);
      const pending = queues.get(s.sid) || Promise.resolve();
      const turn = pending.then(async () => {
        const t0 = Date.now();
        const result = await handleTurn({ customer: s.customer, conversationId: s.conversationId, messageId: `${s.sid}:${input.id}`, text: input.text.trim() });
        const text = String(result.text).replace('Vahvista vastaamalla *TILAA*.', 'Ostoslista on valmis. Tässä demossa tilausta ei lähetetä.')
          .replace('Luonnos odottaa vahvistusta: vastaa *TILAA*, kun haluat tilata.', 'Luonnos on tallessa. Voit muuttaa sitä viestillä.');
        return { text, status: result.status, cart: s.cart(), ms: Date.now() - t0, model: cfg.ollamaModel };
      });
      const tail = turn.catch(() => {}); queues.set(s.sid, tail);
      void tail.then(() => { if (queues.get(s.sid) === tail) queues.delete(s.sid); });
      return json(res, 200, await turn);
    }
    return json(res, 404, { error: 'Not found' });
  } catch { return json(res, 502, { error: 'Kokeilu epäonnistui. Tarkista mallipalvelin ja yritä uudelleen.' }); }
});
server.requestTimeout = cfg.timeout + 15000;
server.listen(cfg.port, cfg.container ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Erillinen mallidemo: http://localhost:${cfg.port} (malli ${cfg.ollamaModel})`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { store.close(); process.exit(0); });
  server.closeIdleConnections();
});
