// DEMODATA. Challenge-aineistossa ei ole asiakkaan tilaushistoriaa, varauksia eikä ruokalistaa, joten ne on
// generoitu tähän yhdelle kuvitteelliselle keittiölle. Tuotteet, allergeenit, korvaavuudet, toimitusvarmuus ja CO2
// tulevat oikeasta Aimo-datasta; hinnat ja saatavuus rajapinnasta. Oikeassa käytössä tämä tiedosto korvautuu
// asiakkaan ostohistorialla (Minun Aimo), kassan/varausjärjestelmän datalla ja reseptiikalla.
import { loadCatalog } from './catalog.mjs';
import { kv, history, bookings, wipe, audit } from './db.mjs';
import { DEFAULT_RULES } from './proposal.mjs';
import { fetchQuotes, clearApiCache } from './valioApi.mjs';
import { apiMode } from './config.mjs';

export const KITCHEN = { id: 'kulma', name: 'Ravintola Kulma', kind: 'Lounas + à la carte, 70 asiakaspaikkaa', city: 'Helsinki', contact: 'Keittiöpäällikkö', demo: true };

// base = tyypillinen viikkomäärä myyntiyksikköinä. every = tilausrytmi viikkoina. trend = muutos / viikko.
export const STAPLES = [
  { id: '465193', group: 'Maito & munat', tags: ['cream'], base: 12 }, // Valio suurtalous kuohukerma 1,75 l laktoositon
  { id: '464249', group: 'Maito & munat', tags: ['cream'], base: 18 }, // Valio ruokakerma 15 % 1 l
  { id: '464201', group: 'Maito & munat', tags: ['dairy'], base: 24 }, // Valio kevytmaito 1 l laktoositon
  { id: '475797', group: 'Maito & munat', tags: ['dairy'], base: 10 }, // Valio voi 500 g
  { id: '476660', group: 'Maito & munat', tags: ['dairy'], base: 4 }, // Valio Emmental raaste 2,5 kg
  { id: '477044', group: 'Maito & munat', tags: ['dessert'], base: 2 }, // Valio maitorahka 5 kg
  { id: '463883', group: 'Maito & munat', tags: ['dairy'], base: 3 }, // Kieku luomu kananmuna
  { id: '468465', group: 'Maito & munat', tags: ['dairy'], base: 5, trend: 0.045 }, // Oddlygood kaurajuoma, nouseva
  { id: '464517', group: 'Maito & munat', tags: ['dairy'], base: 2, until: 6 }, // jogurtti: tilattu vain alkusyksyn → pudonnut pois
  { id: '470961', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 5 }, // peruna 15 kg/ltk
  { id: '460195', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 2 }, // sipuli 10 kg
  { id: '460708', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 2 }, // porkkana 10 kg
  { id: '460131', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 12 }, // kurkku kg
  { id: '460065', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 10 }, // tomaatti kg
  { id: '474247', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 8 }, // jäävuorisalaatti 1 kg
  { id: '460239', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 6 }, // paprika kg
  { id: '460846', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 3 }, // sitruuna 1 kg
  { id: '460335', group: 'Hedelmät & vihannekset', tags: ['veg'], base: 2, every: 2, phase: 1 }, // valkosipuli kuorittu
  { id: '462452', group: 'Liha & kala', tags: ['protein'], base: 8 }, // broilerin fileesuikale 2 kg
  { id: '470418', group: 'Liha & kala', tags: ['protein'], base: 7 }, // naudan jauheliha 2 kg
  { id: '461915', group: 'Liha & kala', tags: ['protein'], base: 20 }, // lohifilee D-leikattu ASC (toimitusvarmuus 78 %)
  { id: '476547', group: 'Liha & kala', tags: ['protein'], base: 4 }, // pekoni
  { id: '463624', group: 'Kuivatuotteet', tags: ['dry'], base: 3 }, // basmatiriisi 5 kg
  { id: '462350', group: 'Kuivatuotteet', tags: ['dry'], base: 2 }, // penne 5 kg
  { id: '465046', group: 'Kuivatuotteet', tags: ['dry'], base: 6 }, // tomaattimurska 2,5 kg
  { id: '461209', group: 'Kuivatuotteet', tags: ['dry'], base: 1, every: 2, phase: 0 }, // vehnäjauho 20 kg, joka toinen viikko
  { id: '466285', group: 'Kuivatuotteet', tags: ['dry'], base: 1, every: 2, phase: 1 }, // rypsiöljy 10 l
  { id: '461219', group: 'Kuivatuotteet', tags: ['dry'], base: 1, every: 4, phase: 1 }, // kasvisliemi, kerran kuussa
  { id: '475842', group: 'Kuivatuotteet', tags: ['dry'], base: 1 }, // kahvi 12 x 500 g
  { id: '461238', group: 'Pakasteet', tags: ['frozen'], base: 3 }, // herne 2,5 kg
  { id: '473427', group: 'Pakasteet', tags: ['dessert'], base: 2 }, // mustikka 2,5 kg
  { id: '471787', group: 'Pakasteet', tags: ['bakery'], base: 2 }, // ruisleipä
  { id: '467845', group: 'Pakasteet', tags: ['bakery'], base: 2 }, // kaurasämpylä
  { id: '470415', group: 'Non-food', tags: ['nonfood'], base: 1 }, // lautasliina
  { id: '463414', group: 'Non-food', tags: ['nonfood'], base: 1, every: 4, phase: 3 }, // leivinpaperi
];

