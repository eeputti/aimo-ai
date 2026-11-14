// Valio Aimo Junction 2026 -rajapinnan asiakas: saatavuus + hinta.
// Periaatteet (challengen ohjeesta): kysytään vain rajatulle tuotejoukolle, eräajona (max 1000 / kutsu), ja tulokset välimuistiin.
// Ilman VALIO_API_KEY:tä vastaukset SIMULOIDAAN deterministisesti ja jokaiseen tulokseen jää merkintä source: 'sim'.
import { config, apiMode } from './config.mjs';
import { apiCache, kv, wipeApiCache } from './db.mjs';
import { loadCatalog } from './catalog.mjs';

const TTL = { avail: 5 * 60_000, price: 30 * 60_000 };
const mem = new Map(); // key -> {at, value}
export const apiStats = { calls: 0, ids: 0, cacheHits: 0, errors: 0, lastMs: null, lastError: null, staleServed: 0 };

const cacheKey = (kind, date, id) => `${apiMode()}:${kind}:${date}:${id}`;

function cacheRead(kind, date, id, { allowStale = false } = {}) {
  const key = cacheKey(kind, date, id);
  let hit = mem.get(key);
  if (!hit) {
    const row = apiCache.get(key);
    if (row) { hit = { at: row.fetchedAt, value: row.value }; mem.set(key, hit); }
  }
  if (!hit) return null;
  const fresh = Date.now() - hit.at < TTL[kind];
  if (fresh) return hit.value;
  return allowStale ? { ...hit.value, stale: true } : null;
}
function cacheWrite(kind, date, id, value) {
  const key = cacheKey(kind, date, id);
  mem.set(key, { at: Date.now(), value });
  apiCache.set(key, value);
}

