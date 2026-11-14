// Aimo AI – selainpää. Ei kehystä eikä build-vaihetta: tila → render-funktiot → tapahtumadelegointi.
const $ = (sel, el = document) => el.querySelector(sel);
const state = { d: null, expanded: new Set(), tab: 'rules', chat: [], audit: null, last: null, showSteps: false, showSkipped: false, flash: new Set(), deepRunning: false, deepSteps: [], review: null, busy: false };

// ---------- apurit ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Tuotekuva: palvelin hakee ja välimuistittaa kuvan (/img/<tuotenumero>). Jos kuvaa ei ole, paikka jää tyhjäksi eikä sitä pyydetä uudelleen.
const noImg = new Set();
const thumb = (id, cls = '') => `<span class="thumb ${cls}">${id && !noImg.has(id) ? `<img src="/img/${esc(id)}" alt="" loading="lazy" data-pid="${esc(id)}">` : ''}</span>`;
document.addEventListener('error', (e) => { const i = e.target; if (i.tagName === 'IMG' && i.dataset.pid) { noImg.add(i.dataset.pid); i.remove(); } }, true);
const money = (n) => `${(+n || 0).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const qty = (q) => String(+(+q).toFixed(2)).replace('.', ',');
const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const WDL = ['Sunnuntain', 'Maanantain', 'Tiistain', 'Keskiviikon', 'Torstain', 'Perjantain', 'Lauantain'];
const dayOf = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const dateLabel = (iso) => { const d = dayOf(iso); return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`; };
const clock = (iso) => new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
const ms = (n) => (n == null ? '–' : n < 10 ? `${(+n).toFixed(1).replace('.', ',')} ms` : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1).replace('.', ',')} s`);
const pctText = (x) => `${x > 0 ? '+' : ''}${String(Math.round(x * 10) / 10).replace('.', ',')} %`;

function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 3200); }

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { toast(json.error || `Virhe ${res.status}`); throw new Error(json.error || res.status); }
  const took = json.ms ?? json.serverMs;
  if (took != null) setLatency(took, 'kanta + säännöt');
  return json;
}
function setLatency(value, via) { state.last = { ms: value, via }; renderStatus(); if (state.tab === 'how') renderTab(); }
function applyProposal(json, flashIds = []) {
  if (json.proposal) state.d.proposal = json.proposal;
  if (json.rules) state.d.rules = json.rules;
  flashIds.filter(Boolean).forEach((id) => state.flash.add(id));
  render();
  if (flashIds.length) setTimeout(() => { state.flash.clear(); }, 1700);
}

// ---------- yläpalkki ----------
function renderStatus() {
  const d = state.d; if (!d) return;
  const p = d.proposal;
  $('#kitchen').textContent = d.kitchen ? `${d.kitchen.name}, ${d.kitchen.kind}` : '';
  // Petrooli palvelupalkki: missä tilassa agentti pyörii.
  const modes = [];
  modes.push(d.mode.api === 'live' ? '<span class="chip live"><span class="dot"></span>Live: Aimo API</span>' : '<span class="chip sim" title="VALIO_API_KEY puuttuu: hinnat ja saatavuus ovat simuloituja">Simuloitu hinta ja saatavuus</span>');
  modes.push(`<span class="chip" title="${d.mode.llm ? `Syvä: ${esc(d.mode.deepModel)}, nopea: ${esc(d.mode.fastModel)}` : 'ANTHROPIC_API_KEY puuttuu: reititys ja perustelut säännöillä'}">Claude ${d.mode.llm ? 'päällä' : 'pois'}</span>`);
  if (state.last) modes.push(`<span class="chip ms" title="Viimeisin vasteaika palvelimella (${esc(state.last.via)})">⚡ ${ms(state.last.ms)}</span>`);
  $('#modes').innerHTML = modes.join('');
  // Lila pääpalkki: toimituspäivä, tilausaikaraja ja tilauksen summa samaan tapaan kuin toimitustukussa.
  // Päivämääräkenttää ei piirretä uudelleen kesken valinnan.
  if (document.activeElement?.id === 'date') return;
  const parts = [];
  if (p) parts.push(`<label class="hd-item" title="Vaihda toimituspäivä">${ICON.calendar}<span class="hd-txt"><span>Toimituspäivä, ${esc(WD[dayOf(p.deliveryDate).getDay()])}</span><input type="date" id="date" value="${esc(p.deliveryDate)}" min="${esc(d.today)}" aria-label="Toimituspäivä"></span></label>`);
  if (p?.cutoff) {
    const h = Math.round((new Date(p.cutoff) - Date.now()) / 36e5);
    parts.push(`<span class="hd-item cutoff" title="Aikaisin tilausaikaraja tilauksen tuotteista (closingTime rajapinnasta)">${ICON.clock}<span class="hd-txt"><span>Tilaa viimeistään</span><b>${esc(dateLabel(p.cutoff))} klo ${esc(clock(p.cutoff))}${h > 0 ? `, ${h} h` : ', umpeutunut'}</b></span></span>`);
  }
  if (p?.totals) parts.push(`<button class="hd-item" data-action="goto-lines" title="Siirry tilausriveihin">${ICON.cart}<i class="hd-badge">${p.totals.lines}</i><span class="hd-txt"><span>Tilaus</span><b>${money(p.totals.expected)}</b></span></button>`);
  $('#status').innerHTML = parts.join('');
}
const svg = (body) => `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  calendar: svg('<rect x="5" y="7" width="22" height="20" rx="2"/><path d="M5 13h22M11 4v6M21 4v6"/>'),
  clock: svg('<circle cx="16" cy="16" r="11"/><path d="M16 10v6l4 3"/>'),
  cart: svg('<path d="M3 6h4l3.5 14h13l2.5-10H9"/><circle cx="12" cy="25" r="1.8"/><circle cx="22" cy="25" r="1.8"/>'),
};

