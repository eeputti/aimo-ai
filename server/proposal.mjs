// Tilausehdotuksen malli + sääntötarkistus ("policy gate"). Kaikki täällä on determinististä koodia, ei kielimallia:
// tämä on se osa, johon keittiöpäällikkö ja hankinta voivat luottaa. Sama tarkistus ajetaan aina juuri ennen tilauksen lähtöä.
import { loadCatalog, unitLabel, stepOf, allergenName, roundToStep } from './catalog.mjs';
import { packHint } from './packs.mjs';
import { cutoffPassed, helsinkiLabel } from './gateway/clock.mjs';

export const DEFAULT_RULES = {
  autonomy: 'ask_exceptions', // 'suggest' = vain ehdottaa, 'ask_exceptions' = kysyy luvan poikkeuksiin, 'auto_within_rules' = hyväksyy itse sääntöjen sisällä
  maxQtyJumpPct: 60, // rivin määrä yli tämän verran perustasosta → varmistus
  bannedAllergens: [],
  blockedVendors: [],
  preferDomestic: true,
  minReliability: 0.9,
  subSameAllergens: true,
  subMaxPriceIncreasePct: 10,
};

// Vanhassa kannassa voi olla poistettuja asetuksia; käytetään vain nykyisiä sääntöjä.
export const normalizeRules = (rules = {}) => Object.fromEntries(Object.entries(DEFAULT_RULES).map(([key, value]) => [key, rules[key] ?? value]));

let lineSeq = 0;
export const newLineId = () => `L${Date.now().toString(36)}${(lineSeq++).toString(36)}`;
const money = (n) => +(+n).toFixed(2);
export const fmtQty = (q) => String(+(+q).toFixed(2)).replace('.', ',');
export const fmtDate = (iso) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };

export function makeLine(productId, qty, extra = {}) {
  const p = loadCatalog().get(productId);
  if (!p) throw new Error(`Tuotetta ${productId} ei ole katalogissa`);
  return {
    lineId: newLineId(), productId: p.id, name: p.name, brand: p.brand || null, vendor: p.vendor,
    unit: p.salesUnit, unitLabel: unitLabel(p.salesUnit), step: stepOf(p), temp: p.temp, country: p.country || null,
    contains: p.contains, labels: p.labels || [], reliability: p.reliability ?? null, co2: p.co2 ?? null, kg: p.kg ?? null,
    qty, baselineQty: null, lastWeekQty: null, history: [], group: null, origin: 'history',
    reason: { text: '', factors: [], sources: [] },
    price: null, availability: null, flags: [], state: 'ok', options: null, decision: null,
    ...extra,
  };
}

export function applyQuote(line, quote) {
  const price = quote?.price;
  const avail = quote?.avail;
  line.price = price && !price.error ? { net: price.net, gross: price.gross, vatRate: price.vatRate, list: price.list, comparison: price.comparison, comparisonUnit: price.comparisonUnit, source: price.source, stale: !!price.stale, fetchedAt: price.fetchedAt } : null;
  line.availability = avail ? { status: avail.status, amount: avail.amount ?? null, date: avail.date ?? null, closingTime: avail.closingTime ?? null, model: avail.model ?? null, source: avail.source, stale: !!avail.stale, note: avail.note, fetchedAt: avail.fetchedAt } : { status: 'unknown' };
  // Vertailuhinnasta saadaan myyntiyksikön koko silloinkin, kun tuotedatassa ei ole painoa (esim. HeVi).
  if (!line.kg && line.price?.comparison > 0) line.kgFromPrice = +(line.price.net / line.price.comparison).toFixed(3);
  return line;
}

export const activeLines = (p) => p.lines.filter((l) => !['removed', 'replaced'].includes(l.state));

/** Rivin saatavuustila suhteessa pyydettyyn määrään. Tuntematon ei ole koskaan "saatavilla". */
export function lineAvailability(line, deliveryDate) {
  const a = line.availability;
  if (!a || a.status === 'unknown') return { kind: 'unknown', text: 'Saatavuutta ei voitu varmistaa rajapinnasta' };
  if (a.status === 'out' || a.status === 'blocked') return { kind: 'out', text: a.status === 'blocked' ? 'Myyntiesto, ei tilattavissa' : 'Ei saatavilla' };
  if (cutoffPassed(a.closingTime)) return { kind: 'closed', text: `Tilausaika umpeutui ${helsinkiLabel(a.closingTime)}` }; // rajapinta näyttää tuotteen silti saatavana
  if (a.status === 'late') return line.acceptLate ? { kind: 'ok', text: `Toimitus ${fmtDate(a.date)} (hyväksytty)` } : { kind: 'late', text: `Saatavilla vasta ${fmtDate(a.date)}` };
  if (a.amount != null && a.amount < line.qty) return { kind: 'partial', text: `Varastossa vain ${fmtQty(a.amount)} ${line.unitLabel}`, amount: a.amount };
  if (a.amount == null) return { kind: 'ok', text: a.model === 'Terminal' ? 'Toimittajan varastosta' : 'Saatavilla' };
  return { kind: 'ok', text: `${a.amount > 999 ? '999+' : fmtQty(a.amount)} ${line.unitLabel} varastossa` };
}