const WEEKS = 12;
function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isoWeek = (iso) => { const d = new Date(`${iso}T12:00:00Z`); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return { year: d.getUTCFullYear(), week: Math.ceil(((d - y0) / 86400000 + 1) / 7) }; };
export const weekKey = (iso) => { const w = isoWeek(iso); return `${w.year}-W${String(w.week).padStart(2, '0')}`; };
export const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/** Seuraava maanantai (vähintään huomenna). Demon tarina: "maanantain tilaus on valmiina". */
export function defaultDeliveryDate(from = todayIso()) {
  let d = addDays(from, 1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}

export async function seedDemo({ deliveryDate = defaultDeliveryDate() } = {}) {
  const cat = loadCatalog();
  wipe();
  if (apiMode() === 'sim') clearApiCache(); // simuloidut arvot generoidaan aina uudelleen; live-välimuisti säästetään
  const rand = mulberry32(20261114);
  const staples = STAPLES.filter((s) => { const ok = !!cat.get(s.id); if (!ok) console.warn(`[demo] tuotetta ${s.id} ei löydy katalogista, ohitetaan`); return ok; });

  // 12 viikkoa tilaushistoriaa (maanantaitoimitukset) ennen toimitusviikkoa.
  for (let w = WEEKS; w >= 1; w--) {
    const date = addDays(deliveryDate, -7 * w);
    const idx = WEEKS - w; // 0 = vanhin
    for (const s of staples) {
      if (s.until != null && idx >= s.until) continue;
      if (s.every && idx % s.every !== (s.phase ?? 0)) continue;
      const p = cat.get(s.id);
      const trend = 1 + (s.trend || 0) * (idx - WEEKS / 2);
      const noise = 1 + (rand() - 0.5) * 0.24;
      const step = p.lot >= 1 ? p.lot : 1;
      const qty = Math.max(step, Math.round((s.base * trend * noise) / step) * step);
      history.add(weekKey(date), date, s.id, qty);
    }
  }

  // Asiakasmäärät: 8 mennyttä viikkoa + toimitusviikko. Su suljettu.
  const normal = [150, 160, 165, 170, 215, 150, 0];
  for (let w = 8; w >= 1; w--) for (let d = 0; d < 7; d++) bookings.add(addDays(deliveryDate, -7 * w + d), Math.round(normal[d] * (1 + (rand() - 0.5) * 0.12)));
  const next = [152, 161, 170, 184, 262, 236, 0];
  const notes = { 4: 'Pikkujouluryhmät 2 kpl (64 hlö)', 5: 'Pikkujouluryhmä (84 hlö)' };
  next.forEach((covers, d) => bookings.add(addDays(deliveryDate, d), covers, notes[d] || null));

  // Ryhmämenu: annosmäärä × resepti → raaka-ainetarve. Tämä on "ruokalistasta ostoslista" pienoiskoossa.
  kv.set('menuEvents', [{
    id: 'pikkujoulu', name: 'Pikkujoulumenu', portions: 148, includedInBookings: true,
    groups: [{ date: addDays(deliveryDate, 4), pax: 64 }, { date: addDays(deliveryDate, 5), pax: 84 }],
    recipe: [
      { productId: '461915', amount: 0.12, unit: 'kg', label: 'lohta 120 g / annos' },
      { productId: '470961', amount: 0.2, unit: 'kg', label: 'perunaa 200 g / annos' },
      { productId: '465193', amount: 0.05, unit: 'l', label: 'kuohukermaa 0,5 dl / annos' },
      { productId: '477044', amount: 0.07, unit: 'kg', label: 'rahkaa 70 g / annos' },
      { productId: '473427', amount: 0.04, unit: 'kg', label: 'mustikkaa 40 g / annos' },
    ].filter((r) => cat.get(r.productId)),
  }]);

  kv.set('kitchen', KITCHEN);
  kv.set('staples', staples.map(({ id, group, tags }) => ({ id, group, tags })));
  kv.set('deliveryDate', deliveryDate);

  // Budjettikatto: tavallisen viikon ostot + 8 % pelivaraa, pyöristettynä. Hinnat rajapinnasta (yksi kutsu rajatulle joukolle).
  const quotes = await fetchQuotes(staples.map((s) => s.id), deliveryDate);
  let normalWeek = 0;
  for (const s of staples) { const price = quotes.get(s.id)?.price; if (price && !price.error && !s.until) normalWeek += price.net * s.base / (s.every || 1); }
  const budgetCap = Math.max(200, Math.round((normalWeek * 1.2) / 50) * 50); // alustava; kalibroidaan ensimmäisen ehdotuksen jälkeen (ks. deep.mjs)
  kv.set('rules', { ...DEFAULT_RULES, budgetCap });
  audit('system', 'Demodata alustettu', { keittio: KITCHEN.name, tuotteita: staples.length, historiaviikkoja: WEEKS, toimituspaiva: deliveryDate, budjetti: budgetCap, huom: 'Historia, varaukset ja menu ovat generoitua demodataa' });
  return { deliveryDate, staples: staples.length, budgetCap };
}
