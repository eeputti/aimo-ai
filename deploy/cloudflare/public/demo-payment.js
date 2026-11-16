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
  // The same capability opens this order's agent trace; nothing else is needed from the server.
  $('trace').href = `/agentti.html#${match[1]}.${match[2]}`;
  $('trace').hidden = false;
}
// Tämän selaimen omat tilaukset (Tilaukset-sivu). Vain avattujen, voimassa olevien linkkien numero ja tunniste.
const OWN = 'aimo.ownOrders.v1';
function remember(orderId, token) {
  try {
    const list = JSON.parse(localStorage.getItem(OWN) || '[]').filter(l => l && l.orderId !== orderId);
    localStorage.setItem(OWN, JSON.stringify([{ orderId, token }, ...list].slice(0, 50)));
  } catch { /* Tallennus voi olla estetty; maksusivu toimii silti linkistä. */ }
}
async function load() {
  // Juuri vahvistettu tilaus siirtyy tänne muutamassa sekunnissa: odotetaan hetki ennen kuin linkkiä pidetään virheellisenä.
  let data;
  for (let attempt = 0; ; attempt++) {
    try { data = await request(); break; }
    catch (error) {
      if (attempt >= 7) throw error;
      $('status').textContent = 'Odotetaan tilauksen siirtymistä maksusivulle…';
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  remember(match[1], match[2]);
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
function init() {
  if (match) return load();
  // Pelkällä tilausnumerolla ei avaudu mitään: tilaus näkyy vain sen omasta linkistä.
  $('status').textContent = /^AGW-\d{8}-\d{4,12}$/.test(location.hash.slice(1))
    ? 'Avaa demomaksu tilauksen omasta linkistä (ostoskorin Siirry demomaksuun -painike).'
    : 'Avaa demomaksu tilauksen omasta maksulinkistä.';
}
void Promise.resolve().then(init).catch(error => { $('status').textContent = error.message; });
