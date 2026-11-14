// Tilauskeskustelun tuotetyökalut (TYONJAKO.md, v1-sopimus, henkilö 3): suggest, quote ja submit.
// Malli ei valitse tuotteita, hintoja tai saatavuutta. Vaihtoehdot tulevat nykyisestä hausta ja saatavuusehdosta
// (storefront.mjs), tarjous ja tilaus gatewayn allekirjoitetusta ketjusta (gateway/service.mjs).
// confirmed tarkoittaa gatewayn demotallennusta. Se ei ole oikea Valio-tilaus.
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { clock } from '../gateway/clock.mjs';

const CLAIM_WORD = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu' };
const UNIT_WORD = { L: 'l', KG: 'kg', PCS: 'kpl' };
// Ruokavaatimus kysytään vain, kun se oikeasti jakaa tilattavat vaihtoehdot.
const CLARIFY = [{ claim: 'FREE_FROM_LACTOSE', min: 0.2, max: 0.8 }];
const issue = (code, fi, extra = {}) => ({ code, message: fi, ...extra });
const validQuantity = (q) => q && Number.isFinite(q.value) && q.value > 0 && q.value <= 100000 && ['L', 'KG', 'PCS'].includes(q.unit);
const dayLabel = (iso) => new Intl.DateTimeFormat('fi-FI', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Tarjous sidotaan sisältöön: sama hash vain, jos asiakas, päivä, toimituspaikka, tuotteet ja määrät ovat samat. */
export function draftHash(customer, draft) {
  const lines = (draft.lines || []).map((l) => [l.ref, String(l.selectedProductId || ''), l.quantity?.value ?? null, l.quantity?.unit ?? null, l.quantity?.basis || 'sales']).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const diet = [[...(draft.diet?.claims || [])].sort(), [...(draft.diet?.excludeAllergens || [])].sort()];
  return crypto.createHash('sha256').update(JSON.stringify([customer.customerId, customer.bindingVersion, draft.id, draft.deliveryDate || null, draft.deliverySiteId || null, diet, lines])).digest('hex');
}

/** Hakuteksti nykyiselle tulkinnalle: määrä, ruokavaatimukset ja tuotesana. Tuotenumero haetaan sellaisenaan. */
// Myyntipakkauksen sanan pitää olla jäsentimen tuntema yksikkö (paketti). Tuntematon sana luettiin tuotesanaksi,
// jolloin raaka-aineen oma hylly ohittui: "3 pakkausta banaani" tarjosi banaanijogurttia.
export function lineQuery(line) {
  const q = line.quantity;
  const amount = q ? `${String(q.value).replace('.', ',')} ${q.unit === 'PCS' && q.basis !== 'items' ? 'pakettia' : UNIT_WORD[q.unit]} ` : '';
  const claims = (line.claims || []).map((c) => CLAIM_WORD[c]).filter(Boolean).join(' ');
  return `${amount}${claims ? `${claims} ` : ''}${line.productTerm}`.trim();
}

// Vaihtoehtojen järjestys ostajalle. Haku palauttaa halvimman tarpeen kattavan ensin, jolloin kärkeen nousi maustettuja
// tuotteita ja annospakkauksia. Tässä perustuote tulee ennen maustettua ja tarpeeseen sopiva pakkaus ennen ylisuurta tai
// kymmeniä pikkupakkauksia. Hinta ja haun oma hyllyjärjestys ratkaisevat tasatilanteet. Heuristiikka nimen sanoista:
// se vain järjestää, ei pudota mitään pois, ja ostaja valitsee aina itse.
const NEUTRAL = /^(\d+([.,]\d+)?|x|l|dl|cl|ml|g|kg|kpl|uht|esl|hyla|fi|ja|laktoosit\w*|vähälaktoosi\w*|gluteenit\w*|luomu|rasvat\w*|kevyt|täys\w*|d-vitaminoitu|suomesta|suomi|suomalainen|kotimainen|pakaste|tuore|pesty|\w*suola\w*)$/;
const words = (text) => String(text || '').toLowerCase().replace(/[®™%&(),+]/g, ' ').split(/[\s/]+/).filter(Boolean);
export function rankOptions(found, line) {
  const term = words(line.productTerm).map((w) => (w.length > 4 ? w.slice(0, -1) : w)); // taivutus: kerma ~ kerman, maito ~ maitoa
  const need = line.quantity?.value || 0;
  // Yli kaksi kertaa tavallisen (mediaani) hintainen vaihtoehto, kuten erikoistuote tai annospakkaus, ei kuulu kärkeen.
  // Mediaani eikä halvin: yksi poikkeuksellisen halpa tuote ei saa pudottaa kaikkia muita.
  const cost = (o) => (Number.isFinite(o.price) && o.price > 0 ? o.price * o.qty : null);
  const costs = found.map(cost).filter((c) => c !== null).sort((x, y) => x - y);
  const typical = costs.length ? costs[Math.floor((costs.length - 1) / 2)] : Infinity;
  const score = (o) => {
    const brand = words(o.brand);
    // Kuvailevat sanat, jotka eivät ole merkki, koko, ruokavaliomerkintä tai itse tuote: "kolme sipulia", "mansikka".
    const extras = words(o.name).filter((w) => w.length > 2 && !/\d/.test(w) && !NEUTRAL.test(w) && !brand.includes(w) && !term.some((t) => w.includes(t))).length;
    const covered = o.quantityExplanation?.providedItems ?? (line.quantity?.unit === 'L' && o.litres ? o.qty * o.litres : line.quantity?.unit === 'KG' && o.kg ? o.qty * o.kg : null);
    const over = need && covered ? (covered - need) / need : 0;
    const fit = (over > 0.5 ? 2 : over > 0.1 ? 1 : 0) + (o.qty > 30 ? 2 : o.qty > 12 ? 1 : 0);
    // Yksi kuvaileva sana (lajike, tuotesarja) ei vielä tee tuotteesta maustettua. Näin haun oma hyllyjärjestys säilyy.
    // Isossa tilauksessa kaikki vaihtoehdot ovat kymmeniä eriä: silloin vähemmän käsiteltäviä eriä ensin.
    return [extras >= 2 || (cost(o) !== null && cost(o) > 2 * typical) ? 1 : 0, fit, o.qty > 30 ? o.qty : 0];
  };
  return found.map((o, i) => ({ o, i, s: score(o) })).sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1] || a.s[2] - b.s[2] || a.i - b.i).map((x) => x.o);
}

