// Tuotekuvat demoa varten. Challenge-datassa on vain kuvien id:t ("files themselves are not part of this data set"),
// joten kuva haetaan laiskasti ensimmäisellä pyynnöllä ja tallennetaan levylle (data/img, ei versionhallintaan):
//   1) Valio Aimon julkinen tuotesivu (www.valioaimo.fi/toimitustukku/<slug>/, og:image), kun tuotenimi osuu sivukartan slugiin
//   2) Valion omille tuotteille valio.fi:n tuotesivu samalla tavalla
//   3) Open Food Facts GTIN-koodilla (avoin data, kuvat CC BY-SA)
// Jos mikään ei löydä, /img/<id> vastaa 404 ja UI näyttää tyhjän paikan.
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, ROOT } from './catalog.mjs';

const DIR = path.join(ROOT, 'data', 'img');
const META_FILE = path.join(DIR, '_meta.json');
const UA = 'aimo-agent-gateway-demo/0.1 (Junction 2026 hackathon demo)';
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const MISS_TTL = 6 * 3600e3; // hutia yritetään uudelleen aikaisintaan 6 h päästä
const MAX_PARALLEL = 4;

let meta = null; // { [id]: { file, type, source, page? } | { miss: ts } }
function loadMeta() {
  if (meta) return meta;
  fs.mkdirSync(DIR, { recursive: true });
  try { meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { meta = {}; }
  return meta;
}
let saveTimer = null;
function saveMeta() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(META_FILE, JSON.stringify(meta), () => {}), 200);
}

const norm = (s) => String(s).toLowerCase().replace(/[äå]/g, 'a').replace(/ö/g, 'o').normalize('NFKD').replace(/[^a-z0-9]/g, '');

async function get(url, { timeout = 10000 } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res;
}

/** Sivukartasta rakennettu hakemisto: normalisoitu slug → slug. Rakennetaan kerran (muutama pyyntö) ja tallennetaan levylle. */
const SITES = {
  aimo: { file: 'image-index.json', root: 'https://www.valioaimo.fi/sitemap_index.xml', maps: /<loc>([^<]*vl_product-aimo-sitemap\d*\.xml)/g, base: 'https://www.valioaimo.fi/toimitustukku/' },
  valio: { file: 'image-index-valio.json', root: 'https://www.valio.fi/sitemap_index.xml', maps: /<loc>([^<]*vl_product-sitemap\d*\.xml)/g, base: 'https://www.valio.fi/tuotteet/' },
};
const slugIndexes = {};
function loadSlugIndex(site) {
  const cfg = SITES[site];
  const file = path.join(ROOT, 'data', cfg.file);
  slugIndexes[site] ||= (async () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* rakennetaan */ }
    const root = await (await get(cfg.root)).text();
    const index = {};
    for (const [, map] of root.matchAll(cfg.maps)) {
      const xml = await (await get(map, { timeout: 30000 })).text();
      for (const [, url] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        if (!url.startsWith(cfg.base)) continue;
        const slug = url.slice(cfg.base.length).replace(/\/$/, '');
        if (slug && !slug.includes('/')) index[norm(slug)] ||= slug;
      }
    }
    if (Object.keys(index).length) fs.writeFileSync(file, JSON.stringify(index));
    return index;
  })().catch((e) => { console.error(`[kuvat] sivukartta ${site}:`, e.message); delete slugIndexes[site]; return {}; });
  return slugIndexes[site];
}

const ogImage = (html) => html.match(/property="og:image"\s+content="([^"]+)"/)?.[1];

