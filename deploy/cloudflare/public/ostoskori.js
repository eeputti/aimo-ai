// Ostoskori-välilehti: avaa tämän selaimen keskustelun ostoskorin samalla sivustolla (/whatsapp/cart#…).
const $ = (id) => document.getElementById(id);
function show(title, detail) {
  $('cart-title').textContent = title; $('cart-detail').textContent = detail; $('cart-actions').hidden = false;
}
async function init() {
  try {
    const response = await fetch('/api/chat/cart', { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    const data = await response.json().catch(() => ({}));
    if (response.ok && typeof data.url === 'string' && /^\/whatsapp\/cart#[A-Za-z0-9_.-]+$/.test(data.url)) { location.replace(data.url); return; }
    if (!response.ok) return show('Ostoskori ei ole juuri nyt saatavilla.', data.error || 'Tilausapurin palvelin on tauolla. Yritä hetken päästä uudelleen.');
    show('Ostoskori on vielä tyhjä.', 'Kerro tilausapurille, mitä keittiöön tarvitaan ja milloin. Ostoskori syntyy keskustelussa, ja näet sen täällä.');
  } catch { show('Ostoskoria ei saatu haettua.', 'Tarkista yhteys ja lataa sivu uudelleen.'); }
}
void init();
