// Tuotekuvat demoa varten. Challenge-datassa on vain kuvien id:t ("files themselves are not part of this data set"),
// joten kuva haetaan laiskasti ensimmäisellä pyynnöllä ja tallennetaan levylle (data/img, ei versionhallintaan):
//   1) Valio Aimon julkinen tuotesivu (www.valioaimo.fi/toimitustukku/<slug>/, og:image), kun tuotenimi osuu sivukartan slugiin
//   2) Valion omille tuotteille valio.fi:n tuotesivu samalla tavalla
//   3) Open Food Facts GTIN-koodilla (avoin data, kuvat CC BY-SA)
// Jos mikään ei löydä, /img/<id> vastaa 404 ja UI näyttää tyhjän paikan.
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, ROOT } from './catalog.mjs';
import { imageCache } from './image-cache.mjs';

export function createImageService({ root = ROOT, catalog = loadCatalog, fetcher = globalThis.fetch } = {}) {
  const DIR = path.join(root, 'data', 'img');
  const ASSETS = path.join(root, 'public', 'storefront-assets');
  const cache = imageCache(DIR);
  const UA = 'aimo-agent-gateway-demo/0.1 (Junction 2026 hackathon demo)';
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const MISS_TTL = 6 * 3600e3; // hutia yritetään uudelleen aikaisintaan 6 h päästä
  const MAX_PARALLEL = 4;

  // The reference basket already includes verified local product photos. Reuse them in search.
  let localImages;
  function localImage(id) {
    if (!localImages) {
      localImages = new Map();
      try {
        const { assets } = JSON.parse(fs.readFileSync(path.join(ASSETS, 'sources.json'), 'utf8'));
        for (const a of assets) {
          const productId = (a.derivedFrom || a.file).match(/^(\d+)\.(?:jpg|png|webp)$/)?.[1];
          if (productId && (!localImages.has(productId) || a.derivedFrom)) localImages.set(productId, a);
        }
      } catch { /* no reference assets in this installation */ }
    }
    const a = localImages.get(id);
    return a && fs.existsSync(path.join(ASSETS, a.file)) ? { file: a.file, type: a.mime, source: a.source, directory: ASSETS } : null;
  }

  const norm = (s) => String(s).toLowerCase().replace(/[äå]/g, 'a').replace(/ö/g, 'o').normalize('NFKD').replace(/[^a-z0-9]/g, '');

  async function get(url, { timeout = 10000 } = {}) {
    const res = await fetcher(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
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
    const file = path.join(root, 'data', cfg.file);
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

  // Lähin vastaava: kun nimi ei osu slugiin sellaisenaan, etsitään sama tuote sanojen päällekkäisyydellä.
  // Merkki (nimen ensimmäinen sana) pitää olla sama, ettei kuvaksi tule kilpailijan tuotetta.
  const words = (s) => String(s).toLowerCase().replace(/[äå]/g, 'a').replace(/ö/g, 'o').normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const SIZE_WORD = /^\d+$|^(l|dl|cl|ml|g|kg|kpl|x|n|uht|esl)$/;
  const fuzzyIndexes = {};
  async function fuzzySlug(site, name, { min, dropSizes = false }) {
    const slugs = Object.values(await loadSlugIndex(site));
    fuzzyIndexes[site] ||= (() => { const inv = new Map(); slugs.forEach((sl, i) => { for (const t of new Set(sl.split('-'))) { if (!inv.has(t)) inv.set(t, []); inv.get(t).push(i); } }); return inv; })();
    const all = words(name); const brand = all[0];
    const a = new Set(dropSizes ? all.filter((t) => !SIZE_WORD.test(t)) : all);
    const hits = new Map();
    for (const t of a) for (const i of fuzzyIndexes[site].get(t) || []) hits.set(i, (hits.get(i) || 0) + 1);
    let best = null;
    for (const [i, c] of hits) {
      const b = new Set(slugs[i].split('-').filter((t) => !dropSizes || !SIZE_WORD.test(t)));
      if (!b.has(brand)) continue;
      const j = c / (a.size + b.size - c);
      if (!best || j > best.j) best = { j, slug: slugs[i] };
    }
    return best && best.j >= min ? best.slug : null;
  }
  async function fromAimoSiteFuzzy(p) {
    const slug = await fuzzySlug('aimo', p.name, { min: 0.6 });
    if (!slug) return null;
    const page = `https://www.valioaimo.fi/toimitustukku/${slug}/`;
    const src = ogImage(await (await get(page)).text())?.match(/https:\/\/api\.valioaimo\.fi\/medias\/[^"\s]+/)?.[0];
    return src ? { url: `https://imgfly.scarabresearch.com/w_400/${src}`, fallbackUrl: src, source: 'valioaimo.fi (lähin vastaava)', page } : null;
  }
  async function fromValioSiteFuzzy(p) {
    if (!/^valio\b/i.test(p.name)) return null;
    const slug = await fuzzySlug('valio', p.name, { min: 0.5, dropSizes: true });
    if (!slug) return null;
    const page = `https://www.valio.fi/tuotteet/${slug}/`;
    const og = ogImage(await (await get(page)).text());
    if (!og) return null;
    const raw = og.replace(/^https:\/\/www\.valio\.fi\/cdn-cgi\/image\/[^/]+\//, '');
    return { url: `https://www.valio.fi/cdn-cgi/image/width=400,format=jpeg/${raw}`, fallbackUrl: og, source: 'valio.fi (lähin vastaava)', page };
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
  function resolveImage(id) {
    id = String(id);
    if (!/^\w{1,20}$/.test(id)) return Promise.resolve(null);
    const local = localImage(id);
    if (local) return Promise.resolve(local);
    const hit = cache.get(id);
    if (hit?.file && fs.existsSync(path.join(DIR, hit.file))) return Promise.resolve(hit);
    if (hit?.miss && Date.now() - hit.miss < MISS_TTL) return Promise.resolve(null);
    if (inflight.has(id)) return inflight.get(id);
    const job = limited(async () => {
      const p = catalog().get(id);
      if (!p) return null;
      // Try the matching suppliers before the slower GTIN fallback (up to 10 s per miss).
      for (const source of [fromAimoSite, fromValioSite, fromAimoSiteFuzzy, fromValioSiteFuzzy, fromOpenFoodFacts]) {
        const found = await source(p).catch(() => null);
        const img = found && await download(found);
        if (!img) continue;
        const file = `${id}${EXT[img.type]}`;
        fs.writeFileSync(path.join(DIR, file), img.buf);
        return cache.put(id, { file, type: img.type, source: found.source, page: found.page });
      }
      cache.put(id, { miss: Date.now() });
      return null;
    }).finally(() => { inflight.delete(id); });
    inflight.set(id, job);
    return job;
  }

  /** GET /img/<tuotenumero> */
  async function serveImage(res, id) {
    const img = /^\w{1,20}$/.test(id) ? await resolveImage(id).catch(() => null) : null;
    // A later preload may fill a miss; do not keep a stale 404 in the browser.
    if (!img) { res.writeHead(404, { 'cache-control': 'no-store' }); return res.end(); }
    res.writeHead(200, { 'content-type': img.type, 'cache-control': 'public, max-age=86400', 'x-image-source': img.source });
    fs.createReadStream(path.join(img.directory || DIR, img.file)).pipe(res);
  }
  return { resolveImage, serveImage };
}

export const { resolveImage, serveImage } = createImageService();