async function defaultDeps() {
  const [storefront, service, gwStore, catalog] = await Promise.all([
    import('../storefront.mjs'), import('../gateway/service.mjs'), import('../gateway/store.mjs'), import('../catalog.mjs'),
  ]);
  const cat = catalog.loadCatalog();
  return {
    // Säännöt ilman mallikutsua: luonnoksen rivi on jo rakenteinen.
    search: async (line, deliveryDate) => {
      const r = await storefront.searchStorefront(lineQuery(line), { deliveryDate, llm: false });
      return r.cards[0]?.list || [];
    },
    product: (id) => cat.get(String(id)),
    buyer: (buyerId) => gwStore.buyers.byId(buyerId),
    requestQuote: service.requestQuote,
    placeOrder: service.placeOrder,
  };
}

/**
 * @param {object} [deps] search, product, buyer, requestQuote, placeOrder, permissions, now, dbPath.
 *   permissions(customer) palauttaa tuoreet oikeudet juuri ennen tilausta (henkilön 4 sovitin); oletus käyttää annettua kontekstia.
 */
export function createOrderingTools(deps = {}) {
  // Sama kello kuin gatewaylla (DEMO_NOW), jotta tarjouksen voimassaolo ei riipu kahdesta eri ajasta.
  const now = deps.now || (() => clock.now().getTime());
  let resolved;
  const d = async () => (resolved ||= { ...(deps.search && deps.requestQuote && deps.placeOrder && deps.buyer && deps.product ? {} : await defaultDeps()), ...deps });
  const db = new DatabaseSync(deps.dbPath || ':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS tool_quotes (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, binding TEXT NOT NULL, draft_id TEXT NOT NULL, revision INTEGER NOT NULL,
    hash TEXT NOT NULL, expires INTEGER NOT NULL, offers TEXT NOT NULL, idem_key TEXT, result TEXT, created INTEGER NOT NULL)`);
  const saved = (id) => db.prepare('SELECT * FROM tool_quotes WHERE id=?').get(String(id || ''));
  const allowed = (customer, what) => customer?.customerId && customer.buyerId && customer.permissions?.[what] === true;

  function unsafe(product, line) {
    const banned = line.excludeAllergens || [];
    if (!banned.length) return false;
    // Puuttuva allergeenitieto ei ole todiste sopivuudesta.
    return !product || !product.hasAllergenData || banned.some((a) => product.contains?.includes(a) || product.mayContain?.includes(a));
  }

  async function suggest({ customer, draft }) {
    if (!allowed(customer, 'readProducts')) return { lines: [], issues: [issue('NOT_PERMITTED', 'Asiakkuudella ei ole oikeutta tuotetietoihin.')] };
    const issues = [];
    if (!validDate(draft.deliveryDate)) issues.push(issue('DELIVERY_DATE_MISSING', 'Toimituspäivä puuttuu.'));
    for (const l of draft.lines) if (!validQuantity(l.quantity)) issues.push(issue('QUANTITY_MISSING', `Määrä puuttuu: ${l.productTerm}.`, { ref: l.ref }));
    if (issues.length) return { lines: [], issues };
    const { search, product } = await d();
    const lines = [];
    // Koko tilauksen ruokavalio (draft.diet): allergeenia sisältävä tuote putoaa aina pois. Tuote, jolta allergeenitieto puuttuu
    // (esim. tuoreet kasvikset), näytetään varoituksen kanssa, ja merkintää vailla olevat näytetään vain, jos merkittyjä ei ole.
    // Rivin oma vaatimus (line.claims, line.excludeAllergens) on tiukka: varmentamaton ei kelpaa.
    const diet = { claims: draft.diet?.claims || [], excludeAllergens: draft.diet?.excludeAllergens || [] };
    for (const line of draft.lines) {
      let found; let soft = [];
      const extra = diet.claims.filter((c) => !(line.claims || []).includes(c));
      // Merkinnällä rajattu haku voi palauttaa saman tuoteryhmän muita merkittyjä tuotteita, kun itse tuotteella ei ole
      // merkintää (gluteeniton + tilli antoi maustesuolaa). Jos yksikään osuma ei ole pyydettyä tuotetta, näytetään
      // pyydetty tuote ja kerrotaan puuttuva merkintä tuotekohtaisesti.
      const stems = words(line.productTerm).map((w) => (w.length > 4 ? w.slice(0, -1) : w));
      const onTerm = (o) => stems.some((t) => String(o.name || '').toLowerCase().includes(t));
      try {
        found = await search(extra.length ? { ...line, claims: [...(line.claims || []), ...extra] } : line, draft.deliveryDate);
        if (extra.length && !found.some(onTerm)) { const plain = await search(line, draft.deliveryDate); if (plain.length) { found = plain; soft = extra; } }
      } catch { issues.push(issue('SEARCH_FAILED', `Tuotehaku ei onnistunut: ${line.productTerm}. Hintoja tai saatavuutta ei näytetä.`, { ref: line.ref })); continue; }
      let fit = found.filter((o) => !unsafe(product(o.id), line));
      if (diet.excludeAllergens.length) {
        const has = (o) => diet.excludeAllergens.some((a) => product(o.id)?.contains?.includes(a) || product(o.id)?.mayContain?.includes(a));
        fit = fit.filter((o) => !has(o));
      }
      fit = rankOptions(fit, line);
      if (!fit.length) { issues.push(issue('NO_ORDERABLE_PRODUCT', `Ei tilattavaa tuotetta päivälle ${dayLabel(draft.deliveryDate)}: ${line.productTerm}.`, { ref: line.ref })); continue; }
      const clarify = CLARIFY.filter((c) => !(line.claims || []).includes(c.claim)).map((c) => ({ claim: c.claim, share: fit.filter((o) => o.labels?.includes(c.claim)).length / fit.length, ...c }))
        .filter((c) => fit.length >= 3 && c.share >= c.min && c.share <= c.max).map((c) => c.claim);
      // Halvin tarpeen kattava vaihtoehto on aina kolmen joukossa, vaikka järjestys suosisi isompaa pakkausta.
      const top = fit.slice(0, 3);
      const cheapest = fit.reduce((a, b) => (b.price * b.qty < a.price * a.qty ? b : a));
      if (!top.includes(cheapest)) top[top.length - 1] = cheapest;
      lines.push({ ref: line.ref, total: fit.length, clarify, options: top.map((o) => ({
        productId: String(o.id), name: o.name, brand: o.brand || null, salesUnits: o.qty, salesUnitLabel: o.unitLabel,
        covers: o.quantityExplanation ? { value: o.quantityExplanation.providedItems, unit: 'PCS' } : o.litres ? { value: +(o.qty * o.litres).toFixed(2), unit: 'L' } : o.kg ? { value: +(o.qty * o.kg).toFixed(2), unit: 'KG' } : null,
        unitPriceNet: o.price, lineNet: +(o.price * o.qty).toFixed(2), deliveryDate: o.availability?.deliveryDate || draft.deliveryDate,
        stock: o.availability?.stock ?? null, labels: o.labels || [], note: o.quantityExplanation?.text || null,
        why: o.substituteFor ? `Korvaa tuotteen ${o.substituteFor.name}` : null,
        warning: [soft.filter((c) => !o.labels?.includes(c)).length ? `Ei merkintää: ${soft.filter((c) => !o.labels?.includes(c)).map((c) => CLAIM_WORD[c] || c).join(', ')}` : null, diet.excludeAllergens.length && !product(o.id)?.hasAllergenData ? 'allergeenitieto puuttuu, tarkista itse' : null].filter(Boolean).join('; ') || null,
      })) });
    }
    return { lines, issues };
  }

  async function quote({ customer, draft }) {
    const fail = (...issues) => ({ quoteId: null, draftId: draft.id, revision: draft.revision, expiresAt: null, lines: [], totals: null, issues });
    if (!allowed(customer, 'readProducts')) return fail(issue('NOT_PERMITTED', 'Asiakkuudella ei ole oikeutta tarjoukseen.'));
    if (!validDate(draft.deliveryDate)) return fail(issue('DELIVERY_DATE_MISSING', 'Toimituspäivä puuttuu.'));
    if (!draft.lines?.length) return fail(issue('EMPTY_DRAFT', 'Tilausluonnoksessa ei ole tuotteita.'));
    const open = draft.lines.filter((l) => !l.selectedProductId || !validQuantity(l.quantity));
    if (open.length) return fail(...open.map((l) => issue(l.selectedProductId ? 'QUANTITY_MISSING' : 'PRODUCT_NOT_SELECTED', `Valinta tai määrä puuttuu: ${l.productTerm}.`, { ref: l.ref })));
    const { buyer, requestQuote, product } = await d();
    const b = buyer(customer.buyerId);
    if (!b) return fail(issue('BUYER_UNKNOWN', 'Asiakkuutta ei löydy tilausjärjestelmästä.'));
    const dietBan = draft.diet?.excludeAllergens || [];
    const bad = draft.lines.filter((l) => unsafe(product(l.selectedProductId), l) || dietBan.some((a) => product(l.selectedProductId)?.contains?.includes(a) || product(l.selectedProductId)?.mayContain?.includes(a)));
    if (bad.length) return fail(...bad.map((l) => issue('ALLERGEN_CONFLICT', `Valittu tuote ei täytä allergiavaatimusta: ${l.productTerm}.`, { ref: l.ref })));
    let q;
    try {
      q = await requestQuote(b, { deliveryDate: draft.deliveryDate, maxOptions: 1, needs: draft.lines.map((l) => ({ ref: l.ref, candidates: [String(l.selectedProductId)], quantity: l.quantity, allowSubstitutes: false })) });
    } catch { return fail(issue('QUOTE_FAILED', 'Hinnan ja saatavuuden tarkistus ei onnistunut. Tilausta ei voi vielä hyväksyä.')); }
    const issues = []; const lines = []; const offers = []; let expires = Infinity;
    for (const need of q.needs) {
      const line = draft.lines.find((l) => l.ref === need.ref); const o = need.options[0];
      if (!o || o.kind !== 'exact') { issues.push(issue(need.excluded?.[0]?.code || 'NOT_AVAILABLE', `Ei tilattavissa: ${line?.productTerm || need.ref}. ${need.excluded?.[0]?.message || ''}`.trim(), { ref: need.ref })); continue; }
      // Eri toimituspäivä vaatii ostajan uuden valinnan, sitä ei hyväksytä hiljaa.
      if (o.deliveryDate !== draft.deliveryDate) { issues.push(issue('DELIVERY_DATE_SHIFT', `${o.lines[0].name} toimitetaan vasta ${o.deliveryDate}.`, { ref: need.ref, deliveryDate: o.deliveryDate })); continue; }
      const l = o.lines[0];
      lines.push({ ref: need.ref, productId: l.productId, name: l.name, salesUnits: l.quantity, salesUnitLabel: l.salesUnitLabel, covers: { value: l.covers, unit: line.quantity.unit }, unitPriceNet: l.unitPriceNet, lineNet: l.lineNet, vatRate: l.vatRate, stockKnown: l.availability.stockKnown, cutoff: o.cutoff, cutoffLabel: o.cutoffLabel });
      offers.push(o.offer); expires = Math.min(expires, Date.parse(o.expiresAt));
    }
    if (issues.length) return fail(...issues);
    const net = +lines.reduce((s, l) => s + l.lineNet, 0).toFixed(2);
    const vat = +lines.reduce((s, l) => s + l.lineNet * l.vatRate / 100, 0).toFixed(2);
    db.prepare('INSERT INTO tool_quotes(id,customer_id,binding,draft_id,revision,hash,expires,offers,created) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(q.quoteId, customer.customerId, String(customer.bindingVersion), draft.id, draft.revision, draftHash(customer, draft), expires, JSON.stringify(offers), now());
    return { quoteId: q.quoteId, draftId: draft.id, revision: draft.revision, expiresAt: new Date(expires).toISOString(), deliveryDate: draft.deliveryDate, lines, totals: { net, vat, gross: +(net + vat).toFixed(2), currency: 'EUR' }, issues: [] };
  }

  async function submit({ customer, draft, quoteId, approval, idempotencyKey }) {
    const reject = (code, fi) => ({ status: 'rejected', orderId: null, reasons: [issue(code, fi)] });
    const q = saved(quoteId);
    const key = String(idempotencyKey || '');
    if (key.length < 8) return reject('IDEMPOTENCY_KEY_REQUIRED', 'Tilauksen tunniste puuttuu.');
    // Saman lähetyksen uusinta palauttaa saman tuloksen, vaikka tarjous olisi jo vanhentunut.
    if (q?.result && q.idem_key === key && q.customer_id === customer?.customerId) return JSON.parse(q.result);
    const fresh = deps.permissions ? await deps.permissions(customer) : customer?.permissions;
    if (!allowed({ ...customer, permissions: fresh }, 'placeOrders')) return reject('NOT_PERMITTED', 'Asiakkuudella ei ole tilausoikeutta.');
    if (!q || q.customer_id !== customer.customerId || q.binding !== String(customer.bindingVersion)) return reject('QUOTE_NOT_FOUND', 'Tarjousta ei löydy tälle asiakkuudelle.');
    if (!approval || approval.draftId !== draft.id || approval.revision !== draft.revision || approval.quoteId !== q.id || q.draft_id !== draft.id || q.revision !== draft.revision)
      return reject('APPROVAL_MISMATCH', 'Hyväksyntä ei koske tätä luonnosversiota. Tarkista yhteenveto uudelleen.');
    if (q.hash !== draftHash(customer, draft)) return reject('DRAFT_CHANGED', 'Luonnos on muuttunut tarjouksen jälkeen. Tarkista yhteenveto uudelleen.');
    if (q.result) return reject('QUOTE_ALREADY_USED', 'Tarjous on jo käytetty.');
    if (q.expires <= now()) return reject('QUOTE_EXPIRED', 'Tarjous on vanhentunut. Tarkista hinnat uudelleen.');
    const { buyer, placeOrder } = await d();
    const b = buyer(customer.buyerId);
    if (!b) return reject('BUYER_UNKNOWN', 'Asiakkuutta ei löydy tilausjärjestelmästä.');
    let order;
    // Virhe ei tuota onnistumiskuittausta. Gatewayn oma idempotenssi estää kaksoistilauksen uusinnassa.
    try { order = await placeOrder(b, { offers: JSON.parse(q.offers), idempotencyKey: key, buyerReference: `whatsapp:${draft.id}`, requestedBy: customer.personName || null }); } catch { return reject('ORDER_FAILED', 'Tilauksen tallennus ei onnistunut. Tilausta ei ole tehty.'); }
    const result = { status: order.status, orderId: order.orderId, deliveryDate: order.deliveryDate || null, totals: order.totals || null, approvalUrl: order.approval?.url || null,
      reasons: (order.reasons || []).map((r) => ({ code: r.code, message: r.message, severity: r.severity })) };
    db.prepare('UPDATE tool_quotes SET idem_key=?, result=? WHERE id=?').run(key, JSON.stringify(result), q.id);
    return result;
  }

  return { suggest, quote, submit, prune() { db.prepare('DELETE FROM tool_quotes WHERE created<?').run(now() - 7 * 86400_000); }, close: () => db.close() };
}
