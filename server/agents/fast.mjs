// NOPEA POLKU. Käyttäjän viesti → reititin → erikoisagentit RINNAKKAIN → sääntötarkistus → vastaus.
// "Agentit" ovat tässä enimmäkseen funktioita ja rajapintakutsuja: haku muistista, saatavuus ja hinta rajapinnasta,
// korvaajat staattisesta datasta, säännöt koodina. Ne vastaavat millisekunneissa eivätkä hallusinoi.
// Kielimallia käytetään vain, kun säännöt eivät ymmärrä viestiä tai kysymykseen ei ole valmista vastausta.
import { loadCatalog, unitLabel, stepOf, TEMP_LABEL, roundToStep } from '../catalog.mjs';
import { kv, proposals, history, audit } from '../db.mjs';
import { fetchQuotes } from '../valioApi.mjs';
import { llmEnabled, config } from '../config.mjs';
import { makeLine, applyQuote, evaluate, activeLines, setQty, removeLine, fmtQty, fmtMoney, fmtDate, lineAvailability, DEFAULT_RULES } from '../proposal.mjs';
import { findSubstitutes } from '../substitutes.mjs';
import { routeByRules, matchLines, labelFilter } from './router.mjs';
import { routeWithLLM, answerQuestion } from '../llm.mjs';

const shortName = (name) => (name.length > 46 ? `${name.slice(0, 44)}…` : name);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

/**
 * Litroina tai kiloina pyydetty määrä tuotteen myyntiyksiköiksi, ylöspäin pyöristäen: 1 000 l on 200 kpl 5 litran laatikkoa.
 * Ilman yksikköä määrä on jo myyntiyksiköitä. Palauttaa null, jos tuotteen pakkauskoko puuttuu datasta: silloin ei arvata.
 */
export function toSalesUnits(p, amount, unit) {
  if (!unit) return amount;
  const per = unit === 'l' ? p?.litres : p?.kg;
  return per ? roundToStep(amount / per, p, 'up') : null;
}

function historyStats() {
  const map = new Map();
  for (const r of history.all()) { if (!map.has(r.product_id)) map.set(r.product_id, []); map.get(r.product_id).push(r.qty); }
  return map;
}

export function optionCard(p, quote, extra = {}) {
  const price = quote?.price && !quote.price.error ? quote.price : null;
  const avail = quote?.avail;
  const fake = { availability: avail || { status: 'unknown' }, qty: extra.qty || 1, unitLabel: unitLabel(p.salesUnit) };
  return {
    productId: p.id, name: p.name, brand: p.brand || null, unitLabel: unitLabel(p.salesUnit), step: stepOf(p), qty: extra.qty || stepOf(p),
    price: price ? { net: price.net, comparison: price.comparison, comparisonUnit: price.comparisonUnit, source: price.source } : null,
    availability: lineAvailability(fake), reliability: p.reliability ?? null, country: p.country || null, labels: p.labels || [], contains: p.contains,
    boughtBefore: !!extra.boughtBefore,
  };
}

/** Lisää tuotteen tilaukseen (chat ja UI-napit käyttävät tätä). */
export async function addProduct(proposal, productId, qty, note) {
  const cat = loadCatalog();
  const p = cat.get(productId);
  if (!p) return null;
  const existing = activeLines(proposal).find((l) => l.productId === p.id);
  if (existing) { const r = setQty(proposal, existing.lineId, existing.qty + (qty || stepOf(p)), { by: 'user' }); return { line: existing, merged: true, ...r }; }
  const meta = (kv.get('staples', []) || []).find((s) => s.id === p.id);
  const typical = median(historyStats().get(p.id) || []);
  const line = makeLine(p.id, roundToStep(qty || typical || stepOf(p), p) || stepOf(p), {
    origin: 'user', group: meta?.group || TEMP_LABEL[p.temp] || 'Muut', tags: meta?.tags || [], baselineQty: typical ? roundToStep(typical, p) : null,
    reason: { text: note || 'Lisätty pyynnöstäsi', factors: typical ? [{ label: 'Aiemmin tilattu', detail: `tyypillisesti ${fmtQty(typical)} ${unitLabel(p.salesUnit)}`, kind: 'base' }] : [], sources: ['Käyttäjän pyyntö'] },
  });
  const quotes = await fetchQuotes([p.id], proposal.deliveryDate);
  applyQuote(line, quotes.get(p.id));
  proposal.lines.push(line);
  return { line, merged: false };
}

