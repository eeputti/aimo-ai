// HTTP-palvelin ilman kehyksiä: staattinen UI + JSON-rajapinta + SSE. Käynnistys: npm start → http://localhost:4747
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, apiMode, llmEnabled } from './config.mjs';
import { loadCatalog, ROOT, publicProduct } from './catalog.mjs';
import { kv, proposals, orders, history, audit, auditList, onAudit } from './db.mjs';
import { apiStats, fetchQuotes, ping } from './valioApi.mjs';
import { llmStats } from './llm.mjs';
import { seedDemo, todayIso, weekKey, defaultDeliveryDate } from './demo.mjs';
import { runDeep, deepState, templateBriefing } from './agents/deep.mjs';
import { handleChat, addProduct, optionCard } from './agents/fast.mjs';
import { evaluate, activeLines, setQty, removeLine, decide, applyQuote, findLine, fmtQty, fmtMoney, DEFAULT_RULES, normalizeRules } from './proposal.mjs';
import { subscribe } from './bus.mjs';
import { handleGateway, bootGateway } from './gateway/http.mjs';
import { ledger as gatewayLedger } from './gateway/store.mjs'; // Aimo Agent Gateway: /v1, /mcp, /console, /.well-known, /openapi.json
import { serveImage } from './images.mjs';
import { staticAssetHeaders } from './static-assets.mjs';
import { orderMode, setOrderMode } from './mode.mjs';
import { packHint } from './packs.mjs';
import { validatePlanning } from './planning.mjs';
import { interpret as aimoInterpret, warm as aimoWarm, loadLexicon as aimoLexicon } from './aimo/index.mjs'; // Aimo-malli: vapaa teksti → rakenteinen pyyntö
import { searchStorefront, reviewStorefront, validDeliveryDate } from './storefront.mjs';
import { analyzeRecipeSource, recipeProducts } from './recipe-import.mjs';
import { handleAssistantChat, assistantStatus } from './assistant.mjs'; // Tilausapuri: Danielin MCP-agentti sivulla /assistant.html

import { createConfiguredWhatsApp } from './whatsapp/runtime.mjs';
const whatsapp = process.env.WHATSAPP_ENABLED === 'true' ? createConfiguredWhatsApp() : null;

