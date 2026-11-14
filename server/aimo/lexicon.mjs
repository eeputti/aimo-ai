// AIMON SANASTO, LOUHITTU AIMON OMASTA DATASTA.
// Challenge-datassa kategorioilla on vain koodit (349 kpl), ei nimiä, eikä tuotetyyppejä ole lueteltu missään.
// Tämä moduuli rakentaa käynnistyksessä tuotekatalogista (17 546 tuotetta) sanaston, jolla vapaa teksti
// kiinnitetään Aimon omiin käsitteisiin: sana → kategoriajakauma, kategorialle luettava nimi, merkit, pakkauskoot.
// Mitään ei ole kirjoitettu käsin tuotekohtaisesti, joten sanasto pysyy ajan tasalla, kun katalogi päivittyy.
import { loadCatalog, tokenize, stems } from '../catalog.mjs';

// Sanat, jotka kuvaavat ominaisuutta eivätkä tuotetta. Ne käsitellään väittäminä tai attribuutteina, ei tuotetyyppinä.
const NOT_A_PRODUCT = /^(pakaste\w*|kypsä\w*|laktoosi\w*|gluteeni\w*|luomu\w*|vegaani\w*|suomi|suomesta|suomalainen|kotimainen|uht|esl|kpl|ltk|pkt|noin|iso|pieni|mini|maxi|original|classic|frozen|free|lactose|gluten|organic|with|and|the|for|pcs|box|bag|finland|finnish|vähälaktoosinen|approx|apx|new|uusi|kausituote|seasonal|rasvaton|kevyt|vähärasvainen|skimmed|semi|light|pro|professional|food|service)$/;

// Taivutusmuodot: katalogin kevyt stemmaus + muutama suomen vartalonvaihtelu, joita se ei kata.
const EXTRA = [[/ia$/, 'a'], [/iä$/, 'ä'], [/ia$/, 'i'], [/iä$/, 'i'], [/hta$/, 'hi'], [/ttä$/, 'si'], [/tta$/, 'si'], [/kkeja$/, 'ke'], [/ies$/, 'y'], [/oes$/, 'o']];
export function variants(token) {
  const out = new Set(stems(token));
  for (const [re, rep] of EXTRA) if (re.test(token)) out.add(token.replace(re, rep));
  return [...out].filter((v) => v.length >= 3);
}

let built;

