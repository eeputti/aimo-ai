// "Katso, mitä agentti näki": draws one order's published trace. All text goes through textContent.
const $ = (id) => document.getElementById(id);
const LINK = /^(AGW-\d{8}-\d{4,12})\.([A-Za-z0-9_-]{43})$/;
const match = LINK.exec(location.hash.slice(1));
// #esimerkki opens the example order the Worker serves without a payment link.
const example = location.hash === '#esimerkki';
const SVG = 'http://www.w3.org/2000/svg';

const nf = (n, digits = 0) => new Intl.NumberFormat('fi-FI', { maximumFractionDigits: digits }).format(n);
const money = (n) => (typeof n === 'number' ? new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(n) : 'Hinta ei tiedossa');
const time = (iso) => new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' }).format(new Date(iso));
const day = (date) => {
  if (!date) return 'päivä puuttuu';
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('fi-FI', { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
  return `${weekday} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
};
const UNIT = { L: 'l', KG: 'kg', PCS: 'kpl', G: 'g' };
const quantity = (q) => (q ? `${nf(q.value, 2)} ${UNIT[q.unit] || q.unit.toLowerCase()}` : 'määrä puuttuu');
const CLAIM = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', FREE_FROM_MILK: 'maidoton', VEGAN: 'vegaaninen',
  VEGETARIAN: 'kasvis', ORGANIC: 'luomu', GOODS_FROM_FINLAND_BLUE_SWAN: 'Hyvää Suomesta', KEYHOLE: 'sydänmerkki' };
const ALLERGEN = { AM: 'maito', AW: 'gluteeni', AE: 'kananmuna', AF: 'kala', AC: 'äyriäiset', AN: 'pähkinät', AP: 'maapähkinä', AS: 'seesami', AY: 'soija',
  AU: 'sulfiitit', BC: 'selleri', BM: 'sinappi', ML: 'lupiini', UM: 'nilviäiset' };
const STATUS = { collecting: 'Kerää tietoja', choosing: 'Valitaan tuotetta', ready: 'Valmis vahvistettavaksi', confirmed: 'Vahvistettu',
  pending_approval: 'Odottaa hyväksyntää', error: 'Ei käsitelty' };
const FLAG = { STOCK_UNKNOWN: 'saldo ei tiedossa', DELIVERY_DATE_SHIFT: 'toimituspäivä siirtyy', SUBSTITUTE: 'korvaava tuote', PRICE_CHANGED: 'hinta muuttui' };
const EXCLUDED = { UNIT_NOT_CONVERTIBLE: 'yksikköä ei voi muuntaa', NOT_AVAILABLE: 'ei saatavilla', PAST_CUTOFF: 'tilausaika umpeutunut', ALLERGEN: 'allergeeni', LATE_DELIVERY: 'liian myöhäinen toimitus' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
function icon(name, className = 'icon') {
  const svg = document.createElementNS(SVG, 'svg'), use = document.createElementNS(SVG, 'use');
  svg.setAttribute('class', className); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', `#i-${name}`);
  svg.append(use); return svg;
}
function chip(text, kind = '') { return el('span', `chip ${kind}`.trim(), text); }
const cap = (text) => (text ? text.charAt(0).toLocaleUpperCase('fi-FI') + text.slice(1) : '');
const label = (code) => CLAIM[code] || (/ORGANIC/.test(code) ? 'luomu' : null);
// Product names for ids that the ledger lists by number only.
let names = new Map();
// WhatsApp formatting: *lihavointi* and line breaks, rendered without HTML.
function whatsappText(text) {
  const out = el('p', 'bubble-text');
  String(text).split(/(\*[^*\n]{1,200}\*)/u).forEach((part) => {
    if (/^\*[^*\n]+\*$/u.test(part)) out.append(el('strong', '', part.slice(1, -1)));
    else if (part) out.append(document.createTextNode(part));
  });
  return out;
}

function stats(trace) {
  const customer = trace.turns.filter((t) => t.source === 'whatsapp').length;
  const revisions = Math.max(0, ...trace.turns.map((t) => t.revision || 0));
  const shown = trace.options.reduce((n, o) => n + Math.max(o.shown.length, o.seen || 0), 0);
  const signed = trace.ledger.events.filter((e) => e.type === 'OFFER_ISSUED').length;
  const mandate = trace.ledger.events.find((e) => e.type === 'MANDATE_EVALUATED')?.detail;
  const tiles = [
    ['chat', nf(customer), 'WhatsApp-viestiä', ''],
    ['brain', nf(revisions), 'korin versiota', ''],
    ['search', nf(shown), 'tuotevaihtoehtoa näytetty', ''],
    ['sign', nf(signed), `allekirjoitettua tarjousta, ${nf(trace.quotes.count || 0)} kierrosta`, ''],
    ['shield', mandate?.outcome === 'confirmed' ? 'OK' : mandate ? 'Hyväksyntä' : 'Ei tietoa', 'ostovaltuus', mandate?.outcome === 'confirmed' ? 'good' : 'warn'],
  ];
  $('stats').replaceChildren(...tiles.map(([name, value, label, tone]) => {
    const tile = el('div', `stat ${tone}`.trim());
    tile.append(icon(name), el('strong', '', value), el('span', '', label));
    return tile;
  }));
  $('stats').hidden = false;
}

function chat(trace) {
  const nodes = [];
  for (const turn of trace.turns) {
    if (turn.source === 'cart') {
      const pill = el('div', 'cart-event');
      pill.append(icon('cart'), el('span', '', turn.action), el('time', '', time(turn.at)));
      nodes.push(pill);
    } else if (turn.customer) {
      const row = el('div', 'msg customer');
      const bubble = el('div', 'bubble');
      bubble.append(whatsappText(turn.customer), el('time', '', time(turn.at)));
      row.append(bubble); nodes.push(row);
    }
    if (turn.replies.length) {
      const row = el('div', 'msg agent');
      const stack = el('div', 'stack');
      turn.replies.forEach((text) => { const b = el('div', 'bubble'); b.append(whatsappText(text)); stack.append(b); });
      const meta = el('div', 'meta');
      if (turn.revision) meta.append(chip(`Kori v${turn.revision}`, 'blue'));
      if (turn.status) meta.append(chip(STATUS[turn.status] || turn.status, turn.status === 'confirmed' ? 'good' : turn.status === 'ready' ? 'blue' : ''));
      if (!turn.revision && !turn.status) meta.append(chip(turn.source === 'cart' ? 'Ostoskorisivu' : 'Keskustelu, kori ennallaan'));
      stack.append(meta); row.append(stack); nodes.push(row);
    }
  }
  $('chat').replaceChildren(...nodes);
}

function understood(trace) {
  const u = trace.understood;
  const delivery = $('delivery');
  delivery.replaceChildren(icon('truck'), el('span', '', 'Toimitus'), el('strong', '', day(u.deliveryDate)));
  if (u.diet.claims.length || u.diet.excludeAllergens.length) {
    delivery.append(el('span', 'sep', 'koko tilaus'));
    u.diet.claims.forEach((c) => delivery.append(chip(CLAIM[c] || c, 'good')));
    u.diet.excludeAllergens.forEach((a) => delivery.append(chip(`ei ${ALLERGEN[a] || a}`, 'bad')));
  }
  $('understood').replaceChildren(...u.lines.map((line) => {
    const card = el('div', 'need');
    const top = el('div', 'need-top');
    top.append(el('span', 'term', cap(line.term)), el('strong', 'qty', quantity(line.quantity)));
    const tags = el('div', 'tags');
    line.claims.forEach((c) => tags.append(chip(CLAIM[c] || c, 'good')));
    line.excludeAllergens.forEach((a) => tags.append(chip(`ei ${ALLERGEN[a] || a}`, 'bad')));
    if (!tags.childNodes.length) tags.append(chip('ei erityisvaatimuksia'));
    const chosen = el('div', `chosen ${line.selectedName ? '' : 'missing'}`.trim());
    chosen.append(icon(line.selectedName ? 'check' : 'x'), el('span', '', line.selectedName || 'Tuotetta ei valittu'));
    card.append(top, tags, chosen);
    return card;
  }));
}

function options(trace) {
  $('options').replaceChildren(...trace.options.map((group) => {
    const wrap = el('div', 'option-group');
    const head = el('div', 'option-head');
    const line = trace.understood.lines.find((l) => l.ref === group.ref);
    head.append(el('h3', '', `${cap(group.term)} ${line ? quantity(line.quantity) : ''}`.trim()),
      el('span', 'muted', `${nf(group.shown.length)} näytetty${group.seen && group.seen > group.shown.length ? `, ${nf(group.seen)} käyty läpi` : ''}`));
    const grid = el('div', 'option-grid');
    if (!group.shown.length) grid.append(el('p', 'muted', 'Vaihtoehtoja ei näytetty: tuote tuli suoraan aiemmasta valinnasta.'));
    group.shown.forEach((o, i) => {
      const card = el('div', `option ${o.selected ? 'selected' : ''}`.trim());
      const top = el('div', 'option-top');
      top.append(el('span', 'option-num', String(i + 1)), o.selected ? chip('Valittu', 'good solid') : el('span'));
      const name = el('p', 'option-name', o.name);
      const pack = el('p', 'option-pack', `${nf(o.salesUnits || 0)} ${o.salesUnitLabel || ''}${o.covers ? ` (${quantity(o.covers)})` : ''}`);
      const price = el('p', 'option-price'); price.append(el('strong', '', money(o.lineNet)), el('small', '', o.unitPriceNet != null ? `${money(o.unitPriceNet)} / ${o.salesUnitLabel || 'kpl'}` : ''));
      const facts = el('div', 'facts');
      if (o.co2PerKg != null) { const f = el('span', 'fact'); f.append(icon('leaf'), document.createTextNode(`${nf(o.co2PerKg, 2)} kg CO₂e/kg`)); facts.append(f); }
      if (o.deliveryReliability != null) { const f = el('span', 'fact'); f.append(icon('truck'), document.createTextNode(`${nf(o.deliveryReliability * 100)} % toimitusvarmuus`)); facts.append(f); }
      const labels = el('div', 'tags');
      [...new Set(o.labels.map(label).filter(Boolean))].slice(0, 3).forEach((l) => labels.append(chip(l)));
      card.append(top, name, pack, price, facts, labels);
      if (o.warning) card.append(el('p', 'warning', o.warning));
      grid.append(card);
    });
    wrap.append(head, grid);
    return wrap;
  }));
}

function eventText(e) {
  const d = e.detail || {};
  switch (e.type) {
    case 'QUOTE_REQUESTED': return ['search', 'Tarjouspyyntö', `${nf(d.needs?.length || 0)} tarvetta toimitukselle ${day(d.deliveryDate)}, ${nf(d.productsPriced || 0)} tuotteen hinta haettu${d.priceSource === 'live' ? ' suoraan rajapinnasta' : ''}.`];
    case 'CANDIDATES_EXCLUDED': return ['x', 'Rajattiin pois', Object.entries(d.summary || {}).map(([k, v]) => `${EXCLUDED[k] || k.toLowerCase().replace(/_/g, ' ')}: ${v}`).join(', ') || 'Sopimattomia ehdokkaita.'];
    case 'OFFER_ISSUED': return ['sign', 'Allekirjoitettu tarjous', `${(d.lines || []).map((l) => l.replace(/^(\S+) ×/u, (all, id) => (names.has(id) ? `${names.get(id)} ×` : all))).join(', ')}, ${money(d.net)}.`, (d.flags || []).map((f) => FLAG[f] || f)];
    case 'ORDER_RECEIVED': return ['cart', 'Tilaus vastaanotettu', `Ostoskorin vahvistus ${nf(d.offers || 0)} tarjouksella.`];
    case 'OFFER_VERIFIED': return ['shield', 'Allekirjoitukset tarkistettu', `${d.algorithm || 'Allekirjoitus'}: ${nf(d.offers || 0)} tarjousta, ${nf(d.failures || 0)} virhettä.`];
    case 'LIVE_RECHECK': return ['refresh', 'Hinnat ja saatavuus tarkistettu uudelleen', d.changed ? `${nf(d.changed)} muutosta ${nf(d.products || 0)} tuotteessa.` : `Ei muutoksia ${nf(d.products || 0)} tuotteessa.`];
    case 'MANDATE_EVALUATED': return ['shield', 'Ostovaltuus', d.outcome === 'confirmed' ? 'Tilaus mahtuu valtuuteen, ihmisen hyväksyntää ei tarvita.' : `Tilaus vaatii hyväksynnän: ${(d.reasons || []).join(', ') || d.outcome}.`];
    case 'WATCH_EVALUATED': return ['eye', 'Vahti', d.findings ? `${nf(d.findings)} havaintoa.` : `Ei poikkeamia ${nf(d.historyOrders || 0)} aiempaan tilaukseen verrattuna.`];
    case 'ORDER_CONFIRMED': return ['check', 'Tilaus vahvistettu', `${money(d.net)} alv 0 %.`];
    default: return ['check', e.type, ''];
  }
}
function ledger(trace) {
  const events = trace.ledger.events;
  // Each quote starts a group. Earlier quotes are folded: they are the same cart before the shopper's last change.
  const groups = [];
  for (const e of events) {
    if (e.type === 'QUOTE_REQUESTED' || !groups.length) groups.push([]);
    groups[groups.length - 1].push(e);
  }
  const lastQuote = groups.map((g) => g[0]?.type).lastIndexOf('QUOTE_REQUESTED');
  const item = (e) => {
    const [name, title, text, flags = []] = eventText(e);
    const li = el('li', `event ${['ORDER_CONFIRMED', 'OFFER_VERIFIED'].includes(e.type) ? 'good' : e.type === 'CANDIDATES_EXCLUDED' ? 'warn' : ''}`.trim());
    const dot = el('span', 'event-dot'); dot.append(icon(name));
    const body = el('div', 'event-body');
    const head = el('div', 'event-head'); head.append(el('strong', '', title), el('time', '', time(e.at)));
    body.append(head, el('p', '', text));
    const tags = el('div', 'tags'); flags.forEach((f) => tags.append(chip(f, 'warn')));
    tags.append(chip(e.actor === 'agent' ? 'agentti' : e.actor === 'policy' ? 'sääntö' : e.actor === 'watch' ? 'vahti' : 'portti', 'ghost'), chip(`#${e.hash}`, 'mono'));
    body.append(tags); li.append(dot, body);
    return li;
  };
  const nodes = [];
  groups.forEach((group, i) => {
    if (i < lastQuote) {
      const li = el('li', 'event folded');
      const details = el('details');
      details.append(el('summary', '', `Aiempi tarjouskierros ${time(group[0].at)}: kori muuttui vielä tämän jälkeen`));
      const inner = el('ol', 'ledger inner'); group.forEach((e) => inner.append(item(e)));
      details.append(inner); li.append(details); nodes.push(li);
    } else group.forEach((e) => nodes.push(item(e)));
  });
  $('ledger').replaceChildren(...nodes);
  if (trace.ledger.head) {
    const li = el('li', 'event chain');
    const dot = el('span', 'event-dot'); dot.append(icon('check'));
    const body = el('div', 'event-body');
    body.append(el('strong', '', 'Päätösketju ehjä julkaisuhetkellä'), el('p', 'mono', trace.ledger.head));
    li.append(dot, body); $('ledger').append(li);
  }
}

function order(trace) {
  const o = trace.order;
  $('order-note').textContent = `${STATUS[o.status] || o.status} ${time(o.createdAt)}, toimitus ${day(o.deliveryDate)}${o.cutoffLabel ? `, tilattava viimeistään ${o.cutoffLabel}` : ''}.`;
  $('order-lines').replaceChildren(...o.lines.map((l) => {
    const li = el('li');
    const name = el('div'); name.append(el('strong', '', l.name), el('small', '', `${nf(l.quantity || 0)} ${l.unit || ''}${l.unitPriceNet != null ? ` × ${money(l.unitPriceNet)}` : ''}`));
    li.append(name, el('span', 'line-net', money(l.net)));
    return li;
  }));
  const totals = $('totals');
  totals.replaceChildren();
  for (const [label, value, strong] of [['Veroton', o.net, true], ['Alv', o.vat], ['Verollinen', o.gross]]) {
    if (value == null) continue;
    const row = el('div', strong ? 'total main' : 'total'); row.append(el('span', '', label), el(strong ? 'strong' : 'span', '', money(value)));
    totals.append(row);
  }
}

// The agent's run as one short script: the real paths, fields and answers of this order, nothing invented.
// Lines are { i, code } (highlighted), { i, res, note, tone } (an answer) or {} (empty line).
const lit = (value) => JSON.stringify(value);
const short = (text, max = 72) => { const t = String(text).replace(/\s+/gu, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
function ident(term, used) {
  const base = String(term || 'tuote').toLocaleLowerCase('fi-FI').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/gu, '') || 'tuote';
  const id = /^\p{N}/u.test(base) ? `_${base}` : base;
  let out = id;
  for (let n = 2; used.has(out); n++) out = `${id}${n}`;
  used.add(out); return out;
}
const PRICE_SOURCE = { live: 'suoraan Valion rajapinnasta', 'last-known': 'viimeisin tunnettu Valion hinta (rajapinta ei vastannut)', simulated: 'simuloitu' };
const CART_CALL = { confirmed: 'vahvista', pending_approval: 'lähetäHyväksyttäväksi', ready: 'tarkista' };

function codeLines(trace) {
  const out = [];
  const code = (text, i = 0) => out.push({ i, code: text });
  const res = (text, opts = {}) => out.push({ i: opts.i ?? 1, res: text, note: opts.note || '', tone: opts.tone || '' });
  const gap = () => out.push({});
  const u = trace.understood, events = trace.ledger.events, final = trace.quotes.final;

  code('import { whatsapp, tulkki, tuotteet, valio, portti, ostoskori } from "aimo"');
  gap();

  // 1. WhatsApp messages, with the cart version each one produced.
  const messages = trace.turns.filter((t) => t.source === 'whatsapp' && t.customer);
  if (messages.length) {
    code('const viestit = await whatsapp.vastaanota()   // Meta → POST /webhooks/whatsapp');
    const shown = messages.length > 8 ? [...messages.slice(0, 4), null, ...messages.slice(-3)] : messages;
    for (const m of shown) {
      if (!m) res(`… ${nf(messages.length - 7)} viestiä lisää`, { tone: 'muted' });
      else res(lit(short(m.customer)), { note: m.revision ? `kori v${m.revision}` : '' });
    }
    gap();
  }

  // 2. What the agent understood.
  code('const tarve = await tulkki.ymmärrä(viestit)   // kielimalli + tilausmoottorin säännöt');
  for (const line of u.lines) {
    const extra = [...line.claims.map((c) => CLAIM[c] || c), ...line.excludeAllergens.map((a) => `ei ${ALLERGEN[a] || a}`)];
    res(`${line.term} ${quantity(line.quantity)}${extra.length ? `, ${extra.join(', ')}` : ''}`);
  }
  const orderDiet = [...u.diet.claims.map((c) => CLAIM[c] || c), ...u.diet.excludeAllergens.map((a) => `ei ${ALLERGEN[a] || a}`)];
  if (orderDiet.length) res(`koko tilaus: ${orderDiet.join(', ')}`);
  res(`toimitus ${day(u.deliveryDate)}`);
  gap();

  // 3. Product search per need and the shopper's pick.
  const used = new Set();
  for (const line of u.lines) {
    const group = trace.options.find((g) => g.ref === line.ref);
    const args = [`toimitus: ${lit(u.deliveryDate || '')}`];
    if (line.claims.length) args.push(`vaatimus: [${line.claims.map((c) => lit(CLAIM[c] || c)).join(', ')}]`);
    if (line.excludeAllergens.length) args.push(`ilman: [${line.excludeAllergens.map((a) => lit(ALLERGEN[a] || a)).join(', ')}]`);
    code(`const ${ident(line.term, used)} = await tuotteet.hae(${lit(line.term || '')}, { ${args.join(', ')} })`);
    const shownCount = group?.shown.length || 0;
    const pick = group ? group.shown.findIndex((o) => o.selected) : -1;
    if (shownCount) {
      const seen = group.seen && group.seen > shownCount ? `, ${nf(group.seen)} käyty läpi` : '';
      res(`${nf(shownCount)} tilattavaa vaihtoehtoa${seen}${pick >= 0 ? `, kokki valitsi ${pick + 1}` : ''}`);
    }
    if (pick >= 0) {
      const o = group.shown[pick];
      res(`${o.name}${o.unitPriceNet != null ? `, ${money(o.unitPriceNet)} / ${o.salesUnitLabel || 'kpl'}` : ''}`, { tone: 'good' });
    } else if (line.selectedName) res(`${line.selectedName} (valittu aiemmin)`, { tone: 'good' });
    else res('tuotetta ei valittu', { tone: 'warn' });
  }
  gap();

  // 4. Valio API: price and availability for the chosen products.
  const offerLines = final ? final.needs.flatMap((n) => n.options[0]?.lines || []) : [];
  if (final && offerLines.length) {
    const ids = [...new Set(offerLines.map((l) => l.productId))];
    const source = [...events].reverse().find((e) => e.type === 'QUOTE_REQUESTED')?.detail?.priceSource || offerLines[0].priceSource;
    code(`const products = [${ids.map(lit).join(', ')}]`);
    code(`await valio.post("/api/price", { requestedDate: ${lit(final.deliveryDate)}, products })`);
    res(`${nf(ids.length)} hintaa, ${PRICE_SOURCE[source] || source || 'lähde ei tiedossa'}`);
    code(`await valio.post("/api/availability", { requestedDate: ${lit(final.deliveryDate)}, products })`);
    for (const l of offerLines.slice(0, 8)) {
      res(`${short(l.name, 44)}: ${l.availableDate ? `saatavilla ${day(l.availableDate)}` : 'saatavuus ei tiedossa'}${l.stockKnown ? '' : ', saldo ei tiedossa'}`);
    }
    const cutoff = final.needs.map((n) => n.options[0]?.cutoffLabel).find(Boolean);
    if (cutoff) res(`tilattava viimeistään ${cutoff}`);
    gap();

    // 5. Gateway quote with the request's real fields.
    if (trace.quotes.count > 1) code(`// ${nf(trace.quotes.count)} tarjouskierrosta: kori muuttui välissä, viimeisin alla`);
    code('const tarjous = await portti.post("/v1/quotes", {');
    code(`deliveryDate: ${lit(final.deliveryDate)},`, 1);
    code('needs: [', 1);
    for (const n of final.needs) {
      const q = n.quantity ? `{ value: ${n.quantity.value}, unit: ${lit(n.quantity.unit)}${n.quantity.basis ? `, basis: ${lit(n.quantity.basis)}` : ''} }` : 'null';
      code(`{ ref: ${lit(n.ref)}, candidates: [${(n.options[0]?.lines || []).map((l) => lit(l.productId)).join(', ')}], quantity: ${q} },`, 2);
    }
    code('],', 1);
    code('})');
    for (const n of final.needs) {
      const o = n.options[0];
      if (!o) { res(`${n.ref}: ei tarjousta`, { tone: 'warn' }); continue; }
      const term = u.lines.find((l) => l.ref === n.ref)?.term || n.ref;
      const flags = o.flags.map((f) => FLAG[f] || f.toLowerCase());
      res(`${n.ref} ${term}: ${money(o.net)}${o.signed ? ', allekirjoitettu' : ''}${flags.length ? `, ${flags.join(', ')}` : ''}`);
    }
    const net = final.needs.reduce((sum, n) => sum + (n.options[0]?.net || 0), 0);
    res(`yhteensä ${money(net)} alv 0 %`);
    gap();
  }

  // 6. What the shopper did on the cart page.
  const cart = trace.turns.filter((t) => t.source === 'cart');
  for (const t of cart) {
    code(`await ostoskori.${CART_CALL[t.status] || 'muuta'}()   // kokki ostoskorisivulla`);
    const what = STATUS[t.status] || t.action;
    res(t.revision ? `kori v${t.revision}, ${what.charAt(0).toLocaleLowerCase('fi-FI')}${what.slice(1)}` : what);
  }
  if (cart.length) gap();

  // 7. The order and every check the gateway made, from its decision ledger.
  const received = events.map((e) => e.type).lastIndexOf('ORDER_RECEIVED');
  code('const tilaus = await portti.post("/v1/orders", { offers: tarjous.offers, idempotencyKey })');
  for (const e of received >= 0 ? events.slice(received + 1) : []) {
    const d = e.detail || {};
    if (e.type === 'OFFER_VERIFIED') res(`allekirjoitukset: ${nf(d.offers || 0)} ok, ${nf(d.failures || 0)} virhettä (${d.algorithm || 'JWS'})`);
    else if (e.type === 'LIVE_RECHECK') res(`hinta ja saatavuus uudelleen: ${d.changed ? `${nf(d.changed)} muutosta` : 'ei muutoksia'}, ${nf(d.products || 0)} tuotetta`);
    else if (e.type === 'MANDATE_EVALUATED') res(d.outcome === 'confirmed' ? 'ostovaltuus: mahtuu, ihmisen hyväksyntää ei tarvita' : `ostovaltuus: vaatii hyväksynnän${d.reasons?.length ? ` (${d.reasons.join(', ')})` : ''}`, { tone: d.outcome === 'confirmed' ? '' : 'warn' });
    else if (e.type === 'WATCH_EVALUATED') res(d.findings ? `vahti: ${nf(d.findings)} havaintoa` : `vahti: ei poikkeamia ${nf(d.historyOrders || 0)} aiempaan tilaukseen`);
    else if (e.type === 'ORDER_CONFIRMED') res(`${trace.orderId} vahvistettu, ${money(d.net)} alv 0 %`, { tone: 'good' });
    else if (e.type === 'ORDER_PENDING_APPROVAL') res(`${trace.orderId} odottaa ihmisen hyväksyntää`, { tone: 'warn' });
  }
  if (!events.some((e) => e.type === 'ORDER_CONFIRMED' || e.type === 'ORDER_PENDING_APPROVAL')) res(`${trace.orderId}: ${STATUS[trace.order.status] || trace.order.status}`);
  if (trace.order.simulated) code('// demo: oikeaa Valio-tilausta ei lähetetty');
  return out;
}

// Light syntax colours: comment, string, keyword, number, call, object, property.
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(?<![\p{L}\p{N}_$])(import|from|const|await|for|of)(?![\p{L}\p{N}_$])|(?<![\p{L}\p{N}_$])(\d[\d.]*)(?![\p{L}\p{N}_$])|([\p{L}_$][\p{L}\p{N}_$]*)(?=\()|([\p{L}_$][\p{L}\p{N}_$]*)(?=\.)|([\p{L}_$][\p{L}\p{N}_$]*)(?=:)/gu;
const KIND = ['com', 'str', 'kw', 'num', 'fn', 'obj', 'prop'];
function highlight(text, target) {
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) target.append(document.createTextNode(text.slice(last, m.index)));
    target.append(el('span', `t-${KIND[m.slice(1).findIndex((g) => g !== undefined)]}`, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) target.append(document.createTextNode(text.slice(last)));
}

let playTimer = null;
function codeView(trace) {
  const lines = codeLines(trace);
  $('code-file').textContent = `tilausapuri/${trace.orderId}.js`;
  const items = lines.map((line, n) => {
    const li = el('li', `ln-i${Math.min(line.i || 0, 3)}${line.res ? ` res ${line.tone || ''}` : line.code ? '' : ' blank'}`.trim());
    li.append(el('span', 'ln', String(n + 1)));
    const body = el('span', 'lc');
    if (line.res) {
      body.append(el('span', 'arrow', '→ '), el('span', 'res-text', line.res));
      if (line.note) body.append(el('span', 'note', line.note));
    } else if (line.code) highlight(line.code, body);
    li.append(body);
    return li;
  });
  $('code-lines').replaceChildren(...items);
  $('code').hidden = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cursor = el('span', 'cursor');
  cursor.setAttribute('aria-hidden', 'true');
  const play = () => {
    clearTimeout(playTimer);
    if (reduce) { items.forEach((li) => li.classList.remove('pending')); items.at(-1)?.lastChild.append(cursor); return; }
    items.forEach((li) => li.classList.add('pending'));
    $('code-state').textContent = 'AJETAAN'; $('code-state').className = 'code-state running';
    $('code-lines').setAttribute('aria-busy', 'true');
    let n = 0;
    const step = () => {
      const li = items[n++];
      li.classList.remove('pending'); li.lastChild.append(cursor);
      if (n < items.length) playTimer = setTimeout(step, li.classList.contains('res') ? 150 : li.classList.contains('blank') ? 40 : 110);
      else { $('code-state').textContent = 'VALMIS'; $('code-state').className = 'code-state'; $('code-lines').removeAttribute('aria-busy'); }
    };
    step();
  };
  $('code-replay').onclick = play;
  // Start the run when the panel scrolls into view.
  if (!('IntersectionObserver' in window)) return play();
  items.forEach((li) => li.classList.add('pending'));
  const seen = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { seen.disconnect(); play(); } }, { threshold: 0.15 });
  seen.observe($('code'));
}

function render(trace) {
  names = new Map([...trace.options.flatMap((g) => g.shown.map((o) => [o.productId, o.name])), ...trace.order.lines.map((l) => [l.productId, l.name])]);
  $('order-label').textContent = `${example ? 'ESIMERKKITILAUS' : 'TILAUS'} ${trace.orderId}`;
  codeView(trace); stats(trace); chat(trace); understood(trace); options(trace); ledger(trace); order(trace);
  $('raw').textContent = JSON.stringify(trace, null, 2);
  $('trace').hidden = false;
  $('status').hidden = true; $('retry').hidden = true;
  if (!example) {
    $('back').href = `/demo-payment.html#${match[1]}.${match[2]}`;
    $('back').textContent = '← Takaisin maksusivulle';
  }
}

let attempts = 0;
async function load() {
  $('retry').hidden = true;
  $('status').hidden = false;
  try {
    const response = example
      ? await fetch('/api/agent-traces/esimerkki', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      : await fetch(`/api/agent-traces/${match[1]}`, { cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${match[2]}` } });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.trace) return render(data.trace);
    // The publisher pushes the trace a few seconds after the order settles; wait for it a while.
    if (data.code === 'not_published' && attempts++ < 12) {
      $('status').textContent = 'Agentin jälkeä julkaistaan. Odotetaan hetki…';
      setTimeout(load, 5000);
      return;
    }
    throw new Error(data.error || 'Agentin jälkeä ei voitu avata.');
  } catch (error) {
    $('status').textContent = error.name === 'TimeoutError' ? 'Yhteys ei vastannut ajoissa.' : error.message;
    $('retry').hidden = false;
  }
}
$('retry').addEventListener('click', () => { attempts = 0; void load(); });
window.addEventListener('hashchange', () => location.reload());

if (match || example) void load();
else $('status').textContent = 'Avaa agentin jälki tilauksen maksusivulta, kun demomaksu on hyväksytty. Yllä näet lyhyesti, miten tilausapuri toimii.';
