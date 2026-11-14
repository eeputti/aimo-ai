import { createStorefrontOrder } from './storefront-order.js';

const cart = window.aimoCart;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => Number(n).toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
const labels = { confirmed: 'Vahvistettu', pending_approval: 'Odottaa hyväksyntää', rejected: 'Hylätty' };
const flags = { STOCK_UNKNOWN: 'Saldomäärää ei ole vahvistettu', DELIVERY_DATE_SHIFT: 'Toimituspäivä muuttuu', PARTIAL_FILL_SPLIT: 'Osatoimitus ja korvaava tuote', SUBSTITUTION_WITHIN_POLICY: 'Korvaava tuote valtuuden sisällä', SUBSTITUTION_OUTSIDE_POLICY: 'Korvaava tuote vaatii hyväksynnän' };
let buyers = []; let buyer; let orders = []; let busy = false; let view = 'orders'; let choices = [];
const localShop = !!document.querySelector('meta[name="aimo-local-shop"]');
const api = async (url, body, account) => {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(account ? { authorization: `Bearer ${account.demoKey}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Palvelupyyntö epäonnistui.');
  return result;
};
const flow = createStorefrontOrder({ cart, request: api });
const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/storefront-agent.css'; document.head.append(style);
const launcher = [...document.querySelectorAll('.main-nav button')].find((b) => b.textContent.trim() === 'Tilaukset') || document.createElement('button');
if (!launcher.isConnected) { launcher.type = 'button'; launcher.className = 'sf-agent-launch'; launcher.textContent = 'Tilaukset'; document.querySelector('.main-nav')?.append(launcher); }
const dialog = document.createElement('dialog'); dialog.className = 'sf-agent';
dialog.innerHTML = `<header><h2>Tilaukset</h2><button type="button" data-sf="close" aria-label="Sulje tilaukset">Sulje</button></header>
  <label>Ostaja <select aria-label="Ostaja" data-sf-buyer></select></label>
  <nav aria-label="Tilauksen toiminnot"><button type="button" data-sf="cart">Tarkista ostoskori</button><button type="button" data-sf="orders">Tilaukset ja hyväksynnät</button><button type="button" data-sf="mandate">Valtuudet</button></nav>
  <p class="sf-note" data-sf-mode></p><p role="status" data-sf-message></p><div data-sf-content></div>`;
document.body.append(dialog);
if (localShop) dialog.querySelector('[data-sf-mode]').insertAdjacentHTML('beforebegin', '<p><a href="/demo" target="_blank" rel="noopener">Avaa tilausapuri</a></p>');
const content = dialog.querySelector('[data-sf-content]'); const message = dialog.querySelector('[data-sf-message]'); const select = dialog.querySelector('[data-sf-buyer]');
const say = (text, error = false) => { message.textContent = text; message.className = error ? 'sf-error' : ''; };
const reasonList = (reasons = []) => `<ul>${reasons.map((r) => `<li>${esc(r.message || r.code)}</li>`).join('')}</ul>`;
const lineList = (lines = []) => `<ul>${lines.map((l) => `<li>${esc(l.name)}: ${esc(l.quantity)} ${esc(l.salesUnitLabel)} — ${money(l.lineNet)}${l.substituteFor ? `, korvaa tuotteen ${esc(l.substituteFor)}` : ''}</li>`).join('')}</ul>`;
const orderReference = (o) => localShop && /^whatsapp:WD-/.test(o.buyerReference || '') ? 'Tilattu tilausapurissa.' : o.buyerReference || '';
const load = async () => {
  const [state, context] = await Promise.all([api('/console/state'), localShop ? api('/api/local-shop') : null]);
  buyers = context ? state.buyers.filter((b) => context.accounts.some((a) => a.buyerId === b.id)) : state.buyers;
  orders = state.orders;
  let savedBuyer; try { savedBuyer = localStorage.getItem('aimo.storefront.buyer'); } catch {}
  const prior = buyer?.id || flow.pending?.buyerId || savedBuyer || context?.defaultBuyerId;
  buyer = buyers.find((b) => b.id === prior) || buyers.find((b) => b.id === context?.defaultBuyerId) || buyers[0];
  if (!buyer) {
    select.innerHTML = ''; content.innerHTML = '';
    throw new Error(localShop ? 'Lähetä tilausapurille ensimmäinen viesti. Testiasiakas ilmestyy tähän automaattisesti.' : 'Ostajatietoja ei saatu ladattua.');
  }
  select.innerHTML = buyers.map((b) => `<option value="${esc(b.id)}"${b.id === buyer.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  if (context) {
    const account = context.accounts.find((a) => a.buyerId === buyer.id);
    const company = document.querySelector('.account .customer'); const person = document.querySelector('.account .user-name');
    if (company) company.textContent = account.name;
    if (person) person.textContent = account.personName;
  }
  dialog.querySelector('[data-sf-mode]').textContent = `${localShop ? 'Paikallinen testikauppa. Tilausapurissa hyväksymäsi tilaus näkyy tässä samalla tilausnumerolla. ' : ''}${state.mode.api === 'live' ? 'Hinnat ja saatavuus Valion mock-rajapinnasta.' : 'Simuloidut hinnat ja saatavuus.'} Tilaukset tallennetaan demoon. Maksamista ei ole kytketty.${state.clock?.simulated ? ' Käytössä on demon simuloitu kello.' : ''}`;
};
function showQuote() {
  view = 'cart';
  const quote = flow.quote;
  if (flow.pending) { content.innerHTML = '<p>Aiemman tilauspyynnön vastaus jäi saamatta. Uudelleenyritys hakee saman tilauksen eikä luo toista.</p><button type="button" class="sf-primary" data-sf="submit">Yritä uudelleen</button>'; return; }
  if (!quote || !flow.valid(buyer)) { content.innerHTML = '<p>Hae tuotteet verkkokaupan hausta ja lisää ne ostoskoriin. Tarkista sitten koko korin hinnat ja saatavuus.</p><div class="sf-agent-actions"><a href="/cart.html">Avaa ostoskori</a><button type="button" class="sf-primary" data-sf="prepare">Tarkista hinnat ja saatavuus</button></div>'; return; }
  const complete = quote.needs.every((n) => n.options?.length);
  content.innerHTML = `<p>${esc(quote.priceSource)}. Toivottu toimitus ${esc(quote.deliveryDate)}.</p>${quote.needs.map((n, i) => {
    const o = n.options[choices[i] || 0];
    return `<article><h3>${esc(cart.lines().find((p) => String(p.id) === n.ref)?.name || n.ref)}</h3>${o ? `<label>Vaihtoehto <select data-sf-choice="${i}">${n.options.map((option, j) => `<option value="${j}"${j === (choices[i] || 0) ? ' selected' : ''}>${esc(option.lines.map((l) => l.name).join(' + '))}, ${money(option.totals.net)} (alv 0 %)</option>`).join('')}</select></label>${lineList(o.lines)}<p>Toimitus ${esc(o.deliveryDate)}, tarjous voimassa ${esc(o.expiresAt)} asti.</p>${reasonList((o.flags || []).map((f) => ({ message: flags[f] || f })))}${reasonList(o.mandatePreview?.reasons)}` : `<p class="sf-error">Tuotteelle ei ole saatavilla tarjousta. Poista tai vaihda tuote ostoskorissa.</p>${reasonList(n.excluded)}`}</article>`;
  }).join('')}${complete ? `<p><b>Tarjouksen summa (alv 0 %): ${money(quote.needs.reduce((sum, n, i) => sum + n.options[choices[i] || 0].totals.net, 0))}</b></p>` : ''}<button type="button" class="sf-primary" data-sf="submit"${complete ? '' : ' disabled'}>Lähetä tilaus</button> <button type="button" data-sf="prepare">Tarkista uudelleen</button>`;
}
function showOrders() {
  view = 'orders';
  const own = orders.filter((o) => o.buyerId === buyer.id);
  content.innerHTML = `<button type="button" data-sf="refresh">Päivitä tilaukset</button>${own.length ? own.map((o) => `<article><h3>${esc(labels[o.status] || o.status)} — ${esc(o.orderId)}</h3><p>${esc(orderReference(o))} Toimitus ${esc(o.deliveryDate || '')}, ${money(o.totals?.net || 0)} (alv 0 %)</p>${lineList(o.lines)}${reasonList(o.reasons)}${o.status === 'pending_approval' || o.pendingAddition ? `<button type="button" data-sf="approve" data-order="${esc(o.orderId)}">Hyväksy ${o.pendingAddition ? 'lisäys' : 'tilaus'}</button> <button type="button" data-sf="reject" data-order="${esc(o.orderId)}">Hylkää ${o.pendingAddition ? 'lisäys' : 'tilaus'}</button>${o.pendingAddition ? lineList(o.pendingAddition.lines) + reasonList(o.pendingAddition.reasons) : ''}` : ''}<p><button type="button" data-sf="audit" data-order="${esc(o.orderId)}">Näytä päätösketju</button></p><div data-audit="${esc(o.orderId)}"></div></article>`).join('') : '<p>Ei vielä tilauksia tälle ostajalle.</p>'}`;
}
function showMandate() {
  view = 'mandate'; const m = buyer.mandate;
  content.innerHTML = `<p>Valtuudet määrittävät, milloin tilaus vahvistuu automaattisesti ja milloin se tarvitsee ihmisen hyväksynnän.</p><label>Hyväksyntä <select data-level>${[['always', 'Hyväksy aina itse'], ['exceptions', 'Hyväksy vain poikkeukset'], ['autonomous', 'Autonominen valtuuden rajoissa']].map(([v, label]) => `<option value="${v}"${m.approval === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Tilauskohtainen raja (€) <input data-cap="order" type="number" min="0" step="0.01" value="${esc(m.maxOrderNet ?? '')}"></label><label>Päiväkohtainen raja (€) <input data-cap="day" type="number" min="0" step="0.01" value="${esc(m.maxDayNet ?? '')}"></label><p>Ruokavalio- ja korvaussäännöt säilyvät ostajan nykyisen valtuuden mukaisina.</p><button type="button" class="sf-primary" data-sf="save-mandate">Tallenna valtuudet</button>`;
}
async function open(next = 'orders') {
  if (!dialog.open) dialog.showModal();
  await act(async () => { await load(); say(''); next === 'cart' ? showQuote() : showOrders(); });
}
async function act(work) {
  if (busy) return; busy = true; dialog.setAttribute('aria-busy', 'true');
  try { await work(); } catch (error) { say(error.message, true); }
  finally { busy = false; dialog.removeAttribute('aria-busy'); }
}
launcher.addEventListener('click', () => open());
select.addEventListener('change', () => { if (busy) { select.value = buyer?.id || ''; return; } buyer = buyers.find((b) => b.id === select.value); if (!buyer) return; try { localStorage.setItem('aimo.storefront.buyer', buyer.id); } catch { /* preference only */ } say(''); choices = []; view === 'cart' ? showQuote() : view === 'mandate' ? showMandate() : showOrders(); if (localShop) act(load); });
dialog.addEventListener('change', (event) => { if (event.target.dataset.sfChoice !== undefined) { choices[Number(event.target.dataset.sfChoice)] = Number(event.target.value); showQuote(); } });
dialog.addEventListener('click', (event) => {
  const b = event.target.closest('[data-sf]'); if (!b || busy) return;
  act(async () => {
    const action = b.dataset.sf; say('');
    if (action === 'close') dialog.close();
    if (!buyer && !['close', 'orders', 'refresh'].includes(action)) return;
    if (action === 'cart') showQuote();
    if (action === 'orders' || action === 'refresh') { await load(); showOrders(); }
    if (action === 'mandate') showMandate();
    if (action === 'prepare') { say('Tarkistetaan hinnat ja saatavuus…'); await flow.prepare(buyer); choices = []; say('Tarkista tuotteet, mahdolliset korvaajat ja toimituspäivät ennen lähettämistä.'); showQuote(); }
    if (action === 'submit') { const o = await flow.submit(buyer, choices); await load(); showOrders(); say(`Tilaus ${o.orderId}: ${labels[o.status] || o.status}.`); }
    if (action === 'approve' || action === 'reject') { const o = await api(`/console/orders/${encodeURIComponent(b.dataset.order)}/${action}`, { by: 'verkkokaupan ostaja' }); await load(); showOrders(); say(`Tilaus ${o.orderId}: ${labels[o.status] || o.status}.`); }
    if (action === 'audit') { const a = await api(`/console/orders/${encodeURIComponent(b.dataset.order)}/audit`); const target = [...content.querySelectorAll('[data-audit]')].find((el) => el.dataset.audit === b.dataset.order); target.innerHTML = `<p>Päätösketju: ${a.chain?.valid ? 'ehjä' : 'tarkista virheet'}</p><ol>${a.entries.map((e) => `<li>${esc(e.ts)}: ${esc(e.type)} (${esc(e.actor)})</li>`).join('')}</ol>`; }
    if (action === 'save-mandate') {
      const cap = (name) => { const value = content.querySelector('[data-cap="' + name + '"]').value; return value === '' ? null : Number(value); }; const order = cap('order'); const day = cap('day');
      if (![order, day].every((v) => (v === null || (Number.isFinite(v) && v >= 0)))) throw new Error('Anna nolla tai positiivinen euromäärä.');
      await api(`/console/buyers/${encodeURIComponent(buyer.id)}/mandate`, { approval: content.querySelector('[data-level]').value, maxOrderNet: order, maxDayNet: day }); await load(); showMandate(); say('Valtuudet tallennettu.');
    }
  });
});
window.addEventListener('aimo:cart-change', () => { if (dialog.open && view === 'cart' && !busy) showQuote(); });
window.addEventListener('aimo:order-checkout', () => open('cart'));
if (localShop) {
  setInterval(() => {
    if (dialog.open && view === 'orders' && !busy && !document.hidden) act(async () => { await load(); showOrders(); say(''); });
  }, 3000);
  if (new URL(location.href).searchParams.get('shop') === 'orders') open();
}
