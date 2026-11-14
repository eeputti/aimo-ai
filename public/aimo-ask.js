// HAKUPANEELI. Otsakkeen hakukenttä on vain avain: klikkaus avaa sivun levyisen valkoisen paneelin, joka kasvaa hakukentän kohdalta.
// Haku on päätoiminto. Resepti ja historiaan perustuva tilausehdotus ovat pienet oikotiet.
// Saatavuus tarkistetaan valitulle toimituspäivälle ennen tuotteiden näyttämistä.
// Etusivun Kokoa ostoskori valmistaa valinnat samaan selaimen koriin. Erillinen agenttikonsoli säilyy debug-polulla.
// Käyttö: window.aimoAsk.attach({ box, input, icon }) ja window.aimoAsk.open(teksti).
(() => {
  if (window.aimoAsk) return;
  const HANDOFF_KEY = 'aimo.ask';
  const COLLECTION_RETURN_KEY = 'aimo.ask.collection-return';
  const intentReady = import('/aimo-request-intent.js').catch(() => null);
  const quantityReady = import('/aimo-search-quantity.js');
  let collectionLinksFor = () => [];
  let collectionBrowseRequest = () => false;
  const collectionsReady = import('/aimo-collections.js').then((module) => { collectionLinksFor = module.collectionLinksFor; collectionBrowseRequest = module.collectionBrowseRequest; }).catch(() => {});
  let cartSelection = () => ({ enabled: false, missingQuantity: -1, entries: [] });
  const cartActionsReady = import('/storefront-cart-actions.js');
  const selectionReady = import('/aimo-cart-selection.js').then((m) => { cartSelection = m.cartSelection; });
  const deliveryReady = import('/delivery-date.js');
  let recipeContext = null;
  const storefrontCart = window.aimoCart || null;
  const PLACEHOLDER = 'Hae tuotteita tai kerro mitä tarvitset';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n) => String(+(+n).toFixed(4)).replace('.', ',');
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
  const EXAMPLES = ['1000 litraa maitoa maanantaiksi', 'laktoositonta kermaa 20 l perjantaiksi', '5 kg voita ja 20 l kermaa maanantaiksi'];

  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/aimo-ask.css';
  document.head.append(css);

  const root = document.createElement('div');
  root.className = 'ask'; root.hidden = true;
  root.innerHTML = `
    <div class="ask-dim" data-close="1"></div>
    <section class="ask-sheet" role="dialog" aria-modal="true" aria-label="Haku ja tilaaminen">
      <div class="ask-in">
        <div class="ask-bar-slot"><form class="ask-bar" autocomplete="off">
          <span class="ask-ai">${I.spark(22)}</span>
          <input class="ask-q" type="text" aria-label="Kirjoita mitä tarvitset" placeholder="Kirjoita mitä tarvitset, esim. 1000 litraa maitoa maanantaiksi">
          <button type="button" class="ask-x" data-close="1" aria-label="Sulje haku">${I.close}</button>
        </form></div>
        ${storefrontCart ? '<label class="ask-delivery">Toimituspäivä<input class="ask-delivery-input" type="date" required aria-label="Haun toimituspäivä"></label>' : ''}
        <div class="ask-body">
          <aside class="ask-side">
            <div class="ask-card" data-card="recipe">
              <a class="ask-card-head" href="/recipes.html" title="Lisää reseptistä">
                <span class="ask-ico">${I.recipe}</span>
                <span class="ask-card-txt"><b>Lisää reseptistä</b><small>Tuo menu, kuva tai oma resepti</small></span>
              </a>
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
            <a class="ask-card" data-card="order" href="/kitchen.html" title="Avaa aiempiin tilauksiin perustuva ehdotus">
              <span class="ask-card-head">
                <span class="ask-ico">${I.order}</span>
                <span class="ask-card-txt"><b>Katso tilausehdotus</b><small>Perustuu aiempiin tilauksiisi</small></span>
                <span class="ask-peek" role="button" tabindex="0" aria-expanded="false" aria-label="Näytä tilausehdotuksen esikatselu" hidden><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
              </span>
              <span class="ask-ready" hidden></span>
            </a>
          </aside>
          <div class="ask-main" aria-live="polite"></div>
        </div>
      </div>
    </section>`;
  const sheet = root.querySelector('.ask-sheet'); const dim = root.querySelector('.ask-dim');
  const bar = root.querySelector('.ask-bar'); const barSlot = root.querySelector('.ask-bar-slot');
  const q = root.querySelector('.ask-q'); const main = root.querySelector('.ask-main');
  const recipes = root.querySelector('.ask-recipes'); const ready = root.querySelector('.ask-ready'); const peek = root.querySelector('.ask-peek');
  // Nuoli avaa esikatselun; muu osa kortista vie historiaan perustuvaan ehdotukseen.
  const togglePeek = (ev) => { ev.preventDefault(); ev.stopPropagation(); const open = peek.closest('.ask-card').classList.toggle('open'); peek.setAttribute('aria-expanded', String(open)); };
  peek.addEventListener('click', togglePeek);
  peek.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') togglePeek(ev); });
  const rinput = root.querySelector('.ask-rinput'); const pinput = root.querySelector('.ask-portions'); const ideasEl = root.querySelector('.ask-ideas');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let origin = null; let seq = 0; let timer; let orderable = false; let searchClosed = true;
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
  // Määrän muutos kohdistetaan tulkitulle riville. Se nollataan, kun käyttäjä kirjoittaa.
  let patches = []; let last = null; const expanded = new Set();
  let observedDate = storefrontCart?.get().selectedDate;
  let syncingDate = false;
  const deliveryInput = root.querySelector('.ask-delivery-input');
  if (deliveryInput) deliveryInput.value = observedDate;
  const WD_TO = ['sunnuntaiksi', 'maanantaiksi', 'tiistaiksi', 'keskiviikoksi', 'torstaiksi', 'perjantaiksi', 'lauantaiksi'];
  const int = (n) => Number(n).toLocaleString('fi-FI');
  const sent = () => (override && q.value.trim() === override.label ? override.text : q.value.trim());

  const idle = () => {
    orderable = false;
    main.innerHTML = `<div class="ask-idle">
      <span class="ask-idle-ico">${I.spark(30)}</span>
      <p>Mitä tarvitset seuraavaan toimitukseen?</p>
      <div class="ask-pills">${EXAMPLES.map((t) => `<button type="button" class="ask-pill" data-example="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>`;
  };

  const selectedNeeds = new Set();
  const tile = (p, it) => `<div class="ask-tile" data-pid="${esc(p.id)}" title="${esc(p.name)}">
      <span class="ask-img"><img src="/img/${encodeURIComponent(p.id)}" alt="" loading="lazy" onerror="this.remove()"></span>
      <span class="ask-tname">${esc(p.name)}</span>
      <span class="ask-tmeta">${esc(p.id)}${p.litres ? `, ${num(p.litres)} l` : p.kg ? `, ${num(p.kg)} kg` : ''}</span>
      ${p.quantityExplanation ? `<span class="ask-tmeta">${esc(p.quantityExplanation.text)}</span>` : ''}
      <span class="ask-live"><b class="ask-price">${money(p.price)}<small> / ${esc(p.unitLabel || p.unit || 'pakkaus')}</small></b>${Number.isFinite(p.comparison) && p.comparisonUnit ? `<span class="ask-comparison">${money(p.comparison)} / ${esc(UNIT[p.comparisonUnit] || p.comparisonUnit.toLowerCase())}</span>` : ''}<span class="ask-avail ok"><i></i>Saatavilla ${day(p.availability.deliveryDate)}${p.availability.stock == null ? ', saldo ei tiedossa' : ''}</span></span>
      ${p.substituteFor ? `<span class="ask-sub">Korvaaja tuotteelle ${esc(p.substituteFor.name)}. Tarkista sopivuus ostoskorissa.</span>` : ''}
      <button type="button" class="ask-add" data-add="${esc(p.id)}" data-qty="${p.qty}">${I.cart}Lisää ${num(p.qty)} koriin</button>
    </div>`;
  let liveTimer;
  const collectionNavigation = (item) => {
    const links = collectionLinksFor(item);
    if (!links.length) return '';
    return `<nav class="ask-collections" aria-label="Tuoteryhmät: ${esc(item.productTerm || item.label || item.raw)}"><span>Selaa koko tuoteryhmää</span><div>${links.map((link, i) => {
      const href = `${link.href}&q=${encodeURIComponent(sent())}&from=${encodeURIComponent(location.pathname === '/cart.html' ? '/cart.html' : '/')}`;
      return `<a href="${esc(href)}"${i ? ' class="ask-collection-parent"' : ''}>${esc(i ? link.allLabel : link.name)}${I.go}</a>`;
    }).join('')}</div></nav>`;
  };
  function need(it, card, i, opt) {
    const ok = card?.status === 'ok' && card.total > 0;
    const all = expanded.has(i);
    const list = (card?.list || card?.top || []).slice(0, all ? 80 : opt.max);
    const fixed = [...(it.claims || []).map((c) => CLAIM[c] || c), it.brand, it.countryOfOrigin === 'fi' ? 'kotimainen' : null,
      { 'fat-free': 'rasvaton', 'semi-skimmed': 'kevyt', whole: 'täysrasvainen' }[it.attributes?.fat],
      it.attributes?.state === 'frozen' ? 'pakaste' : null, it.attributes?.treatment === 'uht' ? 'UHT' : null].filter(Boolean);
    const term = it.productTerm || it.label || it.raw;
    return `<article class="ask-need" data-need="${i}">
      <div class="ask-nhead">
        <div class="ask-line"><b>${esc(term)}</b>${opt.edit ? `<button type="button" class="ask-plus${it.quantity ? ' ask-quantity' : ''}" data-ask="qty" data-item="${i}" aria-label="${it.quantity ? 'Muuta' : 'Lisää'} tuotteen ${esc(term)} määrä">${it.quantity ? `${num(it.quantity.value)} ${it.quantity.unit === 'PCS' ? it.quantity.basis === 'items' ? 'kpl' : 'pakkausta' : UNIT[it.quantity.unit]}<small>Muuta</small>` : `${I.plus}Lisää määrä`}</button>` : it.quantity ? `<span class="ask-qty">${num(it.quantity.value)} ${UNIT[it.quantity.unit] || ''}</span>` : ''}</div>
        ${ok && (card.list || card.top || []).length > opt.max ? `<button type="button" class="ask-all" data-all="${i}" aria-expanded="${all}">${all ? 'Näytä vähemmän' : `Näytä kaikki ${card.total} hakutulosta${I.go}`}</button>` : ''}
      </div>
      ${fixed.length ? `<p class="ask-requirements">${fixed.map(esc).join(' · ')}</p>` : ''}
      ${collectionNavigation(it)}
      ${!ok ? `<p class="ask-no-products">${esc(card?.reason?.fi || 'Kokeile toista hakusanaa tai toimituspäivää.')}${storefrontCart && card?.reason?.nextDeliveryDate ? ` Aikaisin toimitus on ${day(card.reason.nextDeliveryDate)} <button type="button" class="ask-plus" data-next-date="${esc(card.reason.nextDeliveryDate)}">${I.cal}Vaihda päivä</button>` : ''}</p>` : ''}
      ${list.length ? `<div class="ask-rail${all ? ' all' : ''}">
        <button type="button" class="ask-arrow prev" data-rail="-1" aria-label="Edelliset tuotteet">${I.left}</button>
        <div class="ask-tiles">${list.map((p) => tile(p, it)).join('')}</div>
        <button type="button" class="ask-arrow next" data-rail="1" aria-label="Seuraavat tuotteet">${I.right}</button>
      </div>` : ''}
      ${all && card.total > list.length ? `<p class="ask-allnote">Näytetään ${list.length} parasta osumaa ${card.total} tuotteesta. Tarkenna hakusanaa tai selaa tuoteryhmää.</p>` : ''}
    </article>`;
  }
  // Seuraavat kuusi toimituspäivää (ei sunnuntaita): valinta lisää hakuun sanan, jonka sääntökerros jo ymmärtää ("maanantaiksi").
  const dayPills = () => { const out = []; const [y, m, d] = today().split('-').map(Number); for (let k = 1; out.length < 6 && k < 9; k++) { const t = new Date(Date.UTC(y, m - 1, d + k)); if (t.getUTCDay()) out.push(`<button type="button" class="ask-pill" data-day="${WD_TO[t.getUTCDay()]}">${WD[t.getUTCDay()]} ${t.getUTCDate()}.${t.getUTCMonth() + 1}.</button>`); } return out.join(''); };
  function render(r) {
    if (r.error) { orderable = false; main.innerHTML = `<p class="ask-warn">${esc(r.error)}</p>`; return; }
    const u = r.understood || {}; const items = u.items || [];
    orderable = cartSelection(r, selectedNeeds).enabled;
    last = r;
    if (!items.length) {
      const navigation = collectionNavigation({ productTerm: sent() });
      main.innerHTML = navigation || '<div class="ask-empty"><p>Kokeile tuotteen nimeä, esimerkiksi maito.</p></div>';
      return;
    }
    const edit = !override && !r.recipe;
    const max = items.length > 2 ? 4 : 12; // reseptissä monta riviä: vähemmän tuotteita / rivi, jotta hintakyselyt pysyvät kurissa
    const notes = (u.assumptions || []).filter((a) => !['QUANTITY_MISSING', 'DATE_MISSING', 'UNKNOWN_WORD'].includes(a.code)).map((a) => a.fi).filter(Boolean);
    const count = new Set((r.cards || []).flatMap((card) => (card.list || card.top || []).map((p) => p.id))).size;
    main.innerHTML = `
      <div class="ask-head">
        <div class="ask-heading">${override || r.recipe?.name ? `<h2>${override ? esc(override.title) : `${esc(r.recipe.name)}, ${r.recipe.portions} annosta`}</h2>` : ''}
          ${count ? `<p class="ask-count"><i class="ask-dot"></i>Löysin sinulle ${count === 1 ? '1 tuotteen' : `${count} tuotetta`}.</p>` : ''}</div>
        ${!storefrontCart && r.deliveryDate ? `<span class="ask-date">${I.cal}${day(r.deliveryDate)}</span>` : !storefrontCart && edit ? `<span class="ask-dayadd"><button type="button" class="ask-plus" data-ask="date">${I.cal}Lisää toimituspäivä</button></span>` : ''}
        ${override ? `<span class="ask-aitag">${I.spark(14)}Tekoälyn ehdotus, tarkista tuotteet</span>` : ''}
      </div>
      <div class="ask-needs${r.recipe ? ' compact' : ''}">${items.map((it, i) => need(it, r.cards?.[i], i, { max, edit })).join('')}</div>
      ${notes.length ? `<ul class="ask-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="ask-foot">
        <span>${storefrontCart ? 'Hinnat ilman arvonlisäveroa.' : r.gateway?.requestQuote ? 'Hinta ilman arvonlisäveroa. Tarjouksen ja hyväksynnän hoitaa agentti.' : ''}</span>
        <button type="button" class="ask-go"${orderable ? '' : ' disabled'}>${storefrontCart ? I.cart + 'Kokoa ostoskori' : I.truck + 'Tilaa agentin kautta'}</button>
      </div>`;
  }
  async function fetchSearch(text, speech, deliveryDate, requestedPatches = []) {
    const res = await fetch('/api/storefront/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, deliveryDate, llm: speech === true, patches: requestedPatches }) });
    const r = await res.json();
    return res.ok ? r : { error: r.error?.message || r.error || 'Haku epäonnistui' };
  }
  function openRecipeRequest(routed) {
    voice?.cancel();
    const params = new URLSearchParams({ q: routed.recipe.query });
    if (routed.recipe.portions != null) params.set('portions', routed.recipe.portions);
    if (routed.recipe.deliveryText) params.set('when', routed.recipe.deliveryText);
    if (routed.productText) params.set('extra', routed.productText);
    location.href = `/recipes.html?${params}`;
    return true;
  }
  let deepTimer;
  async function search(speech = false) {
    if (searchClosed || root.hidden) return;
    if (override && q.value.trim() !== override.label) { override = null; picked = null; paintIdeas(); }
    const text = sent(); const mine = ++seq;
    orderable = false; last = null;
    if (text.length < 2) { idle(); return; }
    const intent = await intentReady;
    await collectionsReady;
    await selectionReady;
    await storefrontCart?.ready;
    if (mine !== seq || root.hidden) return;
    if (collectionBrowseRequest(text)) {
      clearTimeout(deepTimer);
      render({ understood: { items: [] }, cards: [] });
      return true;
    }
    const requestedDate = storefrontCart?.get().selectedDate;
    if (!override && recipeContext?.label !== q.value) {
      const routed = intent?.routeRequest(text);
      if (routed?.recipe) return openRecipeRequest(routed, text, speech, mine);
      recipeContext = null;
    }
    const context = recipeContext?.label === q.value ? recipeContext : null;
    const offset = context?.productCount || 0;
    const recipePatches = context?.productText ? patches.filter((p) => p.item >= offset).map(({ item, patch }) => ({ item: item - offset, patch })) : patches.map(({ item, patch }) => ({ item, patch }));
    let r;
    try {
      main.innerHTML = '<p class="ask-thinking">Tarkistan tuotteet ja saatavuuden…</p>';
      r = await fetchSearch(text, speech, requestedDate, recipePatches);
      if (context?.productText && !r.error) {
        const products = await fetchSearch(context.productText, speech || context.speech, r.deliveryDate, patches.filter((p) => p.item < offset).map(({ item, patch }) => ({ item, patch })));
        if (mine !== seq || root.hidden) return;
        context.productCount = products.understood?.items?.length || 0;
        r = intent.combineSearchResults(products, r);
      }
    } catch (error) { r = { error: error instanceof TypeError || error instanceof SyntaxError ? 'Hakupalveluun ei saatu yhteyttä.' : error.message || 'Hakupalveluun ei saatu yhteyttä.' }; }
    if (mine !== seq || root.hidden || searchClosed || storefrontCart && requestedDate !== storefrontCart.get().selectedDate) return;
    if (!r.error && storefrontCart && r.deliveryDate !== storefrontCart.get().selectedDate) {
      // Only the latest completed request may update the shared selection.
      syncingDate = true;
      try { storefrontCart.select(r.deliveryDate); selectedNeeds.clear(); }
      finally { syncingDate = false; }
    }
    render(r);
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
  const setText = (text) => { recipeContext = null; root.classList.remove('ask-recipe-mode'); q.value = text; q.focus({ preventScroll: true }); selectedNeeds.clear(); clearTimeout(timer); search(); };
  async function refreshDeliveryDate(date) {
    clearTimeout(timer); clearTimeout(deepTimer); clearTimeout(portionTimer);
    const mine = ++seq; orderable = false; last = null; selectedNeeds.clear();
    main.innerHTML = '<p class="ask-thinking">Tarkistan tuotteet ja saatavuuden…</p>';
    const { withDeliveryDate } = await deliveryReady;
    if (mine !== seq || root.hidden || searchClosed) return;
    const label = withDeliveryDate(q.value, date);
    if (override) override = { ...override, label, text: withDeliveryDate(override.text, date) };
    if (recipeContext) {
      recipeContext.deliveryText = date;
      if (recipeContext.productText) recipeContext.productText = withDeliveryDate(recipeContext.productText, date);
      if (recipeContext.label) recipeContext.label = label;
    }
    if (q.value.trim()) { q.value = label; search(); }
    else idle();
  }
  if (storefrontCart) {
    window.addEventListener('aimo:cart-change', () => {
      const date = storefrontCart.get().selectedDate;
      if (deliveryInput) deliveryInput.value = date;
      if (date === observedDate) return;
      observedDate = date;
      if (!syncingDate && !root.hidden && !searchClosed) refreshDeliveryDate(date);
    });
    deliveryInput.addEventListener('change', () => {
      if (!deliveryInput.value) { deliveryInput.value = storefrontCart.get().selectedDate; return; }
      try { storefrontCart.select(deliveryInput.value); }
      catch { deliveryInput.value = storefrontCart.get().selectedDate; }
    });
  }
  async function addProducts(entries, date) {
    const result = last; const generation = seq;
    const { addReviewedProducts } = await cartActionsReady;
    await addReviewedProducts(storefrontCart, entries, date, { beforeCommit: () => {
      if (last !== result || seq !== generation || searchClosed) throw new Error('Haku muuttui. Tarkista tuotteet ennen lisäämistä.');
    } });
  }
  const toAgent = async () => {
    voice?.cancel();
    if (storefrontCart) {
      if (!orderable || !last) return;
      const selection = cartSelection(last, selectedNeeds);
      if (selection.missingQuantity >= 0) {
        const item = selection.missingQuantity;
        const field = main.querySelector(`.ask-qed[data-item="${item}"] input`);
        if (field) field.focus();
        else main.querySelector(`[data-ask="qty"][data-item="${item}"]`)?.click();
        return;
      }
      const button = main.querySelector('.ask-go'); button.disabled = true;
      try {
        const entries = selection.entries;
        if (entries.length) await addProducts(entries, last.deliveryDate);
        await close();
        location.href = '/cart.html#tarkista';
      } catch (e) { button.disabled = false; main.insertAdjacentHTML('beforeend', `<p class="ask-warn">${esc(e.message)}</p>`); }
      return;
    }
    const text = sent(); if (!text) return;
    try {
      const { quantityLabel } = await quantityReady;
      const refinements = patches.map((p) => ({ ...p, label: p.label || (p.patch.quantity ? `${num(p.patch.quantity.value)} ${quantityLabel(p.patch.quantity)}` : 'Tarkennus') }));
      sessionStorage.setItem(`${HANDOFF_KEY}.patches`, JSON.stringify({ text, patches: refinements }));
      sessionStorage.setItem(HANDOFF_KEY, text);
    } catch { /* ilman tallennusta konsoli avautuu tyhjänä */ }
    location.href = '/agent.html';
  };

  async function addToCart(btn) {
    btn.disabled = true;
    try {
      if (storefrontCart) {
        const p = (last?.cards || []).flatMap((c) => c.list).find((p) => p.id === btn.dataset.add);
        if (!p) throw new Error('Hae tuote uudelleen.');
        await addProducts([p], last.deliveryDate);
        selectedNeeds.add(+btn.closest('[data-need]').dataset.need);
        orderable = cartSelection(last, selectedNeeds).enabled;
        const next = main.querySelector('.ask-go'); if (next) next.disabled = !orderable;
      } else {
        const res = await fetch('/api/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: btn.dataset.add, qty: +btn.dataset.qty || 1 }) });
        if (!res.ok) throw new Error('Lisäys epäonnistui.');
      }
      btn.classList.add('done'); btn.innerHTML = `${I.check}Korissa`;
    } catch (e) { btn.disabled = false; btn.textContent = e.message; }
  }

  // Keittiön historiaennuste on eri asia kuin selaimen oma hakukori. Avaaminen vain lukee ehdotuksen.
  async function loadReady() {
    ready.hidden = false; peek.hidden = false;
    ready.innerHTML = '<span>Ladataan tilausehdotusta…</span>';
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Tilausehdotuksen lataus epäonnistui');
      const p = (await res.json()).proposal;
      const rows = (p?.lines || []).filter((l) => l.qty > 0 && l.state !== 'removed');
      if (!p || !rows.length) {
        ready.innerHTML = `<span>Tilausehdotusta ei ole vielä valmiina. Avaa ehdotusnäkymä ja laadi ehdotus.</span><span class="ask-ready-go">Avaa tilausehdotus${I.go}</span>`;
        return;
      }
      const shown = [...rows].sort((a, b) => Math.abs(b.deltaPct || 0) - Math.abs(a.deltaPct || 0) || (b.total || 0) - (a.total || 0)).slice(0, 6);
      const date = p.deliveryDate ? `<span>${I.cal}${day(p.deliveryDate)}</span>` : '';
      const title = p.status === 'ordered' ? 'Viimeisin tilaus' : p.deliveryDate ? `${WD_GEN[utcDay(p.deliveryDate).wd]} tilausehdotus` : 'Tilausehdotus';
      ready.innerHTML = `<b>${title}</b><span class="ask-thumbs">${shown.map((l) => `<span class="ask-thumb" title="${esc(l.name)}, ${num(l.qty)} ${esc(l.unitLabel || '')}"><img src="/img/${encodeURIComponent(l.productId)}" alt="${esc(l.name)}" loading="lazy" onerror="this.parentElement.classList.add('noimg');this.remove()"><i class="ask-tname">${esc(String(l.name).split(' ').slice(0, 2).join(' '))}</i><i class="ask-tq">${num(l.qty)}</i></span>`).join('')}${rows.length > shown.length ? `<span class="ask-thumb more">+${rows.length - shown.length}</span>` : ''}</span><span class="ask-cfoot"><span><b>${rows.length}</b> tuotetta</span>${date}<b class="ask-ctotal">${p.totals?.expected == null ? 'Hinta ei tiedossa' : money(p.totals.expected)}</b></span><span class="ask-ready-go">Avaa tilausehdotus${I.go}</span>`;
    } catch {
      ready.innerHTML = `<span>Esikatselua ei voitu ladata. Voit yrittää uudelleen tilausehdotusnäkymässä.</span><span class="ask-ready-go">Avaa tilausehdotus${I.go}</span>`;
    }
  }

  // Sama hakurivi liikkuu kentästä paneeliin. Se kelluu animaation ajan paneelin
  // leikkausalueen päällä, jotta teksti ja mikrofoni eivät leikkaudu tai veny.
  let motionId = 0; let closing = false; let motions = []; let dockBar = null;
  const queryPlaceholder = q.placeholder;
  const frame = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (!b.width || !b.height) return null;
    return { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
      borderRadius: s.borderRadius, borderColor: s.borderTopStyle === 'none' ? 'transparent' : s.borderColor,
      boxShadow: s.boxShadow, paddingLeft: s.paddingLeft, paddingRight: s.paddingRight, gap: s.gap };
  };
  const stopMotion = () => {
    motions.forEach((a) => a.cancel()); motions = [];
    dockBar?.(); dockBar = null;
  };
  const animate = (el, frames, options) => {
    const animation = el.animate(frames, { fill: 'both', ...options });
    motions.push(animation); return animation.finished.catch(() => {});
  };
  function moveBar(from, to, duration, opening) {
    const focus = bar.contains(document.activeElement);
    root.append(bar); bar.classList.add('ask-bar-moving');
    Object.assign(bar.style, to);
    dockBar = () => {
      const refocus = bar.contains(document.activeElement);
      barSlot.append(bar); bar.classList.remove('ask-bar-moving'); bar.removeAttribute('style');
      q.placeholder = queryPlaceholder;
      if (refocus) q.focus({ preventScroll: true });
    };
    if (focus) q.focus({ preventScroll: true });
    if (!q.value) q.placeholder = origin?.querySelector('input')?.placeholder || queryPlaceholder;
    const easing = 'cubic-bezier(.22,.8,.25,1)';
    const x = bar.querySelector('.ask-x');
    animate(x, opening ? [{ opacity: 0, width: '0px' }, { opacity: 1, width: `${x.getBoundingClientRect().width}px` }]
      : [{ opacity: 1 }, { opacity: 0, width: '0px' }], { duration, easing });
    return animate(bar, [from, to], { duration, easing });
  }
  const clipFrom = () => {
    const s = sheet.getBoundingClientRect(); const b = origin?.getBoundingClientRect();
    if (!b || !b.width) return 'inset(0 0 100% 0)';
    const px = (n) => `${Math.max(0, n).toFixed(1)}px`;
    return `inset(${px(b.top - s.top)} ${px(s.right - b.right)} ${px(s.bottom - b.bottom)} ${px(b.left - s.left)} round 4px)`;
  };
  function open(text = '') {
    if (!root.hidden && !closing) { if (text) setText(text); return; }
    searchClosed = false;
    const from = closing ? frame(bar) : frame(origin);
    const id = ++motionId; stopMotion(); closing = false;
    if (!root.isConnected) document.body.append(root);
    const b = origin?.getBoundingClientRect();
    // Ostoskorin kenttä nousee otsakkeen alle. Otsakkeen oma haku avautuu paikallaan.
    const viewportHeight = document.documentElement.clientHeight;
    const anchorTop = origin?.closest('.cart-tools') ? document.querySelector('.store-header')?.getBoundingClientRect().bottom ?? 0 : (b?.top ?? 16) - 16;
    const top = Math.max(0, Math.min(Math.round(anchorTop), Math.max(0, viewportHeight - 560)));
    sheet.style.top = `${top}px`;
    // Paneeli alkaa hakukentän kohdalta, joten korkeus rajataan sen alle jäävään ruutuun: muuten alaosa jää näkymättömiin.
    sheet.style.maxHeight = `calc(100dvh - ${top}px)`;
    root.hidden = false; document.documentElement.classList.add('ask-open');
    origin?.querySelector('input')?.setAttribute('aria-expanded', 'true');
    recipeContext = null; root.classList.remove('ask-recipe-mode');
    q.value = text; if (text) search(); else idle();
    loadReady();
    q.focus({ preventScroll: true });
    const to = frame(bar);
    origin?.classList.add('ask-trigger-active');
    if (!still() && from && to) {
      const body = root.querySelector('.ask-body');
      animate(sheet, [{ clipPath: clipFrom() }, { clipPath: 'inset(0 0 0 0 round 0px)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
      animate(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
      animate(body, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 180, easing: 'ease-out' });
      moveBar(from, to, 420, true).then(() => { if (id === motionId) stopMotion(); });
    }
  }
  async function close() {
    if (root.hidden || closing) return;
    searchClosed = true;
    const from = frame(bar); const id = ++motionId; stopMotion(); closing = true;
    voice?.cancel();
    clearTimeout(timer); clearTimeout(deepTimer); clearTimeout(portionTimer);
    seq++;
    const to = frame(origin);
    if (!still() && from && to) {
      animate(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 280 });
      animate(sheet, [{ clipPath: 'inset(0 0 0 0 round 0px)' }, { clipPath: clipFrom() }], { duration: 280, easing: 'cubic-bezier(.4,0,.8,.4)' });
      await moveBar(from, to, 280, false);
    }
    if (id !== motionId) return;
    stopMotion(); closing = false;
    root.hidden = true; document.documentElement.classList.remove('ask-open');
    origin?.classList.remove('ask-trigger-active');
    origin?.querySelector('input')?.setAttribute('aria-expanded', 'false');
    origin?.querySelector('input')?.focus({ preventScroll: true });
  }

  q.addEventListener('input', () => { recipeContext = null; root.classList.remove('ask-recipe-mode'); seq++; orderable = false; selectedNeeds.clear(); patches = []; expanded.clear(); clearTimeout(timer); clearTimeout(deepTimer); main.innerHTML = '<p class="ask-thinking">Tarkistan tuotteet ja saatavuuden…</p>'; timer = setTimeout(search, 350); });
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
    if (!Number.isInteger(portions) || portions < 1 || portions > 2000) {
      main.innerHTML = '<p class="ask-warn">Anna annosmäärä väliltä 1–2000 ennen raaka-aineiden laskemista.</p>'; orderable = false; return false;
    }
    const date = recipeContext?.deliveryText || last?.deliveryDate || storefrontCart?.get().selectedDate;
    const when = date || 'maanantaiksi';
    const label = `${picked.name} ${portions} annosta ${when}`;
    override = picked.pinned ? null : { label, title: `${picked.name}, ${portions} annosta`, text: `${picked.ingredients.map((g) => `${amountText(g.amount * portions)} ${g.unit === 'L' ? 'l' : 'kg'} ${g.name}`).join(', ')} ${when}` };
    if (recipeContext) recipeContext.label = label;
    q.value = label; patches = []; selectedNeeds.clear(); clearTimeout(timer); return search();
  }
  let portionTimer;
  const setPortions = (n) => {
    clearTimeout(portionTimer);
    portions = Number.isInteger(n) && n >= 1 && n <= 2000 ? n : 0;
    pinput.value = portions || '';
    runRecipe();
  };
  rinput.addEventListener('input', () => { clearTimeout(ideaTimer); ideaTimer = setTimeout(loadIdeas, 420); });
  rinput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ideas.length) { ev.preventDefault(); picked = ideas[0]; paintIdeas(); runRecipe(); } });
  pinput.addEventListener('input', () => {
    pinput.value = pinput.value.replace(/\D/g, '');
    portions = parseInt(pinput.value, 10) || 0; orderable = false;
    clearTimeout(portionTimer);
    const value = pinput.value; const source = q.value; const selection = picked;
    portionTimer = setTimeout(() => { if (!root.hidden && q.value === source && pinput.value === value && picked === selection) runRecipe(); }, 250);
  });
  pinput.addEventListener('change', () => setPortions(parseInt(pinput.value, 10)));
  pinput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); pinput.blur(); } if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); setPortions(bump(portions, ev.key === 'ArrowUp' ? 1 : -1)); } });
  pinput.addEventListener('focus', () => pinput.select());
  function saveQuantity(box) {
    const input = box.querySelector('input');
    const value = Number(input.value.trim().replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      input.setCustomValidity('Anna määrä, joka on suurempi kuin 0 ja enintään 100 000.');
      input.reportValidity(); input.focus(); return;
    }
    const [unit, basis] = box.querySelector('select').value.split(':');
    const item = +box.dataset.item;
    patches = patches.filter((p) => !(p.item === item && p.patch.quantity));
    patches.push({ item, patch: { quantity: { value, unit, ...(basis ? { basis } : {}) } } });
    selectedNeeds.delete(item);
    search();
  }
  root.addEventListener('input', (ev) => {
    if (ev.target.closest('.ask-qed') && ev.target.matches('input')) ev.target.setCustomValidity('');
  });
  root.addEventListener('keydown', (ev) => {
    const box = ev.target.closest('.ask-qed');
    if (!box) return;
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); saveQuantity(box); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); render(last); main.querySelector(`[data-item="${box.dataset.item}"]`)?.focus(); }
  });
  root.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-close]')) { close(); return; }
    if (ev.target.closest('.ask-go')) { toAgent(); return; }
    const hit = (sel) => ev.target.closest(sel);
    if (hit('.ask-collections a')) {
      try { sessionStorage.setItem(COLLECTION_RETURN_KEY, JSON.stringify({ text: sent(), patches })); } catch { /* Alkuperäinen hakuteksti kulkee myös linkissä. */ }
      return;
    }
    const add = hit('[data-add]');
    if (add) { addToCart(add); return; }
    const all = hit('[data-all]');
    if (all && last) { const i = +all.dataset.all; if (expanded.has(i)) expanded.delete(i); else expanded.add(i); render(last); return; }
    const rail = hit('[data-rail]');
    if (rail) { const t = rail.parentElement.querySelector('.ask-tiles'); t.scrollBy({ left: +rail.dataset.rail * Math.max(220, t.clientWidth * 0.8), behavior: still() ? 'auto' : 'smooth' }); return; }
    const dayBtn = hit('[data-day]');
    if (dayBtn) { setText(`${q.value.trim()} ${dayBtn.dataset.day}`); return; }
    const save = hit('[data-save-quantity]');
    if (save) { saveQuantity(save.closest('.ask-qed')); return; }
    const cancel = hit('[data-cancel-quantity]');
    if (cancel) { const item = cancel.closest('.ask-qed').dataset.item; render(last); main.querySelector(`[data-item="${item}"]`)?.focus(); return; }
    const nextDate = hit('[data-next-date]');
    if (nextDate && storefrontCart) { storefrontCart.select(nextDate.dataset.nextDate); return; }
    const ask = hit('[data-ask]');
    if (ask?.dataset.ask === 'date') { ask.parentElement.innerHTML = `<span class="ask-pills">${dayPills()}</span>`; return; }
    if (ask?.dataset.ask === 'qty') {
      const result = last; const item = +ask.dataset.item; const it = result?.understood?.items?.[item];
      if (!it) return;
      const { quantityChoices, quantityLabel } = await quantityReady;
      if (last !== result || !ask.isConnected) return;
      const { options } = quantityChoices(it, result.cards?.[item]?.list || []);
      const key = (q) => `${q.unit}${q.basis ? `:${q.basis}` : q.unit === 'PCS' ? ':sales' : ''}`;
      const current = it.quantity;
      if (current && !options.some((o) => key(o) === key(current))) options.push({ ...current, label: quantityLabel(current) });
      const selected = current ? key(current) : key(options[0]);
      const box = document.createElement('div'); box.className = 'ask-qed'; box.dataset.item = item;
      box.innerHTML = `<div class="ask-quantity-fields"><input type="text" inputmode="decimal" maxlength="12" value="${current ? num(current.value) : ''}" placeholder="Määrä" aria-label="Määrä tuotteelle ${esc(it.productTerm)}"><select aria-label="Määrän yksikkö tuotteelle ${esc(it.productTerm)}">${options.map((o) => `<option value="${key(o)}"${key(o) === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select><button type="button" data-save-quantity>Tallenna</button><button type="button" class="ask-quantity-cancel" data-cancel-quantity>Peruuta</button></div>`;
      ask.replaceWith(box); const input = box.querySelector('input'); input.focus(); input.select(); return;
    }

    const example = ev.target.closest('[data-example]');
    if (example) { setText(example.dataset.example); return; }
    const step = ev.target.closest('[data-step]');
    if (step) { setPortions(bump(portions, +step.dataset.step)); return; }
    const idea = ev.target.closest('[data-idea]');
    if (idea) { picked = ideas[+idea.dataset.idea]; paintIdeas(); runRecipe(); return; }
  });

  /** Tekee otsakkeen hakukentästä paneelin avaimen: tekoälykuvake, uusi vihjeteksti ja avaus klikkauksesta tai näppäilystä. */
  function attach({ box, input, icon, placeholder = PLACEHOLDER }) {
    if (!box || !input || box.classList.contains('ask-trigger')) return;
    if (icon) { const ai = document.createElement('span'); ai.className = 'ask-trigger-ai'; ai.innerHTML = I.spark(18); icon.replaceWith(ai); }
    box.classList.add('ask-trigger');
    input.placeholder = placeholder; input.setAttribute('aria-label', placeholder); input.readOnly = true; input.setAttribute('aria-haspopup', 'dialog'); input.setAttribute('aria-expanded', 'false');
    const go = (text) => { origin = box; open(text); };
    voiceReady.then((v) => v?.addTrigger(box, () => go('')));
    box.addEventListener('click', () => go(''));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopImmediatePropagation(); go(''); }
      else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); go(ev.key); }
    }, true);
    origin ||= box;
  }

  if (location.pathname === '/cart.html') import('/cart-workflow.js').catch(() => {});
  window.aimoAsk = { attach, open: (text) => open(text), close };
  // Etusivun otsake (index.html, gateway.html) kytketään suoraan; yhteinen kehys (aimo-shell.js) kutsuu attach-funktiota itse.
  const sf = document.querySelector('.store-header .search');
  if (sf) attach({ box: sf, input: sf.querySelector('input'), icon: sf.querySelector('.icon') });
  const returnUrl = new URL(location.href);
  const agentEntry = returnUrl.searchParams.get('shop') === 'agent';
  if (agentEntry) {
    returnUrl.searchParams.delete('shop');
    history.replaceState(history.state, '', returnUrl.pathname + returnUrl.search + returnUrl.hash);
  }
  const returnSearch = returnUrl.searchParams.get('ask');
  if (returnSearch && returnSearch.length <= 1000) {
    returnUrl.searchParams.delete('ask');
    history.replaceState(history.state, '', returnUrl.pathname + returnUrl.search + returnUrl.hash);
    try {
      const saved = JSON.parse(sessionStorage.getItem(COLLECTION_RETURN_KEY));
      if (saved?.text === returnSearch && Array.isArray(saved.patches)) {
        patches = saved.patches.slice(0, 20).filter((p) => Number.isInteger(p.item) && p.patch?.quantity);
        sessionStorage.removeItem(COLLECTION_RETURN_KEY);
      }
    } catch { /* Ilman tallennusta palataan alkuperäiseen hakutekstiin. */ }
    open(returnSearch);
  } else if (agentEntry) {
    let pending = '';
    try { pending = sessionStorage.getItem(HANDOFF_KEY) || ''; sessionStorage.removeItem(HANDOFF_KEY); } catch {}
    open(pending);
  }
})();