const PUBLIC = path.join(ROOT, 'public');

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req, limit = 1e6) => new Promise((resolve, reject) => {
  let data = ''; let bytes = 0;
  req.on('data', (chunk) => { bytes += chunk.length; if (bytes > limit) { data = ''; reject(Object.assign(new Error('Liian suuri pyyntö'), { status: 413 })); return; } data += chunk; });
  req.on('end', () => { if (bytes > limit) return; try { resolve(data ? JSON.parse(data) : {}); } catch (err) { reject(err); } });
  req.on('error', reject);
});
function sse(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  return (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
}

const rulesNow = () => normalizeRules(kv.get('rules', {}));
const planningCurrent = (p) => (p.planningRevision ?? 0) === kv.get('planningRevision', 0);
function statePayload(t0) {
  const proposal = proposals.current();
  if (proposal && proposal.status !== 'ordered') for (const l of activeLines(proposal)) l.pack = l.state === 'ok' ? packHint(l, rulesNow()) : null; // ennen tätä ominaisuutta tallennetut ehdotukset
  return {
    kitchen: kv.get('kitchen'), rules: rulesNow(), proposal,
    order: proposal ? orders.byProposal(proposal.id) : null,
    mode: { api: apiMode(), llm: llmEnabled(), deepModel: config.deepModel, fastModel: config.fastModel },
    deep: { running: deepState.running, lastRun: deepState.lastRun || proposal?.deep || null, steps: deepState.steps },
    stats: { api: apiStats, llm: llmStats, catalog: { products: loadCatalog().products.length, loadMs: loadCatalog().loadMs } },
    today: todayIso(),
    serverMs: +(performance.now() - t0).toFixed(2),
  };
}
/** Muutos → sääntötarkistus → tallennus. Palauttaa päivitetyn ehdotuksen ja keston. */
function commit(proposal, t0, extra = {}) {
  evaluate(proposal, rulesNow());
  proposals.save(proposal);
  return { proposal, ms: +(performance.now() - t0).toFixed(2), ...extra };
}
function draftOr(res) {
  const p = proposals.current();
  if (!p) { json(res, 409, { error: 'Ehdotusta ei ole vielä laadittu' }); return null; }
  if (p.status === 'ordered') { json(res, 409, { error: 'Tilaus on jo lähetetty' }); return null; }
  if (!planningCurrent(p)) { json(res, 409, { error: 'Suunnittelutiedot muuttuivat: odota uutta tilausehdotusta' }); return null; }
  return p;
}

const reviewTokens = new Map(); // token -> {proposalId, hash, expires}
const proposalHash = (p) => crypto.createHash('sha1').update(JSON.stringify(activeLines(p).map((l) => [l.productId, l.qty, l.price?.net]))).digest('hex');

const routes = {
  'GET /api/state': (req, res, t0) => json(res, 200, statePayload(t0)),
  'GET /api/audit': (req, res) => json(res, 200, { entries: auditList(120) }),

  'GET /api/planning': (req, res) => json(res, 200, { menuEvents: kv.get('menuEvents', []), inventory: kv.get('inventory'), incoming: kv.get('incoming', []) }),
  'POST /api/planning': async (req, res) => {
    if (deepState.running) return json(res, 409, { error: 'Odota, että nykyinen tarvelaskenta valmistuu' });
    const body = await readBody(req);
    const keys = ['menuEvents', 'inventory', 'incoming'];
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some((k) => !keys.includes(k))) return json(res, 400, { error: 'Sallitut kentät: menuEvents, inventory ja incoming' });
    const data = Object.fromEntries(keys.map((k) => [k, Object.hasOwn(body, k) ? body[k] : kv.get(k, k === 'inventory' ? null : [])]));
    const errors = validatePlanning(data, loadCatalog());
    if (!errors.length && Object.hasOwn(body, 'menuEvents')) for (const ev of data.menuEvents) for (const g of ev.groups) {
      if (typeof (g.includedInBookings ?? ev.includedInBookings) !== 'boolean') errors.push(`${ev.name || ev.id}: ilmoita includedInBookings, jotta ryhmää ei lasketa kahdesti`);
    }
    if (errors.length) return json(res, 400, { error: 'Suunnittelutiedot ovat puutteelliset', details: errors });
    for (const k of keys) if (Object.hasOwn(body, k)) kv.set(k, data[k]);
    kv.set('planningRevision', kv.get('planningRevision', 0) + 1);
    audit('käyttäjä', 'Päivitti keittiön suunnittelutiedot', { kentat: Object.keys(body) });
    runDeep({ reason: 'resepti- tai varastotiedot päivitetty' }).catch((e) => console.error('[deep]', e));
    json(res, 202, { started: true });
  },

  // Tila-arvaus: millaista tilausta ostaja on tekemässä (säännöt, ei kielimallia). POST vahvistaa arvauksen tai vaihtaa tilan.
  'GET /api/mode': (req, res) => json(res, 200, { mode: orderMode() }),
  'POST /api/mode': async (req, res) => {
    const body = await readBody(req);
    const mode = setOrderMode({ mode: body.mode ? String(body.mode) : undefined, reset: body.reset === true });
    if (!mode) return json(res, 400, { error: 'Tilaa ei voi asettaa' });
    json(res, 200, { mode });
  },

  // Aimo-malli: vapaa ostopyyntö (fi/en) → tulkinta, ehdokkaat katalogista, tarkennusnapit ja valmis request_quote-runko.
  // patch = tarkennusnapin rakenteinen muutos riville item (ei tekstiä): {item: 0, patch: {attributes: {fat: 'fat-free'}}}
  'POST /api/aimo/interpret': async (req, res) => {
    const body = await readBody(req);
    const text = String(body.text || '').slice(0, 600);
    if (!text.trim()) return json(res, 400, { error: 'Kenttä text puuttuu' });
    const out = await aimoInterpret(text, { llm: body.llm !== false, patches: Array.isArray(body.patches) ? body.patches.slice(0, 20) : undefined });
    // Avoimuus: jos pyynnön tulkitsi kielimalli (säännöt eivät riittäneet), siitä jää rivi portin hash-ketjutettuun lokiin.
    if (out.trace.llmCalls || out.trace.modelError) gatewayLedger.append('model', 'MODEL_CALL', { purpose: 'interpret_request', model: out.trace.via, ms: Math.round(out.trace.ms), text, output: out.trace.modelError ? undefined : { items: out.understood.items.map((i) => ({ productTerm: i.productTerm, quantity: i.quantity, claims: i.claims })), deliveryDate: out.understood.deliveryDate, unparsed: out.understood.unparsed }, error: out.trace.modelError || undefined, usedByCode: !out.trace.modelError && !out.handoff, note: 'säännöt eivät ymmärtäneet pyyntöä riittävän varmasti' });
    json(res, 200, out);
  },
  // Etusivun fiksu haku: hinta ja saatavuus vain näkyville osumille (enintään 30 tuotetta). Yksi pyyntö on korkeintaan
  // kaksi Valion API-kutsua (saatavuus + hinta) ja välimuistista ei yhtään; selain kutsuu tätä vasta kirjoitustauon jälkeen.
  'POST /api/storefront/quotes': async (req, res, t0) => {
    const body = await readBody(req);
    const cat = loadCatalog();
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((id) => cat.get(id)).slice(0, 30);
    const asked = typeof body.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate) && body.deliveryDate >= todayIso() ? body.deliveryDate : null;
    const deliveryDate = asked || defaultDeliveryDate();
    const quotes = ids.length ? await fetchQuotes(ids, deliveryDate) : new Map();
    json(res, 200, {
      deliveryDate, dateAssumed: !asked, mode: apiMode(),
      items: ids.map((id) => { const c = optionCard(cat.get(id), quotes.get(id)); return { productId: id, unitLabel: c.unitLabel, price: c.price, availability: c.availability }; }),
      ms: +(performance.now() - t0).toFixed(1),
    });
  },
  'POST /api/storefront/search': async (req, res) => {
    const body = await readBody(req);
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 600) return json(res, 400, { error: 'Kirjoita tarve, enintään 600 merkkiä.' });
    if (body.deliveryDate != null && !validDeliveryDate(body.deliveryDate)) return json(res, 400, { error: 'Tarkista toimituspäivä.' });
    try {
      const out = await searchStorefront(body.text, { deliveryDate: body.deliveryDate || defaultDeliveryDate(), llm: body.llm === true, patches: Array.isArray(body.patches) ? body.patches.slice(0, 20) : [] });
      if (out.trace.llmCalls || out.trace.modelError) gatewayLedger.append('model', 'MODEL_CALL', { purpose: 'storefront_search', model: out.trace.via, ms: out.trace.ms, error: out.trace.modelError || undefined });
      json(res, 200, out);
    } catch (err) { json(res, 400, { error: err.message }); }
  },
  'POST /api/recipes/analyze': async (req, res) => {
    try {
      const out = await analyzeRecipeSource(await readBody(req, 8e6));
      if (out.model) gatewayLedger.append('model', 'MODEL_CALL', { purpose: 'recipe_import', model: out.model, ms: out.ms, recipes: out.recipes.length });
      json(res, 200, out);
    } catch (err) { json(res, err.status || 400, { error: err.message }); }
  },
  'POST /api/recipes/products': async (req, res) => {
    try { json(res, 200, await recipeProducts(await readBody(req))); }
    catch (err) { json(res, err.status || 400, { error: err.message }); }
  },
  'POST /api/storefront/review': async (req, res) => {
    const body = await readBody(req);
    if (!validDeliveryDate(body.deliveryDate) || !Array.isArray(body.lines) || !body.lines.length || body.lines.length > 80 || body.lines.some((l) => !l || typeof l.id !== 'string' || !Number.isFinite(l.qty) || l.qty <= 0 || l.qty > 999999) || new Set(body.lines.map((l) => l.id)).size !== body.lines.length) return json(res, 400, { error: 'Tarkista toimituspäivä ja ostoskorin määrät (1–80 eri tuotetta).' });
    json(res, 200, await reviewStorefront(body.lines, body.deliveryDate));
  },
  'GET /api/assistant/status': (req, res) => json(res, 200, assistantStatus()),
  'POST /api/assistant/chat': async (req, res) => handleAssistantChat(req, res, await readBody(req)),
  'GET /api/aimo/lexicon': (req, res) => { const l = aimoLexicon(); json(res, 200, { stats: l.stats, categories: [...l.categories.values()].sort((a, b) => b.size - a.size) }); },

  'GET /api/events': (req, res) => {
    const send = sse(res);
    send('hello', { deep: { running: deepState.running, steps: deepState.steps } });
    const offBus = subscribe((ev) => send(ev.type, ev));
    const offAudit = onAudit((entry) => send('audit', entry));
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { offBus(); offAudit(); clearInterval(keepAlive); });
  },

  'POST /api/chat': async (req, res) => {
    const { text } = await readBody(req);
    const send = sse(res);
    try { await handleChat(String(text || '').slice(0, 600), send); } catch (err) { console.error(err); send('say', { text: `Virhe: ${String(err.message || err)}` }); send('done', { ms: 0 }); }
    res.end();
  },

  'GET /api/search': async (req, res, t0, url) => {
    const q = url.searchParams.get('q') || '';
    const p = proposals.current();
    const hits = loadCatalog().search(q, { limit: 5 });
    const quotes = p && hits.length ? await fetchQuotes(hits.map((h) => h.product.id), p.deliveryDate) : new Map();
    json(res, 200, { items: hits.map((h) => optionCard(h.product, quotes.get(h.product.id))), ms: +(performance.now() - t0).toFixed(1) });
  },

  'POST /api/line': async (req, res, t0) => {
    const p = draftOr(res); if (!p) return;
    const { lineId, qty, remove, confirm } = await readBody(req);
    const line = findLine(p, lineId);
    if (!line) return json(res, 404, { error: 'Riviä ei löydy' });
    if (remove) { removeLine(p, lineId); audit('käyttäjä', `Poisti rivin ${line.name}`, {}, null, p.id); }
    else if (confirm) { line.qtyConfirmed = true; audit('käyttäjä', `Vahvisti poikkeavan määrän: ${line.name} ${fmtQty(line.qty)} ${line.unitLabel}`, {}, null, p.id); }
    else { const r = setQty(p, lineId, Number(qty)); if (r && r.prev !== r.next) audit('käyttäjä', `Muutti määrää: ${line.name}`, { ennen: r.prev, jalkeen: r.next, yksikko: line.unitLabel }, null, p.id); }
    json(res, 200, commit(p, t0));
  },

  'POST /api/decide': async (req, res, t0) => {
    const p = draftOr(res); if (!p) return;
    const { lineId, choice } = await readBody(req);
    const r = decide(p, lineId, choice);
    if (!r) return json(res, 400, { error: 'Valinta ei ole mahdollinen' });
    if (r.sub) applyQuote(r.sub, (await fetchQuotes([r.sub.productId], p.deliveryDate)).get(r.sub.productId));
    const what = { drop: 'jätti pois', late: 'hyväksyi myöhemmän toimituksen', keep: 'hyväksyi osatoimituksen', swap: `korvasi tuotteella ${r.sub?.name}`, combo: `täydensi tuotteella ${r.sub?.name}` }[r.action];
    audit('käyttäjä', `Poikkeama ratkaistu: ${r.line.name} → ${what}`, r.sub ? { korvaaja: r.sub.productId, maara: `${fmtQty(r.sub.qty)} ${r.sub.unitLabel}` } : {}, null, p.id);
    json(res, 200, commit(p, t0, { focus: r.sub?.lineId || null }));
  },

  // "Yhdellä napilla": hyväksyy agentin suositteleman korvaajan jokaiselle saatavuuspoikkeamalle.
  'POST /api/accept-recommended': async (req, res, t0) => {
    const p = draftOr(res); if (!p) return;
    const focus = []; const done = [];
    for (const line of activeLines(p).filter((l) => l.state === 'decision')) {
      const i = line.options?.findIndex((o) => o.recommended) ?? -1;
      if (i < 0) continue;
      const r = decide(p, line.lineId, i);
      if (!r?.sub) continue;
      applyQuote(r.sub, (await fetchQuotes([r.sub.productId], p.deliveryDate)).get(r.sub.productId));
      focus.push(r.sub.lineId); done.push(`${line.name} → ${r.sub.name}`);
    }
    audit('käyttäjä', `Hyväksyi ${done.length} suositeltua korvaajaa kerralla`, { korvaukset: done }, null, p.id);
    json(res, 200, commit(p, t0, { focus, accepted: done.length }));
  },

  'POST /api/add': async (req, res, t0) => {
    const p = draftOr(res); if (!p) return;
    const { productId, qty } = await readBody(req);
    const r = await addProduct(p, String(productId), Number(qty) || null, 'Valitsit tämän vaihtoehdoista');
    if (!r) return json(res, 404, { error: 'Tuotetta ei löydy' });
    audit('käyttäjä', `Lisäsi tuotteen ${r.line.name}`, { maara: `${fmtQty(r.line.qty)} ${r.line.unitLabel}` }, null, p.id);
    json(res, 200, commit(p, t0, { focus: r.line.lineId }));
  },

  'POST /api/rules': async (req, res, t0) => {
    const body = await readBody(req);
    const rules = { ...rulesNow() };
    for (const key of Object.keys(DEFAULT_RULES)) if (key in body) rules[key] = body[key];
    kv.set('rules', rules);
    audit('käyttäjä', 'Muutti sääntöjä', body);
    const p = proposals.current();
    if (p && p.status !== 'ordered') return json(res, 200, { rules, ...commit(p, t0) });
    json(res, 200, { rules, proposal: p, ms: +(performance.now() - t0).toFixed(2) });
  },

  'POST /api/deep': async (req, res) => {
    const { deliveryDate, reason } = await readBody(req);
    if (deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return json(res, 400, { error: 'Virheellinen päivämäärä' });
    runDeep({ reason: reason || 'käyttäjä käynnisti', deliveryDate }).catch((e) => console.error('[deep]', e));
    json(res, 202, { started: true });
  },

  // Vaihe 1/2: tuore tarkistus rajapinnasta + sääntöportti. Ei vielä lähetä mitään.
  'POST /api/order/review': async (req, res, t0) => {
    const p = draftOr(res); if (!p) return;
    const lines = activeLines(p);
    const quotes = await fetchQuotes(lines.map((l) => l.productId), p.deliveryDate, { fresh: true });
    const diffs = [];
    for (const l of lines) {
      const before = { net: l.price?.net, state: l.availabilityView?.kind };
      applyQuote(l, quotes.get(l.productId));
      if (before.net != null && l.price && Math.abs(l.price.net - before.net) > 0.004) diffs.push({ lineId: l.lineId, name: l.name, kind: 'price', text: `Hinta muuttui ${fmtMoney(before.net)} → ${fmtMoney(l.price.net)}` });
    }
    evaluate(p, rulesNow());
    for (const l of lines) if (l.state === 'decision') diffs.push({ lineId: l.lineId, name: l.name, kind: 'availability', text: l.flags.find((f) => f.severity === 'decision')?.text });
    proposals.save(p);
    const ms = +(performance.now() - t0).toFixed(1);
    if (!p.canOrder) { audit('sääntöportti', 'Tilaus pysäytetty tarkistuksessa', { syyt: p.approvals.map((a) => a.text) }, ms, p.id); return json(res, 200, { ok: false, proposal: p, diffs, ms }); }
    const token = crypto.randomBytes(12).toString('hex');
    reviewTokens.set(token, { proposalId: p.id, hash: proposalHash(p), expires: Date.now() + 5 * 60_000 });
    audit('sääntöportti', 'Tilaus läpäisi tarkistuksen', { riveja: lines.length, summa: p.totals.net, tuore_haku: `${lines.length} tuotetta` }, ms, p.id);
    json(res, 200, { ok: true, token, proposal: p, diffs, ms, checkedAt: new Date().toISOString() });
  },

  // Vaihe 2/2: nimenomainen vahvistus. Challenge-rajapinnassa ei ole tilausendpointia, joten tilaus tallennetaan paikallisesti.
  'POST /api/order/place': async (req, res, t0) => {
    const { token } = await readBody(req);
    const p = proposals.current();
    if (!p) return json(res, 409, { error: 'Ehdotusta ei ole' });
    const existing = orders.byProposal(p.id);
    if (existing) return json(res, 200, { ok: true, order: existing, duplicate: true, proposal: p }); // tuplaklikkaus ei luo toista tilausta
    if (!planningCurrent(p)) return json(res, 409, { error: 'Suunnittelutiedot muuttuivat: tarkista uusi tilausehdotus' });
    const t = reviewTokens.get(token);
    if (!t || t.proposalId !== p.id || t.expires < Date.now()) return json(res, 409, { error: 'Tarkistus on vanhentunut, tarkista tilaus uudelleen' });
    if (t.hash !== proposalHash(p)) return json(res, 409, { error: 'Tilaus muuttui tarkistuksen jälkeen, tarkista uudelleen' });
    reviewTokens.delete(token);
    const lines = activeLines(p);
    const order = {
      id: `AIMO-${p.deliveryDate.replaceAll('-', '')}-${String(orders.count() + 1).padStart(3, '0')}`, proposalId: p.id, placedAt: new Date().toISOString(), deliveryDate: p.deliveryDate,
      simulated: true, note: 'Junction-rajapinnassa ei ole tilausendpointia: tilaus on tallennettu paikalliseen kantaan.',
      totals: p.totals, lines: lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, unit: l.unit, unitLabel: l.unitLabel, net: l.price.net, total: l.total, substituteFor: l.substituteFor?.productId || null })),
    };
    orders.add(order);
    for (const l of lines) history.add(weekKey(p.deliveryDate), p.deliveryDate, l.productId, l.qty); // seuraava ennuste oppii tästä
    p.status = 'ordered';
    proposals.save(p);
    audit('käyttäjä', `Tilaus ${order.id} vahvistettu ja lähetetty`, { riveja: lines.length, summa: p.totals.net, toimitus: p.deliveryDate }, +(performance.now() - t0).toFixed(1), p.id);
    json(res, 200, { ok: true, order, proposal: p });
  },

  'POST /api/reset': async (req, res) => {
    await seedDemo();
    runDeep({ reason: 'demo nollattu' }).catch((e) => console.error('[deep]', e));
    json(res, 202, { started: true });
  },
};

