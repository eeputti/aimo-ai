// SYVÄ AGENTTI. Ajetaan taustalla (käynnistyksessä, ajastettuna, tai kun data/säännöt muuttuvat), ei koskaan käyttäjän odottaessa.
// Tulos tallennetaan kantaan valmiiksi tilausehdotukseksi, jonka nopea polku vain lukee: "syvä ajattelu tehdään ennen kuin kysyt".
//
// Vaiheet: 1) kysyntäennuste historiasta  2) signaalit (varaukset, ryhmämenut)  3) saatavuus + hinta rajatulle joukolle
//          4) poikkeamille korvaajat valmiiksi  5) sääntötarkistus  6) iso kielimalli tarkistaa kokonaisuuden ja kirjoittaa tiivistelmän.
// Numerot lasketaan koodilla; kielimalli saa vain valita annetuista vaihtoehdoista ja selittää, ei keksiä tuotteita tai määriä.
import { loadCatalog, unitLabel, TEMP_LABEL } from '../catalog.mjs';
import { kv, history, bookings, proposals, audit } from '../db.mjs';
import { fetchQuotes, apiStats } from '../valioApi.mjs';
import { apiMode, llmEnabled, config } from '../config.mjs';
import { makeLine, applyQuote, evaluate, activeLines, decide, fmtQty, fmtMoney, fmtDate, normalizeRules } from '../proposal.mjs';
import { findSubstitutes } from '../substitutes.mjs';
import { buildDemandPlan } from '../planning.mjs';
import { publish } from '../bus.mjs';
import { deepReview } from '../llm.mjs';