// ---------- hero ----------
function renderHero() {
  const d = state.d; const p = d.proposal; const el = $('#hero');
  const steps = state.deepRunning ? state.deepSteps : p?.deep?.steps || [];
  const stepList = `<ol class="steps">${steps.map((s) => `<li><span class="ms num">${ms(s.ms)}</span><span><b>${esc(s.name)}</b>, ${esc(s.detail)}</span></li>`).join('')}</ol>`;
  if (state.deepRunning || !p) {
    el.innerHTML = `<h1>Syvä agentti laatii tilausta…</h1><p class="briefing running"><span class="spinner"></span> Historia, varaukset, saatavuus, korvaajat</p>${steps.length ? stepList : ''}`;
    return;
  }
  const order = d.order;
  const deep = p.deep;
  const title = order ? `Tilaus ${esc(order.id)} on lähetetty` : `${WDL[dayOf(p.deliveryDate).getDay()]} tilaus on valmiina`;
  el.innerHTML = `
    <h1>${title}</h1>
    <div class="hero-stats">
      <div><b>${p.lines.filter((l) => l.state !== 'dropped').length}</b><span>riviä</span></div>
      <div><b>${money(p.totals.expected)}</b><span>alv 0 %</span></div>
      <div><b>${esc(dateLabel(p.deliveryDate))}</b><span>toimitus</span></div>
      ${!order && p.approvals?.length ? `<div class="warn"><b>${p.approvals.length}</b><span>päätöstä sinulle</span></div>` : ''}
    </div>
    <div class="hero-strip">${p.lines.filter((l) => l.productId && !noImg.has(l.productId)).slice(0, 14).map((l) => `<span title="${esc(l.name)}">${thumb(l.productId)}</span>`).join('')}</div>
    ${state.showSteps ? `<p class="briefing">${esc(p.briefing)}</p>` : ''}
    ${(p.risks || []).length ? `<div class="banner">${p.risks.map((r) => `<div>${esc(r)}</div>`).join('')}</div>` : ''}
    ${order ? `<div class="banner ok"><b>${order.lines.length} riviä, ${money(order.totals.net)}, toimitus ${esc(dateLabel(order.deliveryDate))}.</b> ${esc(order.note)} <button class="linkbtn" data-action="next-week">Laadi seuraavan viikon ehdotus</button></div>` : ''}
    <div class="hero-meta">
      <span class="tag deep" title="${esc(deep.reason)}, ${deep.weeks} vk historiaa, ${deep.quotedProducts} hintaa/saatavuutta kysytty${deep.apiCalls ? `, ${deep.apiCalls} API-kutsua` : ''}">Syvä agentti, ${esc(clock(deep.finishedAt))}, ${ms(deep.ms)}</span>
      ${p.signals.map((s) => `<span class="tag signal" title="${esc(s.source || '')}">${esc(s.label)}: ${esc(s.detail)}</span>`).join('')}
      <button class="linkbtn small" data-action="toggle-steps">${state.showSteps ? 'Piilota perustelu' : 'Perustelu'}</button>
      <button class="linkbtn small" data-action="deep-run">Aja uudelleen</button>
    </div>
    ${state.showSteps ? stepList : ''}
    ${d.kitchen?.demo ? '<p class="small muted" style="margin-top:10px" title="Tilaushistoria, varaukset ja ryhmämenu ovat generoitua demodataa. Tuotteet, allergeenit, korvaavuudet, toimitusvarmuus ja CO₂ ovat Aimon challenge-datasta.">Demokeittiö, osa datasta generoitu</p>' : ''}`;
}

