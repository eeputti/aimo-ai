import { rail } from './storefront.js';

const cart = window.aimoCart;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name) => `<span class="icon" aria-hidden="true" style="--icon:url('/storefront-assets/icons/${name}.svg')"></span>`;
const money = (n) => n == null ? 'Hinta ei tiedossa' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const num = (n) => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: 6 });
const dateLabel = (iso) => iso.split('-').reverse().join('.');
const content = document.querySelector('#cart-content');
const days = document.querySelector('#cart-days');
const reference = document.querySelector('#cart-reference');
const status = document.querySelector('#cart-status');
let statusTimer; let alertClosedFor = '';
const tell = (text) => { clearTimeout(statusTimer); status.textContent = text; status.hidden = false; statusTimer = setTimeout(() => { status.hidden = true; }, 3500); };
const unavailable = (p, date) => !!p.availableFrom && p.availableFrom > date;

function row(p, date) {
  const problem = unavailable(p, date);
  const lineNet = p.price == null ? null : Math.round(p.price * p.qty * 100) / 100;
  const unit = esc(p.unit || 'kpl');
  return `<tbody id="cart-product-${esc(p.id)}" data-product="${esc(p.id)}">
    <tr>
      <td><div class="cart-product"><div class="cart-picture">${p.oldPrice ? '<span class="cart-sale-label">TARJOUS</span>' : ''}<img src="${esc(p.image || `/img/${encodeURIComponent(p.id)}`)}" alt="" loading="lazy" onerror="this.hidden=true"></div><div><span class="cart-product-name">${esc(p.name)}</span><span class="cart-product-code">${p.frozen ? icon('snow-flake') : ''}${esc(p.id)}${p.pack ? ` ${esc(p.pack)}` : ''}</span></div></div></td>
      <td><div class="cart-unit-price${p.oldPrice ? ' sale' : ''}"><span class="cart-price"><strong>${money(p.price)}</strong>${p.price == null ? '' : ` / ${unit}`}</span>${p.oldPrice ? `<del>${money(p.oldPrice)} / ${unit}</del>` : ''}</div></td>
      <td>${p.comparison != null ? `<span class="cart-price">${money(p.comparison)} / ${esc(p.comparisonUnit || 'kg')}</span>${p.oldComparison ? `<del>${money(p.oldComparison)} / ${esc(p.comparisonUnit || 'kg')}</del>` : ''}` : ''}</td>
      <td><div class="cart-quantity"><button type="button" data-quantity="-${p.step || 1}" aria-label="Vähennä määrää: ${esc(p.name)}"${p.qty <= (p.step || 1) ? ' disabled' : ''}>−</button><label><input type="number" min="0.000001" max="999999" step="any" value="${p.qty}" aria-label="Lisää haluttu määrä tuotteita ${esc(p.name)}"><span>${unit}</span></label><button type="button" data-quantity="${p.step || 1}" aria-label="Lisää määrää: ${esc(p.name)}">+</button></div></td>
      <td>${p.contains || p.qty !== 1 ? `${num(p.qty * (p.contains || 1))} ${p.contains ? 'kpl' : unit}` : ''}</td>
      <td class="cart-line-total"><strong>${money(lineNet)}</strong>${lineNet == null ? '' : p.taxUnknown ? '<small>Alv tarkistetaan</small>' : `<small>${money(lineNet * (1 + (p.vat ?? 13.5) / 100))} (alv ${p.vat ?? 13.5} %)</small>`}</td>
      <td><button type="button" class="cart-remove" data-remove="${esc(p.id)}" aria-label="Poista tuote ostoskorista: ${esc(p.name)}">${icon('trash')}</button></td>
    </tr>
    ${problem ? `<tr class="cart-problem"><td colspan="7">${p.availabilityNote ? `<p>${esc(p.availabilityNote)}</p>` : ''}<div class="cart-move-line">${icon('warning')}Ei saatavilla haluamallesi päivälle. Siirrä päivälle <button type="button" data-move="${esc(p.availableFrom)}">${dateLabel(p.availableFrom)}</button></div></td></tr>` : ''}
  </tbody>`;
}

