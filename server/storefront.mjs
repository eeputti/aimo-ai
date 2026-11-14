// Hakutulokset ja korin tarkistus käyttävät samaa saatavuusehtoa. Näiden kutsuminen ei tee tilausta.
import { loadCatalog, roundToStep, stepOf, unitLabel } from './catalog.mjs';
import { interpret } from './aimo/index.mjs';
import { fetchQuotes } from './valioApi.mjs';
import { findSubstitutes } from './substitutes.mjs';
import { clock, cutoffPassed } from './gateway/clock.mjs';
import { unitSizeFor } from './gateway/quantity.mjs';
import { PRODUCT_TYPES } from './gateway/contract.mjs';
import { explainItemQuantity } from './itemQuantities.mjs';

export function validDeliveryDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function orderableProduct(p, quote, date, quantity) {
  const a = quote?.avail; const price = quote?.price;
  const fail = (code) => ({ ok: false, code });
  if (!p) return fail('UNKNOWN_PRODUCT');
  if (!price || price.error || price.stale || !Number.isFinite(price.net) || price.net < 0) return fail('PRICE_UNAVAILABLE');
  if (!a || a.stale || a.status !== 'ok') return fail('NOT_AVAILABLE');
  // Pyydetty päivä on tarkka toimituspäivä. Myös aikaisempi toimitus tarvitsee käyttäjän uuden valinnan.
  if (a.date !== date) return fail('DELIVERY_DATE_MISMATCH');
  if (cutoffPassed(a.closingTime)) return fail('CUTOFF_PASSED');
  const size = unitSizeFor(p, price, quantity?.unit || 'PCS', quantity?.basis || 'sales');
  if (!size?.value || !(size.value > 0)) return fail('UNIT_NOT_CONVERTIBLE');
  const qty = Math.max(stepOf(p), roundToStep((quantity?.value || 1) / size.value, p, 'up'));
  if (a.amount != null && (!Number.isFinite(a.amount) || a.amount < qty)) return fail('INSUFFICIENT_STOCK');
  return { ok: true, product: {
    id: p.id, name: p.name, brand: p.brand || null, unit: p.salesUnit, unitLabel: unitLabel(p.salesUnit),
    litres: p.litres ?? null, kg: p.kg ?? null, labels: p.labels || [], step: stepOf(p), qty,
    price: price.net, vat: price.vatRate, comparison: price.comparison ?? null, comparisonUnit: price.comparisonUnit ?? null,
    quantityExplanation: explainItemQuantity(p, quantity, qty),
    availability: { status: 'ok', deliveryDate: date, stock: a.amount ?? null, source: a.source, checkedAt: a.fetchedAt || Date.now() },
  } };
}

// Tiukat ruokavalio- ja allergeeniehdot säilyvät myös korvaajissa.
function fits(p, item) {
  const type = PRODUCT_TYPES.find((t) => t.id === item.productType);
  const fat = { 'fat-free': /rasvaton/i, 'semi-skimmed': /kevyt/i, whole: /täys/i }[item.attributes?.fat];
  return !!p && (!type || type.categories.includes(p.category) && !type.exclude?.test(p.name)) &&
    (!fat || fat.test(p.name)) && (!item.countryOfOrigin || p.country === item.countryOfOrigin) &&
    (item.attributes?.state !== 'frozen' || p.temp === 'frozen') &&
    (item.attributes?.treatment !== 'uht' || /uht/i.test(p.name)) &&
    (item.claims || []).every((c) => p.labels?.includes(c)) &&
    !(item.excludeAllergens || []).some((a) => !p.hasAllergenData || p.contains.includes(a) || p.mayContain?.includes(a));
}
async function alternatives(original, qty, date, item, cat) {
  const r = await findSubstitutes(original, qty, date, { subSameAllergens: true, bannedAllergens: item.excludeAllergens || [], subMaxPriceIncreasePct: 10 }, { limit: 8, recipeRequired: !!item.pinned });
  const candidates = r.options.filter((o) => fits(cat.get(o.productId), item));
  const quotes = await fetchQuotes(candidates.map((o) => o.productId), date);
  return candidates.flatMap((o) => {
    // Osatoimituksen alkuperäinen osa ei saa kadota: etsitään tässä kokonaisen tarpeen kattavia korvaajia.
    const assessed = orderableProduct(cat.get(o.productId), quotes.get(o.productId), date, item.quantity || { value: o.type === 'combo' ? o.qty * qty / (qty - r.partialAmount) : o.qty, unit: 'PCS' });
    return assessed.ok ? [{ ...assessed.product, substituteFor: { id: original.id, name: original.name }, warnings: o.warnings, why: o.why.filter((why) => !why.startsWith('Alkuperäistä saadaan')) }] : [];
  });
}