/**
 * Sääntötarkistus. Asettaa rivien liput ja tilat, laskee summat ja kokoaa hyväksyntää vaativat asiat.
 * Tila: ok | decision (saatavuuspoikkeama, vaatii valinnan) | confirm (epätavallinen määrä) | blocked (sääntö kieltää).
 */
export function evaluate(proposal, rules) {
  rules = normalizeRules(rules);
  delete proposal.budgetOverride; // aiemmin tallennettu ylityslupa ei enää kuulu ehdotukseen
  const lines = activeLines(proposal);
  for (const line of lines) {
    const flags = [];
    const av = lineAvailability(line, proposal.deliveryDate);
    line.availabilityView = av;
    if (av.kind !== 'ok') flags.push({ type: av.kind, severity: 'decision', text: av.text });
    if (!line.price) flags.push({ type: 'noprice', severity: 'decision', text: 'Hintaa ei saatu rajapinnasta' });

    const banned = (rules.bannedAllergens || []).filter((a) => line.contains.includes(a));
    if (banned.length) flags.push({ type: 'allergen', severity: 'blocked', text: `Sisältää kielletyn allergeenin: ${banned.map(allergenName).join(', ')}` });
    if ((rules.blockedVendors || []).includes(line.vendor)) flags.push({ type: 'vendor', severity: 'blocked', text: `Toimittaja ${line.vendor} on estolistalla` });

    const ref = line.expectedQty ?? line.baselineQty; // agentin oma ennuste on vertailukohta; sen ylittävä muutos varmistetaan
    if (ref > 0 && line.qty > ref * (1 + rules.maxQtyJumpPct / 100) && !line.qtyConfirmed) {
      const jump = Math.round((line.qty / ref - 1) * 100);
      flags.push({ type: 'qtyjump', severity: 'confirm', text: `Määrä +${jump} % yli ennusteen (${fmtQty(ref)} ${line.unitLabel}), raja +${rules.maxQtyJumpPct} %` });
    }
    if (line.reliability != null && line.reliability < rules.minReliability) flags.push({ type: 'reliability', severity: 'info', text: `Toimitusvarmuus ${(line.reliability * 100).toFixed(0)} % (raja ${(rules.minReliability * 100).toFixed(0)} %)` });
    if (line.price?.stale || line.availability?.stale) flags.push({ type: 'stale', severity: 'info', text: 'Tieto välimuistista, rajapinta ei vastannut' });

    line.flags = flags;
    line.state = flags.some((f) => f.severity === 'blocked') ? 'blocked' : flags.some((f) => f.severity === 'decision') ? 'decision' : flags.some((f) => f.severity === 'confirm') ? 'confirm' : 'ok';
    line.total = line.price ? money(line.price.net * line.qty) : null;
    line.pack = line.state === 'ok' ? packHint(line, rules) : null; // pakkauskoko-ehdotus (server/packs.mjs)
  }

  const priced = lines.filter((l) => l.total != null && l.state !== 'decision' && l.state !== 'blocked');
  const net = money(priced.reduce((s, l) => s + l.total, 0));
  const vat = money(priced.reduce((s, l) => s + l.total * ((l.price.vatRate ?? 13.5) / 100), 0));
  const pendingNet = money(lines.filter((l) => l.total != null && (l.state === 'decision' || l.state === 'blocked')).reduce((s, l) => s + l.total, 0));
  const baselineNet = money(lines.reduce((s, l) => s + (l.price && l.baselineQty ? l.price.net * l.baselineQty : 0), 0));

  // Vastuullisuus: arvio tuoteryhmäkeskiarvoilla, vain riveille joille on sekä paino että CO2-arvo.
  let co2 = 0; let co2Lines = 0; let domesticNet = 0;
  for (const l of priced) {
    const kg = l.kg ?? l.kgFromPrice;
    if (kg && l.co2 != null) { co2 += l.qty * kg * l.co2; co2Lines += 1; }
    if (l.country === 'fi') domesticNet += l.total;
  }

  const expected = money(net + pendingNet); // mukana myös päätöstä odottavien rivien hinnat
  proposal.totals = { net, vat, gross: money(net + vat), pendingNet, expected, baselineNet, lines: lines.length, co2Kg: Math.round(co2), co2Lines, domesticShare: net ? Math.round((domesticNet / net) * 100) : 0 };

  const approvals = (proposal.planningIssues || []).map((text, i) => ({ id: `planning:${i}`, type: 'planning', text }));
  for (const l of lines) {
    if (l.state === 'decision') approvals.push({ id: `line:${l.lineId}`, type: 'availability', lineId: l.lineId, text: `${l.name}: ${l.flags.find((f) => f.severity === 'decision').text}` });
    if (l.state === 'blocked') approvals.push({ id: `line:${l.lineId}`, type: 'blocked', lineId: l.lineId, text: `${l.name}: ${l.flags.find((f) => f.severity === 'blocked').text}` });
    if (l.state === 'confirm') approvals.push({ id: `line:${l.lineId}`, type: 'qtyjump', lineId: l.lineId, text: `${l.name}: ${l.flags.find((f) => f.severity === 'confirm').text}` });
  }
  proposal.approvals = approvals;
  proposal.canOrder = approvals.length === 0 && lines.length > 0;
  proposal.rulesSnapshot = rules;
  proposal.updatedAt = new Date().toISOString();
  return proposal;
}