// ---------- päätöskortit ----------
function optionHtml(line, o, i, { combo } = {}) {
  const delta = o.price.deltaPct;
  return `<div class="opt ${o.recommended ? 'recommended' : ''}">
    ${o.recommended ? '<span class="badge">Agentin suositus</span>' : ''}
    <div class="ohead">${thumb(o.productId)}<div class="oname">${esc(o.name)}</div></div>
    <div class="oqty">${combo ? `${qty(o.keepOriginalQty)} ${esc(line.unitLabel)} alkuperäistä + ` : ''}<b>${qty(o.qty)} ${esc(o.unitLabel)}</b> tätä</div>
    <div class="oprice"><b>${money(o.price.total)}</b>${delta != null ? `<span class="delta ${delta > 0.5 ? 'up' : ''}">${pctText(delta)}</span>` : ''}<span class="small muted">${money(o.price.net)} / ${esc(o.unitLabel)}</span></div>
    <ul class="facts">${o.agentNote ? `<li class="note">${esc(o.agentNote)}</li>` : ''}${o.why.map((w) => `<li>${esc(w)}</li>`).join('')}${o.warnings.map((w) => `<li class="warn">${esc(w)}</li>`).join('')}</ul>
    <button class="btn ${o.recommended ? '' : 'ghost'}" data-action="decide" data-line="${line.lineId}" data-choice="${i}">${combo ? 'Täydennä tällä' : 'Korvaa tällä'}</button>
  </div>`;
}
// ---------- perustelu kuvana: muutos, 12 viikon pylväät ja syyt väreinä (vihreä = kasvaa, punainen = laskee) ----------
const vzIcon = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const VZ = {
  up: vzIcon('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  down: vzIcon('<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>'),
  people: vzIcon('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.300 2.700-5 6-5s6 1.700 6 5M16 5.200a3.200 3.200 0 0 1 0 5.600M18 15.300c1.800.600 3 2 3 4.700"/>'),
  menu: vzIcon('<path d="M6 3v8M4 3v4a2 2 0 0 0 4 0V3M6 11v10M17 3c-2 2-3 4.500-3 7h3zM17 10v11"/>'),
  box: vzIcon('<path d="m12 3 8 4.500v9L12 21l-8-4.500v-9zM4 7.500l8 4.500 8-4.500M12 12v9"/>'),
  rhythm: vzIcon('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>'),
};
const vzSign = (v) => { const m = /^\s*([+\-−])/.exec(v || ''); return m ? (m[1] === '+' ? 'pos' : 'neg') : ''; };
function vzDelta(line) {
  const d = line.deltaPct;
  if (d == null) return '';
  const cls = d > 0 ? 'pos' : d < 0 ? 'neg' : 'same';
  const base = line.baselineQty != null ? `Tavallisesti ${qty(line.baselineQty)} ${line.unitLabel}, nyt ${qty(line.qty)} ${line.unitLabel}` : '';
  return `<span class="vz-delta ${cls}" title="${esc(base)}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${d === 0 ? 'sama' : `${d > 0 ? '+' : '−'}${Math.abs(d)} %`}</span>`;
}
function vzSpark(line) {
  const h = line.history || []; if (h.length < 3) return '';
  const max = Math.max(...h, line.qty, 1);
  const cls = line.deltaPct > 0 ? 'pos' : line.deltaPct < 0 ? 'neg' : 'same';
  const bar = (v, c = '') => `<i class="${c}" style="height:${Math.max(8, Math.round((v / max) * 100))}%"></i>`;
  return `<span class="vz-spark" title="Tilaukset ${h.length} viikolta (${esc(line.weekLabels?.[0] || '')}–${esc(line.weekLabels?.at(-1) || '')}) ja tämä ehdotus">${h.map((v) => bar(v, v ? '' : 'zero')).join('')}${bar(line.qty, `now ${cls}`)}</span>`;
}
function vzFactor(f, compact) {
  if (f.kind === 'base' || (!f.value && f.kind !== 'cadence')) return '';
  const sign = vzSign(f.value);
  const title = `${f.label}${f.value ? ` ${f.value}` : ''}${f.detail ? `: ${f.detail}` : ''}`;
  let icon = VZ.box; let gauge = '';
  if (f.kind === 'trend') icon = sign === 'neg' ? VZ.down : VZ.up;
  else if (f.kind === 'menu') icon = VZ.menu;
  else if (f.kind === 'cadence') icon = VZ.rhythm;
  else if (f.kind === 'signal') {
    icon = VZ.people;
    const m = /(\d[\d\s ]*)\s*asiakasta, tavallisesti\s*(\d[\d\s ]*)/.exec(f.detail || '');
    if (m) { // varaukset: tavallinen viikko (harmaa) vastaan tuleva viikko (väri)
      const now = +m[1].replace(/\D/g, ''); const usual = +m[2].replace(/\D/g, ''); const top = Math.max(now, usual, 1);
      gauge = `<span class="vz-gauge" aria-hidden="true"><i style="width:${Math.round((usual / top) * 100)}%"></i><i class="now" style="width:${Math.round((now / top) * 100)}%"></i></span>`;
    }
  }
  const cls = f.kind === 'menu' ? 'menu' : f.kind === 'lot' || f.kind === 'cadence' ? 'neutral' : sign || 'neutral';
  return `<span class="vz-chip ${cls}" title="${esc(title)}">${icon}${compact ? '' : `<span class="vz-label">${esc(f.label)}</span>`}${gauge}${f.value ? `<b>${esc(f.value)}</b>` : ''}</span>`;
}
/** Palauttaa tyhjän, jos rivillä ei ole laskelmaa (käyttäjän lisäämä tai korvaaja): silloin näytetään tekstiperustelu. */
function reasonViz(line, { compact = false } = {}) {
  if (line.deltaPct == null || !line.reason?.factors?.some((f) => f.kind === 'base')) return '';
  return `<span class="vz">${vzDelta(line)}${vzSpark(line)}${line.reason.factors.map((f) => vzFactor(f, compact)).join('')}</span>`;
}

function availabilityCard(line) {
  const flag = line.flags.find((f) => f.severity === 'decision');
  const kind = line.availabilityView?.kind;
  const opts = line.options || [];
  const partial = kind === 'partial';
  return `<article class="card" id="card-${line.lineId}">
    <div class="card-head">${thumb(line.productId)}<h3>${esc(line.name)}</h3><span class="tag out">${esc(flag?.text || 'Poikkeama')}</span></div>
    <p class="need vz-need"><span>Tarve <b>${qty(line.qty)} ${esc(line.unitLabel)}</b></span>${reasonViz(line) || `, ${esc(line.reason.text)}`}</p>
    ${opts.length ? `<div class="options">${opts.map((o, i) => optionHtml(line, o, i, { combo: o.type === 'combo' })).join('')}</div>` : '<p class="need" title="Vaatimus: sama allergeeniprofiili, saatavilla, hinnoiteltu">Ei sopivaa korvaajaa</p>'}
    <div class="card-foot">
      ${partial ? `<button class="btn ghost" data-action="decide" data-line="${line.lineId}" data-choice="keep">Ota vain ${qty(line.availabilityView.amount)} ${esc(line.unitLabel)}</button>` : ''}
      ${kind === 'late' ? `<button class="btn ghost" data-action="decide" data-line="${line.lineId}" data-choice="late">Hyväksy toimitus ${esc(dateLabel(line.availability.date))}</button>` : ''}
      <button class="btn danger" data-action="decide" data-line="${line.lineId}" data-choice="drop">Jätä pois tilauksesta</button>
    </div>
  </article>`;
}
function budgetCard(a, p) {
  const t = p.totals; const share = Math.min(100, (t.budgetCap / t.expected) * 100);
  const trim = a.trim;
  return `<article class="card budget" id="card-budget">
    <div class="card-head"><h3>Tilaus ylittää budjetin ${money(a.overBy)}</h3><span class="tag warn">Tarvitsen luvan</span></div>
    <p class="need">${money(t.expected)} / budjetti ${money(t.budgetCap)}. Tavallinen viikko näillä hinnoilla olisi ${money(t.baselineNet)}; ero tulee varauksista ja ryhmämenusta.</p>
    <div class="meter" aria-hidden="true"><i style="width:${share}%"></i></div>
    ${trim.lines.length ? `<ul class="trim">${trim.lines.map((l) => `<li>${esc(l.name)}: ${qty(l.from)} → <b>${qty(l.to)} ${esc(l.unitLabel)}</b> (−${money(l.saves)})</li>`).join('')}</ul>` : ''}
    <div class="card-foot">
      <button class="btn" data-action="budget" data-choice="approve">Hyväksy ylitys tälle tilaukselle</button>
      ${trim.lines.length ? `<button class="btn ghost" data-action="budget" data-choice="trim">Karsi ehdotukseni mukaan (−${money(trim.saves)})${trim.enough ? '' : ', ei riitä kokonaan'}</button>` : ''}
      <span class="small muted">Karsinta palauttaa korotuksia kohti perustasoa. Ryhmämenun tarpeisiin ei kosketa.</span>
    </div>
  </article>`;
}
function simpleCard(line, a) {
  const blocked = a.type === 'blocked';
  return `<article class="card ${blocked ? '' : 'confirm'}" id="card-${line.lineId}">
    <div class="card-head">${thumb(line.productId)}<h3>${esc(line.name)}</h3><span class="tag ${blocked ? 'out' : 'warn'}">${blocked ? 'Sääntö estää' : 'Varmista määrä'}</span></div>
    <p class="need">${esc(line.flags.find((f) => f.severity === (blocked ? 'blocked' : 'confirm'))?.text || '')}</p>
    <div class="card-foot">
      ${blocked ? '' : `<button class="btn" data-action="confirm-qty" data-line="${line.lineId}">Kyllä, ${qty(line.qty)} ${esc(line.unitLabel)} on oikein</button><button class="btn ghost" data-action="set-qty" data-line="${line.lineId}" data-qty="${line.expectedQty ?? line.baselineQty}">Palauta ${qty(line.expectedQty ?? line.baselineQty)} ${esc(line.unitLabel)}</button>`}
      <button class="btn danger" data-action="remove" data-line="${line.lineId}">Poista rivi</button>
    </div>
  </article>`;
}
function renderDecisions() {
  const p = state.d.proposal; const el = $('#decisions');
  if (!p || state.deepRunning || p.status === 'ordered') { el.innerHTML = ''; return; }
  const byId = new Map(p.lines.map((l) => [l.lineId, l]));
  const order = { planning: -1, availability: 0, blocked: 1, qtyjump: 2, budget: 3 };
  const list = [...p.approvals].sort((a, b) => order[a.type] - order[b.type]);
  if (!list.length) { el.innerHTML = '<div class="section-head"><h2>Ei avoimia päätöksiä</h2><span class="count ok">✓</span></div>'; return; }
  const recommendable = list.filter((a) => a.type === 'availability' && byId.get(a.lineId)?.options?.some((o) => o.recommended)).length;
  el.innerHTML = `<div class="section-head"><h2>Tarvitsen päätöksesi</h2><span class="count">${list.length}</span>
      ${recommendable > 1 ? `<button class="btn" style="margin-left:auto" data-action="accept-all">Hyväksy ${recommendable} suositeltua korvaajaa</button>` : ''}</div>
    <div class="cards">${list.map((a) => (a.type === 'planning' ? `<article class="card"><div class="card-head"><h3>Ostotarvetta ei voitu laskea kokonaan</h3></div><p class="need">${esc(a.text)}</p><p class="small muted">Täydennä resepti- tai varastotiedot ja laadi ehdotus uudelleen.</p><button class="btn ghost" data-action="deep-run">Laske uudelleen</button></article>` : a.type === 'budget' ? budgetCard(a, p) : a.type === 'availability' ? availabilityCard(byId.get(a.lineId)) : simpleCard(byId.get(a.lineId), a))).join('')}</div>`;
}

// ---------- rivit ----------
function sparkline(line) {
  const h = line.history || []; if (!h.length) return '';
  const max = Math.max(...h, line.qty, 1);
  const bars = h.map((v, i) => `<i class="${v ? '' : 'zero'}" style="height:${v ? Math.max(6, (v / max) * 100) : 0}%" title="${esc(line.weekLabels?.[i] || '')}: ${v ? `${qty(v)} ${esc(line.unitLabel)}` : 'ei tilattu'}"></i>`).join('');
  return `<div><div class="small muted">Tilaukset ${h.length} viikolta + tämä ehdotus</div><div class="spark">${bars}<i class="now" style="height:${Math.max(6, (line.qty / max) * 100)}%" title="Ehdotus: ${qty(line.qty)} ${esc(line.unitLabel)}"></i></div><div class="spark-axis"><span>${esc(line.weekLabels?.[0] || '')}</span><span>${esc(line.weekLabels?.at(-1) || '')}</span><span><b>nyt</b></span></div></div>`;
}
function rowHtml(line) {
  const open = state.expanded.has(line.lineId);
  const edited = line.reason.userEdit;
  const whyClass = edited || line.origin === 'user' ? 'user' : /^Sama/.test(line.reason.text) ? 'same' : '';
  const av = line.availabilityView || {};
  const tags = [];
  if (line.substituteFor) tags.push(`<span class="tag ok" title="Korvaa tuotteen ${esc(line.substituteFor.name)}">Korvaaja${line.autoDecided ? ', agentti hyväksyi säännöillä' : ''}</span>`);
  for (const f of line.flags.filter((x) => x.severity !== 'decision')) tags.push(`<span class="tag warn">${esc(f.text)}</span>`);
  if (line.pack) tags.push(`<button class="packchip" data-action="set-qty" data-line="${line.lineId}" data-qty="${line.pack.to}" title="${esc(line.pack.title)}">${esc(line.pack.text)}</button>`);
  const detail = !open ? '' : `<div class="row-detail">
      <div class="detail-grid">
        <div>
          <ul class="factors">${line.reason.factors.map((f) => `<li><span>${esc(f.label)}</span>${f.value ? `<span class="fval ${vzSign(f.value)}">${esc(f.value)}</span>` : ''}${f.detail ? `<span class="fdet">${esc(f.detail)}</span>` : ''}</li>`).join('') || `<li><span>${esc(line.reason.text)}</span></li>`}
          ${edited ? `<li><span>${esc(edited)}</span><span class="fval">sinä</span></li>` : ''}</ul>
          <p class="small muted" style="margin-top:8px">Lähteet: ${esc((line.reason.sources || []).join(', ') || '–')}</p>
        </div>
        <div>${sparkline(line)}
          <div class="kv" style="margin-top:10px">
            ${line.reliability != null ? `<span class="tag">Toimitusvarmuus ${(line.reliability * 100).toFixed(1).replace('.', ',').replace(',0', '')} %</span>` : ''}
            ${line.co2 != null ? `<span class="tag" title="Tuoteryhmän keskiarvo">CO₂ ${String(line.co2).replace('.', ',')} kg/kg</span>` : ''}
            ${line.country ? `<span class="tag">Alkuperä ${esc(line.country.toUpperCase())}</span>` : ''}
            ${line.contains?.length ? `<span class="tag">Allergeenit: ${esc(line.contains.join(', '))}</span>` : ''}
            ${line.price?.comparison ? `<span class="tag">${money(line.price.comparison)} / ${esc((line.price.comparisonUnit || 'kg').toLowerCase())}</span>` : ''}
          </div>
        </div>
      </div>
      ${line.options?.length && line.state !== 'decision' ? `<div><div class="small" style="font-weight:700;margin-bottom:8px">${line.altReason === 'reliability' ? 'Varmempi vaihtoehto toimitusvarmuuden takia' : 'Korvaavat vaihtoehdot'}</div><div class="options">${line.options.map((o, i) => optionHtml(line, o, i)).join('')}</div></div>` : ''}
      <div class="card-foot" style="margin-top:0"><button class="btn ghost" data-action="ask-sub" data-line="${line.lineId}">Etsi korvaava</button><button class="btn danger" data-action="remove" data-line="${line.lineId}">Poista rivi</button></div>
    </div>`;
  return `<div class="row ${state.flash.has(line.lineId) ? 'flash' : ''}" id="row-${line.lineId}">
    <div class="row-main">
      <div class="rmain">
        ${thumb(line.productId)}
        <div class="rname">${esc(line.name)}</div>
        <div class="rsub">
          ${edited || !reasonViz(line) ? `<button class="why ${whyClass}" data-action="toggle" data-line="${line.lineId}" aria-expanded="${open}">${esc(edited ? 'Muokattu' : line.reason.text)}</button>` : `<button class="why viz" data-action="toggle" data-line="${line.lineId}" aria-expanded="${open}" aria-label="${esc(line.reason.text)}. Näytä laskelma">${reasonViz(line, { compact: true })}</button>`}
          <span class="avail ${av.kind === 'ok' ? '' : 'warn'}"><span class="dot"></span>${esc(av.text || '')}</span>
          ${tags.join('')}
        </div>
      </div>
      <div class="stepper" role="group" aria-label="Määrä">
        <button data-action="step" data-line="${line.lineId}" data-dir="-1" aria-label="Vähennä">−</button>
        <span class="q">${qty(line.qty)} <small>${esc(line.unitLabel)}</small></span>
        <button data-action="step" data-line="${line.lineId}" data-dir="1" aria-label="Lisää">+</button>
      </div>
      <div class="rprice"><b>${line.total != null ? money(line.total) : '–'}</b><span>${line.price ? `${money(line.price.net)} / ${esc(line.unitLabel)}` : 'ei hintaa'}</span></div>
    </div>${detail}</div>`;
}
function renderLines() {
  const p = state.d.proposal; const el = $('#lines');
  if (!p || state.deepRunning) { el.innerHTML = ''; return; }
  const lines = p.lines.filter((l) => ['ok', 'confirm'].includes(l.state));
  const groups = new Map();
  for (const l of lines) { if (!groups.has(l.group)) groups.set(l.group, []); groups.get(l.group).push(l); }
  el.innerHTML = `<div class="section-head"><h2>Kunnossa</h2><span class="count ok">${lines.length}</span></div>
    ${[...groups].map(([g, ls]) => `<div class="group"><div class="group-head"><span>${esc(g || 'Muut')}</span><span class="num">${money(ls.reduce((s, l) => s + (l.total || 0), 0))}</span></div>${ls.map(rowHtml).join('')}</div>`).join('')}`;
}
function renderSkipped() {
  const p = state.d.proposal; const el = $('#skipped');
  if (!p?.skipped?.length || state.deepRunning) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="linkbtn" data-action="toggle-skipped">${state.showSkipped ? 'Piilota' : 'Näytä'} ${p.skipped.length} tuotetta, jotka jätin pois tällä viikolla</button>
    ${state.showSkipped ? `<div class="group" style="margin-top:10px">${p.skipped.map((s) => `<div class="row"><div class="row-main" style="grid-template-columns:1fr auto"><div><div class="rname">${esc(s.name)}</div><div class="rsub muted">${esc(s.reason)}</div></div><button class="btn ghost" data-action="add-product" data-product="${esc(s.productId)}">Lisää silti</button></div></div>`).join('')}</div>` : ''}`;
}

// ---------- alapalkki ----------
function renderBar() {
  const p = state.d.proposal; const el = $('#bar');
  if (!p || state.deepRunning) { el.innerHTML = '<span class="running"><span class="spinner"></span> Lasketaan…</span>'; return; }
  const t = p.totals; const over = t.expected > t.budgetCap;
  const pending = p.approvals.length;
  const btn = p.status === 'ordered' ? '<button class="btn big ghost" disabled>Tilaus lähetetty ✓</button>'
    : pending ? `<button class="btn big" data-action="goto-decisions">Ratkaise ensin ${pending} ${pending === 1 ? 'päätös' : 'päätöstä'}</button>`
    : '<button class="btn big primary" data-action="open-review">Tarkista ja hyväksy tilaus</button>';
  el.innerHTML = `<div class="sum">
      <div><div class="total">${money(t.expected)}</div><div class="meta">${t.lines} riviä, alv 0 %${t.pendingNet ? `, ${money(t.pendingNet)} odottaa päätöstä` : ''}</div></div>
      <div class="meta budget"><span>Budjetti ${money(t.budgetCap)}, ${over ? `<b style="color:var(--warn)">ylitys ${money(t.expected - t.budgetCap)}${t.budgetOk ? ' (hyväksytty)' : ''}</b>` : `jäljellä ${money(t.budgetCap - t.expected)}`}</span><div class="meter"><i class="${over ? 'over' : ''}" style="width:${Math.min(100, (t.expected / t.budgetCap) * 100)}%"></i></div></div>
      <div class="eco"><span class="tag" title="Arvio tuoteryhmäkeskiarvoilla, kattaa ${t.co2Lines}/${t.lines} riviä">CO₂ ≈ ${t.co2Kg.toLocaleString('fi-FI')} kg</span><span class="tag">Kotimaisia ${t.domesticShare} % arvosta</span></div>
    </div>${btn}`;
}

// ---------- avustaja ----------
const PRESETS = ['Sama kuin viime viikolla, mutta 20 % enemmän kermaa', 'Lisää 10 kg lohta ja poista kahvi', 'Miksi lohta on näin paljon?', 'Tarvitsen tofua', 'Paljonko budjettia on jäljellä?'];
// Chatin tuote-ehdotus kuvakorttina: kuva, hinta, saatavuus värinä ja toimitusvarmuus palkkina.
function chatProduct(it) {
  const ok = it.availability.kind === 'ok' && it.price;
  const rel = it.reliability != null ? Math.round(it.reliability * 100) : null;
  const cart = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h3l2.600 11h10.400l2-8H7"/><circle cx="9.5" cy="19" r="1.400"/><circle cx="17" cy="19" r="1.400"/></svg>';
  return `<article class="cp${ok ? '' : ' off'}">
    ${it.boughtBefore ? '<span class="cp-flag">Tilattu ennen</span>' : ''}
    <div class="cp-img"><img src="/img/${esc(it.productId)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cp-noimg',textContent:'Ei kuvaa'}))"></div>
    <div class="cp-name" title="${esc(it.name)}">${esc(it.name)}</div>
    <div class="cp-price">${it.price ? `${money(it.price.net)} <small>/ ${esc(it.unitLabel)}</small>` : '<small>ei hintaa</small>'}</div>
    <div class="cp-avail"><span class="cp-dot ${it.availability.kind === 'ok' ? 'ok' : it.availability.kind === 'out' || it.availability.kind === 'blocked' ? 'no' : 'warn'}"></span>${esc(it.availability.text)}</div>
    ${rel != null ? `<div class="cp-rel" title="Toimitusvarmuus ${rel} %"><span class="cp-bar"><i class="${rel >= 95 ? 'ok' : rel >= 88 ? 'warn' : 'no'}" style="width:${rel}%"></i></span><b>${rel} %</b></div>` : ''}
    <button class="cp-add" data-action="add-product" data-product="${esc(it.productId)}" data-qty="${it.qty}" ${ok ? '' : 'disabled'}>${ok ? `${cart} Lisää ${qty(it.qty)} ${esc(it.unitLabel)}` : 'Ei tilattavissa'}</button>
  </article>`;
}
function renderChat() {
  const el = $('#chat');
  if (!state.chat.length) { el.innerHTML = ''; }
  else el.innerHTML = state.chat.map((m, mi) => m.role === 'user' ? `<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>` : `<div class="msg agent">
      ${m.agents.length ? `<div class="lane">${m.agents.map((a) => `<span class="agent ${a.state === 'warn' ? 'warn' : ''}" title="${esc(a.detail || '')}">${esc(a.name)}${a.ms != null ? ` <em>${ms(a.ms)}</em>` : ''}</span>`).join('')}</div>` : ''}
      ${m.text || m.pending ? `<div class="bubble">${m.text ? esc(m.text) : '<span class="running"><span class="spinner"></span></span>'}</div>` : ''}
      ${m.cards?.length ? `<div class="minicards${m.cards.some((c) => c.kind === 'options') ? ' cps' : ''}">${m.cards.map((c) => c.items.map((it) => c.kind === 'options'
        ? chatProduct(it)
        : `<div class="mini"><div class="mrow"><span><b>${esc(it.name)}</b>, ${qty(it.qty)} ${esc(it.unitLabel)}</span><button class="btn ${c.action === 'remove' ? 'danger' : ''}" data-action="${c.action === 'remove' ? 'remove' : 'set-qty'}" data-line="${it.lineId}" data-qty="${c.value ?? ''}">${c.action === 'remove' ? 'Poista' : `Aseta ${qty(c.value)}`}</button></div></div>`).join('')).join('')}</div>` : ''}
      ${m.ms != null ? `<div class="took">Vastaus <b>${ms(m.ms)}</b>, reititys: ${esc(m.via || '')}</div>` : ''}
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
  $('#chips').innerHTML = PRESETS.map((t) => `<button data-action="preset" data-text="${esc(t)}">${esc(t)}</button>`).join('');
}
async function send(text) {
  text = text.trim(); if (!text || state.busy) return;
  state.busy = true;
  const msg = { role: 'agent', text: '', agents: [], cards: [], pending: true };
  state.chat.push({ role: 'user', text }, msg); renderChat();
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(frame)?.[1]; const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (ev && data) onChatEvent(ev, JSON.parse(data), msg);
      }
    }
  } catch (err) { msg.text = `Yhteysvirhe: ${err.message}`; }
  msg.pending = false; state.busy = false; renderChat();
}
function onChatEvent(ev, data, msg) {
  if (ev === 'agent') msg.agents.push(data);
  else if (ev === 'token') msg.text += data.text;
  else if (ev === 'say') msg.text = data.text;
  else if (ev === 'result') {
    msg.cards = data.cards || [];
    applyProposal({ proposal: data.proposal }, (data.changes || []).map((c) => c.lineId));
    if (data.ui === 'open_review') openReview();
    else if (data.ui?.startsWith('focus:')) focusLine(data.ui.slice(6));
  } else if (ev === 'done') { msg.ms = data.ms; msg.via = data.via; msg.pending = false; if (data.ms) setLatency(data.ms, `nopea polku, ${data.via}`); }
  renderChat();
}
function focusLine(lineId) {
  const card = document.getElementById(`card-${lineId}`);
  if (!card) { state.expanded.add(lineId); renderLines(); }
  (card || document.getElementById(`row-${lineId}`))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- välilehdet ----------
const AUTONOMY = [['suggest', 'Vain ehdottaa', 'Agentti laatii ehdotuksen, sinä hyväksyt jokaisen poikkeaman.'], ['ask_exceptions', 'Kysyy luvan poikkeuksiin', 'Sääntöjen sisällä olevat rivit ovat valmiina. Korvaukset ja budjetin ylitys kysytään.'], ['auto_within_rules', 'Hoitaa itse sääntöjen sisällä', 'Agentti hyväksyy itse korvaajat, jotka täyttävät säännöt. Kaikki muu kysytään.']];
const ALLERGENS = [['AP', 'maapähkinä'], ['AN', 'pähkinät'], ['AF', 'kala'], ['AC', 'äyriäiset'], ['AW', 'gluteeni'], ['AM', 'maito'], ['AE', 'kananmuna'], ['AY', 'soija'], ['AS', 'seesami'], ['BC', 'selleri'], ['BM', 'sinappi']];
function renderTab() {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  const el = $('#tabbody'); const d = state.d; const r = d.rules;
  if (state.tab === 'rules') {
    el.innerHTML = `<div class="radio">${AUTONOMY.map(([v, t, desc]) => `<label><input type="radio" name="autonomy" data-rule="autonomy" value="${v}" ${r.autonomy === v ? 'checked' : ''}><span title="${desc}"><b>${t}</b></span></label>`).join('')}</div>
      <div class="field2">
        <label class="field"><span>Budjettikatto € / tilaus</span><input type="number" data-rule="budgetCap" value="${r.budgetCap}" step="50" min="0"></label>
        <label class="field"><span>Määrä yli ennusteen, max %</span><input type="number" data-rule="maxQtyJumpPct" value="${r.maxQtyJumpPct}" step="10" min="0"></label>
        <label class="field"><span>Korvaajan hinta, max + %</span><input type="number" data-rule="subMaxPriceIncreasePct" value="${r.subMaxPriceIncreasePct}" step="1" min="0"></label>
        <label class="field"><span>Toimitusvarmuus, min %</span><input type="number" data-rule="minReliability" data-scale="100" value="${Math.round(r.minReliability * 100)}" step="1" min="0" max="100"></label>
      </div>
      <label class="check"><input type="checkbox" data-rule="subSameAllergens" ${r.subSameAllergens ? 'checked' : ''}> Korvaaja ei saa tuoda uusia allergeeneja</label>
      <label class="check"><input type="checkbox" data-rule="preferDomestic" ${r.preferDomestic ? 'checked' : ''}> Suosi kotimaista korvaajaa</label>
      <div class="field" style="margin-top:10px"><span>Kielletyt allergeenit keittiössä</span><div class="allergens">${ALLERGENS.map(([c, n]) => `<button type="button" data-action="allergen" data-code="${c}" aria-pressed="${r.bannedAllergens.includes(c)}">${n}</button>`).join('')}</div></div>
      <p class="small muted">Autonomiataso ja korvaajasäännöt vaikuttavat seuraavaan syväajoon. <button class="linkbtn" data-action="deep-run">Aja nyt</button></p>`;
  } else if (state.tab === 'audit') {
    if (!state.audit) { el.innerHTML = '<p class="muted small">Ladataan…</p>'; api('/api/audit').then((j) => { state.audit = j.entries; if (state.tab === 'audit') renderTab(); }); return; }
    const cls = (a) => (a.actor.startsWith('syvä') ? 'deep' : a.actor.startsWith('nopea') ? 'fast' : a.actor.startsWith('sääntö') ? 'gate' : a.actor === 'käyttäjä' ? 'user' : '');
    el.innerHTML = `<ul class="audit">${state.audit.map((a) => `<li class="${cls(a)}"><div class="ahead"><span><b>${esc(a.actor)}</b>, ${esc(clock(a.ts))}</span><span class="num">${a.ms != null ? ms(a.ms) : ''}</span></div><div>${esc(a.action)}</div>${Object.keys(a.detail || {}).length ? `<div class="adet">${esc(Object.entries(a.detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '))}</div>` : ''}</li>`).join('')}</ul>`;
  } else {
    const deep = d.proposal?.deep; const s = d.stats;
    el.innerHTML = `<div class="how">
      <div class="lanebox deep"><span class="path-tag deep">Syvä polku, taustalla</span><h4 style="margin-top:6px">Ajattelu tehdään ennen kuin kysyt</h4>
        <div class="big">${deep ? ms(deep.ms) : '–'}</div><div class="small">viimeisin ajo${deep ? ` klo ${esc(clock(deep.finishedAt))}` : ''}, ${d.mode.llm ? esc(d.mode.deepModel) : 'ilman kielimallia'}</div>
        <ol><li>Ennuste ostohistoriasta ja tilausrytmistä</li><li>Signaalit: varaukset ja ryhmämenut</li><li>Saatavuus ja hinta vain näille tuotteille</li><li>Korvaajat poikkeamille valmiiksi</li><li>Tulos kantaan</li></ol></div>
      <div class="lanebox fast"><span class="path-tag fast">Nopea polku, kun kysyt</span><h4 style="margin-top:6px">Reititin → agentit rinnakkain → vastaus</h4>
        <div class="big">${state.last ? ms(state.last.ms) : '–'}</div><div class="small">viimeisin vastaus${state.last ? ` (${esc(state.last.via)})` : ''}</div>
        <ol><li>Reititin: säännöt ensin, ${d.mode.llm ? esc(d.mode.fastModel) : 'pieni malli'} vain tarvittaessa</li><li>Tuotehaku muistista (${s.catalog.products.toLocaleString('fi-FI')} tuotetta)</li><li>Saatavuus + hinta välimuistista tai rajapinnasta</li><li>Korvaajat staattisesta datasta</li></ol></div>
      <div class="lanebox gate"><h4>Sääntöportti</h4><div class="small">Budjetti, allergeenit, määrärajat ja korvaussäännöt tarkistetaan koodilla jokaisen muutoksen jälkeen. Ennen lähetystä hinnat ja saatavuus haetaan vielä kerran tuoreena.</div></div>
      <div class="small muted">Aimo API tällä istunnolla: ${s.api.calls} kutsua, ${s.api.ids} tuotekyselyä, ${s.api.cacheHits} osumaa välimuistista${s.api.errors ? `, ${s.api.errors} virhettä` : ''}. Koko valikoimaa ei koskaan kysytä kerralla.</div>
      <button class="linkbtn small" data-action="reset" style="justify-self:start">Nollaa demo alkutilaan</button></div>`;
  }
}

// ---------- tarkistus ja vahvistus (2 vaihetta) ----------
async function openReview() {
  const dlg = $('#review');
  state.review = { step: 'checking' }; renderReview(); if (!dlg.open) dlg.showModal();
  try { const r = await api('/api/order/review', {}); state.d.proposal = r.proposal; state.review = { step: r.ok ? 'summary' : 'blocked', ...r }; render(); } catch { dlg.close(); }
  renderReview();
}
function renderReview() {
  const dlg = $('#review'); const r = state.review; const p = state.d.proposal; if (!r) return;
  const lines = p.lines.filter((l) => !['removed', 'replaced'].includes(l.state)); const t = p.totals;
  const head = (n, title) => `<div class="stepdots">Vaihe ${n} / 2</div><h2>${title}</h2>`;
  if (r.step === 'checking') dlg.innerHTML = '<div class="review-body"><h2>Tarkistan tilauksen…</h2><p class="running"><span class="spinner"></span> Haen tuoreet hinnat ja saatavuuden ja ajan sääntötarkistuksen.</p></div>';
  else if (r.step === 'blocked') dlg.innerHTML = `<div class="review-body"><h2>Tilausta ei voi vielä lähettää</h2><ul class="checks">${p.approvals.map((a) => `<li class="bad">${esc(a.text)}</li>`).join('')}</ul></div><div class="review-foot"><button class="btn" data-action="review-close">Palaa tilaukseen</button></div>`;
  else if (r.step === 'summary') dlg.innerHTML = `<div class="review-body">${head(1, 'Tarkista tilaus')}
      <ul class="checks"><li>Saatavuus ja hinnat haettu juuri nyt ${lines.length} tuotteelle (${ms(r.ms)}, ${state.d.mode.api === 'live' ? 'Aimo API' : 'simuloitu'})</li><li>Budjetti: ${money(t.expected)} / ${money(t.budgetCap)}${t.expected > t.budgetCap ? ' (ylitys hyväksytty)' : ''}</li><li>Allergeeni- ja toimittajasäännöt: ei rikkomuksia</li><li>Korvauksia ${lines.filter((l) => l.substituteFor).length} kpl, kaikki hyväksymiäsi</li>${r.diffs.map((x) => `<li class="bad">${esc(x.name)}: ${esc(x.text)}</li>`).join('')}</ul>
      <div class="scroll"><table><thead><tr><th>Tuote</th><th class="r">Määrä</th><th class="r">à</th><th class="r">Yhteensä</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l.name)}${l.substituteFor ? `<div class="small muted">korvaa: ${esc(l.substituteFor.name)}</div>` : ''}<div class="small muted">${esc(l.productId)}, ${esc(l.availabilityView?.text || '')}</div></td><td class="r">${qty(l.qty)} ${esc(l.unitLabel)}</td><td class="r">${money(l.price.net)}</td><td class="r">${money(l.total)}</td></tr>`).join('')}</tbody></table></div>
      <div class="totals"><span>Välisumma (alv 0 %)</span><span class="num">${money(t.net)}</span><span>Arvonlisävero</span><span class="num">${money(t.vat)}</span><span class="grand">Yhteensä</span><span class="grand num">${money(t.gross)}</span><span class="muted">Toimitus</span><span>${esc(dateLabel(p.deliveryDate))}${p.cutoff ? `, tilattava viimeistään ${esc(dateLabel(p.cutoff))} klo ${esc(clock(p.cutoff))}` : ''}</span></div>
    </div><div class="review-foot"><button class="btn ghost" data-action="review-close">Peruuta</button><button class="btn big" data-action="review-confirm">Vahvista tilaus</button></div>`;
  else if (r.step === 'final') dlg.innerHTML = `<div class="review-body">${head(2, 'Lähetetäänkö tilaus Aimoon?')}
      <p style="font-size:16px">Olet lähettämässä tilauksen: <b>${lines.length} riviä, ${money(t.gross)}</b> (alv 0 % ${money(t.net)}), toimitus <b>${esc(dateLabel(p.deliveryDate))}</b>. Tarkista, että tuotteet, määrät, hinnat ja toimituspäivä ovat oikein.</p>
      <p class="small muted">Tilaus lähtee vasta tästä painikkeesta. Agentti ei voi lähettää tilausta puolestasi.</p>
    </div><div class="review-foot"><button class="btn ghost" data-action="review-back">Takaisin</button><button class="btn big primary" data-action="review-place">Lähetä tilaus</button></div>`;
  else if (r.step === 'done') dlg.innerHTML = `<div class="review-body"><div class="success"><div class="tick">✓</div><h2>Tilaus ${esc(r.order.id)} on lähetetty</h2><p>${r.order.lines.length} riviä, ${money(r.order.totals.gross)}, toimitus ${esc(dateLabel(r.order.deliveryDate))}</p><p class="small muted">${esc(r.order.note)}</p></div></div><div class="review-foot"><button class="btn" data-action="review-close">Valmis</button></div>`;
}

// ---------- kokonaisuus ----------
function render() { renderStatus(); renderHero(); renderDecisions(); renderLines(); renderSkipped(); renderBar(); renderTab(); }
async function load() { state.d = await api('/api/state'); state.deepRunning = state.d.deep.running; state.deepSteps = state.d.deep.steps || []; if (state.last) state.last = { ms: state.d.serverMs, via: 'valmis ehdotus kannasta' }; else setLatency(state.d.serverMs, 'valmis ehdotus kannasta'); render(); renderChat(); }

const actions = {
  toggle: (b) => { const id = b.dataset.line; state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); renderLines(); },
  'toggle-steps': () => { state.showSteps = !state.showSteps; renderHero(); },
  'toggle-skipped': () => { state.showSkipped = !state.showSkipped; renderSkipped(); },
  tab: (b) => { state.tab = b.dataset.tab; if (state.tab === 'audit') state.audit = null; renderTab(); },
  preset: (b) => send(b.dataset.text),
  step: async (b) => { const l = state.d.proposal.lines.find((x) => x.lineId === b.dataset.line); applyProposal(await api('/api/line', { lineId: l.lineId, qty: l.qty + Number(b.dataset.dir) * l.step }), [l.lineId]); },
  'set-qty': async (b) => applyProposal(await api('/api/line', { lineId: b.dataset.line, qty: Number(b.dataset.qty) }), [b.dataset.line]),
  'confirm-qty': async (b) => applyProposal(await api('/api/line', { lineId: b.dataset.line, confirm: true }), [b.dataset.line]),
  remove: async (b) => { applyProposal(await api('/api/line', { lineId: b.dataset.line, remove: true })); toast('Rivi poistettu'); },
  decide: async (b) => { const r = await api('/api/decide', { lineId: b.dataset.line, choice: b.dataset.choice }); applyProposal(r, [r.focus, b.dataset.line]); if (r.focus) document.getElementById(`row-${r.focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  'accept-all': async () => { const r = await api('/api/accept-recommended', {}); applyProposal(r, r.focus || []); toast(`${r.accepted} korvaajaa hyväksytty`); },
  budget: async (b) => applyProposal(await api('/api/budget', { action: b.dataset.choice })),
  'add-product': async (b) => { const r = await api('/api/add', { productId: b.dataset.product, qty: Number(b.dataset.qty) || null }); applyProposal(r, [r.focus]); toast('Lisätty tilaukseen'); },
  'ask-sub': (b) => { const l = state.d.proposal.lines.find((x) => x.lineId === b.dataset.line); send(`korvaava tuotteelle ${l.name.split(' ').slice(0, 3).join(' ')}`); },
  allergen: async (b) => { const cur = new Set(state.d.rules.bannedAllergens); cur.has(b.dataset.code) ? cur.delete(b.dataset.code) : cur.add(b.dataset.code); applyProposal(await api('/api/rules', { bannedAllergens: [...cur] })); },
  'deep-run': async () => { await api('/api/deep', { reason: 'käyttäjä käynnisti' }); },
  'next-week': async () => { const d = dayOf(state.d.proposal.deliveryDate); d.setDate(d.getDate() + 7); await api('/api/deep', { deliveryDate: d.toISOString().slice(0, 10), reason: 'seuraava viikko' }); },
  reset: async () => { if (confirm('Nollataanko demo? Tilaus, loki ja muutokset poistetaan.')) { state.chat = []; state.audit = null; await api('/api/reset', {}); } },
  'goto-lines': () => $('#lines').scrollIntoView({ behavior: 'smooth', block: 'start' }),
  'goto-decisions': () => $('#decisions').scrollIntoView({ behavior: 'smooth', block: 'start' }),
  'open-review': () => openReview(),
  'review-close': () => { $('#review').close(); state.review = null; },
  'review-confirm': () => { state.review.step = 'final'; renderReview(); },
  'review-back': () => { state.review.step = 'summary'; renderReview(); },
  'review-place': async (b) => { b.disabled = true; try { const r = await api('/api/order/place', { token: state.review.token }); state.d.order = r.order; state.d.proposal = r.proposal; state.review = { step: 'done', order: r.order }; render(); renderReview(); } catch { state.review = null; $('#review').close(); } },
};
document.addEventListener('click', (e) => { const b = e.target.closest('[data-action]'); if (!b || b.disabled) return; const fn = actions[b.dataset.action]; if (fn) Promise.resolve(fn(b)).catch((err) => console.warn(err)); });
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'date' && t.value && t.value !== state.d.proposal?.deliveryDate) { if (confirm(`Laaditaanko ehdotus uudelle toimituspäivälle ${dateLabel(t.value)}? Nykyiset muutokset korvataan.`)) await api('/api/deep', { deliveryDate: t.value, reason: 'toimituspäivä vaihdettu' }); else t.value = state.d.proposal.deliveryDate; }
  if (t.dataset.rule) { const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) / (Number(t.dataset.scale) || 1) : t.value; applyProposal(await api('/api/rules', { [t.dataset.rule]: v })); toast('Sääntö tallennettu ja tarkistus ajettu'); }
});
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); const input = $('#input'); const text = input.value; input.value = ''; send(text); });

