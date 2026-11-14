// SYVÄ AGENTTI. Ajetaan taustalla (käynnistyksessä, ajastettuna, tai kun data/säännöt muuttuvat), ei koskaan käyttäjän odottaessa.
// Tulos tallennetaan kantaan valmiiksi tilausehdotukseksi, jonka nopea polku vain lukee: "syvä ajattelu tehdään ennen kuin kysyt".
//
// Vaiheet: 1) kysyntäennuste historiasta  2) signaalit (varaukset, ryhmämenut)  3) saatavuus + hinta rajatulle joukolle
//          4) poikkeamille korvaajat valmiiksi  5) sääntötarkistus  6) iso kielimalli tarkistaa kokonaisuuden ja kirjoittaa tiivistelmän.
// Numerot lasketaan koodilla; kielimalli saa vain valita annetuista vaihtoehdoista ja selittää, ei keksiä tuotteita tai määriä.
import { loadCatalog, roundToStep, unitLabel, TEMP_LABEL } from '../catalog.mjs';
import { kv, history, bookings, proposals, audit } from '../db.mjs';
import { fetchQuotes, apiStats } from '../valioApi.mjs';
import { apiMode, llmEnabled, config } from '../config.mjs';
import { makeLine, applyQuote, evaluate, activeLines, decide, fmtQty, fmtMoney, fmtDate, DEFAULT_RULES } from '../proposal.mjs';
import { findSubstitutes } from '../substitutes.mjs';
import { addDays, isoWeek, weekKey } from '../demo.mjs';
import { publish } from '../bus.mjs';
import { deepReview } from '../llm.mjs';

export const deepState = { running: false, queued: null, lastRun: null, steps: [] };

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const TAG_WEIGHT = { protein: 1, veg: 1, dairy: 1, cream: 1, dessert: 1, bakery: 1, frozen: 1, dry: 0.5, nonfood: 0.5 };
const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const weekday = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

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

