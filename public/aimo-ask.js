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
    find: svg('<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>', 18),
    minus: svg('<path d="M6 12h12"/>', 20),
    plus: svg('<path d="M6 12h12M12 6v12"/>', 20),
    own: svg('<path d="M12 3.500 14.600 9l6 .700-4.500 4.100 1.300 5.900L12 16.700 6.600 19.700l1.300-5.900L3.400 9.700l6-.700z"/>', 18),
    cal: svg('<rect x="3.500" y="5.500" width="17" height="15" rx="1.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>', 16),
    check: svg('<path d="m5 12.500 4.500 4.500L19 7.500"/>', 14),
    cart: svg('<path d="M2.5 4h3l2.6 11h10.4l2-8H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>', 18),
    left: svg('<path d="m14 6-6 6 6 6"/>', 22),
    right: svg('<path d="m10 6 6 6-6 6"/>', 22),
    truck: svg('<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6.500" cy="17.500" r="1.800"/><circle cx="17" cy="17.500" r="1.800"/>', 20),
  };
  const UNIT = { L: 'l', KG: 'kg', PCS: 'kpl' };
  const CLAIM = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu', MARINE_STEWARDSHIP_COUNCIL_LABEL: 'MSC', FAIR_TRADE_MARK: 'Reilu kauppa' };
  const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  const WD_GEN = ['Sunnuntain', 'Maanantain', 'Tiistain', 'Keskiviikon', 'Torstain', 'Perjantain', 'Lauantain'];
  const utcDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), d, m }; };
  const day = (iso) => { const t = utcDay(iso); return `${WD[t.wd]} ${t.d}.${t.m}.`; };
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
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
              <button type="button" class="ask-card-head" aria-expanded="false" title="Hae tuotteita reseptin perusteella">
                <span class="ask-ico">${I.recipe}</span>
                <span class="ask-card-txt"><b>Hae tuotteita reseptin perusteella</b><small>Ruoka ja annosmäärä, saat raaka-aineet koriin</small></span>
              </button>
              <div class="ask-recipes" hidden>
                <label class="ask-rq">${I.find}<input class="ask-rinput" type="text" autocomplete="off" placeholder="Mitä valmistat? esim. kermainen lohikeitto" aria-label="Hae reseptiä"></label>
                <div class="ask-step" role="group" aria-label="Annosmäärä">
                  <button type="button" data-step="-1" aria-label="Vähennä annoksia">${I.minus}</button>
                  <label class="ask-step-mid"><input class="ask-portions" type="text" inputmode="numeric" maxlength="4" value="100" aria-label="Annosmäärä"><span>annosta</span></label>
                  <button type="button" data-step="1" aria-label="Lisää annoksia">${I.plus}</button>
                </div>
                <div class="ask-ideas" aria-live="polite"></div>
              </div>
            </div>
            <a class="ask-card" data-card="order" href="/kitchen.html" title="Avaa valmis tilaus ostoskorissa">
              <span class="ask-card-head">
                <span class="ask-ico">${I.order}</span>
                <span class="ask-card-txt"><b>Katso valmis tilauksesi</b><small>Perustuen aiempiin tilauksiisi</small></span>
                <span class="ask-peek" role="button" tabindex="0" aria-expanded="false" aria-label="Näytä tilauksen esikatselu" hidden><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
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
  const recipes = root.querySelector('.ask-recipes'); const ready = root.querySelector('.ask-ready'); const peek = root.querySelector('.ask-peek');
  // Nuoli avaa tilauksen esikatselun; muu osa kortista vie suoraan ostoskoriin.
  const togglePeek = (ev) => { ev.preventDefault(); ev.stopPropagation(); const open = peek.closest('.ask-card').classList.toggle('open'); peek.setAttribute('aria-expanded', String(open)); };
  peek.addEventListener('click', togglePeek);
  peek.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') togglePeek(ev); });
  const rinput = root.querySelector('.ask-rinput'); const pinput = root.querySelector('.ask-portions'); const ideasEl = root.querySelector('.ask-ideas');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let origin = null; let seq = 0; let timer; let orderable = false;
  let voice = null;
  const voiceReady = import('/aimo-voice.js').then(({ attachVoice }) => {
    voice = attachVoice({ root, input: q,
      onBegin: () => { clearTimeout(timer); clearTimeout(liveTimer); seq++; },
      onCancel: () => { clearTimeout(timer); clearTimeout(liveTimer); seq++; },
      onCommit: (text) => { override = null; q.value = text; q.dispatchEvent(new Event('input')); clearTimeout(timer); return search(true); },
    });
    return voice;
  }).catch(() => null); // Sanelun latausvirhe ei estä tavallista hakua.
  // Valittu resepti. override: hakukentässä näkyy ruoan nimi, mutta tulkintaan ja agentille lähtee raaka-ainelista määrineen.
  let portions = 100; let ideas = []; let picked = null; let override = null; let ideaSeq = 0; let ideaTimer;
  // Suodattimet (laktoositon, rasvaton...) ovat rakenteisia muutoksia tulkintaan, eivät uutta tekstiä. Ne nollataan, kun käyttäjä kirjoittaa.
  let patches = []; let last = null; const expanded = new Set();
  const WD_TO = ['sunnuntaiksi', 'maanantaiksi', 'tiistaiksi', 'keskiviikoksi', 'torstaiksi', 'perjantaiksi', 'lauantaiksi'];
  const int = (n) => Number(n).toLocaleString('fi-FI');
  const sent = () => (override && q.value.trim() === override.label ? override.text : q.value.trim());

  const idle = () => {
    orderable = false;
    main.innerHTML = `<div class="ask-idle">
      <span class="ask-idle-ico">${I.spark(30)}</span>
      <p>Tuotteet näkyvät tässä, kun kirjoitat.</p>
      <div class="ask-pills">${EXAMPLES.map((t) => `<button type="button" class="ask-pill" data-example="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>`;
  };

  // Montako myyntiyksikköä pyydetty määrä on tätä tuotetta: 1000 l ja 1 l:n tölkki = 1000, 5 l:n kanisteri = 200.
  const unitsFor = (it, p) => { const v = it?.quantity; if (!v) return 1; const size = v.unit === 'L' ? p.litres : v.unit === 'KG' ? p.kg : 1; return size ? Math.max(1, Math.ceil(v.value / size - 1e-9)) : 1; };
  const tile = (p, it) => `<div class="ask-tile" data-pid="${esc(p.id)}" title="${esc(p.name)}">
      <span class="ask-img"><img src="/img/${encodeURIComponent(p.id)}" alt="" loading="lazy" onerror="this.remove()"></span>
      <span class="ask-tname">${esc(p.name)}</span>
      <span class="ask-tmeta">${esc(p.id)}${p.litres ? `, ${num(p.litres)} l` : p.kg ? `, ${num(p.kg)} kg` : ''}</span>
      <span class="ask-live" data-live="1"><i class="ask-skel"></i></span>
      <button type="button" class="ask-add" data-add="${esc(p.id)}" data-qty="${unitsFor(it, p)}">${I.cart}Lisää ${int(unitsFor(it, p))} koriin</button>
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
      const add = el.querySelector('.ask-add'); if (add && !add.classList.contains('done')) add.disabled = cls === 'no';
      el.querySelector('[data-live]').innerHTML = `${v.priceNet != null ? `<b class="ask-price">${money(v.priceNet)}</b>` : '<span class="ask-noprice">Hinta ei tiedossa</span>'}
        <span class="ask-avail ${cls}"><i></i>${label}${when}${stock}</span>`;
    }
  };
  let liveTimer;
  function loadLive(date, mine) {
    clearTimeout(liveTimer);
    const ids = [...new Set([...main.querySelectorAll('.ask-tile[data-pid]')].map((el) => el.dataset.pid))].slice(0, 48);
    if (!ids.length) return;
    paint(date);
    const missing = ids.filter((id) => !liveCache.has(`${date}:${id}`));
    if (!missing.length) return;
    liveTimer = setTimeout(async () => {
      const items = [];
      for (let i = 0; i < missing.length; i += 12) {
        try { const res = await fetch(`/console/availability?date=${encodeURIComponent(date)}&ids=${missing.slice(i, i + 12).join(',')}`); if (res.ok) items.push(...((await res.json()).items || [])); } catch { /* jää tuntemattomaksi */ }
      }
      const got = new Map(items.map((v) => [v.productId, v]));
      if (mine !== seq) { for (const [id, v] of got) liveCache.set(`${date}:${id}`, v); return; }
      for (const id of missing) liveCache.set(`${date}:${id}`, got.get(id) || { status: 'unknown', priceNet: null });
      paint(date);
    }, 450);
  }
  function need(it, card, i, opt) {
    const ok = card?.status === 'ok' && card.total > 0;
    const all = expanded.has(i);
    const list = (card?.list || card?.top || []).slice(0, all ? 40 : opt.max);
    const fixed = [...(it.claims || []).map((c) => CLAIM[c] || c), it.brand, it.countryOfOrigin === 'fi' ? 'kotimainen' : null].filter(Boolean).filter((c) => !patches.some((p) => p.item === i && p.label.toLowerCase() === String(c).toLowerCase()));
    const on = patches.map((p, k) => (p.item === i ? `<button type="button" class="ask-filter on" data-unfilter="${k}" aria-pressed="true">${I.check}${esc(p.label)}</button>` : '')).join('');
    const more = (card?.chips || []).filter((c) => !patches.some((p) => p.item === i && p.label === c.label)).map((c) => `<button type="button" class="ask-filter" data-filter="${i}:${esc(c.label)}" aria-pressed="false">${esc(c.label)}<small>${c.matches}</small></button>`).join('');
    const count = ok ? (card.total === 1 ? '1 sopiva tuote' : `${card.total} sopivaa tuotetta`) : esc(card?.reason?.fi || 'Ei sopivia tuotteita');
    return `<article class="ask-need${ok ? '' : ' miss'}" data-need="${i}">
      <div class="ask-nhead">
        <div class="ask-line">${it.quantity ? `<span class="ask-qty">${num(it.quantity.value)} ${UNIT[it.quantity.unit] || ''}</span>` : opt.edit ? `<button type="button" class="ask-plus" data-ask="qty" data-item="${i}">${I.plus}Lisää määrä</button>` : ''}<b>${esc(it.productTerm || it.label || it.raw)}</b>
          <span class="ask-count"><i class="ask-dot${ok ? '' : ' no'}"></i>${count}</span></div>
        ${ok && (card.list || card.top || []).length > opt.max ? `<button type="button" class="ask-all" data-all="${i}">${all ? 'Näytä vähemmän' : `Katso hakutulokset${I.go}`}</button>` : ''}
      </div>
      ${fixed.length || on || more ? `<div class="ask-chips">${fixed.map((c) => `<span class="ask-chip">${I.check}${esc(c)}</span>`).join('')}${on}${more}</div>` : ''}
      ${list.length ? `<div class="ask-rail${all ? ' all' : ''}">
        <button type="button" class="ask-arrow prev" data-rail="-1" aria-label="Edelliset tuotteet">${I.left}</button>
        <div class="ask-tiles">${list.map((p) => tile(p, it)).join('')}</div>
        <button type="button" class="ask-arrow next" data-rail="1" aria-label="Seuraavat tuotteet">${I.right}</button>
      </div>` : ''}
      ${all && card.total > list.length ? `<p class="ask-allnote">Näytetään ${list.length} parasta osumaa ${card.total} tuotteesta. Rajaa suodattimilla.</p>` : ''}
    </article>`;
  }
  // Seuraavat kuusi toimituspäivää (ei sunnuntaita): valinta lisää hakuun sanan, jonka sääntökerros jo ymmärtää ("maanantaiksi").
  const dayPills = () => { const out = []; const [y, m, d] = today().split('-').map(Number); for (let k = 1; out.length < 6 && k < 9; k++) { const t = new Date(Date.UTC(y, m - 1, d + k)); if (t.getUTCDay()) out.push(`<button type="button" class="ask-pill" data-day="${WD_TO[t.getUTCDay()]}">${WD[t.getUTCDay()]} ${t.getUTCDate()}.${t.getUTCMonth() + 1}.</button>`); } return out.join(''); };
  function render(r) {
    if (r.error) { orderable = false; main.innerHTML = `<p class="ask-warn">${esc(r.error)}</p>`; return; }
    const u = r.understood || {}; const items = u.items || [];
    orderable = items.length > 0;
    last = r;
    const edit = !override && !r.recipe;
    const max = items.length > 2 ? 4 : 12; // reseptissä monta riviä: vähemmän tuotteita / rivi, jotta hintakyselyt pysyvät kurissa
    const notes = (u.assumptions || []).filter((a) => !['QUANTITY_MISSING', 'DATE_MISSING'].includes(a.code)).map((a) => a.fi).filter(Boolean);
    main.innerHTML = `
      <div class="ask-head">
        <h2>${override ? esc(override.title) : r.recipe?.name ? `${esc(r.recipe.name)}, ${r.recipe.portions} annosta` : 'Näin ymmärsin'}</h2>
        ${u.deliveryDate ? `<span class="ask-date">${I.cal}${day(u.deliveryDate)}</span>` : edit && items.length ? `<span class="ask-dayadd"><button type="button" class="ask-plus" data-ask="date">${I.cal}Lisää toimituspäivä</button></span>` : ''}
        ${override ? `<span class="ask-aitag">${I.spark(14)}Tekoälyn ehdotus, tarkista tuotteet</span>` : ''}
      </div>
      ${items.length ? `<div class="ask-needs${r.recipe ? ' compact' : ''}">${items.map((it, i) => need(it, r.cards?.[i], i, { max, edit })).join('')}</div>` : `<p class="ask-warn">${esc(r.summary || 'En löytänyt tuotepyyntöä.')}</p>`}
      ${u.unparsed?.length ? `<p class="ask-warn">En ymmärtänyt: ${esc(u.unparsed.join(', '))}</p>` : ''}
      ${notes.length ? `<ul class="ask-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="ask-foot">
        <span>${r.gateway?.requestQuote ? 'Hinta ilman arvonlisäveroa. Tarjouksen ja hyväksynnän hoitaa agentti.' : items.length ? 'Lisää määrä, niin agentti voi pyytää tarjouksen.' : ''}</span>
        <button type="button" class="ask-go"${items.length ? '' : ' disabled'}>${I.truck}Tilaa agentin kautta</button>
      </div>`;
  }
  let deepTimer;
  async function search(speech = false) {
    if (override && q.value.trim() !== override.label) { override = null; picked = null; paintIdeas(); }
    const text = sent(); const mine = ++seq;
    if (text.length < 2) { idle(); return; }
    let r;
    try {
      const res = await fetch('/api/aimo/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, llm: speech === true, patches: patches.map(({ item, patch }) => ({ item, patch })) }) });
      r = await res.json();
      if (!res.ok) r = { error: r.error?.message || r.error || 'Haku epäonnistui' };
    } catch { r = { error: 'Hakupalveluun ei saatu yhteyttä.' }; }
    if (mine !== seq || root.hidden) return;
    render(r);
    if (!r.error) loadLive(r.understood?.deliveryDate || today(), mine);
    // Säännöt eivät tunnistaneet sanaa: kirjoitustauon jälkeen kysytään kielimallilta. Vastaus tallentuu palvelimen
    // muistiin, joten sama sana tunnistuu seuraavalla kerralla heti.
    clearTimeout(deepTimer);
    if (!speech && !r.error && (r.trace?.confidence ?? 1) < 0.6 && r.understood?.unparsed?.some((w) => w.length > 2)) {
      deepTimer = setTimeout(() => {
        if (mine !== seq || root.hidden || sent() !== text) return;
        main.insertAdjacentHTML('afterbegin', '<p class="ask-thinking">Selvitän, mitä tarkoitit</p>');
        search(true);
      }, 600);
    }
    return !r.error;
  }
  const setText = (text) => { q.value = text; q.focus({ preventScroll: true }); clearTimeout(timer); search(); };
  const toAgent = () => {
    voice?.cancel();
    const text = sent(); if (!text) return;
    try { sessionStorage.setItem(HANDOFF_KEY, text); } catch { /* ilman tallennusta konsoli avautuu tyhjänä */ }
    location.href = '/agent.html';
  };

  async function addToCart(btn) {
    btn.disabled = true;
    try {
      const res = await fetch('/api/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: btn.dataset.add, qty: +btn.dataset.qty || 1 }) });
      if (!res.ok) throw new Error(String(res.status));
      btn.classList.add('done'); btn.innerHTML = `${I.check}Korissa`; loadReady();
    } catch { btn.disabled = false; btn.textContent = 'Ei onnistunut, yritä uudelleen'; }
  }

  // Valmis tilaus: keittiön tallennettu ehdotus. Jos sitä ei ole, kortti jää pelkäksi linkiksi.
  async function loadReady() {
    try {
      const p = (await (await fetch('/api/state')).json()).proposal;
      if (!p?.totals) return;
      // Näytetään ensin rivit, joissa agentti ehdottaa tavallisesta poikkeavaa määrää, sitten suurimmat.
      const lines = (p.lines || []).filter((l) => l.qty > 0 && l.state !== 'removed');
      const sorted = [...lines].sort((a, b) => Math.abs(b.deltaPct || 0) - Math.abs(a.deltaPct || 0) || (b.total || 0) - (a.total || 0)).slice(0, 18);
      // Kaikilla tuotteilla ei ole kuvaa: kuvalliset ensin, jotta kortti ei täyty nimiruuduista.
      const hasImg = (id) => new Promise((done) => { const im = new Image(); im.onload = () => done(true); im.onerror = () => done(false); im.src = `/img/${encodeURIComponent(id)}`; });
      const ok = await Promise.all(sorted.map((l) => hasImg(l.productId)));
      const shown = [...sorted.filter((_, k) => ok[k]), ...sorted.filter((_, k) => !ok[k])].slice(0, 6);
      // Tilaus näytetään tuotekuvina, ei rivilistana: kuva, määrä kuvan kulmassa ja loput lukuna.
      const thumb = (l) => `<span class="ask-thumb" title="${esc(l.name)}, ${num(l.qty)} ${esc(l.unitLabel || '')}"><img src="/img/${encodeURIComponent(l.productId)}" alt="${esc(l.name)}" loading="lazy" onerror="this.parentElement.classList.add('noimg');this.remove()"><i class="ask-tname">${esc(String(l.name).split(' ').slice(0, 2).join(' '))}</i><i class="ask-tq">${num(l.qty)}</i></span>`;
      ready.innerHTML = `<b>${WD_GEN[utcDay(p.deliveryDate).wd]} tilaus on valmiina</b>
        <span class="ask-thumbs">${shown.map(thumb).join('')}${lines.length > shown.length ? `<span class="ask-thumb more">+${lines.length - shown.length}</span>` : ''}</span>
        <span class="ask-cfoot"><span><b>${p.totals.lines}</b> tuotetta</span><span>${I.cal}${day(p.deliveryDate)}</span><b class="ask-ctotal">${money(p.totals.expected)}</b></span>
        <span class="ask-ready-go">Avaa tilaus${I.go}</span>`;
      ready.hidden = false; peek.hidden = false; // esikatselu pysyy kiinni, kunnes käyttäjä avaa sen nuolesta
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
    const top = Math.max(0, Math.round((b?.top ?? 0) - 16));
    sheet.style.top = `${top}px`;
    // Paneeli alkaa hakukentän kohdalta, joten korkeus rajataan sen alle jäävään ruutuun: muuten alaosa jää näkymättömiin.
    sheet.style.maxHeight = `calc(100dvh - ${top}px)`;
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
    voice?.cancel();
    seq++;
    if (!still()) {
      dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
      await sheet.animate([{ clipPath: 'inset(0 0 0 0 round 0px)' }, { clipPath: clipFrom() }], { duration: 200, easing: 'cubic-bezier(.4,0,.8,.4)' }).finished.catch(() => {});
      dim.getAnimations().forEach((a) => a.cancel());
    }
    root.hidden = true; document.documentElement.classList.remove('ask-open');
    origin?.querySelector('input')?.blur();
  }

  q.addEventListener('input', () => { patches = []; expanded.clear(); clearTimeout(timer); timer = setTimeout(search, 160); });
  root.querySelector('.ask-bar').addEventListener('submit', (ev) => { ev.preventDefault(); toAgent(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !root.hidden) close(); });

  // ---------- reseptihaku ja annoslaskuri ----------
  // Askel kasvaa määrän mukana: alle 50 annosta 5, alle 200 annosta 10, siitä ylöspäin 25. Luvun voi myös kirjoittaa itse.
  const stepAt = (n) => (n < 50 ? 5 : n < 200 ? 10 : 25);
  const bump = (n, dir) => { const st = stepAt(dir > 0 ? n : n - 1); return Math.min(2000, Math.max(1, dir > 0 ? Math.floor(n / st) * st + st : Math.ceil(n / st) * st - st)); };
  const amountText = (v) => { const r = v >= 10 ? Math.round(v) : Math.max(0.1, Math.round(v * 10) / 10); return String(r).replace('.', ','); };
  function paintIdeas(loading = false) {
    const rows = ideas.map((it, i) => `<button type="button" class="ask-idea${picked === it ? ' on' : ''}" data-idea="${i}">
        <span class="ask-idea-ico${it.pinned ? ' own' : ''}">${it.pinned ? I.own : I.spark(16)}</span>
        <span class="ask-idea-txt"><b>${esc(it.name)}</b><small>${esc(it.pinned ? `Oma resepti: ${it.note}` : it.note)}</small></span>
      </button>`).join('');
    ideasEl.innerHTML = `${rows}${loading ? '<span class="ask-idea-load"><i class="ask-skel"></i><i class="ask-skel"></i><i class="ask-skel"></i></span>' : ''}${!rows && !loading ? '<p class="ask-idea-none">Ei ehdotuksia tällä haulla.</p>' : ''}`;
  }
  async function loadIdeas() {
    const text = rinput.value.trim(); const mine = ++ideaSeq;
    if (text.length >= 3) paintIdeas(true);
    let r = null;
    try { const res = await fetch(`/console/recipes?q=${encodeURIComponent(text)}`); if (res.ok) r = await res.json(); } catch { /* lista jää ennalleen */ }
    if (mine !== ideaSeq) return;
    ideas = r?.items || []; if (picked) picked = ideas.find((it) => it.name === picked.name) || picked;
    paintIdeas();
  }
  function runRecipe() {
    if (!picked) return;
    const label = `${picked.name} ${portions} annosta maanantaiksi`;
    override = picked.pinned ? null : { label, title: `${picked.name}, ${portions} annosta`, text: `${picked.ingredients.map((g) => `${amountText(g.amount * portions)} ${g.unit === 'L' ? 'l' : 'kg'} ${g.name}`).join(', ')} maanantaiksi` };
    q.value = label; clearTimeout(timer); search();
  }
  const setPortions = (n) => { portions = Math.min(2000, Math.max(1, Math.round(n) || portions)); pinput.value = portions; runRecipe(); };
  rinput.addEventListener('input', () => { clearTimeout(ideaTimer); ideaTimer = setTimeout(loadIdeas, 420); });
  rinput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ideas.length) { ev.preventDefault(); picked = ideas[0]; paintIdeas(); runRecipe(); } });
  pinput.addEventListener('input', () => { pinput.value = pinput.value.replace(/\D/g, ''); });
  pinput.addEventListener('change', () => setPortions(parseInt(pinput.value, 10)));
  pinput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); pinput.blur(); } if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); setPortions(bump(portions, ev.key === 'ArrowUp' ? 1 : -1)); } });
  pinput.addEventListener('focus', () => pinput.select());
  root.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close]')) { close(); return; }
    if (ev.target.closest('.ask-go')) { toAgent(); return; }
    const hit = (sel) => ev.target.closest(sel);
    const add = hit('[data-add]');
    if (add) { addToCart(add); return; }
    const filter = hit('[data-filter]');
    if (filter) { const [item, label] = [+filter.dataset.filter.split(':')[0], filter.dataset.filter.slice(filter.dataset.filter.indexOf(':') + 1)]; const chip = last?.cards?.[item]?.chips?.find((c) => c.label === label); if (chip) { patches.push({ item, patch: chip.patch, label: chip.label }); search(); } return; }
    const unfilter = hit('[data-unfilter]');
    if (unfilter) { patches.splice(+unfilter.dataset.unfilter, 1); search(); return; }
    const all = hit('[data-all]');
    if (all && last) { const i = +all.dataset.all; if (expanded.has(i)) expanded.delete(i); else expanded.add(i); render(last); loadLive(last.understood?.deliveryDate || today(), seq); return; }
    const rail = hit('[data-rail]');
    if (rail) { const t = rail.parentElement.querySelector('.ask-tiles'); t.scrollBy({ left: +rail.dataset.rail * Math.max(220, t.clientWidth * 0.8), behavior: still() ? 'auto' : 'smooth' }); return; }
    const dayBtn = hit('[data-day]');
    if (dayBtn) { setText(`${q.value.trim()} ${dayBtn.dataset.day}`); return; }
    const unit = hit('[data-unit]');
    if (unit) { // määrä kirjoitetaan hakuun tuotesanan eteen, jolloin se näkyy ja on muokattavissa kuten käsin kirjoitettu
      const box = unit.closest('.ask-qed'); const n = String(box.querySelector('input').value).replace(',', '.'); if (!(+n > 0)) { box.querySelector('input').focus(); return; }
      const term = box.dataset.term; const text = q.value.trim(); const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1; const amount = `${n.replace('.', ',')} ${unit.dataset.unit}`;
      setText(at >= 0 ? `${text.slice(0, at)}${amount} ${text.slice(at)}` : `${amount} ${text}`); return;
    }
    const ask = hit('[data-ask]');
    if (ask?.dataset.ask === 'date') { ask.parentElement.innerHTML = `<span class="ask-pills">${dayPills()}</span>`; return; }
    if (ask?.dataset.ask === 'qty') { const it = last?.understood?.items?.[+ask.dataset.item]; const span = document.createElement('span'); span.className = 'ask-qed'; span.dataset.term = it?.productTerm || ''; span.innerHTML = '<input type="text" inputmode="decimal" value="10" aria-label="Määrä"><button type="button" data-unit="l">l</button><button type="button" data-unit="kg">kg</button><button type="button" data-unit="kpl">kpl</button>'; ask.replaceWith(span); const inp = span.querySelector('input'); inp.focus(); inp.select(); return; }

    const example = ev.target.closest('[data-example]');
    if (example) { setText(example.dataset.example); return; }
    const step = ev.target.closest('[data-step]');
    if (step) { setPortions(bump(portions, +step.dataset.step)); return; }
    const idea = ev.target.closest('[data-idea]');
    if (idea) { picked = ideas[+idea.dataset.idea]; paintIdeas(); runRecipe(); return; }
    const head = ev.target.closest('[data-card="recipe"] .ask-card-head');
    if (head) { recipes.hidden = !recipes.hidden; head.setAttribute('aria-expanded', String(!recipes.hidden)); if (!recipes.hidden) { if (!ideas.length) loadIdeas(); rinput.focus({ preventScroll: true }); } }
  });

  /** Tekee otsakkeen hakukentästä paneelin avaimen: tekoälykuvake, uusi vihjeteksti ja avaus klikkauksesta tai näppäilystä. */
  function attach({ box, input, icon }) {
    if (!box || !input) return;
    if (icon) { const ai = document.createElement('span'); ai.className = 'ask-trigger-ai'; ai.innerHTML = I.spark(20); icon.replaceWith(ai); }
    box.classList.add('ask-trigger');
    input.placeholder = PLACEHOLDER; input.setAttribute('aria-label', PLACEHOLDER); input.readOnly = true; input.setAttribute('aria-haspopup', 'dialog');
    const go = (text) => { origin = box; open(text); };
    voiceReady.then((v) => v?.addTrigger(box, () => go('')));
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