async function fromAimoSite(p) {
  const slug = (await loadSlugIndex('aimo'))[norm(p.name)];
  if (!slug) return null;
  const page = `https://www.valioaimo.fi/toimitustukku/${slug}/`;
  const html = await (await get(page)).text();
  const src = ogImage(html)?.match(/https:\/\/api\.valioaimo\.fi\/medias\/[^"\s]+/)?.[0];
  if (!src) return null;
  // Sama pienennyspalvelu, jota sivu itse käyttää; 400 px riittää listaan ja kortteihin.
  return { url: `https://imgfly.scarabresearch.com/w_400/${src}`, fallbackUrl: src, source: 'valioaimo.fi', page };
}

/** Valion omat tuotteet puuttuvat tukun julkisilta sivuilta, mutta löytyvät valio.fi:stä. Siellä slugissa ei ole pakkauskokoa. */
async function fromValioSite(p) {
  if (!/^valio\b/i.test(p.name)) return null;
  const key = norm(p.name.replace(/\b\d+(?:[.,]\d+)?\s*(?:l|dl|cl|ml|g|kg)\b/gi, ' '));
  const slug = (await loadSlugIndex('valio'))[key];
  if (!slug) return null;
  const page = `https://www.valio.fi/tuotteet/${slug}/`;
  const og = ogImage(await (await get(page)).text());
  if (!og) return null;
  const raw = og.replace(/^https:\/\/www\.valio\.fi\/cdn-cgi\/image\/[^/]+\//, '');
  return { url: `https://www.valio.fi/cdn-cgi/image/width=400,format=jpeg/${raw}`, fallbackUrl: og, source: 'valio.fi', page };
}

async function fromOpenFoodFacts(p) {
  if (!/^\d{8,14}$/.test(p.gtin || '')) return null;
  const res = await get(`https://world.openfoodfacts.org/api/v2/product/${p.gtin}.json?fields=image_front_url,image_front_small_url`).catch(() => null);
  const prod = res ? (await res.json()).product : null;
  const url = prod?.image_front_url || prod?.image_front_small_url;
  return url ? { url, source: 'Open Food Facts (CC BY-SA)', page: `https://world.openfoodfacts.org/product/${p.gtin}` } : null;
}

async function download(found) {
  for (const url of [found.url, found.fallbackUrl].filter(Boolean)) {
    try {
      const res = await get(url, { timeout: 15000 });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!EXT[type]) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 200 && buf.length < 5e6) return { buf, type };
    } catch { /* kokeillaan seuraavaa */ }
  }
  return null;
}

let active = 0;
const waiting = [];
async function limited(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

const inflight = new Map();
/** Palauttaa { file, type, source } tai null. Tulos (myös huti) jää levylle. */
export function resolveImage(id) {
  const m = loadMeta();
  const hit = m[id];
  if (hit?.file && fs.existsSync(path.join(DIR, hit.file))) return Promise.resolve(hit);
  if (hit?.miss && Date.now() - hit.miss < MISS_TTL) return Promise.resolve(null);
  if (inflight.has(id)) return inflight.get(id);
  const job = limited(async () => {
    const p = loadCatalog().get(id);
    if (!p) return null;
    for (const source of [fromAimoSite, fromValioSite, fromOpenFoodFacts]) {
      const found = await source(p).catch(() => null);
      const img = found && await download(found);
      if (!img) continue;
      const file = `${id}${EXT[img.type]}`;
      fs.writeFileSync(path.join(DIR, file), img.buf);
      return (m[id] = { file, type: img.type, source: found.source, page: found.page });
    }
    m[id] = { miss: Date.now() };
    return null;
  }).finally(() => { inflight.delete(id); saveMeta(); });
  inflight.set(id, job);
  return job;
}

/** GET /img/<tuotenumero> */
export async function serveImage(res, id) {
  const img = /^\w{1,20}$/.test(id) ? await resolveImage(id).catch(() => null) : null;
  if (!img) { res.writeHead(404, { 'cache-control': 'public, max-age=600' }); return res.end(); }
  res.writeHead(200, { 'content-type': img.type, 'cache-control': 'public, max-age=86400', 'x-image-source': img.source });
  fs.createReadStream(path.join(DIR, img.file)).pipe(res);
}