async function post(path, body) {
  const t0 = performance.now();
  const res = await fetch(`${config.valioBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-Key': config.valioKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  apiStats.calls += 1;
  apiStats.ids += body.products.length;
  apiStats.lastMs = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Valio API ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const day = (s) => (s ? String(s).slice(0, 10) : null);

function normAvailability(row, requestedDate) {
  const line = row.scheduleLines?.[0];
  const base = { closingTime: row.closingTime || null, model: row.logisticModel || null, source: 'live', fetchedAt: Date.now() };
  if (row.salesBlock || line?.salesBlock) return { ...base, status: 'blocked', amount: 0, date: null, unit: line?.salesUnit };
  if (!line) return { ...base, status: 'out', amount: 0, date: null }; // ei toimitettavissa millekään päivälle
  const amount = Number(line.availableAmount);
  const date = day(line.availableDate);
  const unknownQty = amount >= 999999; // Terminal-tuote: todellista määrää ei tiedetä
  if (!(amount > 0)) return { ...base, status: 'out', amount: 0, date, unit: line.salesUnit };
  if (date && date > requestedDate) return { ...base, status: 'late', amount: unknownQty ? null : amount, date, unit: line.salesUnit };
  return { ...base, status: 'ok', amount: unknownQty ? null : amount, date: date || requestedDate, unit: line.salesUnit };
}

function normPrice(row) {
  const base = { source: 'live', fetchedAt: Date.now() };
  if (row.error || !row.catalogPrice) return { ...base, error: true };
  const net = Number(row.catalogPrice.value);
  const list = row.listPrice ? Number(row.listPrice.value) : null;
  return {
    ...base,
    net,
    gross: Number(row.priceWithTax?.value ?? row.catalogPrice.valueWithTax),
    vatRate: row.tax ? Number(row.tax.taxRate) : null,
    list: list && list > net + 0.004 ? list : null,
    comparison: row.comparisonPrice ? Number(row.comparisonPrice.value) : null,
    comparisonUnit: row.comparisonUnit || null,
    validTo: row.catalogPrice.validTo || null,
    netPriceFound: !!row.netPriceFound,
  };
}

// ---------- Simulaattori (vain kun API-avainta ei ole) ----------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
// Demotarinan kiinteät poikkeamat simulaatiotilassa, jotta polku on aina sama. Live-tilassa nämä tulevat oikeasta rajapinnasta.
const SIM_SCENARIO = { '465193': { status: 'out' }, '460131': { status: 'ok', amount: 6 }, '469126': { status: 'out' }, '460137': { status: 'ok', amount: 400 }, '464727': { status: 'ok', amount: 310 }, '464699': { status: 'ok', amount: 84 } };
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function simAvailability(id, date) {
  const r = hash(`a:${id}:${date}`);
  const terminal = hash(`m:${id}`) < 0.22;
  const base = { model: terminal ? 'Terminal' : 'Stock', closingTime: `${addDays(date, terminal ? -2 : -1)}T${terminal ? '10' : '12'}:00:00`, source: 'sim', fetchedAt: Date.now() };
  const forced = SIM_SCENARIO[id];
  if (forced) return { ...base, model: 'Stock', closingTime: `${addDays(date, -1)}T12:00:00`, status: forced.status, amount: forced.status === 'out' ? 0 : forced.amount, date: forced.status === 'out' ? null : date };
  const staple = (kv.get('staples', []) || []).some((s) => s.id === id); // demopolku pysyy samana: vakiotuotteista puuttuvat vain SIM_SCENARIO:n tuotteet
  if (!staple && r < 0.05) return { ...base, status: 'out', amount: 0, date: null };
  if (!staple && r < 0.08) return { ...base, status: 'late', amount: terminal ? null : 40, date: addDays(date, 2 + Math.floor(r * 100) % 4) };
  if (terminal) return { ...base, status: 'ok', amount: null, date };
  return { ...base, status: 'ok', amount: Math.round(30 + hash(`q:${id}:${date}`) * 900), date };
}
function simPrice(id) {
  const p = loadCatalog().get(id);
  const perKg = { ambient: [1.4, 9], chilled: [1.8, 16], frozen: [3, 14] }[p?.temp || 'ambient'];
  let comparison = +(perKg[0] + hash(`p:${p?.category}`) * (perKg[1] - perKg[0]) * (0.75 + hash(`pp:${id}`) * 0.5)).toFixed(2);
  if (/naudan|lohi|pekoni|juusto|emmental|voi /i.test(p?.name || '')) comparison = +(comparison * 1.6).toFixed(2);
  if (/peruna|sipuli|porkkana|jauho|sokeri/i.test(p?.name || '')) comparison = +(0.8 + hash(`v:${id}`) * 1.2).toFixed(2);
  const size = p?.kg || p?.litres || 1;
  const net = +(comparison * size).toFixed(2);
  const vatRate = p?.vat === 'STANDARD' ? 25.5 : p?.vat === 'LOW' ? 10 : 13.5;
  return { net, gross: +(net * (1 + vatRate / 100)).toFixed(2), vatRate, list: null, comparison, comparisonUnit: p?.litres && !p?.kg ? 'L' : 'KG', validTo: null, source: 'sim', fetchedAt: Date.now() };
}

/**
 * Hakee saatavuuden ja hinnan annetuille tuotteille yhdellä kertaa (2 rinnakkaista kutsua / max 1000 tuotetta).
 * Palauttaa Map(id -> {avail, price}). Virhetilanteessa palautetaan vanha välimuistiarvo merkittynä stale: true
 * tai status 'unknown' — tuntematonta ei koskaan tulkita saatavilla olevaksi.
 */
export async function fetchQuotes(ids, date, { fresh = false } = {}) {
  const unique = [...new Set(ids.map(String))];
  const out = new Map();
  const need = { avail: [], price: [] };
  for (const id of unique) {
    const entry = {};
    for (const kind of ['avail', 'price']) {
      const hit = fresh ? null : cacheRead(kind, date, id);
      if (hit) { entry[kind] = hit; apiStats.cacheHits += 1; } else need[kind].push(id);
    }
    out.set(id, entry);
  }
  if (!need.avail.length && !need.price.length) return out;

  if (apiMode() === 'sim') {
    for (const id of need.avail) { const v = simAvailability(id, date); cacheWrite('avail', date, id, v); out.get(id).avail = v; }
    for (const id of need.price) { const v = simPrice(id); cacheWrite('price', date, id, v); out.get(id).price = v; }
    return out;
  }

  const chunks = (list) => { const res = []; for (let i = 0; i < list.length; i += 1000) res.push(list.slice(i, i + 1000)); return res; };
  const run = async (kind, path, normalize) => {
    await Promise.all(chunks(need[kind]).map(async (chunk) => {
      try {
        const json = await post(path, { customer: config.customer, requestedDate: date, products: chunk });
        const seen = new Set();
        for (const row of json.products || []) {
          const value = normalize(row, date);
          cacheWrite(kind, date, row.productId, value);
          if (out.has(row.productId)) out.get(row.productId)[kind] = value;
          seen.add(row.productId);
        }
        for (const id of chunk) if (!seen.has(id)) out.get(id)[kind] = kind === 'avail' ? { status: 'unknown', source: 'live', note: 'rajapinta ei palauttanut tuotetta' } : { error: true, source: 'live' };
      } catch (err) {
        apiStats.errors += 1;
        apiStats.lastError = String(err.message || err);
        for (const id of chunk) {
          const stale = cacheRead(kind, date, id, { allowStale: true });
          if (stale) apiStats.staleServed += 1;
          out.get(id)[kind] = stale || (kind === 'avail' ? { status: 'unknown', source: 'live', note: apiStats.lastError } : { error: true, source: 'live' });
        }
      }
    }));
  };
  await Promise.all([run('avail', '/api/availability', normAvailability), run('price', '/api/price', normPrice)]);
  return out;
}

export function clearApiCache() { mem.clear(); wipeApiCache(); }

export async function ping() {
  if (apiMode() === 'sim') return { ok: false, mode: 'sim' };
  try {
    const t0 = performance.now();
    const res = await fetch(`${config.valioBase}/api/ping`, { headers: { 'X-API-Key': config.valioKey }, signal: AbortSignal.timeout(6000) });
    return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - t0), mode: 'live' };
  } catch (err) { return { ok: false, mode: 'live', error: String(err.message || err) }; }
}