// Sanelu (Web Speech API, fi-FI). Kokki ei istu koneella.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('#mic');
if (!SR) mic.hidden = true, $('#composer').style.gridTemplateColumns = '1fr 44px';
else {
  let rec = null;
  mic.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'fi-FI'; rec.interimResults = true; rec.maxAlternatives = 1;
    mic.classList.add('on');
    rec.onresult = (ev) => { const text = [...ev.results].map((r) => r[0].transcript).join(''); $('#input').value = text; if (ev.results[ev.results.length - 1].isFinal) { $('#input').value = ''; send(text); } };
    rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'Mikrofonin käyttö estetty selaimessa' : `Sanelu ei onnistunut (${ev.error})`);
    rec.onend = () => { mic.classList.remove('on'); rec = null; };
    rec.start();
  });
}

// Palvelimen tapahtumat: syvän agentin eteneminen ja loki.
const es = new EventSource('/api/events');
es.addEventListener('deep', (e) => {
  const ev = JSON.parse(e.data);
  if (ev.phase === 'start') { state.deepRunning = true; state.deepSteps = []; render(); }
  else if (ev.phase === 'step') { state.deepSteps = ev.steps; renderHero(); }
  else { state.deepRunning = false; state.expanded.clear(); load().then(() => { if (ev.phase === 'done') toast(`Syvä agentti valmis: ${ms(ev.ms)}`); else toast(`Syväajo epäonnistui: ${ev.error}`); }); }
});
es.addEventListener('audit', (e) => { if (state.audit) { state.audit.unshift(JSON.parse(e.data)); if (state.tab === 'audit') renderTab(); } });

load();
