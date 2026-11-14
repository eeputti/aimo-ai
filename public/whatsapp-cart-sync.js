// Poll only our own origin. Source URLs and capability tokens stay on the Node server.
export function startWhatsAppCartSync(cart, { fetchImpl = fetch, intervalMs = 3000 } = {}) {
  let stopped = false; let timer; let blocked = false;
  const guard = (event) => {
    if (blocked) { event.preventDefault(); event.stopImmediatePropagation(); say('Odota, että WhatsApp-kori on ajan tasalla ennen tilaamista.', true); }
  };
  const clickGuard = (event) => { if (event.target.closest?.('.cart-checkout')) guard(event); };
  window.addEventListener('aimo:order-checkout', guard, true);
  document.addEventListener('click', clickGuard, true);
  let notice;
  const say = (text, error = false) => {
    if (!document.querySelector('#cart-content')) return;
    if (!notice) {
      notice = document.createElement('p'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
      document.querySelector('#cart-content').before(notice);
    }
    notice.textContent = text; notice.style.color = error ? '#a32020' : '';
  };
  const tick = async () => {
    if (stopped) return;
    try {
      const response = await fetchImpl('/api/storefront/whatsapp-cart', { cache: 'no-store' });
      const snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.error || 'WhatsApp-korin yhteys katkesi.');
      if (!snapshot.enabled) { stopped = true; blocked = false; return; }
      blocked = snapshot.state === 'waiting';
      if (snapshot.state === 'waiting') say('WhatsApp-ostoslista odottaa vielä tarkkaa tuotevalintaa tai toimitustietoja. Nykyinen kori säilyy.');
      else {
        await cart.syncWhatsApp(snapshot);
        say(snapshot.state === 'empty' ? 'WhatsApp-kori on tyhjä tai suljettu.' : 'Ostoskori päivittyy WhatsApp-keskustelusta automaattisesti.');
      }
    } catch (error) { blocked = true; say(`${error.message} Nykyinen ostoskori säilyy.`, true); }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); window.removeEventListener('aimo:order-checkout', guard, true); document.removeEventListener('click', clickGuard, true); };
}
