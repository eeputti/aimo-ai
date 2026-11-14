// FIKSU HAKU etusivulla. Hakukenttään kirjoitettu puhekielinen pyyntö ("laktoositonta kermaa 20 l perjantaiksi")
// tulkitaan Aimon sääntökerroksella (/api/aimo/interpret, llm: false): yksikään näppäily ei maksa mallikutsua eikä Valion API-kutsua.
// Näkymä näyttää, mitä ymmärrettiin (määrä, tuote, väittämät, päivä) ja parhaat osumat kuvineen.
// Hinta ja saatavuus haetaan näkyville osumille vasta kirjoitustauon jälkeen (/api/storefront/quotes): palvelimen välimuisti ja
// selaimen oma muisti pitävät Valion API-kutsut vähissä. Tilaus ei tapahdu täällä: nappi vie pyynnön agenttikonsoliin,
// jossa portti tekee allekirjoitetun tarjouksen, mandaattitarkistuksen ja hyväksynnän.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name) => `<span class="icon" aria-hidden="true" style="--icon:url('/storefront-assets/icons/${name}.svg')"></span>`;
const num = (n) => String(+(+n).toFixed(2)).replace('.', ',');
const UNIT = { L: 'l', KG: 'kg', PCS: 'kpl' };
const CLAIM = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu', MARINE_STEWARDSHIP_COUNCIL_LABEL: 'MSC', FAIR_TRADE_MARK: 'Reilu kauppa' };
const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const eur = (n) => `${(+n).toFixed(2).replace('.', ',')} €`;
const DOT = { ok: '', partial: ' warn', late: ' warn', out: ' unavailable', closed: ' unavailable', unknown: ' unknown' };
const QUOTE_PAUSE = 450; // ms kirjoitustaukoa ennen hinta- ja saatavuushakua
const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}.${m}.`; };
const CHECK = '<svg class="ss-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.500 8.500 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const HANDOFF_KEY = 'aimo.ask';

const box = document.querySelector('.store-header .search');
const input = box?.querySelector('input');
if (box && input) {
  const panel = document.createElement('div');
  panel.className = 'ss-panel'; panel.hidden = true; panel.setAttribute('aria-live', 'polite');
  document.querySelector('.store-header').append(panel);
  box.insertAdjacentHTML('beforeend', '<button type="button" class="ss-clear" aria-label="Tyhjennä haku" hidden>' + icon('x') + '</button>');
  const clear = box.querySelector('.ss-clear');
  input.placeholder = 'Hae tai kirjoita mitä tarvitset, esim. laktoositonta kermaa 20 l perjantaiksi';

  let seq = 0; let timer; let last = null;
  const close = () => { panel.hidden = true; };
  const toAgent = () => {
    const text = input.value.trim(); if (!text) return;
    try { sessionStorage.setItem(HANDOFF_KEY, text); } catch { /* ilman tallennusta konsoli avautuu tyhjänä */ }
    location.href = '/agent.html';
  };

  const tile = (p) => `<div class="ss-tile" data-id="${esc(p.id)}" title="${esc(p.name)}">
      <span class="ss-img"><img src="/img/${encodeURIComponent(p.id)}" alt="" loading="lazy" onerror="this.remove()"></span>
      <span class="ss-tname">${esc(p.name)}</span>
      <span class="ss-tmeta">${esc(p.id)}${p.litres ? `, ${num(p.litres)} l` : p.kg ? `, ${num(p.kg)} kg` : ''}</span>
      <span class="ss-quote" aria-busy="true"><span class="ss-skel"></span></span>
    </div>`;

  // Hinta ja saatavuus tulevat erillisellä haulla; tuntematon saatavuus näytetään tuntemattomana, ei saatavilla olevana.
  const quoteHtml = (q) => `<b class="ss-price">${q.price ? `${eur(q.price.net)}<small> / ${esc(q.unitLabel)}</small>` : '<small>hinta ei saatavilla</small>'}</b>
      <span class="ss-stock"><span class="stock-dot${DOT[q.availability.kind] ?? ' unknown'}"></span>${esc(q.availability.text)}</span>`;
  const quoteCache = new Map(); let quoteTimer;
  function paintQuotes(date, info) {
    for (const el of panel.querySelectorAll('.ss-tile')) {
      const q = quoteCache.get(`${date}:${el.dataset.id}`); const slot = el.querySelector('.ss-quote');
      if (q) { slot.innerHTML = quoteHtml(q); slot.removeAttribute('aria-busy'); }
    }
    const note = panel.querySelector('.ss-qnote');
    if (note && info) note.innerHTML = `${icon('calendar-blank')}Hinnat (alv 0 %) ja saatavuus toimituspäivälle ${day(info.deliveryDate)}${info.dateAssumed ? ', oletuspäivä' : ''}${info.mode === 'sim' ? '<b class="ss-sim">simuloitu</b>' : ''}`;
  }
  async function loadQuotes(r, mine) {
    const ids = [...new Set((r.cards || []).flatMap((c) => (c.top || []).map((p) => String(p.id))))];
    if (!ids.length) return;
    let q;
    try {
      const res = await fetch('/api/storefront/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, deliveryDate: r.understood.deliveryDate || undefined }) });
      if (!res.ok) throw new Error(String(res.status));
      q = await res.json();
    } catch { q = null; }
    if (mine !== seq) return;
    if (!q) { for (const slot of panel.querySelectorAll('.ss-quote[aria-busy]')) { slot.innerHTML = '<span class="ss-stock"><span class="stock-dot unknown"></span>Hintaa ja saatavuutta ei saatu</span>'; slot.removeAttribute('aria-busy'); } return; }
    for (const it of q.items) quoteCache.set(`${q.deliveryDate}:${it.productId}`, it);
    paintQuotes(q.deliveryDate, q);
  }

  function need(it, card) {
    const ok = card?.status === 'ok' && card.total > 0;
    const chips = [...(it.claims || []).map((c) => CLAIM[c] || c), it.brand, it.countryOfOrigin === 'fi' ? 'kotimainen' : null].filter(Boolean);
    return `<article class="ss-need${ok ? '' : ' miss'}">
      <div class="ss-what">
        <div class="ss-line">${it.quantity ? `<span class="ss-qty">${num(it.quantity.value)} ${UNIT[it.quantity.unit] || ''}</span>` : ''}<b>${esc(it.productTerm || it.label || it.raw)}</b></div>
        ${chips.length ? `<div class="ss-chips">${chips.map((c) => `<span class="ss-chip">${CHECK}${esc(c)}</span>`).join('')}</div>` : ''}
        <div class="ss-count"><span class="stock-dot${ok ? '' : ' unavailable'}"></span>${ok ? (card.total === 1 ? '1 sopiva tuote' : `${card.total} sopivaa tuotetta`) : esc(card?.reason?.fi || 'Ei sopivia tuotteita')}</div>
      </div>
      <div class="ss-tiles">${(card?.top || []).map(tile).join('')}</div>
    </article>`;
  }

  function render(r, text) {
    if (r.error) { panel.innerHTML = `<div class="container"><p class="ss-warn">${esc(r.error)}</p></div>`; return; }
    const u = r.understood; const items = u.items || [];
    const orderable = !!r.gateway?.requestQuote;
    const notes = (u.assumptions || []).map((a) => a.fi).filter(Boolean);
    panel.innerHTML = `<div class="container">
      <div class="ss-head">
        <h2>${r.recipe?.name ? `${esc(r.recipe.name)}, ${r.recipe.portions} annosta` : 'Näin ymmärsin'}</h2>
        ${u.deliveryDate ? `<span class="ss-date">${icon('calendar-blank')}${day(u.deliveryDate)}</span>` : ''}
        <span class="ss-trace">${icon('clock')}${num(r.trace.ms)} ms, ${r.trace.llmCalls} mallikutsua</span>
      </div>
      ${items.length ? `<div class="ss-needs">${items.map((it, i) => need(it, r.cards[i])).join('')}</div>` : `<p class="ss-warn">${esc(r.summary || 'En löytänyt tuotepyyntöä.')}</p>`}
      ${u.unparsed?.length ? `<p class="ss-warn">En ymmärtänyt: ${esc(u.unparsed.join(', '))}</p>` : ''}
      ${notes.length ? `<ul class="ss-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="ss-foot">
        <span class="ss-qnote"></span>
        <span>${orderable ? 'Tarjouksen ja hyväksynnän hoitaa agentti portin kautta.' : items.length ? 'Lisää määrä, niin agentti voi pyytää tarjouksen.' : ''}</span>
        <button type="button" class="solid-button ss-go"${items.length ? '' : ' disabled'}>${icon('truck')}Pyydä tarjous agentilta</button>
      </div>
    </div>`;
    last = text;
  }

  async function search() {
    const text = input.value.trim(); const mine = ++seq;
    clear.hidden = !input.value;
    if (text.length < 2) { close(); last = null; return; }
    let r;
    try {
      const res = await fetch('/api/aimo/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, llm: false }) });
      r = await res.json();
      if (!res.ok) r = { error: r.error?.message || r.error || 'Haku epäonnistui' };
    } catch { r = { error: 'Hakupalveluun ei saatu yhteyttä.' }; }
    if (mine !== seq) return;
    render(r, text); panel.hidden = false;
    clearTimeout(quoteTimer);
    if (!r.error) quoteTimer = setTimeout(() => loadQuotes(r, mine), QUOTE_PAUSE);
  }

  input.addEventListener('input', () => { clearTimeout(timer); clearTimeout(quoteTimer); timer = setTimeout(search, 160); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) { if (last === input.value.trim()) panel.hidden = false; else search(); } });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { close(); input.blur(); }
    if (ev.key === 'Enter') { ev.preventDefault(); toAgent(); }
  });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; seq++; close(); last = null; input.focus(); });
  panel.addEventListener('click', (ev) => { if (ev.target.closest('.ss-go')) toAgent(); });
  document.addEventListener('click', (ev) => { if (!panel.hidden && !ev.target.closest('.ss-panel, .store-header .search')) close(); });
}
