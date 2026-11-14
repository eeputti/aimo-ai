// Päästä päähän -tarkkuustesti: npm run eval
// Käynnistää oman portti-instanssin (oma kanta, kello kiinnitetty la 14.11.2026 klo 10), ajaa eval/cases.mjs:n pyynnöt
// ulkopuolisen ostoagentin tavoin HTTP:n yli ja vertaa syntynyttä tilausta riippumattoman oraakkelin vastaukseen.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from '../eval/cases.mjs';
import { runBuyerAgent } from '../server/gateway/buyerAgent.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4951; const base = `http://127.0.0.1:${PORT}`;
const NOW = '2026-11-14T10:00:00+02:00';
const key = (process.env.VALIO_API_KEY || '').trim();
if (!key) { console.error('VALIO_API_KEY puuttuu: tarkkuustesti ajetaan oikeaa mock-rajapintaa vasten.'); process.exit(1); }
const valio = (process.env.VALIO_API_BASE || 'https://junction26.valioaimo.fi').replace(/\/$/, '');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const byId = new Map(catalog.map((p) => [p.id, p]));

// ---------- Oraakkeli: oma, yksinkertainen laskenta suoraan rajapinnasta ----------
const matches = (p, n) => n.cat.includes(p.category) && (n.claims || []).every((c) => p.labels?.includes(c)) && (!n.must || n.must.test(p.name)) && (!n.not || !n.not.test(p.name));
// Rajapinnan vastaukset välimuistiin levylle (data/, ei versionhallintaan): mock-data ei muutu, ja kutsurajat ovat tiukat.
const cacheFile = path.join(root, 'data', 'eval-oracle-cache.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
async function raw(kind, ids) {
  const k = `${kind}:${ids.join(',')}`;
  if (cache[k]) return cache[k];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${valio}/api/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-API-Key': key }, body: JSON.stringify({ customer: '123', requestedDate: '2026-11-16', products: ids }) });
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) { cache[k] = await res.json(); fs.writeFileSync(cacheFile, JSON.stringify(cache)); return cache[k]; }
    if (attempt >= 6) throw new Error(`Aimo API ${kind} → HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 8000 * (attempt + 1))); // 429: odotetaan ja yritetään uudelleen
  }
}
async function oracle(n) {
  const ids = catalog.filter((p) => matches(p, n)).map((p) => p.id).sort();
  const sizes = new Map();
  if (!ids.length) return { candidates: 0, best: null, sizes };
  const a = await raw('availability', ids); const pr = await raw('price', ids);
  const price = new Map(pr.products.map((x) => [x.productId, x]));
  const ok = [];
  for (const x of a.products) {
    const line = x.scheduleLines?.[0]; const p = byId.get(x.productId); const c = price.get(x.productId);
    if (!c?.catalogPrice) continue;
    // Myyntiyksikön koko: tuotedata, mutta jos netto ÷ vertailuhinta eroaa siitä yli 10 %, hinta voittaa (esim. "voi 4x5 kg").
    const fromData = n.qty.unit === 'L' ? p.litres : p.kg;
    const fromPrice = c.comparisonUnit === n.qty.unit && c.comparisonPrice?.value ? +(c.catalogPrice.value / c.comparisonPrice.value).toFixed(2) : null;
    const size = fromData && fromPrice && Math.abs(fromData - fromPrice) / fromPrice > 0.1 ? fromPrice : fromData || fromPrice;
    if (!size) continue;
    sizes.set(x.productId, size);
    if (!line || x.salesBlock || line.salesBlock || !(line.availableAmount > 0)) continue;
    if (new Date(String(x.closingTime).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) <= new Date(NOW)) continue; // tilausaika mennyt
    const units = Math.ceil(n.qty.value / size - 1e-9);
    if (line.availableAmount < units) continue;
    ok.push({ id: x.productId, name: p.name, size, units, perUnit: c.catalogPrice.value / size, net: +(units * c.catalogPrice.value).toFixed(2) });
  }
  ok.sort((x, y) => x.perUnit - y.perUnit);
  return { candidates: ids.length, orderable: ok.length, best: ok[0] || null, sizes };
}

// ---------- Portti omana prosessinaan ----------
const dbFile = path.join(os.tmpdir(), `aimo-eval-${process.pid}.db`);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT), GATEWAY_DB: dbFile, DEMO_NOW: NOW }, stdio: 'ignore' });
const stop = () => { server.kill(); for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true }); };
process.on('exit', stop); process.on('SIGINT', () => process.exit(1));
for (let i = 0; ; i++) { try { if ((await fetch(`${base}/.well-known/jwks.json`)).ok) break; } catch { /* odotetaan */ } if (i > 80) { console.error('Portti ei käynnistynyt'); process.exit(1); } await new Promise((r) => setTimeout(r, 150)); }
const mandate = (patch) => fetch(`${base}/console/buyers/nordic-hotels/mandate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rows = []; let pass = 0;
for (const c of CASES.filter((x) => !only.length || only.includes(x.id))) {
  // Tulkintatestissä eurokatot pois, jotta mitataan osumista eikä mandaattia; kattotesti asettaa omansa.
  await mandate({ maxOrderNet: null, maxDayNet: null, ...(c.mandate || {}) });
  const errs = []; const got = [];
  const t0 = performance.now();
  const r = await runBuyerAgent({ baseUrl: base, apiKey: c.buyer || 'demo-nordic-hotels', text: c.text });
  const ms = Math.round(performance.now() - t0);
  const o = r.order;
  if (c.noOrder) { if (o) errs.push(`tilaus syntyi (${o.orderId}), vaikka pyyntöä ei pitänyt ymmärtää`); }
  else if (!o) {
    errs.push(`ei tilausta: ${r.summary}`);
    for (const [i, n] of c.needs.entries()) { const exp = await oracle(n); errs.push(exp.best ? `[${i}] oraakkelin mukaan tilattavissa: ${exp.best.id} × ${exp.best.units} = ${exp.best.net.toFixed(2)} €` : `[${i}] oraakkelikaan ei löydä tilattavaa (${exp.candidates} ehdokasta): testin odotus on väärä`); }
  }
  else {
    if (o.status !== c.status) errs.push(`tila ${o.status} ≠ ${c.status} (${o.reasons.map((x) => x.code).join(', ')})`);
    for (const code of c.reasons || []) if (!o.reasons.some((x) => x.code === code)) errs.push(`syykoodi ${code} puuttuu`);
    if (o.deliveryDate !== c.date) errs.push(`toimitus ${o.deliveryDate} ≠ ${c.date}`);
    const lines = [...o.lines];
    for (const [i, n] of c.needs.entries()) {
      const mine = lines.filter((l) => { const p = byId.get(l.productId); return p && n.cat.includes(p.category); });
      if (!mine.length) { errs.push(`[${i}] ei riviä ryhmästä ${n.cat}`); continue; }
      const exp = await oracle(n);
      let covered = 0; let net = 0; let minSize = Infinity;
      for (const l of mine) {
        const p = byId.get(l.productId);
        if (!matches(p, n)) errs.push(`[${i}] ${l.productId} ${p.name} ei täytä ehtoja`);
        const size = exp.sizes.get(l.productId) || (n.qty.unit === 'L' ? p.litres : p.kg) || 1;
        covered += l.quantity * size; net += l.lineNet; minSize = Math.min(minSize, size);
      }
      got.push(mine.map((l) => `${l.productId} × ${l.quantity}`).join(' + ') + ` = ${net.toFixed(2)} €`);
      if (covered + 1e-6 < n.qty.value) errs.push(`[${i}] kattaa vain ${covered} ${n.qty.unit}, pyydettiin ${n.qty.value}`);
      if (covered - n.qty.value >= minSize - 1e-6) errs.push(`[${i}] ylitilaus: ${covered} ${n.qty.unit}, pyydettiin ${n.qty.value}`);
      if (!n.anyPrice) {
        if (!exp.best) errs.push(`[${i}] oraakkelin mukaan mitään ei voi tilata, silti tilattiin`);
        else if (net > exp.best.net + 0.005) errs.push(`[${i}] ${net.toFixed(2)} € > halvin mahdollinen ${exp.best.net.toFixed(2)} € (${exp.best.id} × ${exp.best.units})`);
      }
    }
    if (c.split && !(o.lines[0].productId === c.split.first && o.lines[0].quantity === c.split.firstQty && o.lines[1]?.substituteFor === c.split.first)) errs.push(`osatoimitus: odotettiin ${c.split.first} × ${c.split.firstQty} + korvaaja`);
    if (o.lines.length > c.needs.reduce((s, n) => s + (c.split ? 2 : 1), 0)) errs.push(`ylimääräisiä rivejä: ${o.lines.length}`);
  }
  if (!errs.length) pass += 1;
  rows.push({ id: c.id, text: c.text, ok: !errs.length, got: c.noOrder ? (o ? 'tilaus' : 'ei tilausta (oikein pysähtyi)') : got.join(', ') || '–', status: o?.status || '–', ms, errs });
  console.log(`${errs.length ? 'VIRHE' : 'ok   '} ${String(ms).padStart(5)} ms  ${c.text}${errs.length ? `\n        → ${errs.join('\n        → ')}` : `\n        ${rows.at(-1).got}${o ? `, ${o.status}` : ''}`}`);
}
const total = rows.length;
const avg = Math.round(rows.reduce((s, r) => s + r.ms, 0) / total);
console.log(`\n${pass}/${total} pyynnöstä oikein ilman käsikorjausta, keskimäärin ${avg} ms / pyyntö (haku → tarjous → tilaus, live-mock-API)`);
const md = [`# Tarkkuustesti: ${pass}/${total} oikein`, '', `Ajettu ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, portin kello kiinnitetty ${NOW}, hinnat ja saatavuus Aimon mock-rajapinnasta, keskimäärin ${avg} ms / pyyntö.`, '', 'Oikein = tilaus täyttää pyynnön ehdot (tuoteryhmä, väittämät, nimi), kattaa määrän ilman ylitilausta, on yhtä halpa kuin riippumattoman oraakkelin halvin tilattava vaihtoehto, ja toimituspäivä sekä lopputila ovat odotetut.', '', '| | Pyyntö | Tilaus | Tila | ms |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.text} | ${r.ok ? r.got : r.errs.join('; ')} | ${r.status} | ${r.ms} |`), ''].join('\n');
if (!only.length) fs.writeFileSync(path.join(root, 'eval', 'results.md'), md);
if (!only.length) fs.writeFileSync(path.join(root, 'eval', 'results.json'), JSON.stringify({ pass, total, avgMs: avg, clock: NOW, rows }, null, 2));
process.exit(pass === total ? 0 : 2);