export const fmtMoney = (n) => `${(+n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// ---------- Muutokset (nopea polku ja UI käyttävät samoja funktioita) ----------
export const findLine = (proposal, lineId) => proposal.lines.find((l) => l.lineId === lineId);

export function setQty(proposal, lineId, qty, { confirmed = false, by = 'user' } = {}) {
  const line = findLine(proposal, lineId);
  if (!line) return null;
  const p = loadCatalog().get(line.productId);
  const next = roundToStep(Math.max(0, qty), p, 'nearest');
  if (next <= 0) return removeLine(proposal, lineId, by);
  const prev = line.qty;
  line.qty = next;
  if (confirmed) line.qtyConfirmed = true;
  if (by === 'user' && next !== prev) line.reason.userEdit = `Muutit määrää ${fmtQty(prev)} → ${fmtQty(next)} ${line.unitLabel}`;
  return { line, prev, next };
}

export function removeLine(proposal, lineId, by = 'user') {
  const line = findLine(proposal, lineId);
  if (!line) return null;
  line.state = 'removed';
  line.removedBy = by;
  return { line, prev: line.qty, next: 0 };
}

/** Käyttäjän päätös saatavuuspoikkeamaan: option index | 'drop' | 'late' (hyväksy myöhempi toimitus) | 'keep' (osatoimitus). */
export function decide(proposal, lineId, choice) {
  const line = findLine(proposal, lineId);
  if (!line) return null;
  if (choice === 'drop') { line.state = 'removed'; line.decision = { type: 'drop' }; return { line, action: 'drop' }; }
  if (choice === 'late') { line.acceptLate = true; line.decision = { type: 'late' }; return { line, action: 'late' }; }
  if (choice === 'keep') { // otetaan se mitä saadaan
    const amount = roundToStep(line.availability?.amount || 0, loadCatalog().get(line.productId), 'down');
    if (amount <= 0) return null;
    line.reason.userEdit = `Osatoimitus hyväksytty: ${fmtQty(line.qty)} → ${fmtQty(amount)} ${line.unitLabel}`;
    line.qty = amount; line.decision = { type: 'keep' };
    return { line, action: 'keep' };
  }
  const opt = line.options?.[Number(choice)];
  if (!opt) return null;
  const sub = makeLine(opt.productId, opt.qty, {
    recipeRequired: !!line.recipeRequired,
    group: line.group, origin: 'substitute', substituteFor: { productId: line.productId, name: line.name, qty: line.qty, unitLabel: line.unitLabel },
    baselineQty: null, tags: line.tags,
    reason: { text: `Korvaa tuotteen ${line.name}`, factors: opt.why.map((w) => ({ label: w })), sources: ['Aimo-tuotedata', 'saatavuus- ja hintarajapinta'] },
    price: { net: opt.price.net, comparison: opt.price.comparison, comparisonUnit: opt.price.comparisonUnit, source: opt.price.source, vatRate: line.price?.vatRate ?? 13.5 },
    availability: { status: 'ok', amount: opt.availability.amount, model: opt.availability.model, source: opt.availability.source },
  });
  if (opt.type === 'combo' && opt.keepOriginalQty > 0) {
    line.qty = opt.keepOriginalQty;
    line.reason.userEdit = `Osa korvattu: tätä ${fmtQty(opt.keepOriginalQty)} ${line.unitLabel}, loput tuotteella ${opt.name}`;
    line.decision = { type: 'combo', productId: opt.productId };
  } else {
    line.state = 'replaced';
    line.decision = { type: 'swap', productId: opt.productId };
  }
  proposal.lines.splice(proposal.lines.indexOf(line) + 1, 0, sub);
  return { line, sub, action: opt.type };
}