export async function searchStorefront(text, opts = {}) {
  const r = await interpret(text, { ...opts, limit: 80 });
  return availableStorefront(r, opts);
}

// Myös reseptien rakenteiset määrät tarkistetaan samalla saatavuusehdolla.
export async function availableStorefront(r, opts = {}) {
  const date = r.understood.deliveryDate || opts.deliveryDate;
  if (!validDeliveryDate(date) || date < clock.today()) throw new Error('Valitse kelvollinen tuleva toimituspäivä.');
  r.deliveryDate = date;
  r.dateAssumed = !r.understood.deliveryDate;
  const cat = loadCatalog();
  const ids = [...new Set(r.cards.filter((c) => c.status === 'ok').flatMap((c) => c.list.map((p) => p.id)))];
  const quotes = await fetchQuotes(ids, date);
  for (const [i, card] of r.cards.entries()) {
    const item = r.understood.items[i];
    const exact = card.status === 'ok' ? card.list.flatMap((p) => {
      const a = orderableProduct(cat.get(p.id), quotes.get(p.id), date, item.quantity);
      return a.ok ? [a.product] : [];
    }) : [];
    let substitutes = [];
    if (!exact.length && card.status === 'ok' && card.list.length) {
      const original = cat.get(card.list[0].id);
      const size = unitSizeFor(original, quotes.get(original.id)?.price, item.quantity?.unit || 'PCS', item.quantity?.basis || 'sales');
      if (size?.value) substitutes = await alternatives(original, (item.quantity?.value || 1) / size.value, date, item, cat);
    }
    // Esimerkiksi kurkun tuorehylly säilyy ennen säilykkeitä myös hintajärjestyksessä.
    const shelfRank = (p) => item.shelf ? item.categories.indexOf(cat.get(p.id).category) : 0;
    card.list = exact.length ? exact.sort((a, b) => shelfRank(a) - shelfRank(b) || (item.quantity?.basis === 'items' ? (a.quantityExplanation?.excessItems || 0) - (b.quantityExplanation?.excessItems || 0) : 0) || a.price * a.qty - b.price * b.qty) : substitutes;
    card.top = card.list.slice(0, 3); card.total = card.list.length;
    card.status = card.total ? 'ok' : 'no_match';
    // Katalogin suodatinten lukumäärät eivät kuvaa tämän päivän saatavuutta.
    card.chips = card.chips.map(({ matches, ...chip }) => chip);
    if (!card.total) card.reason = { code: 'NOT_AVAILABLE_ON_DATE', fi: 'Ei tilattavia tuotteita valitulle toimituspäivälle. Kokeile toista päivää tai tarkenna hakua.' };
  }
  r.gateway = { ...r.gateway, requestQuote: null };
  return r;
}

export async function reviewStorefront(rows, date) {
  const cat = loadCatalog();
  const quotes = await fetchQuotes(rows.map((r) => r.id), date, { fresh: true });
  const lines = [];
  for (const row of rows) {
    const p = cat.get(row.id);
    const a = orderableProduct(p, quotes.get(row.id), date, { value: row.qty, unit: 'PCS' });
    const avail = quotes.get(row.id)?.avail;
    const nextDeliveryDate = !avail?.stale && avail?.date > date && !cutoffPassed(avail.closingTime) ? avail.date : null;
    lines.push({ id: row.id, qty: row.qty, ...a,
      availability: avail ? { status: avail.status, deliveryDate: avail.date, stock: avail.amount ?? null, cutoffPassed: !!cutoffPassed(avail.closingTime), stale: !!avail.stale, source: avail.source } : { status: 'unknown' },
      nextDeliveryDate, alternatives: !a.ok && p ? await alternatives(p, row.qty, date, {}, cat) : [] });
  }
  return { deliveryDate: date, ok: lines.every((l) => l.ok), lines, checkedAt: clock.now().toISOString() };
}