function knownAnswer(q, proposal) {
  const t = proposal.totals;
  const s = q.toLowerCase();
  if (/yhteensä|summa|paljonko.*(tilau|maksa)|loppusumma/.test(s)) return `Tilaus on nyt ${fmtMoney(t.expected)} (alv 0 %)${t.pendingNet ? `, josta ${fmtMoney(t.pendingNet)} odottaa päätöstäsi` : ''}. Rivejä ${t.lines}.`;
  if (/mihin\s+mennessä|tilausaika|viimeistään|cut.?off|ehdin/.test(s)) return proposal.cutoff ? `Tilaus pitää lähettää viimeistään ${fmtDate(proposal.cutoff.slice(0, 10))} klo ${proposal.cutoff.slice(11, 16).replace(':', '.')}, jotta toimitus ehtii ${fmtDate(proposal.deliveryDate)}.` : 'Rajapinta ei palauttanut tilausaikarajaa näille tuotteille.';
  if (/puuttu|loppu|poikkeam|saatavill|ongelm/.test(s)) return proposal.approvals.length ? `Päätöstäsi odottaa ${proposal.approvals.length} asiaa: ${proposal.approvals.map((a) => a.text).join('; ')}.` : 'Ei poikkeamia: kaikki rivit ovat saatavilla ja sääntöjen sisällä.';
  if (/hiili|co2|päästö/.test(s)) return `Tilauksen arvioitu hiilijalanjälki on noin ${t.co2Kg} kg CO2e. Arvio perustuu tuoteryhmien keskiarvoihin ja kattaa ${t.co2Lines}/${t.lines} riviä.`;
  if (/kotimai/.test(s)) return `Kotimaisten tuotteiden osuus tilauksen arvosta on ${t.domesticShare} %.`;
  return null;
}

function explainLine(line) {
  const parts = line.reason.factors.map((f) => `${f.label}${f.value ? ` ${f.value}` : ''}${f.detail ? ` (${f.detail})` : ''}`);
  let s = `${shortName(line.name)}: ${fmtQty(line.qty)} ${line.unitLabel}. ${parts.length ? `Laskelma: ${parts.join(' → ')}.` : line.reason.text}`;
  if (line.reason.userEdit) s += ` ${line.reason.userEdit}.`;
  if (line.reason.sources?.length) s += ` Lähteet: ${line.reason.sources.join(', ')}.`;
  return s;
}

/**
 * @param {string} text käyttäjän viesti
 * @param {(event: string, data: object) => void} emit SSE-lähetin
 */
