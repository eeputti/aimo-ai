// Aimo Agent Gateway – ihmisen näkymät. Sama tiedosto palvelee konsolia (gateway.html) ja puhelimen hyväksyntää (approve.html).
// Agentit eivät käytä tätä: ne asioivat REST- tai MCP-rajapinnan kautta. Tässä ihminen näkee, hyväksyy ja säätää valtuuksia.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `${(+n || 0).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const qty = (n) => (+n).toLocaleString('fi-FI', { maximumFractionDigits: 2 });
const HKI = { timeZone: 'Europe/Helsinki' };
const time = (iso) => new Date(iso).toLocaleTimeString('fi-FI', { ...HKI, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayTime = (iso) => new Date(iso).toLocaleString('fi-FI', { ...HKI, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
const ms = (n) => (n < 10 ? `${(+n).toFixed(1).replace('.', ',')} ms` : `${Math.round(n)} ms`);
const STATUS = { confirmed: 'Vahvistettu', pending_approval: 'Odottaa hyväksyntääsi', rejected: 'Hylätty' };
const api = async (path, body) => { const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status); return j; };

// Syyn selitys ihmiselle: koodi + luvut auki kirjoitettuna.
function reasonText(r) {
  const d = r.detail || {};
  switch (r.code) {
    case 'SPEND_CAP_ORDER': return `Tilaus ${money(d.orderNet)} ylittää valtuutesi ${money(d.cap)} / tilaus (${money(d.overBy)} yli).`;
    case 'SPEND_CAP_DAY': return `Päivän ostot nousisivat ${money(d.spentToday + d.orderNet)}: päiväkatto on ${money(d.cap)}.`;
    case 'DELIVERY_DATE_SHIFT': return `Pyydettiin ${day(d.requested)}, mutta aikaisin toimitus on ${day(d.earliest)} (+${d.shiftDays} pv).`;
    case 'SUBSTITUTION_WITHIN_POLICY': return `Korvaaja sääntöjen sisällä: ${d.byName} tuotteen ${d.forName} tilalle${d.keptOriginalUnits ? ` (alkuperäistä saatiin ${qty(d.keptOriginalUnits)})` : ''}. Sama allergeeniprofiili, yksikköhinta ${d.unitPriceDeltaPct > 0 ? '+' : ''}${String(d.unitPriceDeltaPct).replace('.', ',')} %.`;
    case 'SUBSTITUTION_OUTSIDE_POLICY': return `Korvaaja ylittää säännöt: ${d.byName} tuotteen ${d.forName} tilalle. ${(d.warnings || []).join('. ')}`;
    case 'APPROVAL_ALWAYS': return 'Valtuutuksesi mukaan jokainen tilaus kuitataan.';
    case 'OFFER_INVALID_SIGNATURE': return 'Tarjouksen allekirjoitus ei täsmää: sitä on muokattu tai se ei ole tämän portin antama.';
    case 'CUTOFF_PASSED': return `Tilausaika umpeutui ${d.closingLabel || ''} (tuote ${d.productId}).`;
    case 'HUMAN_APPROVED': return `Hyväksyi: ${d.by}, ${dayTime(d.at)}.`;
    case 'HUMAN_REJECTED': return `Hylkäsi: ${d.by}, ${dayTime(d.at)}.`;
    default: return r.message;
  }
}

function orderCard(o, { actions = true, link = true } = {}) {
  const reasons = o.reasons || [];
  return `<article class="order ${o.status}" id="o-${o.orderId}">
    <div class="order-head">
      <div><div class="who">${esc(o.buyerName)} <span class="tag agent">ostoagentti</span></div>${o.requestedBy ? `<div class="asked">"${esc(o.requestedBy)}"</div>` : ''}</div>
      <span class="tag ${o.status}">${STATUS[o.status]}</span>
    </div>
    ${o.pendingAddition ? additionCard(o, actions) : ''}
    ${o.totals ? `<div><div class="total">${money(o.totals.net)}</div><div class="small muted" title="alv 0 %, verollisena ${money(o.totals.gross)}">toimitus ${day(o.deliveryDate)}${o.cutoffLabel && o.status === 'pending_approval' ? `, päätä ennen ${esc(o.cutoffLabel)}` : ''}</div></div>` : ''}
    ${o.lines?.length ? `<ul class="lines">${o.lines.map((l) => `<li><span class="limg"><img src="/img/${esc(l.productId)}" alt="" loading="lazy" onerror="this.remove()"></span><span>${esc(l.name)} <span class="muted mono">${esc(l.productId)}</span></span><span class="num"><b>${qty(l.quantity)} ${esc(l.salesUnitLabel)}</b>, ${money(l.lineNet)}</span>${l.substituteFor ? `<span class="sub">korvaa tuotteen ${esc(l.substituteFor)}</span>` : ''}${l.addedIn ? '<span class="sub">lisätty jälkikäteen</span>' : ''}</li>`).join('')}</ul>` : ''}
    ${o.suggestions?.length ? suggestBlock(o) : ''}
    ${o.approval?.explanation && o.status === 'pending_approval' ? `<details class="ai-note"><summary><b>${{ approve: 'Tekoäly suosittelee: hyväksy', reject: 'Tekoäly suosittelee: hylkää', review: 'Tekoäly suosittelee: tarkista' }[o.approval.explanation.suggestion] || 'Tekoälyn selitys'}</b></summary><p class="small">${esc(o.approval.explanation.text)} ${esc(o.approval.explanation.suggestionWhy)}</p><p class="small muted">${esc(o.approval.explanation.model)}, päätös on sinun</p></details>` : ''}
    ${o.substitutions?.some((s) => s.modelNote) ? `<div class="ai-note"><p class="small">${o.substitutions.filter((s) => s.modelNote).map((s) => esc(s.modelNote)).join(' ')} <span class="muted">Korvaajan valitsi tekoäly portin tarkistamista vaihtoehdoista (${esc(o.substitutions.find((s) => s.modelNote).chosenBy)}).</span></p></div>` : ''}
    ${reasons.length ? `<ul class="why">${reasons.map((r) => `<li class="${r.severity}">${esc(reasonText(r))}<code>${esc(r.code)}</code></li>`).join('')}</ul>` : ''}
    ${o.status === 'pending_approval' && actions ? `<div class="actions"><button class="btn primary big" data-act="approve" data-order="${o.orderId}">Hyväksy</button><button class="btn danger big" data-act="reject" data-order="${o.orderId}">Hylkää</button></div>` : ''}
    <div class="small muted">${esc(o.orderId)}, ${dayTime(o.createdAt)}${link ? `, <a href="#" data-act="trail" data-order="${o.orderId}">päätösketju</a>${o.status === 'pending_approval' || o.pendingAddition ? `, <a href="/approve.html?order=${o.orderId}" target="_blank" rel="noopener">avaa puhelinnäkymä</a>` : ''}` : ''}</div>
  </article>`;
}

// "Unohtuiko tämä?": portti huomaa ostajan omasta historiasta, mitä tavallisesta tilauksesta puuttuu. Ei kysymystä, vaan kuva ja yksi nappi.
function suggestBlock(o) {
  return `<div class="suggest"><div class="suggest-head">Unohtuiko tämä?</div>
    <ul>${o.suggestions.map((s) => `<li>
      <span class="limg"><img src="/img/${esc(s.productId)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>
      <span><b>${esc(s.name)}</b><span class="small muted" title="${esc(s.message)}">mukana ${s.inOrders}/${s.ofOrders} viime tilauksessa, yleensä ${qty(s.typicalQuantity)} ${esc(s.salesUnitLabel)}</span></span>
      <button class="btn add" data-act="suggest" data-order="${o.orderId}" data-product="${esc(s.productId)}" aria-label="Lisää tilaukseen ${esc(s.name)}, ${qty(s.typicalQuantity)} ${esc(s.salesUnitLabel)}">+ Lisää${s.estimateNet != null ? ` <span class="num">noin ${money(s.estimateNet)}</span>` : ''}</button>
    </li>`).join('')}</ul></div>`;
}

// "Unohtui kerma": lisäys vahvistettuun tilaukseen, joka ylittää valtuuden. Tilaus pysyy voimassa, vain lisäys kysytään.
function additionCard(o, actions) {
  const a = o.pendingAddition;
  return `<div class="addition">
    <div class="who">Lisäys odottaa hyväksyntääsi</div>${a.requestedBy ? `<div class="asked">"${esc(a.requestedBy)}"</div>` : ''}
    <ul class="lines">${a.lines.map((l) => `<li><span class="limg"><img src="/img/${esc(l.productId)}" alt="" loading="lazy" onerror="this.remove()"></span><span>${esc(l.name)} <span class="muted mono">${esc(l.productId)}</span></span><span class="num"><b>${qty(l.quantity)} ${esc(l.salesUnitLabel)}</b>, ${money(l.lineNet)}</span></li>`).join('')}</ul>
    <div class="small muted">+${money(a.addedNet)}, uusi summa olisi ${money(a.orderNetIfApproved)}${a.approval?.expiresAt ? ', tilaus pysyy ennallaan, jos et hyväksy' : ''}</div>
    <ul class="why">${a.reasons.filter((r) => r.severity === 'approval').map((r) => `<li class="${r.severity}">${esc(reasonText(r))}<code>${esc(r.code)}</code></li>`).join('')}</ul>
    ${actions ? `<div class="actions"><button class="btn primary big" data-act="approve" data-order="${o.orderId}">Hyväksy lisäys</button><button class="btn danger big" data-act="reject" data-order="${o.orderId}">Hylkää lisäys</button></div>` : ''}
  </div>`;
}

const EVENT_FI = { MODEL_CALL: 'Kielimalli avusti', QUOTE_REQUESTED: 'Agentti pyysi tarjousta', OFFER_ISSUED: 'Portti antoi allekirjoitetun tarjouksen', CANDIDATES_EXCLUDED: 'Ehdokkaita jäi pois', ORDER_RECEIVED: 'Agentti lähetti tilauksen', OFFER_VERIFIED: 'Tarjouksen allekirjoitus todennettu', OFFER_VERIFICATION_FAILED: 'Tarjouksen todennus epäonnistui', LIVE_RECHECK: 'Hinta, saldo ja tilausaika tarkistettu uudelleen', MANDATE_EVALUATED: 'Mandaatti arvioitu', WATCH_EVALUATED: 'Taustavahti vertasi ostajan historiaan',APPROVAL_REQUESTED: 'Hyväksyntäpyyntö lähetetty ihmiselle', ORDER_PENDING_APPROVAL: 'Tilaus odottaa hyväksyntää', ORDER_CONFIRMED: 'Tilaus vahvistettu', ORDER_REJECTED: 'Tilaus hylätty', HUMAN_APPROVED: 'Ihminen hyväksyi', HUMAN_REJECTED: 'Ihminen hylkäsi', SUGGESTION_ACCEPTED: 'Ihminen lisäsi portin ehdotuksen', NOTIFICATION_SENT: 'Ilmoitus lähetetty ihmiselle', MANDATE_UPDATED: 'Mandaattia muutettu', DEMO_RESET: 'Demo nollattu' };
function eventDetail(e) {
  const p = e.payload || {};
  if (e.type === 'MODEL_CALL') return `${{ pick_substitute: 'korvaajan valinta', explain_approval: 'selitys hyväksyjälle', interpret_request: 'pyynnön tulkinta' }[p.purpose] || p.purpose}, ${p.model}, ${p.ms} ms${p.tokens ? `, ${p.tokens.in}+${p.tokens.out} tokenia` : ''}, ${p.error ? `virhe: ${p.error}` : p.usedByCode ? 'koodi käytti vastausta' : 'koodi ei käyttänyt vastausta'}${p.note ? ` (${p.note})` : ''}`;
  if (e.type === 'OFFER_ISSUED') return `${p.kind}: ${(p.lines || []).join(' + ')} = ${money(p.net)}${p.flags?.length ? `, ${p.flags.join(', ')}` : ''}`;
  if (e.type === 'CANDIDATES_EXCLUDED') return Object.entries(p.summary || {}).map(([c, n]) => `${n} × ${c}`).join(', ');
  if (e.type === 'MANDATE_EVALUATED') return `taso ${p.approvalLevel} → ${p.outcome}${p.reasons?.length ? `: ${p.reasons.map((r) => `${r.code} (${r.severity})`).join(', ')}` : ''}`;
  if (e.type === 'WATCH_EVALUATED') return p.findings?.length ? `${p.findings.map((f) => f.message).join(' ')} → ihmisen hyväksyntään` : `ei poikkeamia (${p.historyOrders} aiempaa tilausta)`;
  if (e.type === 'QUOTE_REQUESTED') return `${p.productsPriced} tuotetta hinnoiteltu (${p.priceSource}), toimitus ${p.deliveryDate}`;
  if (e.type === 'LIVE_RECHECK') return `${p.products} tuotetta${p.changed?.length ? `, muuttunut: ${p.changed.join(', ')}` : ', ei muutoksia'}`;
  if (e.type === 'OFFER_VERIFIED' || e.type === 'OFFER_VERIFICATION_FAILED') return `${p.algorithm}${p.failures?.length ? `, ${p.failures.join(', ')}` : ''}`;
  if (e.type === 'SUGGESTION_ACCEPTED') return `${p.name} × ${qty(p.quantity)} ${p.unit}, mukana ${p.basis?.inOrders}/${p.basis?.ofOrders} viime tilauksessa`;
  if (e.type === 'HUMAN_APPROVED') return p.overrode?.length ? `hyväksyi poikkeukset: ${p.overrode.join(', ')}` : '';
  if (e.type === 'APPROVAL_REQUESTED' || e.type === 'NOTIFICATION_SENT') return `vastaanottaja: ${p.to}`;
  if (e.type.startsWith('ORDER_')) return [p.net != null ? money(p.net) : '', (p.reasons || []).join(', ')].filter(Boolean).join(', ');
  return '';
}
const timeline = (entries) => `<ul class="timeline">${entries.map((e) => `<li class="${e.actor.split(':')[0]}"><span class="t">${time(e.ts)}</span><span class="dot"></span><div><b>${esc(EVENT_FI[e.type] || e.type)}</b> <span class="muted small">${esc(e.actor)}</span><div class="detail">${esc(eventDetail(e))}</div><div class="hash">#${e.seq} ${esc(e.hash.slice(0, 16))}… ← ${esc(e.prevHash.slice(0, 8))}…</div></div></li>`).join('')}</ul>`;

// ====================== PUHELIN: yksi tilaus, yksi nappi ======================
async function phone(orderId) {
  const root = $('#phone');
  const load = async () => {
    try { const o = await api(`/console/orders/${orderId}`); render(o); } catch (e) { root.innerHTML = `<div class="empty">Tilausta ei löytynyt (${esc(e.message)}).</div>`; }
  };
  const render = (o) => {
    if (o.clock?.simulated) document.body.insertAdjacentHTML('afterbegin', '<div class="demo-clock">Demokello: aika on simuloitu</div>');
    if (o.status === 'pending_approval') root.innerHTML = `<h2>Hyväksytkö tilauksen?</h2>${orderCard(o, { link: false })}`;
    else if (o.pendingAddition) root.innerHTML = `<h2>Hyväksytkö lisäyksen?</h2>${orderCard(o, { link: false })}`;
    else root.innerHTML = `<div class="done"><div class="tick ${o.status === 'confirmed' ? '' : 'no'}">${o.status === 'confirmed' ? '✓' : '✕'}</div><h2>${o.addition ? (o.addition.status === 'applied' ? 'Lisäys hyväksytty' : 'Lisäys hylätty, tilaus ennallaan') : o.status === 'confirmed' ? 'Tilaus vahvistettu' : 'Tilaus hylätty'}</h2><p>${esc(o.orderId)}${o.totals ? `, ${money(o.totals.net)}, toimitus ${day(o.deliveryDate)}` : ''}</p></div>${orderCard(o, { actions: false, link: false })}`;
  };
  root.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    b.disabled = true;
    const path = b.dataset.act === 'suggest' ? `suggestions/${b.dataset.product}` : b.dataset.act;
    try { render(await api(`/console/orders/${orderId}/${path}`, { by: 'Hankintapäällikkö' })); } catch (e) { alert(e.message); load(); }
  });
  load();
}

// ====================== KONSOLI ======================
const SCENARIOS = [
  { buyer: 'nordic-hotels', text: 'I need 1,000 litres of lactose-free milk by Monday.', img: '464306', title: 'Briefin lause sellaisenaan', hint: 'Halvin tilattavissa oleva → ylittää 1 000 €:n valtuuden → pysähtyy hyväksyntään' },
  { buyer: 'nordic-hotels', text: '100 litraa Arlan rasvatonta laktoositonta maitojuomaa maanantaiksi', img: '462775', title: 'Saldo ei riitä', hint: 'Osatoimitus + korvaaja sääntöjen sisällä → agentti päättää itse, ihminen saa ilmoituksen' },
  { buyer: 'nordic-hotels', text: '200 litres of lactose-free milk by Sunday', img: '464306', title: 'Toimitus ei ehdi', hint: 'Aikaisin toimitus on maanantai → kysytään päivän siirrosta' },
  { buyer: 'nordic-hotels', text: '50 litres of lactose-free milk by Monday', tamper: true, img: '464306', title: 'Muokattu tarjous', hint: 'Agentti puolittaa hinnan tarjouksessa → allekirjoitus ei täsmää → hylätään' },
  { buyer: 'kahvila-aalto', text: '20 litraa laktoositonta maitoa maanantaiksi', img: '464306', title: 'Uusi asiakas, oletusvaltuus', hint: 'Mikään ei lähde ilman kuittausta' },
];
const LEVELS = [['always', 'Aina kuittaus', 'Oletus. Mikään tilaus ei lähde ilman hyväksyntääsi.'], ['exceptions', 'Kuittaus vain poikkeuksissa', 'Tavallinen tilaus menee läpi. Eurokaton ylitys, korvaaja ja päivän siirto kysytään.'], ['autonomous', 'Itsenäinen sääntöjen sisällä', 'Agentti hyväksyy itse myös korvaajan, kun se pysyy säännöissä. Saat ilmoituksen.']];
const S = { d: null, buyer: 'nordic-hotels', run: null, running: false, trail: null, askText: '', preview: null, patches: [] };

function renderTop() {
  const d = S.d;
  $('#chips').innerHTML = `
    <span class="chip ${d.mode.api === 'live' ? 'live' : 'sim'}">${d.mode.api === 'live' ? 'Live: Aimo-mock-API' : 'Simuloitu hinta ja saatavuus'}</span>
    <span class="chip">Portin kello <b>${dayTime(d.clock.now)}</b>${d.clock.simulated ? ', simuloitu' : ''}</span>
    <span class="chip">Loki ${d.chain.valid ? '✓ ehjä' : `✕ rikki rivillä ${d.chain.brokenAt}`}, ${d.chain.entries} riviä</span>
    <a class="chip" href="/kitchen.html">Keittiödemo (asiakas)</a>`;
  if (d.clock.simulated && !$('.demo-clock')) document.body.insertAdjacentHTML('afterbegin', '<div class="demo-clock">Demokello päällä: portin aika on simuloitu (DEMO_NOW)</div>');
}
function renderAgent() {
  const run = S.run;
  $('#agent').innerHTML = `
    <div class="panel-head"><h2>Ulkopuolinen ostoagentti</h2><span class="tag agent">vain julkinen REST-sopimus</span></div>
    <div class="scenarios">${SCENARIOS.map((s, i) => `<button class="scenario" data-act="scenario" data-i="${i}" title="${esc(S.d.buyers.find((b) => b.id === s.buyer)?.name || s.buyer)}, ${esc(s.hint)}" ${S.running ? 'disabled' : ''}><img src="/img/${s.img}" alt="" loading="lazy" onerror="this.remove()"><b>${esc(s.title)}</b><span>"${esc(s.text)}"</span></button>`).join('')}</div>
    <form class="ask" id="ask"><input id="askText" value="${esc(S.askText || '')}" autocomplete="off" placeholder="Oma pyyntö, esim. 40 kg voita ja 20 l laktoositonta kermaa maanantaiksi" aria-label="Oma pyyntö agentille"><button class="btn" ${S.running ? 'disabled' : ''}>Lähetä agentille</button></form>
    <div id="aimoPreview" class="aimo" aria-live="polite">${previewHtml()}</div>
    <div class="buyer-pick" role="group" aria-label="Ostaja">${S.d.buyers.map((b) => `<button type="button" data-act="buyer" data-buyer="${b.id}" aria-pressed="${S.buyer === b.id}">${esc(b.name)}</button>`).join('')}</div>
    ${S.running ? '<p><span class="spinner"></span> Agentti asioi portin kanssa…</p>' : ''}
    ${run ? `<div><div class="small muted" style="margin-bottom:6px">"${esc(run.text)}", koko ketju ${ms(run.totalMs)}</div>
      <ol class="trace">${run.steps.map((s) => `<li><span class="ms">${ms(s.ms)}</span><div><b>${esc(s.name)}</b> <span class="req">${esc(s.request)} → ${s.status}</span><div>${esc(s.note || '')}</div></div></li>`).join('')}</ol></div>
      <div class="verdict ${run.order?.status || 'rejected'}">${esc(run.summary)}</div>` : ''}`;
}
function renderInbox() {
  const orders = S.d.orders;
  const pending = orders.filter((o) => o.status === 'pending_approval' || o.pendingAddition);
  const fyi = orders.filter((o) => o.status === 'confirmed' && o.notifications?.some((n) => n.kind === 'fyi') && !o.approval?.decision).slice(0, 3);
  const rest = orders.filter((o) => !pending.includes(o) && !fyi.includes(o)).slice(0, 6);
  $('#inbox').innerHTML = `
    <div class="panel-head"><h2>Ihmisen päätettävät</h2><span class="tag ${pending.length ? 'warn' : 'ok'}">${pending.length ? `${pending.length} odottaa` : 'ei avoimia'}</span></div>
    ${pending.length ? pending.map((o) => orderCard(o)).join('') : '<div class="empty">Ei hyväksyntää odottavia tilauksia.</div>'}
    ${fyi.length ? `<h3 style="margin-top:6px">Ilmoitukset: agentti päätti itse</h3>${fyi.map((o) => orderCard(o, { actions: false })).join('')}` : ''}
    ${rest.length ? `<h3 style="margin-top:6px">Aiemmat</h3>${rest.map((o) => orderCard(o, { actions: false })).join('')}` : ''}`;
}
function renderMandate() {
  const b = S.d.buyers.find((x) => x.id === S.buyer); const m = b.mandate;
  $('#mandate').innerHTML = `
    <div class="panel-head"><h2>Valtuutus: ${esc(b.name)}</h2><span class="small muted">${esc(b.kind)}</span></div>
    <div class="levels">${LEVELS.map(([v, t, desc]) => `<label><input type="radio" name="level" data-m="approval" value="${v}" ${m.approval === v ? 'checked' : ''}><span title="${desc}"><b>${t}</b></span></label>`).join('')}</div>
    <div class="grid2">
      <label class="field"><span>Enintään € / tilaus (alv 0 %)</span><input type="number" data-m="maxOrderNet" value="${m.maxOrderNet ?? ''}" min="0" step="50" placeholder="ei rajaa"></label>
      <label class="field"><span>Enintään € / päivä</span><input type="number" data-m="maxDayNet" value="${m.maxDayNet ?? ''}" min="0" step="100" placeholder="ei rajaa"></label>
      <label class="field"><span>Korvaajan hinta enintään + %</span><input type="number" data-m="sub.maxUnitPriceIncreasePct" value="${m.substitution.maxUnitPriceIncreasePct}" min="0" step="1"></label>
      <label class="field"><span>Toimitus saa myöhästyä, pv</span><input type="number" data-m="maxDateShiftDays" value="${m.maxDateShiftDays}" min="0" step="1"></label>
    </div>
    <p class="small muted">Demoavain: <span class="mono">${esc(b.demoKey)}</span></p>`;
}
function renderTrail() {
  const t = S.trail;
  $('#trail').innerHTML = `<div class="panel-head"><h2>Päätösketju</h2><span class="tag ${S.d.chain.valid ? 'ok' : 'bad'}">hash-ketju ${S.d.chain.valid ? 'ehjä' : 'RIKKI'}</span></div>
    ${t ? `<p class="small muted">Tilaus ${esc(t.orderId)}</p>${timeline(t.entries)}` : `${timeline(S.d.ledger.slice(0, 14))}`}`;
}
function renderContract() {
  $('#contract').innerHTML = `<div class="panel-head"><h2>Yksi sopimus, kaksi ovea</h2></div>
    <div class="contract"><a href="/openapi.json" target="_blank" rel="noopener">GET /openapi.json</a><a href="/.well-known/agent-gateway.json" target="_blank" rel="noopener">GET /.well-known/agent-gateway.json</a><a href="/.well-known/jwks.json" target="_blank" rel="noopener">GET /.well-known/jwks.json</a><a href="/mcp" onclick="return false" title="JSON-RPC POST">POST /mcp</a></div>
    <p class="small muted">Aimo-API: ${S.d.apiStats.calls} kutsua, ${S.d.apiStats.ids} tuotekyselyä</p>
    <button class="btn ghost" data-act="reset" style="justify-self:start">Nollaa portin demo</button>`;
}
const renderAll = () => { renderTop(); renderAgent(); renderInbox(); renderMandate(); renderTrail(); renderContract(); };
async function refresh() { S.d = await api('/console/state'); if (S.trail) S.trail = await api(`/console/orders/${S.trail.orderId}/audit`).catch(() => null); renderAll(); }

// ---------- Aimo-malli: esikatselu kirjoittaessa ----------
// Näyttää ennen lähetystä, miten pyyntö ymmärrettiin: rivit, näkyvät oletukset ja tarkennusnapit.
// Nappi on valmis rakenteinen muutos (ei tekstiä): se lähetetään samaan tulkintareittiin kentässä patches.
const UNIT = { L: 'l', KG: 'kg', PCS: 'kpl' };
const CLAIM = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu', MARINE_STEWARDSHIP_COUNCIL_LABEL: 'MSC', FAIR_TRADE_MARK: 'Reilu kauppa' };
const FAT = { 'fat-free': 'rasvaton', 'semi-skimmed': 'kevyt', whole: 'täys' };
function previewHtml() {
  const p = S.preview;
  if (!p || !(S.askText || '').trim()) return '';
  if (p.error) return `<p class="small muted">Tulkinta ei ole käytettävissä: ${esc(p.error)}</p>`;
  const u = p.understood;
  const applied = (i) => S.patches.map((x, k) => ({ ...x, k })).filter((x) => x.item === i);
  const rows = u.items.map((it, i) => {
    const c = p.cards[i];
    const facts = [...it.claims.map((x) => CLAIM[x] || x), it.brand, it.countryOfOrigin === 'fi' ? 'kotimainen' : null, FAT[it.attributes.fat], it.attributes.pack ? `${qty(it.attributes.pack.value)} ${UNIT[it.attributes.pack.unit]} pakkaus` : null, ...it.excludeAllergens.map((a) => `ei allergeenia ${a}`)].filter(Boolean);
    return `<li>
      <div><b>${it.quantity ? `${qty(it.quantity.value)} ${UNIT[it.quantity.unit]} ` : ''}${esc(it.productTerm)}</b>${facts.length ? ` <span class="muted">${esc(facts.join(', '))}</span>` : ''}
        <span class="tag ${c.status === 'ok' ? 'ok' : 'bad'}">${c.status === 'ok' ? `${c.total} tuotetta` : 'ei osumia'}</span></div>
      ${c.reason ? `<div class="small warn-text">${esc(c.reason.fi)}</div>` : ''}
      ${c.top.length ? `<div class="small muted">esim. ${esc(c.top.map((t) => t.name).join(', '))}</div>` : ''}
      <div class="refine" role="group" aria-label="Tarkenna riviä ${i + 1}">
        ${applied(i).map((x) => `<button type="button" data-act="unchip" data-k="${x.k}" aria-pressed="true" title="Poista tarkennus">${esc(x.label)} ✕</button>`).join('')}
        ${c.chips.map((ch, k) => `<button type="button" data-act="chip" data-item="${i}" data-k="${k}" aria-pressed="false">${esc(ch.label)} <span class="n">${ch.matches}</span></button>`).join('')}
      </div></li>`;
  }).join('');
  const notes = u.assumptions.filter((a) => a.code !== 'UNKNOWN_WORD');
  return `<div class="aimo-head"><b>Näin pyyntö ymmärrettiin</b><span class="small muted">${u.deliveryDate ? `toimitus ${day(u.deliveryDate)}, ` : ''}${p.trace.via === 'aimo-rules' ? 'säännöt + Aimon sanasto' : esc(p.trace.via)}, ${p.trace.llmCalls} mallikutsua, ${ms(p.trace.ms)}</span></div>
    ${rows ? `<ul class="aimo-items">${rows}</ul>` : ''}
    ${notes.length ? `<ul class="aimo-notes small">${notes.map((a) => `<li>Oletus: ${esc(a.fi)}</li>`).join('')}</ul>` : ''}
    ${p.handoff ? `<div class="small warn-text"><b>${esc(p.handoff.fi)}.</b>${u.unparsed.length ? ` Tuntematon: ${esc(u.unparsed.join(', '))}.` : ''} Agentti ei tilaa tällä pyynnöllä mitään.</div>` : ''}
    ${!p.handoff && p.gateway.blocked.some((b) => b.code === 'QUANTITY_MISSING') ? '<div class="small warn-text">Määrä puuttuu: lisää esim. "40 kg" tai "200 l", niin agentti voi pyytää tarjouksen.</div>' : ''}`;
}
let previewTimer; let previewSeq = 0;
async function loadPreview() {
  const text = (S.askText || '').trim(); const seq = ++previewSeq;
  if (text.length < 3) { S.preview = null; } else {
    // Kirjoittaessa käytetään vain sääntökerrosta (llm: false): yksikään näppäily ei maksa mallikutsua.
    try { const r = await api('/api/aimo/interpret', { text, patches: S.patches.map(({ item, patch }) => ({ item, patch })), llm: false }); if (seq !== previewSeq) return; S.preview = r; } catch (e) { if (seq !== previewSeq) return; S.preview = { error: e.message }; }
  }
  const el = $('#aimoPreview'); if (el) el.innerHTML = previewHtml();
}

async function runAgent(buyerId, text, tamper = false, patches) {
  if (S.running || !text.trim()) return;
  S.running = true; S.buyer = buyerId; renderAgent(); renderMandate();
  try { S.run = { text, ...(await api('/console/demo', { buyerId, text, tamper, patches })) }; } catch (e) { S.run = { text, steps: [], totalMs: 0, summary: `Virhe: ${e.message}` }; }
  S.running = false;
  if (S.run.order) S.trail = { orderId: S.run.order.orderId, entries: [] };
  await refresh();
  if (S.run.order?.status === 'pending_approval') document.getElementById(`o-${S.run.order.orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function consoleApp() {
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'chip') { const ch = S.preview?.cards?.[+b.dataset.item]?.chips?.[+b.dataset.k]; if (!ch) return; S.patches.push({ item: +b.dataset.item, patch: ch.patch, label: ch.label }); return loadPreview(); }
    if (act === 'unchip') { S.patches = S.patches.slice(0, +b.dataset.k); return loadPreview(); } // myöhemmät tarkennukset rakentuvat aiempien päälle
    if (act === 'scenario') { const s = SCENARIOS[+b.dataset.i]; return runAgent(s.buyer, s.text, !!s.tamper); }
    if (act === 'buyer') { S.buyer = b.dataset.buyer; renderAgent(); return renderMandate(); }
    if (act === 'approve' || act === 'reject' || act === 'suggest') { b.disabled = true; try { await api(`/console/orders/${b.dataset.order}/${act === 'suggest' ? `suggestions/${b.dataset.product}` : act}`, { by: S.d.buyers.find((x) => x.id === S.d.orders.find((o) => o.orderId === b.dataset.order)?.buyerId)?.approver || 'ostaja' }); S.trail = { orderId: b.dataset.order, entries: [] }; } catch (e) { alert(e.message); } return refresh(); }
    if (act === 'trail') { ev.preventDefault(); S.trail = await api(`/console/orders/${b.dataset.order}/audit`); renderTrail(); return $('#trail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (act === 'reset') { if (!confirm('Nollataanko portin tilaukset, loki ja mandaatit demon alkutilaan?')) return; S.run = null; S.trail = null; await api('/console/reset', {}); return refresh(); }
  });
  document.addEventListener('submit', (ev) => { if (ev.target.id !== 'ask') return; ev.preventDefault(); const v = $('#askText').value; runAgent(S.buyer, v, false, S.patches.map(({ item, patch }) => ({ item, patch }))); });
  document.addEventListener('input', (ev) => { if (ev.target.id !== 'askText') return; S.askText = ev.target.value; S.patches = []; clearTimeout(previewTimer); previewTimer = setTimeout(loadPreview, 140); });
  document.addEventListener('change', async (ev) => {
    const key = ev.target.dataset.m; if (!key) return;
    const raw = ev.target.value;
    const patch = key === 'approval' ? { approval: raw } : key.startsWith('sub.') ? { substitution: { [key.slice(4)]: Number(raw) } } : { [key]: raw === '' ? null : Number(raw) };
    await api(`/console/buyers/${S.buyer}/mandate`, patch); refresh();
  });
  // Uudet lokirivit tulevat palvelimelta: toinen laite (puhelin) näkyy tässä heti.
  let timer = null;
  new EventSource('/console/events').addEventListener('ledger', () => { clearTimeout(timer); timer = setTimeout(() => { if (!S.running) refresh(); }, 250); });
  refresh();
}

const params = new URLSearchParams(location.search);
if ($('#phone')) phone(params.get('order'));
else consoleApp();