function render() {
  const s = cart.get(); const date = s.selectedDate; const rows = cart.lines(); const t = cart.totals();
  days.innerHTML = Object.keys(s.carts).sort().map((d) => `<button type="button" class="cart-day" role="tab" aria-selected="${d === date}" aria-controls="cart-content" data-cart-day="${d}">${dateLabel(d)}<span class="cart-count">${s.carts[d].length}</span></button>`).join('');
  document.querySelector('#cart-selected-day').textContent = `Valittu toimitus ${dateLabel(date)}`;
  const removeDate = document.querySelector('[data-cart-action="remove-date"]');
  removeDate.disabled = Object.keys(s.carts).length < 2;
  removeDate.title = removeDate.disabled ? 'Säilytä yksi toimituspäivä. Voit tyhjentää sen ostoskorin.' : '';
  reference.value = s.references[date] || '';
  const missing = rows.filter((p) => unavailable(p, date));
  const warningKey = `${date}:${missing.map((p) => p.id).join(',')}`;
  content.innerHTML = `${missing.length && alertClosedFor !== warningKey ? `<div class="cart-alert" role="status">${icon('warning')}<p>Seuraavat tuotteet eivät ole saatavilla haluamallesi toimituspäivälle: ${missing.map((p) => `<a href="#cart-product-${esc(p.id)}">${esc(p.id)}</a>`).join(', ')}</p><button type="button" data-dismiss="${warningKey}" aria-label="Sulje saatavuusilmoitus">${icon('x')}</button></div>` : ''}
    <div class="cart-columns">
      ${rows.length ? `<table class="cart-table" aria-label="Ostoskorin tuotteet"><colgroup>${'<col>'.repeat(7)}</colgroup><thead><tr><th scope="col">Tuote</th><th scope="col">Yksikköhinta<span>(alv 0 %)</span></th><th scope="col">Vertailuhinta<span>(alv 0 %)</span></th><th scope="col">Määrä</th><th scope="col">Sis.</th><th scope="col">Hinta yhteensä<span>(alv 0 % / sis. alv)</span></th><th scope="col"><span class="sr-only">Poista</span></th></tr></thead>${rows.map((p) => row(p, date)).join('')}</table>` : `<div class="cart-empty"><p>Ostoskori on tyhjä.</p><button type="button" data-cart-action="search">Lisää tuotteita ostoskoriin</button></div>`}
      <aside class="cart-summary" aria-labelledby="cart-summary-title">
        <h3 id="cart-summary-title">Yhteenveto</h3>
        <dl><div><dt>Ostokset (alv 0 %)</dt><dd>${t.unpriced ? 'Hinta ei tiedossa' : money(t.net)}</dd></div><div><dt>Toimitusmaksu (alv 0 %)</dt><dd>0,00 €</dd></div><div><dt>Yhteensä (alv 0 %)</dt><dd>${t.unpriced ? 'Hinta ei tiedossa' : money(t.net)}</dd></div>
        ${Object.entries(t.vat).map(([rate, amount]) => `<div><dt>Alv ${rate} %</dt><dd>${money(amount)}</dd></div>`).join('')}
        <div class="cart-reservation"><dt>Lisävaraus <span title="Lisävaraus on 10 % arvonlisäverollisesta summasta">${icon('info')}</span></dt><dd>${t.unpriced || t.taxUnknown ? 'Tarkistetaan' : money(t.reservation)}</dd></div>
        <div class="cart-final"><dt>Yhteensä (sis. alv)</dt><dd>${t.unpriced || t.taxUnknown ? 'Tarkistetaan' : money(t.total)}</dd></div></dl>
        <button type="button" class="cart-checkout" data-cart-action="checkout" disabled title="Tarkista ensin hinnat ja saatavuus">SIIRRY MAKSAMAAN</button>
      </aside>
    </div>`;
}

