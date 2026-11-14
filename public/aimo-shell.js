// Yhteinen kehys (palvelupalkki + otsikkoalue) kaikille sivuille. Ladataan tavallisena skriptinä heti <body>:n alussa,
// jotta sivun oma koodi (app.js, gateway.js) löytää elementit #modes, #kitchen, #status ja #chips, kun se käynnistyy.
// Käyttö: <script src="/aimo-shell.js" data-page="gateway | kitchen | approve"></script>
(() => {
  const page = document.currentScript?.dataset.page || 'gateway';
  const svg = (d, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    plane: svg('<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>'),
    store: svg('<path d="M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6"/>'),
    truck: svg('<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
    box: svg('<path d="m12 3 8 4.5v9L12 21l-8-4.500v-9zM4 7.500l8 4.500 8-4.500M12 12v9"/>'),
    chart: svg('<path d="M3 4v16h18M7 15l4-5 3 3 5-7"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    chev: svg('<path d="m6 9 6 6 6-6"/>', 16),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.500 4.500"/>', 22),
    calendar: svg('<rect x="3.500" y="5.500" width="17" height="15" rx="1.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>', 34),
    cart: svg('<path d="M2.500 4h3l2.600 11h10.400l2-8H7"/><circle cx="9.500" cy="19" r="1.400"/><circle cx="17" cy="19" r="1.400"/>', 34),
  };
  const SEARCH = 'Hae tuotteita';
  const compact = page === 'approve';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => `${(+n).toFixed(2).replace('.', ',')} €`;
  const fiDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('fi-FI', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit' });
  const STATUS = { confirmed: ['ok', 'Vahvistettu'], pending_approval: ['wait', 'Odottaa hyväksyntää'], rejected: ['no', 'Hylätty'] };
  // Lyhyet otsikot valikon tapahtumille; koko selitys on konsolin päätösketjussa (gateway.js).
  const NEWS = { ORDER_CONFIRMED: 'Tilaus vahvistettu', ORDER_PENDING_APPROVAL: 'Tilaus odottaa hyväksyntää', ORDER_REJECTED: 'Tilaus hylätty', HUMAN_APPROVED: 'Ihminen hyväksyi', HUMAN_REJECTED: 'Ihminen hylkäsi', OFFER_VERIFICATION_FAILED: 'Muokattu tarjous torjuttu', MANDATE_UPDATED: 'Mandaattia muutettu', DEMO_RESET: 'Demo nollattu' };
  const dd = (id, trigger, cls = '') => `<div class="as-dd ${cls}" data-dd="${id}">${trigger}<div class="as-pop" id="as-pop-${id}" hidden></div></div>`;

  if (!document.querySelector('link[data-aimo-shell]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet'; font.dataset.aimoShell = '1';
    font.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Sofia+Sans+Extra+Condensed:wght@800&display=swap';
    document.head.append(font);
  }
  document.body.classList.add('aimo-page');

  const el = document.createElement('header');
  el.className = `aimo-shell${compact ? ' compact' : ''}`;
  el.innerHTML = `
    <div class="as-top"><div class="as-in">
      <nav class="as-svc" aria-label="Valio Aimon palvelut">
        <a class="as-tab" href="https://www.valioaimo.fi/" target="_blank" rel="noopener">${I.plane}Valioaimo.fi</a>
        <a class="as-tab" href="https://pikatukku.valioaimo.fi/fi" target="_blank" rel="noopener">${I.store}Pikatukku</a>
        <a class="as-tab active" aria-current="true" href="/gateway.html">${I.truck}Toimitustukku</a>
        <a class="as-tab" href="https://valotilaus.fi/fi/all" target="_blank" rel="noopener">${I.box}VALO Tilauspalvelu</a>
        <a class="as-tab" href="https://minunaimo.valioaimo.fi/" target="_blank" rel="noopener">${I.chart}Minun Aimo</a>
      </nav>
      <div class="as-acct">
        <span class="as-cust" id="kitchen">554485 VALIO OY / ALKOHOLI</span>
        ${dd('user', `<button type="button" class="as-acctbtn" aria-haspopup="true" aria-expanded="false">${I.user}<span class="as-name">Junction TestUser</span>${I.chev}</button>`, 'right')}
        <span>FI${I.chev}</span>
      </div>
    </div></div>
    <div class="as-head"><div class="as-in">
      <a class="as-logo" href="${compact ? '#' : '/gateway.html'}" aria-label="Valio Aimo"><img src="/aimo-logo.png" alt="Valio Aimo" width="190" height="66"></a>
      ${compact ? '' : `
      <nav class="as-nav" aria-label="Päävalikko">
        ${dd('products', '<button type="button" aria-haspopup="true" aria-expanded="false">Tuotteet</button>')}
        ${dd('orders', '<button type="button" aria-haspopup="true" aria-expanded="false">Tilaukset</button>')}
        ${dd('news', '<button type="button" aria-haspopup="true" aria-expanded="false">Ajankohtaista</button>')}
      </nav>
      <form class="as-search" id="as-search" role="search" autocomplete="off">${I.search}<input id="as-q" type="text" placeholder="${SEARCH}" aria-label="${SEARCH}"><div class="as-pop as-sugg" id="as-sugg" hidden></div></form>
      <div class="as-right" id="status"></div>`}
    </div></div>
    ${compact ? '' : `<div class="as-strip"><div class="as-in ${page === 'kitchen' ? 'modes' : 'chips'}" id="${page === 'kitchen' ? 'modes' : 'chips'}"></div></div>`}`;
  document.currentScript.replaceWith(el);
  if (compact) return;

  // ---------- yhteinen tila: sama /console/state, jota konsoli lukee ----------
  let state = null; let types = null;
  const load = async () => { try { state = await (await fetch('/console/state')).json(); } catch { /* valikot näyttävät tyhjän tilan */ } return state; };
  const key = () => state?.buyers?.[0]?.demoKey;
  const api = async (path) => (await fetch(path, { headers: { authorization: `Bearer ${key()}` } })).json();
  const row = (href, main, sub, right = '', dot = '') => `<a class="as-row" href="${href}"${href.startsWith('/approve') ? ' target="_blank" rel="noopener"' : ''}>${dot ? `<i class="as-dot ${dot}"></i>` : ''}<span class="as-row-main"><b>${main}</b><small>${sub}</small></span>${right ? `<span class="as-row-right">${right}</span>` : ''}</a>`;
  const empty = (t) => `<p class="as-empty">${t}</p>`;
  const waitingOf = (s) => s.orders.filter((o) => o.status === 'pending_approval' || o.pendingAddition);
  const waitNet = (o) => (o.status === 'pending_approval' ? o.totals?.net || 0 : o.pendingAddition?.addedNet || 0);

  const MENU = {
    async user() {
      return `<h4>Junction TestUser</h4>
        ${row('/gateway.html', 'Agenttiportti', 'Hyväksynnät, mandaatit ja päätösketju')}
        ${row('/', 'Keittiödemo', 'Asiakkaan tilausnäkymä: Ravintola Kulma')}
        ${row('/openapi.json', 'Rajapinta', 'OpenAPI-sopimus ostoagenteille')}
        ${row('/.well-known/agent-gateway.json', 'Portin kuvaus', 'Kyvykkyydet, avaimet ja valvonnan säännöt')}`;
    },
    async products() {
      await load();
      try { types ||= (await api('/v1/product-types')).items; } catch { types = []; }
      return `<h4>Tuoteryhmät</h4>
        ${(types || []).map((t) => `<button type="button" class="as-row" data-type="${esc(t.fi)}"><span class="as-row-main"><b>${esc(t.fi)}</b><small>${esc((t.keywords || []).slice(0, 4).join(', '))}</small></span></button>`).join('') || empty('Tuoteryhmiä ei saatu ladattua.')}
        <a class="as-more" href="/gateway.html#products">Agenttien tilaamat tuotteet</a>`;
    },
    async orders() {
      const s = await load(); if (!s) return empty('Tilauksia ei saatu ladattua.');
      return `<h4>Viimeisimmät tilaukset</h4>
        ${s.orders.slice(0, 6).map((o) => { const [cls, label] = STATUS[o.status] || ['no', o.status]; return row(`/approve.html?order=${encodeURIComponent(o.orderId)}`, esc(o.orderId), `${esc(o.buyerName)} · toimitus ${o.deliveryDate ? fiDate(o.deliveryDate) : 'avoin'}`, `<b>${money(o.totals?.net || 0)}</b><small>${label}</small>`, cls); }).join('') || empty('Yhtään tilausta ei ole vielä tehty.')}
        <a class="as-more" href="/gateway.html#inbox">Hyväksyntää odottavat</a>`;
    },
    async news() {
      const s = await load(); if (!s) return empty('Tapahtumia ei saatu ladattua.');
      const rows = s.ledger.filter((e) => NEWS[e.type]).slice(0, 6);
      return `<h4>Viimeisimmät tapahtumat</h4>
        ${rows.map((e) => row(e.orderId ? `/approve.html?order=${encodeURIComponent(e.orderId)}` : '/gateway.html#trail', NEWS[e.type], `${e.orderId ? `${esc(e.orderId)} · ` : ''}${esc(e.actor)}`, `<small>${hhmm(e.ts)}</small>`)).join('') || empty('Ei vielä tapahtumia.')}
        <a class="as-more" href="/gateway.html#trail">Koko päätösketju${s.chain ? ` · ketju ${s.chain.valid ? 'ehjä' : 'rikki'}` : ''}</a>`;
    },
    async date() {
      const s = await load(); if (!s) return empty('Toimituksia ei saatu ladattua.');
      const today = String(s.clock.now).slice(0, 10); const days = new Map();
      for (const o of s.orders) if (o.deliveryDate >= today && o.status !== 'rejected') days.set(o.deliveryDate, [...(days.get(o.deliveryDate) || []), o]);
      return `<h4>Tulevat toimitukset</h4>
        ${[...days].sort().slice(0, 5).map(([d, os]) => row('/gateway.html#inbox', fiDate(d), `${os.length} tilausta${os[0].cutoffLabel ? ` · tilaa viimeistään ${esc(os[0].cutoffLabel)}` : ''}`, `<b>${money(os.reduce((t, o) => t + (o.totals?.net || 0), 0))}</b>`)).join('') || empty('Ei tulevia toimituksia.')}`;
    },
    async cart() {
      const s = await load(); if (!s) return empty('Koria ei saatu ladattua.');
      const w = waitingOf(s);
      return `<h4>Odottaa hyväksyntääsi</h4>
        ${w.map((o) => row(`/approve.html?order=${encodeURIComponent(o.orderId)}`, esc(o.orderId), `${esc(o.buyerName)} · ${o.status === 'pending_approval' ? `${o.lines?.length || 0} riviä` : 'lisäys tilaukseen'}`, `<b>${money(waitNet(o))}</b>`, 'wait')).join('') || empty('Kori on tyhjä: mikään ei odota hyväksyntää.')}
        ${w.length ? `<div class="as-total"><span>Yhteensä (alv 0 %)</span><b>${money(w.reduce((t, o) => t + waitNet(o), 0))}</b></div>` : ''}
        <a class="as-more" href="/gateway.html#inbox">Siirry hyväksymään</a>`;
    },
  };

  // ---------- pudotusvalikot ----------
  const closeAll = (except) => el.querySelectorAll('.as-pop:not([hidden])').forEach((p) => { if (p !== except) { p.hidden = true; p.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); } });
  el.addEventListener('click', async (ev) => {
    const typeBtn = ev.target.closest('[data-type]');
    if (typeBtn) { closeAll(); const q = el.querySelector('#as-q'); q.value = typeBtn.dataset.type; q.focus(); suggest(); return; }
    if (ev.target.closest('.as-pop')) { if (ev.target.closest('a')) closeAll(); return; }
    const box = ev.target.closest('.as-dd'); if (!box) return;
    const pop = box.querySelector('.as-pop'); const open = pop.hidden;
    closeAll();
    if (!open) return;
    pop.hidden = false; box.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'true');
    pop.innerHTML = empty('Ladataan…');
    pop.innerHTML = await MENU[box.dataset.dd]();
  });
  document.addEventListener('click', (ev) => { if (!el.contains(ev.target)) closeAll(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeAll(); });

  // ---------- haku: tuote-ehdotukset katalogista; Enter antaa tekstin ostopyyntönä agentille ----------
  const target = page === 'kitchen' ? { form: '#composer', input: '#input' } : { form: '#ask', input: '#askText' };
  const q = el.querySelector('#as-q'); const sugg = el.querySelector('#as-sugg');
  const toAgent = (text, submit) => {
    const form = document.querySelector(target.form); const input = document.querySelector(target.input);
    if (!text || !form || !input) return;
    input.value = text; q.value = ''; closeAll();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (submit) form.requestSubmit(); else input.focus({ preventScroll: true });
  };
  let seq = 0; let debounce;
  async function suggest() {
    const text = q.value.trim(); const mine = ++seq;
    if (text.length < 2) { sugg.hidden = true; return; }
    if (!state) await load();
    let r = null;
    try { r = await api(`/v1/products/search?limit=6&q=${encodeURIComponent(text)}`); } catch { /* näytetään vain agenttirivi */ }
    if (mine !== seq) return;
    const items = r?.items || [];
    closeAll(sugg); sugg.hidden = false;
    sugg.innerHTML = `<button type="button" class="as-row agent" data-agent="1"><span class="as-row-main"><b>Anna ostopyyntönä agentille</b><small>”${esc(text)}”</small></span><span class="as-row-right"><small>Enter ↵</small></span></button>
      ${items.length ? `<h4>Tuotteet${r.total > items.length ? ` · ${items.length} / ${r.total}` : ''}</h4>` : empty('Ei osumia tuotteista.')}
      ${items.map((p) => `<button type="button" class="as-row prod" data-name="${esc(p.name.fi)}"><img src="/img/${encodeURIComponent(p.productId)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="as-row-main"><b>${esc(p.name.fi)}</b><small>${esc(p.productId)} · ${esc(p.brand || p.vendor || '')}</small></span><span class="as-row-right"><small>/ ${esc(p.salesUnit?.label || 'kpl')}</small></span></button>`).join('')}`;
  }
  q.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(suggest, 180); });
  q.addEventListener('focus', () => { if (q.value.trim().length >= 2) suggest(); });
  sugg.addEventListener('click', (ev) => {
    const b = ev.target.closest('.as-row'); if (!b) return;
    ev.stopPropagation();
    if (b.dataset.agent) toAgent(q.value.trim(), true); else toAgent(b.dataset.name, false);
  });
  el.querySelector('#as-search').addEventListener('submit', (ev) => { ev.preventDefault(); seq++; toAgent(q.value.trim(), true); });

  // Konsolissa oikea reuna: toimituspäivä ja kori (keittiödemossa app.js täyttää saman paikan omalla tilauksellaan).
  if (page !== 'gateway') return;
  const right = el.querySelector('#status');
  async function refresh() {
    const s = await load(); if (!s) return;
    const open = right.querySelector('.as-pop:not([hidden])')?.id;
    const today = String(s.clock.now).slice(0, 10);
    const upcoming = s.orders.filter((o) => o.deliveryDate >= today && o.status !== 'rejected');
    const next = upcoming.map((o) => o.deliveryDate).sort()[0];
    const waiting = waitingOf(s);
    right.innerHTML = `
      ${dd('date', `<button type="button" class="hd-item" aria-haspopup="true" aria-expanded="false" title="Seuraava toimituspäivä ja sille menevät tilaukset">${I.calendar}${next ? `<i class="hd-badge">${upcoming.filter((o) => o.deliveryDate === next).length}</i>` : ''}<span class="hd-txt"><span>Toimituspäivä</span><b>${fiDate(next || today)}</b></span></button>`, 'right')}
      ${dd('cart', `<button type="button" class="hd-item" aria-haspopup="true" aria-expanded="false" title="Ihmisen hyväksyntää odottavat tilaukset ja lisäykset">${I.cart}<i class="hd-badge">${waiting.length}</i><span class="hd-txt"><span>Ostoskori</span><b>${money(waiting.reduce((t, o) => t + waitNet(o), 0))}</b></span></button>`, 'right')}`;
    if (open) { const pop = right.querySelector(`#${open}`); pop.hidden = false; pop.innerHTML = await MENU[pop.parentElement.dataset.dd](); }
  }
  refresh();
  let timer;
  new EventSource('/console/events').addEventListener('ledger', () => { clearTimeout(timer); timer = setTimeout(refresh, 300); });
})();
