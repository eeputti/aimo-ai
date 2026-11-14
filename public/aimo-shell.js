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
    bars: svg('<path d="M5 20v-6M12 20V8M19 20V4"/>', 18),
    bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20a2 2 0 0 0 4 0"/>', 18),
    go: svg('<path d="m9 6 6 6-6 6"/>', 16),
    back: svg('<path d="M19 12H5m6-6-6 6 6 6"/>', 22),
    fwd: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>', 22),
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
  const link = (href, label, count = '') => `<a class="as-link" href="${href}"${href.startsWith('/console') ? ' target="_blank" rel="noopener"' : ''}><span>${label}</span>${count !== '' ? `<small>${count}</small>` : ''}</a>`;
  const cal = { month: null, sel: null };
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
      const s = await load();
      if (!types) {
        try {
          types = (await api('/v1/product-types')).items;
          await Promise.all(types.map(async (t) => { try { t.total = (await api(`/v1/products/search?limit=1&productType=${encodeURIComponent(t.id)}`)).total; } catch { /* määrä jää pois */ } }));
        } catch { types = null; }
      }
      const lines = (s?.orders || []).flatMap((o) => o.lines || []);
      return `${link('/gateway.html#products', `${I.bars}Usein tilatut`, new Set(lines.map((l) => l.productId)).size || '')}
        ${link('/gateway.html#inbox', `${I.bell}Odottaa hyväksyntää`, s ? waitingOf(s).length : '')}
        <hr>
        ${(types || []).map((t) => `<button type="button" class="as-link" data-type="${esc(t.fi)}"><span>${esc(t.fi)}</span><small>${t.total ?? ''}</small>${I.go}</button>`).join('') || empty('Tuoteryhmiä ei saatu ladattua.')}
        <a class="as-more" href="/gateway.html#products">Katso agenttien tilaamat tuotteet</a>`;
    },
    async orders() {
      return `${link('/gateway.html#inbox', 'Tilausten hallinta')}
        ${link('/gateway.html#mandate', 'Mandaatit')}
        ${link('/gateway.html#trail', 'Päätösketju')}
        ${link('/console/watch', 'Raportit: taustavahti')}`;
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
      const today = String(s.clock.now).slice(0, 10);
      const live = s.orders.filter((o) => o.deliveryDate && o.status !== 'rejected');
      const next = live.map((o) => o.deliveryDate).filter((d) => d >= today).sort()[0];
      cal.sel ||= next || today; cal.month ||= cal.sel.slice(0, 7);
      const [y, m] = cal.month.split('-').map(Number);
      const iso = (d) => d.toISOString().slice(0, 10);
      const start = new Date(Date.UTC(y, m - 1, 1)); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      const week = (d) => { const t = new Date(d); t.setUTCDate(t.getUTCDate() + 3); const j = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - j) / 864e5 - 3 + ((j.getUTCDay() + 6) % 7)) / 7); };
      let rows = '';
      for (let w = 0; w < 6; w++) {
        const first = new Date(start); first.setUTCDate(start.getUTCDate() + w * 7);
        rows += `<tr><th>${week(first)}</th>${[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = new Date(first); d.setUTCDate(first.getUTCDate() + i); const k = iso(d);
          const os = live.filter((o) => o.deliveryDate === k);
          const cls = [k.slice(0, 7) !== cal.month ? 'out' : '', k === today ? 'today' : '', os.some((o) => o.status === 'pending_approval' || o.pendingAddition) ? 'open' : os.length ? 'done' : '', k === cal.sel ? 'sel' : ''].join(' ');
          return `<td><button type="button" class="${cls}" data-day="${k}">${d.getUTCDate()}</button></td>`;
        }).join('')}</tr>`;
      }
      const picked = live.filter((o) => o.deliveryDate === cal.sel);
      const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return `<div class="as-cal">
        <div class="as-cal-head"><button type="button" data-cal="-1" aria-label="Edellinen kuukausi">${I.back}</button><b>${title.charAt(0).toUpperCase()}${title.slice(1)}</b><button type="button" data-cal="1" aria-label="Seuraava kuukausi">${I.fwd}</button></div>
        <table><thead><tr><th>VK</th><th>MA</th><th>TI</th><th>KE</th><th>TO</th><th>PE</th><th>LA</th><th>SU</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="as-cal-legend"><span><b>${+today.slice(8)}</b>Kuluva päivä</span><span><i class="done"></i>Vahvistettu tilaus</span><span><i class="sel"></i>Valittu päivä</span><span><i class="open"></i>Odottaa hyväksyntää</span></div>
      </div>
      <h4>Toimitus ${fiDate(cal.sel)}</h4>
      ${picked.map((o) => { const [cls, label] = STATUS[o.status] || ['no', o.status]; return row(`/approve.html?order=${encodeURIComponent(o.orderId)}`, esc(o.orderId), `${esc(o.buyerName)} · ${label}`, `<b>${money(o.totals?.net || 0)}</b>`, cls); }).join('') || empty('Ei tilauksia tälle päivälle.')}`;
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
    const calBtn = ev.target.closest('[data-cal], [data-day]');
    if (calBtn) {
      if (calBtn.dataset.day) { cal.sel = calBtn.dataset.day; cal.month = cal.sel.slice(0, 7); }
      else { const [y, m] = cal.month.split('-').map(Number); cal.month = new Date(Date.UTC(y, m - 1 + +calBtn.dataset.cal, 1)).toISOString().slice(0, 7); }
      const pop = calBtn.closest('.as-pop'); pop.innerHTML = await MENU.date(); return;
    }
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
  let seq = 0; let debounce; let limit = 6;
  const mark = (name, text) => { const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1); return esc(name).split(/(\s+)/).map((w) => (words.some((x) => w.toLowerCase().includes(x)) ? `<b>${w}</b>` : w)).join(''); };
  async function suggest() {
    const text = q.value.trim(); const mine = ++seq;
    if (text.length < 2) { sugg.hidden = true; return; }
    if (!state) await load();
    let r = null;
    try { r = await api(`/v1/products/search?limit=${limit}&q=${encodeURIComponent(text)}`); } catch { /* näytetään vain agenttipainike */ }
    if (mine !== seq) return;
    const items = r?.items || [];
    closeAll(sugg); sugg.hidden = false;
    sugg.innerHTML = `${items.length ? `<table class="as-hits"><thead><tr><th>Tuote</th><th>Tuotemerkki</th><th>Myyntiyksikkö</th><th>Määrä</th></tr></thead><tbody>
      ${items.map((p) => `<tr><td><span class="as-hit"><img src="/img/${encodeURIComponent(p.productId)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span><span class="as-hit-name">${mark(p.name.fi, text)}</span><small>${esc(p.productId)}</small></span></span></td><td>${esc(p.brand || p.vendor || '')}</td><td>${esc(p.salesUnit?.label || 'kpl')}</td>
        <td><span class="as-qty" data-name="${esc(p.name.fi)}" data-unit="${esc(p.salesUnit?.label || 'kpl')}"><button type="button" data-step="-1" aria-label="Vähennä">−</button><input type="text" inputmode="numeric" value="" placeholder="${esc(p.salesUnit?.label || 'kpl')}" aria-label="Määrä: ${esc(p.name.fi)}"><button type="button" data-step="1" aria-label="Lisää">+</button></span></td></tr>`).join('')}
      </tbody></table>` : empty('Ei osumia tuotteista.')}
      ${r?.interpretedAs?.assumptions?.length ? `<p class="as-note">${esc(r.interpretedAs.assumptions.join(' '))}</p>` : ''}
      <div class="as-foot"><span>Löytyi ${r?.total ?? 0} tuotetta</span><span class="as-foot-btns">${r && r.total > items.length && limit < 24 ? '<button type="button" class="as-btn ghost" data-all="1">Kaikki hakutulokset</button>' : ''}<button type="button" class="as-btn" data-agent="1">Pyydä tarjous agentilta</button></span></div>`;
  }
  // Valitut määrät muuttuvat ostopyynnöksi, jonka agentti hoitaa portin kautta: tarjous, mandaatti ja tarvittaessa ihmisen hyväksyntä.
  const request = () => { const picked = [...sugg.querySelectorAll('.as-qty')].map((b) => ({ n: parseInt(b.querySelector('input').value, 10), name: b.dataset.name, unit: b.dataset.unit })).filter((x) => x.n > 0); return picked.length ? picked.map((x) => `${x.n} ${x.unit} ${x.name}`).join(' ja ') : q.value.trim(); };
  q.addEventListener('input', () => { limit = 6; clearTimeout(debounce); debounce = setTimeout(suggest, 180); });
  q.addEventListener('focus', () => { if (q.value.trim().length >= 2 && sugg.hidden) suggest(); });
  sugg.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const step = ev.target.closest('[data-step]');
    if (step) { const input = step.parentElement.querySelector('input'); input.value = Math.max(0, (parseInt(input.value, 10) || 0) + +step.dataset.step) || ''; return; }
    if (ev.target.closest('[data-all]')) { limit = 24; suggest(); return; }
    if (ev.target.closest('[data-agent]')) toAgent(request(), true);
  });
  el.querySelector('#as-search').addEventListener('submit', (ev) => { ev.preventDefault(); seq++; toAgent(sugg.hidden ? q.value.trim() : request(), true); });

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
