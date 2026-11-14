// Korin nykyinen ulkoasu säilyy; tarkistus ja hyväksyttävät muutokset tulevat tuoteriveille.
const cart = window.aimoCart;
const content = document.querySelector('#cart-content');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => n == null ? 'Hinta ei tiedossa' : `${Number(n).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/cart-workflow.css'; document.head.append(css);
let review = null; let busy = false; let applying = false; let message = '';
const signature = () => JSON.stringify([cart.get().selectedDate, cart.get().references[cart.get().selectedDate] || '', cart.lines().map((p) => [p.id, p.qty, p.price, p.vat])]);
let checkedSignature = '';
const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok && !data.needsReview) throw new Error(data.error?.message || data.error || 'Tarkistus epäonnistui. Yritä uudelleen.');
  return data;
};
const changed = (p, l) => l?.ok && (p.price == null || Math.abs(p.price - l.product.price) > 0.004 || p.qty !== l.product.qty);
const pendingSub = (p) => p.substituteFor && !p.substitutionAccepted;
const pending = () => cart.lines().some((p) => pendingSub(p) || changed(p, review?.lines.find((l) => l.id === p.id)));
const observer = new MutationObserver(() => paint());
function paint() {
  if (!content) return;
  observer.disconnect();
  content.querySelectorAll('[data-workflow-row]').forEach((el) => el.remove());
  for (const p of cart.lines()) {
    const l = review?.lines.find((l) => l.id === p.id);
    const target = [...content.querySelectorAll('tbody[data-product]')].find((el) => el.dataset.product === p.id);
    if (!target) continue;
    let html = '';
    if (l && !l.ok) {
      html = `<p>${l.code === 'UNKNOWN_PRODUCT' ? 'Tuotetta ei löydy tilattavasta valikoimasta. Valitse uusi tuote hausta tai poista rivi.' : 'Tätä määrää ei voi tilata valitulle toimituspäivälle.'}</p>${l.nextDeliveryDate ? `<button type="button" data-wf="move" data-id="${esc(p.id)}" data-date="${l.nextDeliveryDate}">Siirrä päivälle ${l.nextDeliveryDate.split('-').reverse().join('.')}</button>` : ''}${l.alternatives.length ? l.alternatives.map((a, i) => `<div class="cart-replacement"><img src="/img/${encodeURIComponent(a.id)}" alt="" onerror="this.hidden=true"><span><b>${esc(a.name)}</b><small>${a.qty} ${esc(a.unitLabel)}, ${money(a.price * a.qty)} (alv 0 %)</small>${a.warnings?.length ? `<small>${esc(a.warnings.join(', '))}</small>` : ''}</span><button type="button" data-wf="replace" data-id="${esc(p.id)}" data-option="${i}">Hyväksy korvaaja</button></div>`).join('') : l.code === 'UNKNOWN_PRODUCT' ? '' : '<p>Sopivaa korvaajaa ei löytynyt. Vaihda toimituspäivää tai poista tuote.</p>'}`;
    } else if (l && changed(p, l)) {
      html = `<p>Päivitetty määrä ${l.product.qty} ${esc(l.product.unitLabel)}, yksikköhinta ${money(l.product.price)} (alv 0 %).</p><button type="button" data-wf="update" data-id="${esc(p.id)}">Hyväksy muutos</button>`;
    } else if (pendingSub(p)) {
      html = `<p>Ehdotettu korvaaja tuotteelle ${esc(p.substituteFor.name)}. Tarkista sopivuus, määrä ja pakkauskoko.${p.warnings?.length ? ` ${esc(p.warnings.join(', '))}` : ''}</p><button type="button" data-wf="accept-sub" data-id="${esc(p.id)}">Hyväksy korvaaja</button>`;
    }
    if (html) target.insertAdjacentHTML('beforeend', `<tr data-workflow-row class="cart-review-row"><td colspan="7">${html}</td></tr>`);
  }
  const button = content.querySelector('.cart-checkout');
  if (button) {
    button.dataset.wf = 'order';
    button.disabled = busy || !cart.lines().length;
    button.title = '';
    button.textContent = busy ? 'TARKISTETAAN…' : 'TARKISTA JA TILAA';
    if (!content.querySelector('[data-wf="review"]')) {
      const check = document.createElement('button'); check.type = 'button'; check.dataset.wf = 'review'; check.textContent = 'Tarkista tuoterivit ja korvaajat'; button.after(check);
    }
    let note = content.querySelector('.cart-review-note');
    if (!note) { note = document.createElement('p'); note.className = 'cart-review-note'; note.setAttribute('role', 'status'); button.after(note); }
    note.textContent = message || (review ? review.ok && !pending() ? 'Tuoterivit tarkistettu. Tarkista vielä sitova tarjous ennen tilauksen lähettämistä.' : 'Hyväksy muutokset tai ratkaise puuttuvat tuotteet ennen vahvistusta.' : 'Tarkista ja tilaa näyttää tarjouksen, korvaajat ja toimituspäivät ennen lähettämistä.');
  }
  observer.observe(content, { childList: true, subtree: true });
}
async function runReview() {
  const before = signature(); busy = true; review = null; checkedSignature = ''; message = ''; paint();
  try {
    const data = await post('/api/storefront/review', { deliveryDate: cart.get().selectedDate, lines: cart.lines().map((p) => ({ id: p.id, qty: p.qty })) });
    if (before === signature()) { review = data; checkedSignature = before; }
  } catch (e) { message = e.message; }
  finally { busy = false; paint(); }
}
async function applyProduct(old, product, qty, extra = {}) {
  const date = cart.get().selectedDate;
  const expected = { lines: JSON.stringify(cart.lines(date)) };
  applying = true;
  try {
    await cart.replace(old.id, { ...old, ...product, unit: product.unitLabel || old.unit, availableFrom: product.availability?.deliveryDate, taxUnknown: product.vat == null, availabilityNote: null, image: `/img/${encodeURIComponent(product.id)}`, ...extra }, qty, date, expected);
    review = null;
  } finally { applying = false; }
  await runReview();
}
content?.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-wf]'); if (!b || busy) return;
  const action = b.dataset.wf;
  if (action === 'review') { await runReview(); return; }
  if (action === 'order') { window.dispatchEvent(new Event('aimo:order-checkout')); return; }
  const old = cart.lines().find((p) => p.id === b.dataset.id); if (!old) return;
  if (action === 'move') { cart.move(b.dataset.date, old.id); await runReview(); return; }
  const l = review?.lines.find((l) => l.id === old.id);
  b.disabled = true; busy = true;
  try {
    if (action === 'replace') { const a = l.alternatives[+b.dataset.option]; await applyProduct(old, a, a.qty, { substitutionAccepted: true }); }
    if (action === 'update') await applyProduct(old, l.product, l.product.qty);
    if (action === 'accept-sub') await applyProduct(old, old, old.qty, { substitutionAccepted: true });
  } catch (e) { busy = false; message = e.message; paint(); }
});
window.addEventListener('aimo:cart-change', () => {
  if (!applying) { review = null; message = ''; }
  queueMicrotask(paint);
});
if (cart && content) {
  await cart.ready; paint();
  if (location.hash === '#tarkista' && cart.lines().length) await runReview();
}
