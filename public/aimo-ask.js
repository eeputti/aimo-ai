// HAKUPANEELI. Otsakkeen hakukenttä on vain avain: klikkaus avaa sivun levyisen valkoisen paneelin, joka kasvaa hakukentän kohdalta.
// Vasemmalla kaksi oikotietä (resepti, valmis tilaus), oikealla tuotteet sitä mukaa kuin kirjoitat.
// Tulkinta tulee Aimon sääntökerroksesta (/api/aimo/interpret, llm: false): näppäily ei maksa mallikutsua eikä Valion API-kutsua.
// Enter tai nappi vie pyynnön agenttikonsoliin (sessionStorage 'aimo.ask'), jossa portti tekee tarjouksen ja hyväksynnän.
// Käyttö: window.aimoAsk.attach({ box, input, icon }) ja window.aimoAsk.open(teksti).
(() => {
  if (window.aimoAsk) return;
  const HANDOFF_KEY = 'aimo.ask';
  const PLACEHOLDER = 'Hae tuotteitasi';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n) => String(+(+n).toFixed(2)).replace('.', ',');
  const money = (n) => `${(+n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const svg = (d, size = 20, fill = false) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
  const I = {
    spark: (s = 20) => svg('<path d="M10 2.500c.5 4.300 2.700 6.500 7 7-4.300.5-6.500 2.700-7 7-.5-4.300-2.700-6.500-7-7 4.300-.5 6.500-2.700 7-7z"/><path d="M18.500 14c.25 2.150 1.350 3.250 3.500 3.500-2.150.25-3.250 1.350-3.500 3.500-.25-2.150-1.350-3.250-3.500-3.500 2.150-.25 3.250-1.350 3.500-3.500z"/>', s, true),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 22),
    recipe: svg('<path d="M7 14.500a4 4 0 1 1 1.600-7.700 4 4 0 0 1 6.800 0A4 4 0 1 1 17 14.500V19H7z"/><path d="M7 16.500h10"/>', 26),
    order: svg('<rect x="5" y="4.500" width="14" height="16" rx="1.500"/><path d="M9 4.500V3h6v1.500M8.500 12.500l2.500 2.500 4.500-5"/>', 26),
    go: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>', 20),
    cal: svg('<rect x="3.500" y="5.500" width="17" height="15" rx="1.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>', 16),
    check: svg('<path d="m5 12.500 4.500 4.500L19 7.500"/>', 14),
    truck: svg('<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6.500" cy="17.500" r="1.800"/><circle cx="17" cy="17.500" r="1.800"/>', 20),
  };
  const UNIT = { L: 'l', KG: 'kg', PCS: 'kpl' };
  const CLAIM = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu', MARINE_STEWARDSHIP_COUNCIL_LABEL: 'MSC', FAIR_TRADE_MARK: 'Reilu kauppa' };
  const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  const WD_GEN = ['Sunnuntain', 'Maanantain', 'Tiistain', 'Keskiviikon', 'Torstain', 'Perjantain', 'Lauantain'];
  const utcDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), d, m }; };
  const day = (iso) => { const t = utcDay(iso); return `${WD[t.wd]} ${t.d}.${t.m}.`; };
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
  const RECIPES = ['Lohikeitto', 'Kanacurry ja riisi', 'Riisipuuro', 'Mustikkarahka'];
  const EXAMPLES = ['1000 litraa maitoa maanantaiksi', 'laktoositonta kermaa 20 l perjantaiksi', 'Lohikeitto 100 annosta maanantaiksi'];

  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/aimo-ask.css';
  document.head.append(css);

  const root = document.createElement('div');
  root.className = 'ask'; root.hidden = true;
  root.innerHTML = `
    <div class="ask-dim" data-close="1"></div>
    <section class="ask-sheet" role="dialog" aria-modal="true" aria-label="Haku ja tilaaminen">
      <div class="ask-in">
        <form class="ask-bar" autocomplete="off">
          <span class="ask-ai">${I.spark(22)}</span>
          <input class="ask-q" type="text" aria-label="Kirjoita mitä tarvitset" placeholder="Kirjoita mitä tarvitset, esim. 1000 litraa maitoa maanantaiksi">
          <button type="button" class="ask-x" data-close="1" aria-label="Sulje haku">${I.close}</button>
        </form>
        <div class="ask-body">
          <aside class="ask-side">
            <div class="ask-card" data-card="recipe">
              <button type="button" class="ask-card-head" aria-expanded="false">
                <span class="ask-ico">${I.recipe}</span>
                <span class="ask-card-txt"><b>Hae tuotteita reseptin perusteella</b><small>Ruoka ja annosmäärä, saat raaka-aineet koriin</small></span>
              </button>
              <div class="ask-recipes" hidden>
                <div class="ask-pills" data-recipes="1">${RECIPES.map((r, i) => `<button type="button" class="ask-pill${i ? '' : ' on'}" data-recipe="${esc(r)}">${esc(r)}</button>`).join('')}</div>
                <div class="ask-pills" data-portions="1">${[20, 50, 100, 200].map((n) => `<button type="button" class="ask-pill${n === 100 ? ' on' : ''}" data-portion="${n}">${n} annosta</button>`).join('')}</div>
              </div>
            </div>
            <a class="ask-card" data-card="order" href="/kitchen.html">
              <span class="ask-card-head">
                <span class="ask-ico">${I.order}</span>
                <span class="ask-card-txt"><b>Katso valmis tilauksesi</b><small>Perustuen aiempiin tilauksiisi</small></span>
              </span>
              <span class="ask-ready" hidden></span>
            </a>
          </aside>
          <div class="ask-main" aria-live="polite"></div>
        </div>
      </div>
    </section>`;
  const sheet = root.querySelector('.ask-sheet'); const dim = root.querySelector('.ask-dim');
  const q = root.querySelector('.ask-q'); const main = root.querySelector('.ask-main');
  const recipes = root.querySelector('.ask-recipes'); const ready = root.querySelector('.ask-ready');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let origin = null; let seq = 0; let timer; let orderable = false;

  const idle = () => {
    orderable = false;
    main.innerHTML = `<div class="ask-idle">
      <span class="ask-idle-ico">${I.spark(30)}</span>
      <p>Tuotteet näkyvät tässä, kun kirjoitat.</p>
      <div class="ask-pills">${EXAMPLES.map((t) => `<button type="button" class="ask-pill" data-example="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>`;
  };

  const tile = (p) => `<div class="ask-tile" data-pid="${esc(p.id)}" title="${esc(p.name)}">
      <span class="ask-img"><img src="/img/${encodeURIComponent(p.id)}" alt="" loading="lazy" onerror="this.remove()"></span>
      <span class="ask-tname">${esc(p.name)}</span>
      <span class="ask-tmeta">${esc(p.id)}${p.litres ? `, ${num(p.litres)} l` : p.kg ? `, ${num(p.kg)} kg` : ''}</span>
      <span class="ask-live" data-live="1"><i class="ask-skel"></i></span>
    </div>`;

  // Hinta ja saatavuus näkyville tuotteille: yksi kevyt lukukutsu, kun kirjoitus on tauonnut. Ei tarjousta eikä merkintää päätösketjuun.
  const AVAIL = { ok: ['ok', 'Saatavilla'], late: ['late', 'Myöhässä'], out: ['no', 'Ei saatavilla'], blocked: ['no', 'Ei tilattavissa'], unknown: ['unk', 'Saatavuus ei tiedossa'] };
  const liveCache = new Map();
  const paint = (date) => {
    for (const el of main.querySelectorAll('.ask-tile[data-pid]')) {
      const v = liveCache.get(`${date}:${el.dataset.pid}`); if (!v) continue;
      const closed = v.cutoffPassed && (v.status === 'ok' || v.status === 'late'); // saatavilla, mutta tilausaikaraja on jo mennyt
      const [cls, label] = closed ? ['no', 'Tilausaika umpeutunut'] : AVAIL[v.status] || AVAIL.unknown;
      const when = !closed && v.deliveryDate && (v.status === 'ok' || v.status === 'late') ? ` ${day(v.deliveryDate)}` : '';
      const stock = !closed && v.status === 'ok' && v.stock != null ? `, varastossa ${num(v.stock)}` : '';
      el.classList.toggle('off', cls === 'no');
      el.querySelector('[data-live]').innerHTML = `${v.priceNet != null ? `<b class="ask-price">${money(v.priceNet)}</b>` : '<span class="ask-noprice">Hinta ei tiedossa</span>'}
        <span class="ask-avail ${cls}"><i></i>${label}${when}${stock}</span>`;
    }
  };
  let liveTimer;
  function loadLive(date, mine) {
    clearTimeout(liveTimer);
    const ids = [...new Set([...main.querySelectorAll('.ask-tile[data-pid]')].map((el) => el.dataset.pid))].slice(0, 12);
    if (!ids.length) return;
    paint(date);
    const missing = ids.filter((id) => !liveCache.has(`${date}:${id}`));
    if (!missing.length) return;
    liveTimer = setTimeout(async () => {
      let items = [];
      try { const res = await fetch(`/console/availability?date=${encodeURIComponent(date)}&ids=${missing.join(',')}`); if (res.ok) items = (await res.json()).items || []; } catch { /* jää tuntemattomaksi */ }
      const got = new Map(items.map((v) => [v.productId, v]));
      if (mine !== seq) { for (const [id, v] of got) liveCache.set(`${date}:${id}`, v); return; }
      for (const id of missing) liveCache.set(`${date}:${id}`, got.get(id) || { status: 'unknown', priceNet: null });
      paint(date);
    }, 450);
  }
  function need(it, card) {
    const ok = card?.status === 'ok' && card.total > 0;
    const chips = [...(it.claims || []).map((c) => CLAIM[c] || c), it.brand, it.countryOfOrigin === 'fi' ? 'kotimainen' : null].filter(Boolean);
    return `<article class="ask-need${ok ? '' : ' miss'}">
      <div class="ask-what">
        <div class="ask-line">${it.quantity ? `<span class="ask-qty">${num(it.quantity.value)} ${UNIT[it.quantity.unit] || ''}</span>` : ''}<b>${esc(it.productTerm || it.label || it.raw)}</b></div>
        ${chips.length ? `<div class="ask-chips">${chips.map((c) => `<span class="ask-chip">${I.check}${esc(c)}</span>`).join('')}</div>` : ''}
        <div class="ask-count"><i class="ask-dot${ok ? '' : ' no'}"></i>${ok ? (card.total === 1 ? '1 sopiva tuote' : `${card.total} sopivaa tuotetta`) : esc(card?.reason?.fi || 'Ei sopivia tuotteita')}</div>
      </div>
      <div class="ask-tiles">${(card?.top || []).map(tile).join('')}</div>
    </article>`;
  }
  function render(r) {
    if (r.error) { orderable = false; main.innerHTML = `<p class="ask-warn">${esc(r.error)}</p>`; return; }
    const u = r.understood || {}; const items = u.items || [];
    orderable = items.length > 0;
    const notes = (u.assumptions || []).map((a) => a.fi).filter(Boolean);
    main.innerHTML = `
      <div class="ask-head">
        <h2>${r.recipe?.name ? `${esc(r.recipe.name)}, ${r.recipe.portions} annosta` : 'Näin ymmärsin'}</h2>
        ${u.deliveryDate ? `<span class="ask-date">${I.cal}${day(u.deliveryDate)}</span>` : ''}
      </div>
      ${items.length ? `<div class="ask-needs${r.recipe ? ' compact' : ''}">${items.map((it, i) => need(it, r.cards?.[i])).join('')}</div>` : `<p class="ask-warn">${esc(r.summary || 'En löytänyt tuotepyyntöä.')}</p>`}
      ${u.unparsed?.length ? `<p class="ask-warn">En ymmärtänyt: ${esc(u.unparsed.join(', '))}</p>` : ''}
      ${notes.length ? `<ul class="ask-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="ask-foot">
        <span>${r.gateway?.requestQuote ? 'Hinta ilman arvonlisäveroa. Tarjouksen ja hyväksynnän hoitaa agentti.' : items.length ? 'Lisää määrä, niin agentti voi pyytää tarjouksen.' : ''}</span>
        <button type="button" class="ask-go"${items.length ? '' : ' disabled'}>${I.truck}Tilaa agentin kautta</button>
      </div>`;
  }
  async function search() {
    const text = q.value.trim(); const mine = ++seq;
    if (text.length < 2) { idle(); return; }
    let r;
    try {
      const res = await fetch('/api/aimo/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, llm: false }) });
      r = await res.json();
      if (!res.ok) r = { error: r.error?.message || r.error || 'Haku epäonnistui' };
    } catch { r = { error: 'Hakupalveluun ei saatu yhteyttä.' }; }
    if (mine !== seq || root.hidden) return;
    render(r);
    if (!r.error) loadLive(r.understood?.deliveryDate || today(), mine);
  }
  const setText = (text) => { q.value = text; q.focus(); clearTimeout(timer); search(); };
  const toAgent = () => {
    const text = q.value.trim(); if (!text) return;
    try { sessionStorage.setItem(HANDOFF_KEY, text); } catch { /* ilman tallennusta konsoli avautuu tyhjänä */ }
    location.href = '/agent.html';
  };

  // Valmis tilaus: keittiön tallennettu ehdotus. Jos sitä ei ole, kortti jää pelkäksi linkiksi.
  async function loadReady() {
    try {
      const p = (await (await fetch('/api/state')).json()).proposal;
      if (!p?.totals) return;
      const thumbs = (p.lines || []).slice(0, 6).map((l) => `<span class="ask-thumb"><img src="/img/${encodeURIComponent(l.productId)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></span>`).join('');
      ready.innerHTML = `<b>${WD_GEN[utcDay(p.deliveryDate).wd]} tilaus on valmiina</b>
        <span class="ask-ready-facts"><span><b>${p.totals.lines}</b> riviä</span><span><b>${money(p.totals.expected)}</b></span><span>${day(p.deliveryDate)}</span></span>
        <span class="ask-thumbs">${thumbs}</span>
        <span class="ask-ready-go">Avaa tilaus${I.go}</span>`;
      ready.hidden = false;
    } catch { /* kortti toimii linkkinä ilman tietoja */ }
  }

  // Paneeli kasvaa hakukentän kohdalta: leikkausalue lähtee kentän reunoista ja avautuu koko paneelin kokoiseksi.
  const clipFrom = () => {
    const s = sheet.getBoundingClientRect(); const b = origin?.getBoundingClientRect();
    if (!b || !b.width) return 'inset(0 0 100% 0)';
    const px = (n) => `${Math.max(0, n).toFixed(1)}px`;
    return `inset(${px(b.top - s.top)} ${px(s.right - b.right)} ${px(s.bottom - b.bottom)} ${px(b.left - s.left)} round 4px)`;
  };
  function open(text = '') {
    if (!root.hidden) { if (text) setText(text); return; }
    if (!root.isConnected) document.body.append(root);
    const b = origin?.getBoundingClientRect();
    sheet.style.top = `${Math.max(0, Math.round((b?.top ?? 0) - 16))}px`;
    root.hidden = false; document.documentElement.classList.add('ask-open');
    q.value = text; if (text) search(); else idle();
    loadReady();
    if (!still()) {
      const body = root.querySelector('.ask-body');
      sheet.animate([{ clipPath: clipFrom() }, { clipPath: 'inset(0 0 0 0 round 0px)' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
      dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
      body.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 120, easing: 'ease-out', fill: 'backwards' });
    }
    q.focus({ preventScroll: true });
  }
  async function close() {
    if (root.hidden) return;
    seq++;
    if (!still()) {
      dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
      await sheet.animate([{ clipPath: 'inset(0 0 0 0 round 0px)' }, { clipPath: clipFrom() }], { duration: 200, easing: 'cubic-bezier(.4,0,.8,.4)' }).finished.catch(() => {});
      dim.getAnimations().forEach((a) => a.cancel());
    }
    root.hidden = true; document.documentElement.classList.remove('ask-open');
    origin?.querySelector('input')?.blur();
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 160); });
  root.querySelector('.ask-bar').addEventListener('submit', (ev) => { ev.preventDefault(); toAgent(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !root.hidden) close(); });
  const recipeText = () => `${recipes.querySelector('[data-recipe].on').dataset.recipe} ${recipes.querySelector('[data-portion].on').dataset.portion} annosta maanantaiksi`;
  root.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close]')) { close(); return; }
    if (ev.target.closest('.ask-go')) { toAgent(); return; }
    const example = ev.target.closest('[data-example]');
    if (example) { setText(example.dataset.example); return; }
    const pill = ev.target.closest('[data-recipe], [data-portion]');
    if (pill) { pill.parentElement.querySelectorAll('.ask-pill').forEach((p) => p.classList.toggle('on', p === pill)); setText(recipeText()); return; }
    const head = ev.target.closest('[data-card="recipe"] .ask-card-head');
    if (head) { recipes.hidden = !recipes.hidden; head.setAttribute('aria-expanded', String(!recipes.hidden)); if (!recipes.hidden) setText(recipeText()); }
  });

  /** Tekee otsakkeen hakukentästä paneelin avaimen: tekoälykuvake, uusi vihjeteksti ja avaus klikkauksesta tai näppäilystä. */
  function attach({ box, input, icon }) {
    if (!box || !input) return;
    if (icon) { const ai = document.createElement('span'); ai.className = 'ask-trigger-ai'; ai.innerHTML = I.spark(20); icon.replaceWith(ai); }
    box.classList.add('ask-trigger');
    input.placeholder = PLACEHOLDER; input.setAttribute('aria-label', PLACEHOLDER); input.readOnly = true; input.setAttribute('aria-haspopup', 'dialog');
    const go = (text) => { origin = box; open(text); };
    box.addEventListener('click', () => go(''));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopImmediatePropagation(); go(''); }
      else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); go(ev.key); }
    }, true);
    origin ||= box;
  }

  window.aimoAsk = { attach, open: (text) => open(text), close };
  // Etusivun otsake (index.html, gateway.html) kytketään suoraan; yhteinen kehys (aimo-shell.js) kutsuu attach-funktiota itse.
  const sf = document.querySelector('.store-header .search');
  if (sf) attach({ box: sf, input: sf.querySelector('input'), icon: sf.querySelector('.icon') });
})();