export async function handleChat(text, emit) {
  const t0 = performance.now();
  const cat = loadCatalog();
  const rules = kv.get('rules', DEFAULT_RULES);
  const proposal = proposals.current();
  if (!proposal) { emit('say', { text: 'Syvä agentti laatii vielä ensimmäistä ehdotusta. Kokeile hetken päästä.' }); return emit('done', { ms: 0 }); }
  if (proposal.status === 'ordered') { emit('say', { text: 'Tämä tilaus on jo lähetetty. Aloita uusi ehdotus ajamalla syväanalyysi uudelleen.' }); return emit('done', { ms: 0 }); }

  // 1) Reititys: säännöt ensin, pieni malli vain tarvittaessa
  let tr = performance.now();
  let route = routeByRules(text);
  let via = 'säännöt';
  if (route.confidence < 0.6 && llmEnabled()) {
    try {
      const cart = activeLines(proposal).map((l) => `${l.lineId} | ${l.name} | ${fmtQty(l.qty)} ${l.unitLabel}`).join('\n');
      route = { actions: await routeWithLLM(text, cart), confidence: 1 };
      via = config.fastModel;
    } catch (err) { emit('agent', { name: 'Reititin', state: 'warn', detail: `Kielimalli ei vastannut, käytetään sääntöjä (${String(err.message || err).slice(0, 80)})` }); }
  }
  const routeMs = +(performance.now() - tr).toFixed(1);
  emit('agent', { name: 'Reititin', state: 'done', ms: routeMs, detail: `${via} → ${route.actions.map((a) => a.type).join(', ') || 'ei tunnistettu'}`, path: 'fast' });
  if (!route.actions.length) route.actions = [{ type: 'question', term: text }];

  // 2) Erikoisagentit rinnakkain: haku, saatavuus + hinta, korvaajat
  const histStats = historyStats();
  const lines0 = activeLines(proposal);
  const prep = new Map();
  let searchMs = 0; let searchHits = 0; let subMs = 0; let subCount = 0;
  const wantQuotes = new Set();
  const jobs = [];
  for (const a of route.actions) {
    const needsSearch = ['add', 'search', 'qty'].includes(a.type) || (a.type === 'adjust' && !a.lineId);
    if (needsSearch && a.term) {
      const ts = performance.now();
      const hits = cat.search(a.term, { limit: 6, filter: labelFilter(a.labels), boost: (p) => (histStats.has(p.id) ? 0.25 : 0) });
      searchMs += performance.now() - ts; searchHits += hits.length;
      prep.set(a, { hits });
      hits.slice(0, 3).forEach((h) => wantQuotes.add(h.product.id));
    }
    if (a.type === 'substitute') {
      const target = a.lineId ? lines0.filter((l) => l.lineId === a.lineId) : matchLines(lines0, a.term || '');
      if (target.length === 1) jobs.push((async () => { const ts = performance.now(); const res = await findSubstitutes(cat.get(target[0].productId), target[0].qty, proposal.deliveryDate, rules, { limit: 3, recipeRequired: target[0].recipeRequired }); subMs += performance.now() - ts; subCount += res.checked; prep.set(a, { target: target[0], subs: res }); })());
      else prep.set(a, { targets: target });
    }
  }
  let quotes = new Map(); let quoteMs = 0;
  if (wantQuotes.size) jobs.push((async () => { const ts = performance.now(); quotes = await fetchQuotes([...wantQuotes], proposal.deliveryDate); quoteMs = performance.now() - ts; })());
  const agentsStart = performance.now();
  await Promise.all(jobs);
  const parallelMs = +(performance.now() - agentsStart).toFixed(1);
  if (searchHits || route.actions.some((a) => prep.get(a)?.hits)) emit('agent', { name: 'Tuotehaku', state: 'done', ms: +searchMs.toFixed(1), detail: `${searchHits} osumaa 17 546 tuotteesta`, path: 'fast' });
  if (wantQuotes.size) emit('agent', { name: 'Saatavuus + hinta', state: 'done', ms: +quoteMs.toFixed(1), detail: `${wantQuotes.size} tuotetta, ${proposal.source === 'live' ? 'live-rajapinta' : 'simuloitu'}`, path: 'fast' });
  if (subCount) emit('agent', { name: 'Korvaajat', state: 'done', ms: +subMs.toFixed(1), detail: `${subCount} ehdokasta arvioitu`, path: 'fast' });

  // 3) Muutokset järjestyksessä
  const say = []; const cards = []; const changes = []; let ui = null; let question = null;
  const change = (line, from, to) => changes.push({ lineId: line.lineId, name: line.name, from, to, unitLabel: line.unitLabel });
  for (const a of route.actions) {
    const lines = activeLines(proposal);
    const pre = prep.get(a) || {};
    if (a.type === 'approve') { ui = 'open_review'; say.push('Avaan tilauksen tarkistuksen. Mitään ei lähetetä ennen kuin vahvistat.'); continue; }
    if (a.type === 'repeat_last') {
      let n = 0; let kept = 0;
      for (const l of lines) { if (l.lastWeekQty) { if (l.qty !== l.lastWeekQty) { const r = setQty(proposal, l.lineId, l.lastWeekQty, { by: 'agent' }); l.reason.userEdit = 'Asetettu viime viikon määrään pyynnöstäsi'; change(l, r.prev, r.next); n += 1; } } else kept += 1; }
      say.push(`Asetin ${n} riviä viime viikon määriin${kept ? `; ${kept} riviä, joita ei tilattu viime viikolla, jäi ennalleen` : ''}.`);
      continue;
    }
    if (a.type === 'why') {
      const target = a.lineId ? lines.filter((l) => l.lineId === a.lineId) : matchLines(lines, a.term || '');
      if (target.length) say.push(target.slice(0, 2).map(explainLine).join(' '));
      else say.push(proposal.briefing);
      continue;
    }
    if (a.type === 'question') { const known = knownAnswer(a.term || text, proposal); if (known) say.push(known); else question = a.term || text; continue; }
    if (a.type === 'remove') {
      const target = a.lineId ? lines.filter((l) => l.lineId === a.lineId) : matchLines(lines, a.term || '');
      if (!target.length) say.push(`En löytänyt tilauksesta riviä haulla "${a.term}".`);
      else if (target.length > 1) { say.push(`"${a.term}" osuu ${target.length} riviin. Kumman poistan?`); cards.push({ kind: 'lines', title: 'Valitse poistettava', action: 'remove', items: target.map((l) => ({ lineId: l.lineId, name: l.name, qty: l.qty, unitLabel: l.unitLabel })) }); }
      else { const r = removeLine(proposal, target[0].lineId, 'user'); change(target[0], r.prev, 0); say.push(`Poistin rivin ${shortName(target[0].name)}.`); }
      continue;
    }
    if (a.type === 'substitute') {
      if (pre.target && pre.subs?.options.length) { pre.target.options = pre.subs.options; pre.target.altReason = pre.target.state === 'decision' ? null : 'user'; say.push(`Löysin ${pre.subs.options.length} korvaavaa tuotteelle ${shortName(pre.target.name)}. Sama allergeeniprofiili, saatavuus ja hinta tarkistettu. Valitse rivin alta.`); ui = `focus:${pre.target.lineId}`; }
      else if (pre.target) say.push(`En löytänyt tuotteelle ${shortName(pre.target.name)} korvaajaa, joka täyttäisi säännöt (sama allergeeniprofiili, saatavilla, hinnoiteltu).`);
      else say.push(pre.targets?.length ? `"${a.term}" osuu useaan riviin, tarkenna mikä.` : `En löytänyt tilauksesta riviä haulla "${a.term}".`);
      continue;
    }
    // adjust / qty / add / search
    let target = a.lineId ? lines.filter((l) => l.lineId === a.lineId) : a.term ? matchLines(lines, a.term) : [];
    if (a.type === 'qty') { a.mode = target.length && (a.relative || a.addVerb) ? 'delta' : 'set'; a.value = a.mode === 'delta' ? a.dir * a.value : a.value; a.type = target.length ? 'adjust' : 'add'; }
    // Litroina tai kiloina annettu määrä muunnetaan tuotekohtaisesti myyntiyksiköiksi; etumerkki säilyy ("2 kg vähemmän").
    const asked = a.unit ? `${fmtQty(Math.abs(a.value))} ${a.unit}` : null;
    const sized = (p) => { if (!a.unit) return a.value; const n = toSalesUnits(p, Math.abs(a.value), a.unit); return n == null ? null : (a.value < 0 ? -n : n); };
    if (a.type === 'adjust' && target.length) {
      if (a.mode === 'set' && target.length > 1 && a.unit) { say.push(`"${a.term}" osuu ${target.length} riviin (${target.map((l) => shortName(l.name)).join(', ')}). Tarkenna, mille niistä asetan määrän ${asked}.`); continue; }
      if (a.mode === 'set' && target.length > 1) { say.push(`"${a.term}" osuu ${target.length} riviin. Mille asetan määrän ${fmtQty(a.value)}?`); cards.push({ kind: 'lines', title: 'Valitse rivi', action: 'set', value: a.value, items: target.map((l) => ({ lineId: l.lineId, name: l.name, qty: l.qty, unitLabel: l.unitLabel })) }); continue; }
      const done = [];
      for (const l of target) {
        const v = sized(cat.get(l.productId));
        if (v == null) { done.push(`${shortName(l.name)}: pakkauskoko puuttuu datasta, joten en voi muuntaa määrää ${asked} myyntiyksiköiksi`); continue; }
        const next = a.mode === 'pct' ? l.qty * (1 + v / 100) : a.mode === 'mult' ? l.qty * v : a.mode === 'delta' ? l.qty + v : v;
        const r = setQty(proposal, l.lineId, a.mode === 'pct' && v > 0 ? Math.max(next, l.qty + l.step) : next, { by: 'user' });
        if (r) { change(l, r.prev, r.next); done.push(`${shortName(l.name)} ${fmtQty(r.prev)} → ${fmtQty(r.next)} ${l.unitLabel}${asked ? ` (pyysit ${asked})` : ''}`); }
      }
      say.push(`${done.join(', ')}.`);
      continue;
    }
    const hits = pre.hits || [];
    if (!hits.length) { say.push(a.term ? `En löytänyt Aimon valikoimasta tuotetta haulla "${a.term}".` : 'En saanut selvää, mitä tuotetta tarkoitat.'); continue; }
    const top = hits[0].product;
    const known = histStats.has(top.id);
    if (a.type === 'add' && known) { // keittiön oma tuttu tuote → lisätään suoraan
      const units = sized(top);
      const r = await addProduct(proposal, top.id, units ?? undefined, `Lisätty pyynnöstäsi: "${text.trim()}"`);
      change(r.line, r.merged ? r.prev : 0, r.line.qty);
      say.push(`Lisäsin ${shortName(top.name)} ${fmtQty(r.line.qty)} ${r.line.unitLabel} (olet tilannut tätä ennenkin).${asked ? (units == null ? ` Pakkauskoko puuttuu datasta, joten en voinut muuntaa määrää ${asked}: tarkista määrä.` : ` Pyysit ${asked}.`) : ''}`);
      continue;
    }
    // uusi tuote: näytetään enintään 3 tarkistettua vaihtoehtoa, käyttäjä valitsee
    const shown = hits.slice(0, 3);
    cards.push({ kind: 'options', title: a.term, qty: a.unit ? null : (a.value || null), requested: a.unit ? { value: a.value, unit: a.unit } : null, items: shown.map((h) => optionCard(h.product, quotes.get(h.product.id), { qty: sized(h.product) ?? undefined, boughtBefore: histStats.has(h.product.id) })) });
    const unsized = asked ? shown.filter((h) => sized(h.product) == null).length : 0;
    say.push(a.type === 'search' ? `Tässä parhaat osumat haulle "${a.term}".` : `"${a.term}": löysin ${hits.length} sopivaa. Valitse näistä, niin lisään tilaukseen.${asked ? ` Pyysit ${asked}: määrä on laskettu kunkin pakkauskoon mukaan${unsized ? `, paitsi ${unsized} tuotteelle, jonka pakkauskoko puuttuu datasta` : ''}.` : ''}`);
  }

  // Pyydetty toimituspäivä: tilauksen päivää ei vaihdeta hiljaa, vaan ero sanotaan ääneen.
  if (route.deliveryDate && route.deliveryDate !== proposal.deliveryDate && (changes.length || cards.length)) say.push(`Huom: pyysit toimitusta ${fmtDate(route.deliveryDate)}, mutta tämä tilaus toimitetaan ${fmtDate(proposal.deliveryDate)}.`);

  // 4) Sääntötarkistus aina muutosten jälkeen
  const tp = performance.now();
  const before = new Set((proposal.approvals || []).map((x) => x.id));
  evaluate(proposal, rules);
  const policyMs = +(performance.now() - tp).toFixed(1);
  const fresh = proposal.approvals.filter((x) => !before.has(x.id));
  emit('agent', { name: 'Säännöt', state: fresh.length ? 'warn' : 'done', ms: policyMs, detail: fresh.length ? `${fresh.length} uutta päätettävää` : 'sääntöjen sisällä', path: 'fast' });
  if (changes.length) {
    say.push(`Tilaus nyt ${fmtMoney(proposal.totals.expected)}.`);
    for (const f of fresh) say.push(`Huom: ${f.text}.`);
  }
  proposals.save(proposal);

  // 5) Vastaus. Vapaaseen kysymykseen vastaa pieni malli striimattuna, muuten valmis lause heti.
  let reply = say.join(' ');
  if (question) {
    if (llmEnabled()) {
      try {
        const facts = { toimituspaiva: proposal.deliveryDate, tilausaikaraja: proposal.cutoff, summat: proposal.totals, tiivistelma: proposal.briefing, paatettavat: proposal.approvals.map((x) => x.text), rivit: activeLines(proposal).map((l) => ({ tuote: l.name, maara: `${fmtQty(l.qty)} ${l.unitLabel}`, hinta: l.price?.net, rivisumma: l.total, saatavuus: l.availabilityView?.text, perustelu: l.reason.text, toimitusvarmuus: l.reliability })) };
        if (reply) emit('token', { text: `${reply} ` });
        const tl = performance.now();
        reply += await answerQuestion(question, facts, (tok) => emit('token', { text: tok }));
        emit('agent', { name: 'Vastaus', state: 'done', ms: Math.round(performance.now() - tl), detail: config.fastModel, path: 'fast' });
        emit('say', { text: reply, streamed: true });
      } catch (err) { reply += `En saanut kielimallilta vastausta (${String(err.message || err).slice(0, 80)}). Kokeile kysyä summasta, tilausaikarajasta tai poikkeamista.`; emit('say', { text: reply }); }
    } else {
      reply += `${reply ? ' ' : ''}Tähän kysymykseen tarvitsen kielimallin (ANTHROPIC_API_KEY puuttuu). Ilman sitä osaan: "lisää lohta", "20 % enemmän kermaa", "poista kahvi", "korvaava kurkulle", "miksi kermaa on näin paljon", "paljonko tilaus maksaa".`;
      emit('say', { text: reply });
    }
  } else emit('say', { text: reply || 'Valmis.' });

  const totalMs = +(performance.now() - t0).toFixed(1);
  audit('nopea polku', `Viesti: "${text.trim().slice(0, 120)}"`, { reititys: via, toiminnot: route.actions.map((a) => `${a.type}${a.term ? `(${a.term})` : ''}`), muutokset: changes.map((c) => `${c.name}: ${fmtQty(c.from)} → ${fmtQty(c.to)} ${c.unitLabel}`), rinnakkain_ms: parallelMs, saannot_ms: policyMs }, totalMs, proposal.id);
  emit('result', { changes, cards, ui, proposal });
  emit('done', { ms: totalMs, via, routeMs, parallelMs, policyMs });
}