const dialog = document.querySelector('#cart-date-dialog');
const dateInput = document.querySelector('#cart-date');
const dateError = document.querySelector('#cart-date-error');
let movingDate;
function openDate() {
  movingDate = cart.get().selectedDate; dateInput.value = movingDate; dateError.hidden = true;
  document.querySelector('#cart-date-description').textContent = `Siirrä toimituksen ${dateLabel(movingDate)} kaikki tuotteet uudelle päivälle. Vanha toimitusvälilehti poistuu. Saatavuus ja hinnat tarkistetaan uudelleen.`;
  document.querySelector('#cart-date-merge').hidden = true;
  dialog.showModal();
}
dateInput.addEventListener('input', () => { document.querySelector('#cart-date-merge').hidden = dateInput.value === movingDate || !cart.get().carts[dateInput.value]; });
document.querySelector('#cart-date-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  try {
    if (cart.get().selectedDate !== movingDate) throw new Error('Valittu toimituspäivä muuttui. Avaa päivän vaihto uudelleen.');
    cart.move(dateInput.value); dialog.close(); tell('Toimituspäivä vaihdettu. Tarkista tuotteiden saatavuus uudelleen.');
  }
  catch (e) { dateError.textContent = e.message; dateError.hidden = false; }
});
const removeDialog = document.querySelector('#cart-remove-date-dialog');
let removingDate;
document.querySelector('#cart-remove-date-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  try { cart.removeDate(removingDate); removeDialog.close(); tell('Toimituspäivä ja sen tuotteet poistettu.'); }
  catch (e) { const error = document.querySelector('#cart-remove-date-error'); error.textContent = e.message; error.hidden = false; }
});
reference.addEventListener('input', () => cart.reference(reference.value));
const cartSearch = document.querySelector('#cart-search');
window.aimoAsk.attach({ box: cartSearch.closest('.cart-product-search'), input: cartSearch, icon: cartSearch.previousElementSibling, placeholder: 'Lisää tuotteita' });
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.cartDay) { cart.select(b.dataset.cartDay); return; }
  if (b.dataset.dismiss) { alertClosedFor = b.dataset.dismiss; render(); return; }
  if (b.dataset.remove) { cart.remove(b.dataset.remove); tell('Tuote poistettu ostoskorista.'); return; }
  if (b.dataset.quantity) {
    const id = b.closest('[data-product]').dataset.product; const p = cart.lines().find((p) => p.id === id);
    try { cart.setQuantity(id, p.qty + Number(b.dataset.quantity)); } catch (e) { tell(e.message); }
    return;
  }
  if (b.dataset.move) { cart.move(b.dataset.move, b.closest('[data-product]').dataset.product); tell('Tuote siirretty toiselle toimituspäivälle.'); return; }
  if (b.dataset.cartAction === 'date') openDate();
  if (b.dataset.cartAction === 'select-date') cart.openDatePicker();
  if (b.dataset.cartAction === 'remove-date') {
    removingDate = cart.get().selectedDate;
    document.querySelector('#cart-remove-date-description').textContent = `Poistetaanko toimituspäivä ${dateLabel(removingDate)} ja sen ${cart.lines().length} tuotetta sekä tilaajan viite? Muiden toimituspäivien tuotteet säilyvät.`;
    document.querySelector('#cart-remove-date-error').hidden = true; removeDialog.showModal();
  }
  if (b.dataset.cartAction === 'cancel-date') dialog.close();
  if (b.dataset.cartAction === 'cancel-remove-date') removeDialog.close();
  if (b.dataset.cartAction === 'search') cartSearch.click();
  if (b.dataset.cartAction === 'print') window.print();
  if (b.dataset.cartAction === 'clear' && window.confirm('Haluatko varmasti tyhjentää tämän toimituspäivän ostoskorin?')) { cart.clear(); tell('Ostoskori tyhjennetty.'); }
  if (b.dataset.cartAction === 'export') {
    const cell = (v) => `"${String(v ?? '').replaceAll('"', '""').replace(/^[=+@-]/, "'$&")}"`;
    const rows = [['Tuotenumero', 'Tuote', 'Määrä', 'Yksikkö', 'Yksikköhinta (alv 0 %)', 'Toimituspäivä'], ...cart.lines().map((p) => [p.id, p.name, num(p.qty), p.unit, p.price == null ? '' : num(p.price), dateLabel(cart.get().selectedDate)])];
    const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `ostoskorin-tuotteet-${cart.get().selectedDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
content.addEventListener('change', (ev) => {
  if (!ev.target.matches('.cart-quantity input')) return;
  const id = ev.target.closest('[data-product]').dataset.product;
  try { cart.setQuantity(id, ev.target.value); } catch (e) { render(); tell(e.message); }
});
// Enter commits the edited quantity without submitting any order.
content.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('.cart-quantity input')) { ev.preventDefault(); ev.target.blur(); } });
window.addEventListener('aimo:cart-change', render);
try {
  await cart.ready; render();
  if (location.hash === '#toimituspaiva') {
    // Consume this navigation request so refreshing does not reopen the dialog.
    history.replaceState(history.state, '', location.pathname + location.search);
    cart.openDatePicker();
  }
  const d = await (await fetch('/storefront-cart-data.json')).json();
  if (d.recommendations?.length) document.querySelector('#cart-recommendations').innerHTML = rail('🎄Tilaa joulutuotteet ennakkoon', d.recommendations, { link: 'Katso kaikki' });
} catch (e) { content.textContent = e.message; }