const server = http.createServer(async (req, res) => {
  const t0 = performance.now();
  const url = new URL(req.url, 'http://localhost');
  if (whatsapp && await whatsapp.handle(req, res, url)) return;
  if (await handleGateway(req, res, url)) return; // portin reitit ensin; se käsittelee omat virheensä
  const handler = routes[`${req.method} ${url.pathname}`];
  try {
    if (handler) return await handler(req, res, t0, url);
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Tuntematon reitti' });
    if (req.method === 'GET' && url.pathname.startsWith('/img/')) return await serveImage(res, url.pathname.slice(5));
    const file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    const headers = staticAssetHeaders(file, fs.statSync(file));
    if (headers.etag && req.headers['if-none-match'] === headers.etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: String(err.message || err) }); else res.end();
  }
});

async function boot() {
  const cat = loadCatalog();
  console.log(`Katalogi: ${cat.products.length} tuotetta (${cat.loadMs} ms)`);
  console.log(`Valio API: ${apiMode() === 'live' ? `LIVE (${config.valioBase})` : 'SIMULOITU – lisää VALIO_API_KEY tiedostoon .env'}`);
  console.log(`Claude: ${llmEnabled() ? `päällä (syvä ${config.deepModel}, nopea ${config.fastModel})` : 'pois – sääntöpohjainen reititys (lisää ANTHROPIC_API_KEY)'}`);
  if (apiMode() === 'live') { const p = await ping(); console.log(`  ping: ${p.ok ? `ok ${p.ms} ms` : `EPÄONNISTUI ${p.status || p.error}`}`); }
  bootGateway();
  await aimoWarm();
  console.log(`Aimo-malli: sanasto ${aimoLexicon().stats.concepts} käsitettä, ${aimoLexicon().stats.categories} tuoteryhmää, ${aimoLexicon().stats.brands} merkkiä (${aimoLexicon().stats.ms} ms)`);
  whatsapp?.start();
  server.listen(config.port, () => console.log(`\n→ http://localhost:${server.address().port}\n`));

  // Hintalähteen vaihtuessa (simuloitu ↔ live) demodata alustetaan uudelleen.
  if (!kv.get('kitchen') || (proposals.current() && proposals.current().source !== apiMode())) await seedDemo();
  const current = proposals.current();
  if (current && current.status !== 'ordered' && Object.hasOwn(current.totals || {}, 'budgetCap')) {
    // Poistetaan vanhan luonnoksen budjettipäätös muuttamatta käyttäjän tuotteita tai määriä.
    evaluate(current, rulesNow());
    current.briefing = templateBriefing(current, current.signals || [], activeLines(current).filter((l) => l.state === 'decision'));
    proposals.save(current);
  }
  const stale = !current || current.source !== apiMode() || (current.status !== 'ordered' && current.deliveryDate <= todayIso());
  if (stale) await runDeep({ reason: 'käynnistys', deliveryDate: !current || current.deliveryDate <= todayIso() ? defaultDeliveryDate() : current.deliveryDate }).catch((e) => console.error('[deep]', e));

  // "Yöajo": klo 02 laaditaan seuraava ehdotus, jos edellinen on jo tilattu tai vanhentunut. Keskeneräistä luonnosta ei ylikirjoiteta.
  setInterval(() => {
    const now = new Date();
    const p = proposals.current();
    const done = !p || p.status === 'ordered' || p.deliveryDate <= todayIso();
    if (now.getHours() === 2 && now.getMinutes() === 0 && done && !deepState.running) runDeep({ reason: 'ajastettu yöajo', deliveryDate: defaultDeliveryDate() }).catch((e) => console.error('[deep]', e));
  }, 60_000).unref();
}
boot().catch((err) => { console.error(err); process.exit(1); });