function bookingSignal(deliveryDate) {
  const rows = bookings.all();
  if (!rows.length) return null;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const weekSum = (start) => { let s = 0; for (let d = 0; d < 7; d++) s += byDate.get(addDays(start, d))?.covers || 0; return s; };
  const next = weekSum(deliveryDate);
  const past = [];
  for (let w = 1; w <= 8; w++) { const s = weekSum(addDays(deliveryDate, -7 * w)); if (s > 0) past.push(s); }
  if (!past.length || !next) return null;
  const avg = mean(past);
  const uplift = next / avg - 1;
  const peaks = [];
  for (let d = 0; d < 7; d++) { const date = addDays(deliveryDate, d); const r = byDate.get(date); if (r?.note) peaks.push(`${weekday(date)} ${r.covers}`); }
  return { id: 'bookings', label: `Varaukset vk ${isoWeek(deliveryDate).week}`, uplift, next, avg: Math.round(avg), detail: `${next.toLocaleString('fi-FI')} asiakasta, tavallisesti ${Math.round(avg).toLocaleString('fi-FI')}`, peaks, source: 'Varausjärjestelmä (demodata)' };
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
    const rules = kv.get('rules', DEFAULT_RULES);
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

    // 2) Signaalit
    t = performance.now();
    const signals = [];
    const booking = bookingSignal(date);
    if (booking && Math.abs(booking.uplift) >= 0.03) signals.push(booking);
    const menuEvents = (kv.get('menuEvents', []) || []).filter((e) => e.groups.some((g) => g.date >= date && g.date <= addDays(date, 6)));
    const menuExtra = new Map();
    for (const ev of menuEvents) {
      signals.push({ id: `menu:${ev.id}`, label: ev.name, detail: `${ev.portions} annosta (${ev.groups.map((g) => `${weekday(g.date)} ${g.pax}`).join(' + ')})`, source: 'Ryhmävaraukset + reseptiikka (demodata)' });
      for (const r of ev.recipe) {
        const p = cat.get(r.productId);
        if (!p) continue;
        const size = r.unit === 'l' ? p.litres || p.kg : p.kg || r.packKg; // myyntiyksikön koko reseptin yksikössä
        if (!size) continue;
        const need = r.amount * ev.portions;
        const list = menuExtra.get(r.productId) || [];
        list.push({ event: ev.name, portions: ev.portions, label: r.label, need, unit: r.unit, units: need / size });
        menuExtra.set(r.productId, list);
      }
    }
    step(steps, 'Signaalit', signals.map((s) => `${s.label}: ${s.detail}`).join(' · ') || 'ei poikkeavia signaaleja', t);

    // 3) Määrät pakkauskokoihin
    t = performance.now();
    const lines = planned.map((pl) => {
      const { p } = pl;
      const ul = unitLabel(p.salesUnit);
      const factors = [...pl.factors];
      factors[0].value = `${fmtQty(Math.round(pl.base * 10) / 10)} ${ul}`;
      let target = pl.base;
      const sources = [`Tilaushistoria ${weekLabels[0]}–${weekLabels.at(-1).replace('vk ', '')}`];
      const weight = Math.max(0, ...pl.tags.map((tg) => TAG_WEIGHT[tg] ?? 1), pl.tags.length ? 0 : 1);
      if (booking && Math.abs(booking.uplift) >= 0.03) {
        const u = booking.uplift * weight;
        target *= 1 + u;
        factors.push({ label: booking.label, detail: booking.detail + (weight < 1 ? ' (kuivatuotteille puolet vaikutuksesta)' : ''), value: `${u > 0 ? '+' : ''}${Math.round(u * 100)} %`, kind: 'signal' });
        sources.push('Varaukset');
      }
      let extraUnits = 0;
      for (const m of menuExtra.get(p.id) || []) {
        extraUnits += m.units;
        factors.push({ label: m.event, detail: `${m.portions} annosta × ${m.label} = ${fmtQty(Math.round(m.need * 10) / 10)} ${m.unit}`, value: `+${fmtQty(Math.round(m.units * 10) / 10)} ${ul}`, kind: 'menu' });
        sources.push('Reseptiikka');
      }
      const qty = Math.max(roundToStep(pl.base, p), roundToStep(target + extraUnits, p, extraUnits ? 'up' : 'nearest'));
      const baselineQty = roundToStep(pl.base, p);
      const exact = target + extraUnits;
      if (p.lot >= 2 && qty - exact > exact * 0.05) factors.push({ label: 'Myyntierä', detail: `tilattavissa ${fmtQty(p.lot)} ${ul} erissä, tarve ${fmtQty(Math.round(exact * 10) / 10)} ${ul}`, value: `→ ${fmtQty(qty)} ${ul}`, kind: 'lot' });
      const deltaPct = baselineQty ? Math.round((qty / baselineQty - 1) * 100) : 0;
      const short = factors.filter((f) => f.kind !== 'base' && f.value).map((f) => `${f.label.toLowerCase()} ${f.value}`);
      const text = deltaPct === 0 ? `Sama kuin tavallisesti${short.length ? ': lisätarve ei riitä seuraavaan pakkauskokoon' : ''}` : `${deltaPct > 0 ? '+' : ''}${deltaPct} %: ${short.join(', ') || 'pyöristys pakkauskokoon'}`;
      return makeLine(p.id, qty, { baselineQty, expectedQty: qty, lastWeekQty: pl.lastWeekQty, history: pl.series, weekLabels, group: pl.group, tags: pl.tags, menuExtra: extraUnits, deltaPct, reason: { text, factors, sources: [...new Set(sources)] } });
    });
    const order = ['Maito & munat', 'Hedelmät & vihannekset', 'Liha & kala', 'Kuivatuotteet', 'Pakasteet', 'Non-food'];
    lines.sort((a, b) => (order.indexOf(a.group) + 99) % 99 - (order.indexOf(b.group) + 99) % 99 || a.name.localeCompare(b.name, 'fi'));
    step(steps, 'Määrät pakkauskokoihin', `${lines.length} riviä pyöristetty myyntieriin`, t);

    // 4) Saatavuus + hinta vain näille tuotteille
    t = performance.now();
    const quotes = await fetchQuotes(lines.map((l) => l.productId), date);
    lines.forEach((l) => applyQuote(l, quotes.get(l.productId)));
    const proposal = { id: `P-${date}-${Date.now().toString(36)}`, kitchen: kv.get('kitchen'), deliveryDate: date, createdAt: new Date().toISOString(), status: 'draft', lines, signals, skipped, source: apiMode() };
    evaluate(proposal, rules);
    if (!kv.get('budgetCalibrated')) {
      // DEMO: budjettikatto asetetaan ensimmäisen ehdotuksen perusteella noin 4 % sen alle, jotta "agentti kysyy luvan" -polku
      // näkyy samanlaisena sekä simuloidulla että live-datalla. Oikeassa käytössä katto tulee asiakkaan asetuksista.
      rules.budgetCap = Math.max(100, Math.floor((proposal.totals.expected * 0.962) / 50) * 50);
      kv.set('rules', rules); kv.set('budgetCalibrated', true);
      evaluate(proposal, rules);
    }
    step(steps, 'Saatavuus ja hinnat', `${lines.length} tuotetta, ${apiStats.calls - callsBefore} API-kutsua (${apiMode() === 'live' ? 'live' : 'simuloitu'})`, t);

    // 5) Poikkeamille korvaajat valmiiksi (rinnakkain)
    t = performance.now();
    const exceptions = lines.filter((l) => l.state === 'decision');
    const weak = lines.filter((l) => l.state !== 'decision' && l.flags.some((f) => f.type === 'reliability'));
    let checked = 0;
    await Promise.all([...exceptions, ...weak].map(async (line) => {
      const res = await findSubstitutes(cat.get(line.productId), line.qty, date, rules, { limit: line.state === 'decision' ? 3 : 10 });
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
    if (llmEnabled()) {
      try {
        const review = await deepReview(reviewFacts(proposal, signals, skipped));
        if (review?.briefing) proposal.briefing = review.briefing;
        proposal.risks = review?.risks || [];
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

function templateBriefing(proposal, signals, exceptions) {
  const t = proposal.totals;
  const parts = [`${weekdayLong(proposal.deliveryDate)} ${fmtDate(proposal.deliveryDate)} tilaus on valmiina: ${t.lines} riviä, ${fmtMoney(t.expected)} (alv 0 %).`];
  const booking = signals.find((s) => s.id === 'bookings');
  if (booking) parts.push(`Varauksia on ${Math.round(Math.abs(booking.uplift) * 100)} % tavallista ${booking.uplift > 0 ? 'enemmän' : 'vähemmän'}${booking.peaks.length ? ` (${booking.peaks.join(' ja ')} asiakasta)` : ''}, joten tuoretuotteiden määriä on ${booking.uplift > 0 ? 'nostettu' : 'laskettu'}.`);
  const menu = signals.find((s) => s.id.startsWith('menu:'));
  if (menu) parts.push(`${menu.label} (${menu.detail.split(' (')[0]}) on laskettu reseptistä mukaan.`);
  const outs = exceptions.filter((l) => l.state !== 'replaced');
  if (outs.length) parts.push(`${outs.length} ${outs.length === 1 ? 'tuote ei ole' : 'tuotetta ei ole'} saatavilla sellaisenaan: ${outs.map((l) => l.name.split(' ').slice(0, 3).join(' ')).join(', ')}. Korvaajat on valittu valmiiksi, sinun tarvitsee vain hyväksyä.`);
  if (!t.budgetOk) parts.push(`Budjetti ylittyy ${fmtMoney(t.overBy)}: tarvitsen siihen luvan tai karsin ehdotukseni mukaan.`);
  return parts.join(' ');
}
const weekdayLong = (iso) => ['Sunnuntain', 'Maanantain', 'Tiistain', 'Keskiviikon', 'Torstain', 'Perjantain', 'Lauantain'][new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Tiivis faktapaketti kielimallille. Kaikki luvut ovat jo laskettuja; malli ei saa muuttaa niitä. */
function reviewFacts(proposal, signals, skipped) {
  return {
    keittio: proposal.kitchen?.name, toimituspaiva: proposal.deliveryDate, summat: proposal.totals,
    signaalit: signals.map((s) => ({ nimi: s.label, kuvaus: s.detail, lahde: s.source })),
    rivit: activeLines(proposal).map((l) => ({ lineId: l.lineId, tuote: l.name, maara: `${fmtQty(l.qty)} ${l.unitLabel}`, perustaso: l.baselineQty, perustelu: l.reason.text, tila: l.state, liput: l.flags.map((f) => f.text), toimitusvarmuus: l.reliability, rivisumma: l.total })),
    poikkeamat: proposal.lines.filter((l) => l.options?.length).map((l) => ({ lineId: l.lineId, tuote: l.name, syy: l.flags.map((f) => f.text).join('; ') || l.altReason, vaihtoehdot: l.options.map((o) => ({ productId: o.productId, tuote: o.name, maara: `${fmtQty(o.qty)} ${o.unitLabel}`, hintaero_pct: o.price.deltaPct, toimitusvarmuus: o.reliability, perusteet: o.why, varoitukset: o.warnings })) })),
    pois_jatetyt: skipped,
    saannot: proposal.rulesSnapshot,
  };
}
