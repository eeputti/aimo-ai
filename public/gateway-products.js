// Tuotekortit konsoliin: mitä ostaja-agentit ovat portin kautta tilanneet, samassa korttimuodossa kuin Aimon toimitustukussa.
// Oma moduulinsa, ei osa gateway.js:ää: lukee saman /console/state-tilan ja päivittyy lokitapahtumista.
const root = document.querySelector('#products');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (n) => `${(+n).toFixed(2).replace('.', ',')} €`;
const num = (n) => String(n).replace('.', ',');
const svg = (d, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  doc: svg('<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 13h5M10 17h5"/>', 20),
  cart: svg('<path d="M2.500 4h3l2.600 11h10.400l2-8H7"/><circle cx="9.500" cy="19" r="1.400"/><circle cx="17" cy="19" r="1.400"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20a2 2 0 0 0 4 0"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>', 20),
  left: svg('<path d="m14 6-6 6 6 6"/>'),
  right: svg('<path d="m10 6 6 6-6 6"/>'),
};
const STATUS = { confirmed: ['ok', 'Vahvistettu'], pending_approval: ['wait', 'Odottaa hyväksyntää'], rejected: ['no', 'Hylätty'] };
const when = (iso) => new Date(iso).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

// Toimitusvarmuus ja hiilijalanjälki pieninä merkkeinä tuoterivillä. Puuttuva tieto ei näy lainkaan: tyhjä ei saa näyttää tarkistetulta.
const ECO_ICON = {
  truck: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h11v10H2zM13 10h4l4 3v3h-8z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 14zM5 19l7-7"/></svg>',
};
const ecoNum = (n, d) => n.toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d });
function ecoBadges(l) {
  const out = [];
  if (l.deliveryReliability != null) {
    const pct = l.deliveryReliability * 100;
    out.push(`<span class="eco-b ${pct >= 95 ? 'ok' : 'warn'}" title="Toimitusvarmuus ${ecoNum(pct, 1)} % Valion toimitusvarmuusdatan mukaan">${ECO_ICON.truck}${ecoNum(pct, 0)} %</span>`);
  }
  if (l.co2PerKg != null) out.push(`<span class="eco-b" title="Hiilijalanjälki ${ecoNum(l.co2PerKg, 2)} kg CO₂-ekv tuotekiloa kohti">${ECO_ICON.leaf}${ecoNum(l.co2PerKg, 1)} kg CO₂e/kg</span>`);
  return out.length ? `<span class="eco">${out.join('')}</span>` : '';
}

function card(o, l) {
  const [cls, label] = STATUS[o.status] || ['no', o.status];
  const gross = l.unitPriceNet * (1 + (l.vatRate ?? 13.5) / 100);
  const tags = [l.substituteFor ? '<span class="pc-tag sub">Korvaaja</span>' : '', l.addedIn ? '<span class="pc-tag add">Lisäys</span>' : ''].join('');
  const pending = o.status === 'pending_approval';
  return `<article class="pcard">
    ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
    <a class="pc-icon" href="/approve.html?order=${encodeURIComponent(o.orderId)}" target="_blank" rel="noopener" title="Avaa tilaus ${esc(o.orderId)} hyväksyntänäkymässä" aria-label="Avaa tilaus ${esc(o.orderId)}">${ICON.doc}</a>
    <div class="pc-img"><img src="/img/${encodeURIComponent(l.productId)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pc-noimg',textContent:'Ei kuvaa'}))"></div>
    <h3 class="pc-name">${esc(l.name)}</h3>
    <div class="pc-id">${esc(l.productId)}</div>
    <div class="pc-eco">${ecoBadges(l)}</div>
    <div class="pc-price">${eur(l.unitPriceNet)} <small>/ ${esc(l.salesUnitLabel)}</small></div>
    <div class="pc-buy">
      <div class="pc-sub">${num(l.quantity)} ${esc(l.salesUnitLabel)} = ${eur(l.lineNet)}${l.orders > 1 ? `, ${l.orders} tilausta` : ''}<br>${eur(gross)} / ${esc(l.salesUnitLabel)} (alv ${num(l.vatRate ?? 13.5)} %)</div>
      <a class="pc-go${pending ? ' ring' : ''}" href="#o-${esc(o.orderId)}" data-order="${esc(o.orderId)}" title="${pending ? 'Odottaa hyväksyntääsi: näytä tilaus' : 'Näytä tilaus'}" aria-label="Näytä tilaus ${esc(o.orderId)}">${pending ? ICON.bell : ICON.cart}</a>
    </div>
    <div class="pc-stock"><span class="pc-dot ${cls}"></span><span>${label}, ${esc(o.buyerName)}${l.orders > 1 ? ' ym.' : ''}</span><span class="pc-clock" title="Tilattu ${esc(when(o.createdAt))}">${ICON.clock}</span></div>
  </article>`;
}

async function render() {
  let s;
  try { s = await (await fetch('/console/state')).json(); } catch { return; }
  // Yksi kortti / tuote ja tila: sama maito viidessä vahvistetussa tilauksessa on yksi kortti, jossa määrät on laskettu yhteen.
  const groups = new Map();
  for (const o of s.orders) for (const l of o.lines || []) {
    const key = `${l.productId}|${o.status}`;
    const g = groups.get(key);
    if (g) { g.l.quantity += l.quantity; g.l.lineNet += l.lineNet; g.l.orders += 1; g.l.substituteFor ||= l.substituteFor; g.l.addedIn ||= l.addedIn; }
    else groups.set(key, { o, l: { ...l, orders: 1 } });
  }
  const cards = [...groups.values()].slice(0, 14).map(({ o, l }) => card(o, l));
  const keep = root.querySelector('.pc-track')?.scrollLeft || 0;
  root.innerHTML = `
    <div class="pc-head"><h2>Agenttien tilaamat tuotteet</h2><a href="#trail">Koko päätösketju</a></div>
    ${cards.length ? `<div class="pc-rail">
      <button type="button" class="pc-arrow prev" data-dir="-1" aria-label="Edelliset">${ICON.left}</button>
      <div class="pc-track">${cards.join('')}</div>
      <button type="button" class="pc-arrow next" data-dir="1" aria-label="Seuraavat">${ICON.right}</button>
    </div>` : '<p class="pc-empty">Yhtään tilausta ei ole vielä tehty. Aja skenaario alta tai kirjoita ostopyyntö yläreunan hakukenttään.</p>'}`;
  const track = root.querySelector('.pc-track');
  if (track) track.scrollLeft = keep;
}

root.addEventListener('click', (ev) => {
  const arrow = ev.target.closest('.pc-arrow');
  if (arrow) { const t = root.querySelector('.pc-track'); t.scrollBy({ left: +arrow.dataset.dir * Math.max(340, t.clientWidth * 0.8), behavior: 'smooth' }); return; }
  const go = ev.target.closest('.pc-go');
  if (go) { // tilauskortti on sivulla vain, jos se on hyväksyntälistalla tai viimeisimmissä: muuten avataan tilauksen oma näkymä
    const target = document.getElementById(`o-${go.dataset.order}`);
    ev.preventDefault();
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else window.open(`/approve.html?order=${encodeURIComponent(go.dataset.order)}`, '_blank', 'noopener');
  }
});

render();
let timer;
new EventSource('/console/events').addEventListener('ledger', () => { clearTimeout(timer); timer = setTimeout(render, 350); });
