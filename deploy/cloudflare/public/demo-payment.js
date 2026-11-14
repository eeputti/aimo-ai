const $ = id => document.getElementById(id);
const linkPattern = /^(AGW-\d{8}-\d{4,12})\.([A-Za-z0-9_-]{43})$/;
let match = linkPattern.exec(location.hash.slice(1));
const money = cents => new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(cents / 100);
let paid = false, busy = false;
async function request(simulate) {
  const response = await fetch(`/api/demo-payments/${match[1]}`, {
    method: simulate ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${match[2]}`, ...(simulate ? { 'content-type': 'application/json' } : {}) },
    ...(simulate ? { body: JSON.stringify({ simulate }) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Maksusivua ei voitu avata.');
  return data;
}
function confirmation(email) {
  const messages = { sent: 'Vahvistussähköposti on lähetetty testiosoitteeseen.', not_requested: 'Testisähköpostiosoitetta ei ole asetettu.',
    sender_missing: 'Vahvistussähköposti odottaa lähettäjän käyttöönottoa.', retry: 'Vahvistussähköpostin lähetystä yritetään uudelleen.',
    sending: 'Vahvistussähköpostia lähetetään.', failed: 'Vahvistussähköpostin lähetys epäonnistui. Ota yhteys demon ylläpitäjään.' };
  return messages[email] || 'Vahvistussähköposti odottaa lähetystä.';
}
function completed(email) {
  paid = true; $('heading').textContent = 'Demomaksu onnistui.';
  $('status').textContent = `Rahaa ei veloitettu. ${confirmation(email)}`;
  // A retry completes a previously interrupted mail send without repeating the payment.
  $('pay').textContent = 'Tarkista vahvistuksen lähetys';
  $('pay').hidden = ['sent', 'not_requested', 'failed'].includes(email);
  $('cancel').hidden = true;
}
async function load() {
  const data = await request();
  $('order-id').textContent = data.order.orderId;
  $('delivery').textContent = data.order.deliveryDate ? new Intl.DateTimeFormat('fi-FI', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${data.order.deliveryDate}T12:00:00Z`)) : 'Toimituspäivä puuttuu';
  $('amount').textContent = money(data.payment.amountNetCents);
  $('lines').replaceChildren(...data.order.lines.map(line => {
    const row = document.createElement('li'), name = document.createElement('span'), quantity = document.createElement('span');
    name.textContent = line.name; quantity.textContent = `${new Intl.NumberFormat('fi-FI').format(line.quantity)} ${line.unit}`;
    row.append(name, quantity); return row;
  }));
  $('summary').hidden = false;
  if (data.payment.status === 'paid') completed(data.email);
  else $('status').textContent = 'Tilaus odottaa demomaksua. Tarkista tuotteet ja toimituspäivä ennen hyväksymistä.';
}
async function act(simulate) {
  if (busy) return;
  busy = true; $('pay').disabled = true; $('cancel').disabled = true;
  try {
    const data = await request(simulate);
    if (data.status === 'paid') completed(data.email);
    else $('status').textContent = 'Demomaksu keskeytettiin. Tilaus odottaa edelleen maksua, eikä vahvistussähköpostia lähetetty.';
  } catch (error) {
    $('status').textContent = `${error.message} ${paid ? 'Demomaksu on jo hyväksytty.' : 'Tarkista tilanne lataamalla sivu uudelleen tai yritä uudestaan.'}`;
  } finally { busy = false; $('pay').disabled = false; $('cancel').disabled = false; }
}
$('pay').addEventListener('click', () => { void act('success'); });
$('cancel').addEventListener('click', () => { void act('cancel'); });
// A second link to this same page can change only the fragment; restart its read
// so the previous order's summary and action handlers cannot remain on screen.
window.addEventListener('hashchange', () => location.reload());
async function init() {
  const orderId = location.hash.slice(1);
  if (!match && /^AGW-\d{8}-\d{4,12}$/.test(orderId)) {
    // The WhatsApp cart can hand off only its order id. Resolve its published demo
    // capability here without exposing the publisher secret to that browser.
    $('status').textContent = 'Odotetaan tilauksen siirtymistä maksusivulle…';
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch('/api/orders', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Tilausyhteys ei juuri nyt vastaa. Lataa sivu hetken kuluttua uudelleen.');
      const data = await response.json();
      const payment = data.orders?.find(order => order.orderId === orderId)?.demoPayment;
      if (payment?.mode === 'demo' && payment.url) {
        const url = new URL(payment.url, location.origin);
        const candidate = linkPattern.exec(url.hash.slice(1));
        if (url.origin !== location.origin || url.pathname !== '/demo-payment.html' || !candidate || candidate[1] !== orderId) throw new Error('Demomaksulinkki on virheellinen.');
        match = candidate; history.replaceState(null, '', url.hash); break;
      }
      if (attempt < 7) await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (!match) throw new Error('Tilausta vielä julkaistaan tai sillä ei ole demomaksua. Lataa sivu hetken kuluttua uudelleen.');
  }
  if (match) await load();
  else $('status').textContent = 'Avaa demomaksu tilauksen omasta maksulinkistä.';
}
void init().catch(error => { $('status').textContent = error.message; });