/** @returns {{concepts: Map, categories: Map, brands: Map, brandMaxWords: number, stats: object}} */
export function loadLexicon() {
  if (built) return built;
  const t0 = performance.now();
  const cat = loadCatalog();
  const products = cat.products;

  // 1) Merkit: "santa maria" → {name: 'Santa Maria', n}
  const brands = new Map();
  const brandTokens = new Set();
  for (const p of products) {
    if (!p.brand) continue;
    const toks = tokenize(p.brand);
    if (!toks.length) continue;
    const key = toks.join(' ');
    const b = brands.get(key) || { name: p.brand.trim(), n: 0, key };
    b.n += 1;
    brands.set(key, b);
    toks.forEach((t) => brandTokens.add(t));
  }
  for (const [key, b] of brands) if (b.n < 2) brands.delete(key); // yksittäiset kirjoitusasut pois
  const brandMaxWords = Math.max(...[...brands.keys()].map((k) => k.split(' ').length));

  // 2) Tuotesanat nimistä. Suomen yhdyssanat: "kevytmaitojuoma" lasketaan myös sanoille "maitojuoma" ja "juoma",
  //    jos ne esiintyvät datassa itsenäisinä sanoina. Englanniksi "ice cream" on eri asia kuin "cream".
  const wordsOf = (p, lang) => {
    let toks = tokenize(lang === 'en' ? p.nameEn || '' : p.name);
    if (lang === 'en') { const out = []; for (let i = 0; i < toks.length; i++) { if (toks[i] === 'ice' && toks[i + 1] === 'cream') { out.push('icecream'); i += 1; } else out.push(toks[i]); } toks = out; }
    const own = new Set(tokenize(p.brand || '')); // vain tuotteen oma merkki pois: "Nordic Sugar" ei saa hävittää sanaa "sugar" muilta
    return toks.filter((t) => t.length >= 3 && !/\d/.test(t) && !own.has(t) && !NOT_A_PRODUCT.test(t));
  };
  const standalone = new Map(); // sana → montako tuotetta
  const perProduct = products.map((p) => {
    const fi = new Set(wordsOf(p, 'fi'));
    const en = new Set(wordsOf(p, 'en'));
    for (const w of fi) standalone.set(w, (standalone.get(w) || 0) + 1);
    for (const w of en) if (!fi.has(w)) standalone.set(w, (standalone.get(w) || 0) + 1);
    return { fi, en };
  });
  const concepts = new Map(); // sana → {total, cats: Map(cat → n)}
  const bump = (w, c) => { let e = concepts.get(w); if (!e) concepts.set(w, (e = { total: 0, cats: new Map() })); e.total += 1; e.cats.set(c, (e.cats.get(c) || 0) + 1); };
  products.forEach((p, i) => {
    const seen = new Set();
    for (const w of perProduct[i].fi) {
      seen.add(w);
      for (let k = 1; k <= w.length - 3; k++) { const tail = w.slice(k); if ((standalone.get(tail) || 0) >= 2) seen.add(tail); } // yhdyssanan loppuosa
    }
    for (const w of perProduct[i].en) seen.add(w);
    for (const w of seen) bump(w, p.category);
  });
  for (const [w, e] of concepts) if (e.total < 2) concepts.delete(w);

  // 3) Kategorialle luettava nimi: sana, joka kattaa kategoriasta eniten ja keskittyy siihen.
  const sizes = new Map();
  for (const p of products) sizes.set(p.category, (sizes.get(p.category) || 0) + 1);
  const best = new Map(); // cat → [{w, n, share}]
  for (const [w, e] of concepts) {
    for (const [c, n] of e.cats) {
      const share = n / e.total;
      if (n < 3 || share < 0.3) continue;
      let list = best.get(c); if (!list) best.set(c, (list = []));
      list.push({ w, n, share, score: n * share });
    }
  }
  const categories = new Map();
  for (const [c, size] of sizes) {
    const words = (best.get(c) || []).sort((a, b) => b.score - a.score).slice(0, 6);
    categories.set(c, { id: c, size, label: words.slice(0, 2).map((x) => x.w).join(', ') || `kategoria ${c}`, words: words.map((x) => x.w) });
  }

  built = { concepts, categories, brands, brandMaxWords, stats: { products: products.length, concepts: concepts.size, categories: categories.size, brands: brands.size, ms: Math.round(performance.now() - t0) } };
  return built;
}

/**
 * Sana (missä tahansa suomen taivutusmuodossa tai englanniksi) → Aimon kategoriat, todennäköisin ensin.
 * @returns {{word: string, total: number, top: {category: string, label: string, n: number, share: number}[]} | null}
 */
export function conceptOf(token) {
  const { concepts, categories } = loadLexicon();
  let hit = null;
  for (const v of variants(token)) { // "maitoa" → "maito", "voita" → "voi", "kananmunia" → "kananmuna", "eggs" → "egg"
    const e = concepts.get(v);
    if (e && (!hit || e.total > hit.e.total)) hit = { word: v, e };
  }
  if (!hit) return null;
  const top = [...hit.e.cats].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([category, n]) => ({ category, label: categories.get(category)?.label, n, share: +(n / hit.e.total).toFixed(2) }));
  return { word: hit.word, total: hit.e.total, top };
}

/** Pisin merkkiosuma sanajonon alusta. @returns {{name: string, key: string, words: number} | null} */
export function brandAt(tokens, i) {
  const { brands, brandMaxWords } = loadLexicon();
  for (let len = Math.min(brandMaxWords, tokens.length - i); len >= 1; len--) {
    const b = brands.get(tokens.slice(i, i + len).join(' '));
    if (b && (len > 1 || b.n >= 5)) return { name: b.name, key: b.key, words: len };
  }
  return null;
}