export const deepState = { running: false, queued: null, lastRun: null, steps: [] };

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/** Kysyntäennuste yhdelle tuotteelle viikkosarjasta. Palauttaa joko {base, factors} tai {skip: syy}. */
export function forecast(series, weekLabels) {
  const idx = series.map((q, i) => (q > 0 ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { skip: 'Ei tilaushistoriaa' };
  const n = series.length;
  const last = idx.at(-1);
  const since = n - last; // 1 = tilattu viime viikolla
  const gaps = idx.slice(1).map((v, i) => v - idx[i]);
  const cadence = gaps.length ? Math.round(median(gaps)) : 1;
  const lastLabel = weekLabels[last];
  if (since > Math.max(4, cadence * 2 + 1)) return { skip: `Ei tilattu ${since - 1} viikkoon (viimeksi ${lastLabel}), jätetty pois` };
  if (cadence >= 2 && since < cadence) return { skip: `Tilausrytmi noin joka ${cadence}. viikko, viimeksi ${lastLabel}: ei vielä tällä viikolla` };
  const values = idx.slice(-8).map((i) => series[i]);
  let base = median(values);
  const factors = [{ label: 'Perustaso', detail: `${values.length} viime tilauksen mediaani`, kind: 'base' }];
  if (values.length >= 6) {
    const recent = mean(values.slice(-3));
    const prior = mean(values.slice(0, -3));
    const ratio = recent / prior;
    if (ratio >= 1.15 || ratio <= 0.85) {
      base = recent;
      factors.push({ label: 'Trendi', detail: `3 viime tilausta vs. aiemmat ${Math.round(prior * 10) / 10} → ${Math.round(recent * 10) / 10}`, value: `${ratio > 1 ? '+' : ''}${Math.round((ratio - 1) * 100)} %`, kind: 'trend' });
    }
  }
  if (cadence >= 2) factors.push({ label: 'Tilausrytmi', detail: `noin joka ${cadence}. viikko, viimeksi ${lastLabel}`, kind: 'cadence' });
  return { base, factors, cadence, lastWeekQty: series[n - 1] || null };
}

function step(steps, name, detail, t0) {
  const s = { name, detail, ms: +(performance.now() - t0).toFixed(1) };
  steps.push(s);
  deepState.steps = steps;
  publish('deep', { phase: 'step', step: s, steps });
  return s;
}

export async function runDeep({ reason = 'ajastettu yöajo', deliveryDate } = {}) {
  if (deepState.running) { deepState.queued = { reason, deliveryDate }; return null; }
  deepState.running = true;
  deepState.steps = [];
  const started = performance.now();
  publish('deep', { phase: 'start', reason });
  try {
    const cat = loadCatalog();
    const planningRevision = kv.get('planningRevision', 0);
    const rules = normalizeRules(kv.get('rules', {}));
    const date = deliveryDate || kv.get('deliveryDate');
    kv.set('deliveryDate', date);
    const steps = [];
    const callsBefore = apiStats.calls;
    const idsBefore = apiStats.ids;

    // 1) Historia → ennuste
    let t = performance.now();
    const rows = history.all().filter((r) => r.date < date);
    const weeks = [...new Set(rows.map((r) => r.week))].sort().slice(-12);
    const weekLabels = weeks.map((w) => `vk ${+w.split('-W')[1]}`);
    const series = new Map();
    for (const r of rows) { const i = weeks.indexOf(r.week); if (i < 0) continue; if (!series.has(r.product_id)) series.set(r.product_id, new Array(weeks.length).fill(0)); series.get(r.product_id)[i] = r.qty; }
    const meta = new Map((kv.get('staples', []) || []).map((s) => [s.id, s]));
    const planned = []; const skipped = [];
    for (const [productId, s] of series) {
      const p = cat.get(productId);
      if (!p) continue;
      const f = forecast(s, weekLabels);
      if (f.skip) skipped.push({ productId, name: p.name, reason: f.skip });
      else planned.push({ p, series: s, ...f, tags: meta.get(productId)?.tags || [], group: meta.get(productId)?.group || TEMP_LABEL[p.temp] || 'Muut' });
    }
    step(steps, 'Kysyntäennuste', `${series.size} tuotetta, ${weeks.length} viikon historia → ${planned.length} riviä, ${skipped.length} jätetty pois`, t);

    // 2–3) Historia + päiväkohtaiset ryhmät + reseptit − käyttökelpoinen varasto.
    t = performance.now();
    const demand = buildDemandPlan({ cat, planned, bookingRows: bookings.all(), menuEvents: kv.get('menuEvents', []),
      inventory: kv.get('inventory'), incoming: kv.get('incoming', []), deliveryDate: date, weekLabels });
    const signals = demand.signals;
    const lines = demand.lines.map(({ productId, qty, extra }) => makeLine(productId, qty, extra));
    const included = new Set(lines.map((l) => l.productId));
    for (let i = skipped.length - 1; i >= 0; i--) if (included.has(skipped[i].productId)) skipped.splice(i, 1);
    skipped.push(...demand.skipped);
    step(steps, 'Reseptit ja ostotarve', `${signals.length} signaalia, ${lines.length} ostoriviä, ${demand.issues.length} laskennan estettä`, t);
    const order = ['Maito & munat', 'Hedelmät & vihannekset', 'Liha & kala', 'Kuivatuotteet', 'Pakasteet', 'Non-food'];
    lines.sort((a, b) => (order.indexOf(a.group) + 99) % 99 - (order.indexOf(b.group) + 99) % 99 || a.name.localeCompare(b.name, 'fi'));
    step(steps, 'Määrät pakkauskokoihin', `${lines.length} riviä pyöristetty myyntieriin`, t);

    // 4) Saatavuus + hinta vain näille tuotteille
    t = performance.now();
    const quotes = await fetchQuotes(lines.map((l) => l.productId), date);
    lines.forEach((l) => applyQuote(l, quotes.get(l.productId)));
    const proposal = { id: `P-${date}-${Date.now().toString(36)}`, kitchen: kv.get('kitchen'), deliveryDate: date, createdAt: new Date().toISOString(), status: 'draft', lines, signals, skipped, planningIssues: demand.issues, planningWarnings: demand.warnings, planningRevision, source: apiMode() };
    evaluate(proposal, rules);
    step(steps, 'Saatavuus ja hinnat', `${lines.length} tuotetta, ${apiStats.calls - callsBefore} API-kutsua (${apiMode() === 'live' ? 'live' : 'simuloitu'})`, t);

    // 5) Poikkeamille korvaajat valmiiksi (rinnakkain)
    t = performance.now();
    const exceptions = lines.filter((l) => l.state === 'decision');
    const weak = lines.filter((l) => l.state !== 'decision' && l.flags.some((f) => f.type === 'reliability'));
    let checked = 0;
    await Promise.all([...exceptions, ...weak].map(async (line) => {
      const res = await findSubstitutes(cat.get(line.productId), line.qty, date, rules, { limit: line.state === 'decision' ? 3 : 10, recipeRequired: line.recipeRequired });
      checked += res.checked;
      if (line.state === 'decision') line.options = res.options;
      else { // toimitusvarmuus alle rajan: tarjotaan varmempaa vaihtoehtoa, ei pakoteta
        const better = res.options.filter((o) => (o.reliability ?? 0) >= rules.minReliability && o.reliability > line.reliability).slice(0, 2);
        if (better.length) { better.forEach((o, i) => { o.recommended = i === 0; }); line.options = better; line.altReason = 'reliability'; }
      }
    }));
    step(steps, 'Korvaajat poikkeamille', `${exceptions.length} poikkeamaa, ${weak.length} heikon toimitusvarmuuden riviä, ${checked} ehdokasta arvioitu`, t);

    // 6) Sääntötarkistus + autonomiataso
    t = performance.now();
    const autoDecisions = [];
    if (rules.autonomy === 'auto_within_rules') {
      for (const line of exceptions) {
        const best = line.options?.[0];
        if (best?.withinPolicy) { const r = decide(proposal, line.lineId, 0); if (r?.sub) { r.sub.autoDecided = true; applyQuote(r.sub, (await fetchQuotes([r.sub.productId], date)).get(r.sub.productId)); autoDecisions.push(`${line.name} → ${best.name}`); } }
      }
    }
    evaluate(proposal, rules);
    step(steps, 'Sääntötarkistus', `${proposal.approvals.length} asiaa vaatii päätöksen${autoDecisions.length ? `, ${autoDecisions.length} korvausta hyväksytty itse sääntöjen sisällä` : ''}`, t);

    // 7) Tiivistelmä: iso malli jos avain on, muuten sääntöpohjainen
    t = performance.now();
    proposal.briefing = templateBriefing(proposal, signals, exceptions);
    proposal.llm = { used: false };
    proposal.risks = demand.warnings;
    if (llmEnabled()) {
      try {
        const review = await deepReview(reviewFacts(proposal, signals, skipped));
        if (review?.briefing) proposal.briefing = review.briefing;
        proposal.risks = [...demand.warnings, ...(review?.risks || [])];
        for (const pick of review?.picks || []) { // malli saa vain järjestää valmiiksi tarkistetut vaihtoehdot
          const line = proposal.lines.find((l) => l.lineId === pick.lineId);
          const i = line?.options?.findIndex((o) => o.productId === pick.productId) ?? -1;
          if (i >= 0) { line.options.forEach((o) => { o.recommended = false; }); line.options[i].recommended = true; line.options[i].agentNote = pick.why; }
        }
        proposal.llm = { used: true, model: review?.model || config.deepModel };
        step(steps, 'Syvä tarkistus (kielimalli)', `${proposal.llm.model}: tiivistelmä, ${review?.picks?.length || 0} korvaajavalintaa, ${proposal.risks.length} riskihuomiota`, t);
      } catch (err) {
        step(steps, 'Syvä tarkistus (kielimalli)', `ohitettu, käytetään sääntöpohjaista tiivistelmää: ${String(err.message || err).slice(0, 120)}`, t);
      }
    } else step(steps, 'Tiivistelmä', 'sääntöpohjainen (ANTHROPIC_API_KEY puuttuu, kielimallia ei käytetty)', t);

    const closings = activeLines(proposal).map((l) => l.availability?.closingTime).filter(Boolean).sort();
    proposal.cutoff = closings[0] || null;
    proposal.deep = { ms: Math.round(performance.now() - started), steps, reason, finishedAt: new Date().toISOString(), apiCalls: apiStats.calls - callsBefore, quotedProducts: apiStats.ids - idsBefore, autoDecisions, weeks: weeks.length };
    proposals.save(proposal);
    proposals.setCurrent(proposal.id);
    deepState.lastRun = proposal.deep;
    audit('syvä agentti', 'Tilausehdotus laadittu', { syy: reason, riveja: proposal.totals.lines, summa: proposal.totals.expected, poikkeamia: proposal.approvals.length, kesto_ms: proposal.deep.ms, api_kutsuja: proposal.deep.apiCalls, malli: proposal.llm.used ? proposal.llm.model : 'ei kielimallia' }, proposal.deep.ms, proposal.id);
    publish('deep', { phase: 'done', ms: proposal.deep.ms, proposalId: proposal.id });
    return proposal;
  } catch (err) {
    audit('syvä agentti', 'Ajo epäonnistui', { virhe: String(err.stack || err).slice(0, 400) });
    publish('deep', { phase: 'error', error: String(err.message || err) });
    throw err;
  } finally {
    deepState.running = false;
    if (deepState.queued) { const next = deepState.queued; deepState.queued = null; setImmediate(() => runDeep(next).catch(() => {})); }
  }
}

export function templateBriefing(proposal, signals, exceptions) {
  const t = proposal.totals;
  const parts = [`${weekdayLong(proposal.deliveryDate)} ${fmtDate(proposal.deliveryDate)} tilaus on valmiina: ${t.lines} riviä, ${fmtMoney(t.expected)} (alv 0 %).`];
  const booking = signals.find((s) => s.id === 'bookings');
  if (booking && Math.abs(booking.uplift) >= 0.03) parts.push(`Tavallisen myynnin varauksia on ${Math.round(Math.abs(booking.uplift) * 100)} % tavallista ${booking.uplift > 0 ? 'enemmän' : 'vähemmän'}${booking.peaks.length ? ` (${booking.peaks.join(' ja ')} asiakasta)` : ''}, joten tuoretuotteiden määriä on ${booking.uplift > 0 ? 'nostettu' : 'laskettu'}.`);
  const menu = signals.find((s) => s.id.startsWith('menu:'));
  if (menu) parts.push(`${menu.label} (${menu.detail.split(' (')[0]}) on laskettu reseptistä mukaan.`);
  const outs = exceptions.filter((l) => l.state !== 'replaced');
  if (outs.length) parts.push(`${outs.length} ${outs.length === 1 ? 'tuote ei ole' : 'tuotetta ei ole'} saatavilla sellaisenaan: ${outs.map((l) => l.name.split(' ').slice(0, 3).join(' ')).join(', ')}. Korvaajat on valittu valmiiksi, sinun tarvitsee vain hyväksyä.`);
  return parts.join(' ');
}
const weekdayLong = (iso) => ['Sunnuntain', 'Maanantain', 'Tiistain', 'Keskiviikon', 'Torstain', 'Perjantain', 'Lauantain'][new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Tiivis faktapaketti kielimallille. Kaikki luvut ovat jo laskettuja; malli ei saa muuttaa niitä. */
function reviewFacts(proposal, signals, skipped) {
  return {
    keittio: proposal.kitchen?.name, toimituspaiva: proposal.deliveryDate, summat: proposal.totals,
    laskennan_esteet: proposal.planningIssues, laskennan_huomiot: proposal.planningWarnings,
    signaalit: signals.map((s) => ({ nimi: s.label, kuvaus: s.detail, lahde: s.source })),
    rivit: activeLines(proposal).map((l) => ({ lineId: l.lineId, tuote: l.name, maara: `${fmtQty(l.qty)} ${l.unitLabel}`, perustaso: l.baselineQty, perustelu: l.reason.text, tila: l.state, liput: l.flags.map((f) => f.text), toimitusvarmuus: l.reliability, rivisumma: l.total })),
    poikkeamat: proposal.lines.filter((l) => l.options?.length).map((l) => ({ lineId: l.lineId, tuote: l.name, syy: l.flags.map((f) => f.text).join('; ') || l.altReason, vaihtoehdot: l.options.map((o) => ({ productId: o.productId, tuote: o.name, maara: `${fmtQty(o.qty)} ${o.unitLabel}`, hintaero_pct: o.price.deltaPct, toimitusvarmuus: o.reliability, perusteet: o.why, varoitukset: o.warnings })) })),
    pois_jatetyt: skipped,
    saannot: proposal.rulesSnapshot,
  };
}
