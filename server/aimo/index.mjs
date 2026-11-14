// AIMO-MALLI: yksi sisäänkäynti. Vapaa teksti → tulkinta → ehdokkaat katalogista → portin kutsu valmiina.
//   import { interpret } from './aimo/index.mjs';
//   const r = await interpret('I need 1,000 litres of lactose-free milk by Monday');
// Vastauksen muoto on tehty näytettäväksi ilman keskustelua: lyhyt yhteenveto, tuotekortit, näkyvät oletukset ja
// tarkennusnapit (valmiita rakenteisia muutoksia). Avoimia kysymyksiä ei esitetä koskaan.
import { understand } from './understand.mjs';
import { toGateway } from './resolve.mjs';
import { interpretWithModel, warm, modelStats, domainCard } from './model.mjs';
import { loadLexicon } from './lexicon.mjs';

export const LLM_THRESHOLD = 0.6;
const UNIT_FI = { L: 'l', KG: 'kg', PCS: 'kpl' };
const CLAIM_FI = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu', MARINE_STEWARDSHIP_COUNCIL_LABEL: 'MSC', FAIR_TRADE_MARK: 'Reilu kauppa' };

function summarize(req, gw) {
  if (!req.items.length) return req.language === 'en' ? 'I could not find a product request in this message.' : 'En löytänyt viestistä tuotepyyntöä.';
  const parts = req.items.map((it, i) => {
    const q = it.quantity ? `${String(it.quantity.value).replace('.', ',')} ${UNIT_FI[it.quantity.unit]} ` : '';
    const extra = [...it.claims.map((c) => CLAIM_FI[c]), it.brand, it.countryOfOrigin === 'fi' ? 'kotimainen' : null].filter(Boolean).join(', ');
    return `${q}${it.productTerm}${extra ? ` (${extra})` : ''}: ${gw.resolved[i].total} sopivaa tuotetta`;
  });
  return `${parts.join(' · ')}${req.deliveryDate ? ` · toimitus ${req.deliveryDate}` : ''}`;
}

/**
 * @param {string} text ostajan vapaa pyyntö
 * @param {{now?: Date, llm?: boolean, limit?: number}} [opts] llm: false pakottaa pelkät säännöt
 */
export async function interpret(text, opts = {}) {
  const t0 = performance.now();
  let req = understand(text, opts);
  let modelError = null;
  if (req.confidence < LLM_THRESHOLD && opts.llm !== false) {
    try {
      const m = await interpretWithModel(text, opts.now || new Date());
      if (m && m.items.length) req = { ...req, intent: m.intent === 'other' ? req.intent : m.intent, items: m.items, deliveryDate: m.deliveryDate || req.deliveryDate, unparsed: m.unparsed, assumptions: req.assumptions.filter((a) => a.item == null && a.code !== 'UNKNOWN_WORD'), confidence: m.unparsed.length ? 0.7 : 0.9, via: m.via, modelMs: m.modelMs };
    } catch (err) { modelError = String(err.message || err).slice(0, 160); }
  }
  // Tarkennusnapit: valmis rakenteinen muutos riville, ei uutta tekstiä eikä uutta tulkintaa.
  for (const { item, patch } of opts.patches || []) {
    const it = req.items[item];
    if (!it || !patch || typeof patch !== 'object') continue;
    if (Array.isArray(patch.claims)) it.claims = patch.claims.filter((c) => typeof c === 'string');
    if (typeof patch.brand === 'string') it.brand = patch.brand;
    if (patch.countryOfOrigin === 'fi') it.countryOfOrigin = 'fi';
    if (patch.attributes && typeof patch.attributes === 'object') it.attributes = { ...it.attributes, ...patch.attributes };
    req.assumptions = req.assumptions.filter((a) => !(a.item === item && a.code === 'FAT_NOT_SPECIFIED' && it.attributes.fat));
  }
  const gw = toGateway(req, opts);
  const needsHuman = !req.items.length || req.confidence < LLM_THRESHOLD;
  return {
    understood: req,
    summary: summarize(req, gw),
    cards: gw.resolved.map((r, i) => ({ item: i, status: r.status, reason: r.reason, total: r.total, top: r.candidates.slice(0, 3), chips: r.chips, funnel: r.funnel })),
    gateway: { search: gw.resolved.map((r) => r.search), requestQuote: gw.requestQuote, blocked: gw.blocked },
    handoff: needsHuman ? { code: 'NEEDS_HUMAN', fi: 'Pyyntöä ei ymmärretty riittävän varmasti: ohjataan ihmiselle eikä arvata', en: 'Not understood with enough confidence: handed to a human instead of guessing' } : null,
    trace: { via: req.via, confidence: req.confidence, llmCalls: req.via === 'aimo-rules' ? 0 : 1, modelError, ms: +(performance.now() - t0).toFixed(2) },
  };
}

export { understand, toGateway, warm, modelStats, domainCard, loadLexicon };
