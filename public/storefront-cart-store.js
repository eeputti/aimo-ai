// Storefront-only basket. Never reads or writes the kitchen proposal or gateway orders.
(() => {
  const KEY = 'aimo.storefront.cart.v1';
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const amount = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
  const validDate = (d) => { const parsed = new Date(`${d}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d; };
  const number = (n) => Number(String(n).replace(',', '.'));
  // Remove only our untouched visual reference basket; preserve all user edits and additions.
  const untouchedReference = (saved, reference) => {
    if (!reference || !Object.values(reference.carts).some((rows) => rows.length) || saved.selectedDate !== reference.selectedDate || Object.values(saved.references || {}).some(Boolean)) return false;
    const signature = (carts) => JSON.stringify(Object.entries(carts).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => [date, rows.map((p) => [p.id, p.name, p.qty, p.price]).sort(([a], [b]) => a.localeCompare(b))]));
    return signature(saved.carts) === signature(reference.carts);
  };
  let state = { selectedDate: '2026-11-16', carts: {}, references: {} };
  let storageAvailable = true;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { storageAvailable = false; }
    window.dispatchEvent(new Event('aimo:cart-change'));
  };
  const lines = (date = state.selectedDate) => state.carts[date] ||= [];
  const ready = fetch('/storefront-cart-data.json').then((r) => {
    if (!r.ok) throw new Error('Ostoskoria ei voitu ladata.');
    return r.json();
  }).then((seed) => {
    state = copy(seed.cart);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && validDate(saved.selectedDate) && saved.carts && Object.values(saved.carts).every((rows) => Array.isArray(rows) && rows.every((p) => p.id && p.name && number(p.qty) > 0 && Number.isFinite(number(p.qty)))) && !untouchedReference(saved, seed.referenceCart)) state = { ...saved, references: saved.references || {} };
    } catch { /* a missing or invalid saved basket starts empty */ }
    // Refresh legacy photo URLs without changing the user's saved products or quantities.
    const photos = new Map([...Object.values(seed.referenceCart?.carts || seed.cart.carts).flat(), ...(seed.recommendations || [])].map((p) => [p.id, p.image]));
    for (const rows of Object.values(state.carts)) for (const p of rows) {
      const legacy = [`/img/${p.id}`, ...['jpg', 'png', 'webp'].map((ext) => `/storefront-assets/${p.id}.${ext}`)];
      if (photos.get(p.id) && (!p.image || legacy.includes(p.image))) p.image = photos.get(p.id);
    }
    window.dispatchEvent(new Event('aimo:cart-change'));
  });
  const totals = (date = state.selectedDate) => {
    const rows = lines(date); const vat = {}; let net = 0;
    const unpriced = rows.some((p) => p.price == null);
    const taxUnknown = rows.some((p) => p.taxUnknown);
    for (const p of rows) {
      if (p.price == null) continue;
      const amount = money(p.qty * p.price); net += amount;
      if (!p.taxUnknown) vat[p.vat ?? 13.5] = (vat[p.vat ?? 13.5] || 0) + amount * (p.vat ?? 13.5) / 100;
    }
    net = money(net);
    for (const rate of Object.keys(vat)) vat[rate] = money(vat[rate]);
    const gross = money(net + Object.values(vat).reduce((a, b) => a + b, 0));
    const reservation = money(gross * .1);
    return { count: rows.length, net, vat, gross, reservation, total: money(gross + reservation), unpriced, taxUnknown };
  };
  window.aimoCart = {
    ready, totals, get: () => copy(state), lines: (date) => copy(lines(date)),
    get storageAvailable() { return storageAvailable; },
    select(date) { if (!validDate(date)) throw new Error('Tarkista toimituspäivä.'); state.selectedDate = date; lines(date); save(); },
    setQuantity(id, value, date = state.selectedDate) {
      const p = lines(date).find((p) => p.id === id); const qty = number(value);
      if (!p || !Number.isFinite(qty) || amount(qty) <= 0 || qty > 999999) throw new Error('Anna positiivinen määrä, enintään 999 999.');
      p.qty = amount(qty); save();
    },
    remove(id, date = state.selectedDate) { state.carts[date] = lines(date).filter((p) => p.id !== id); save(); },
    clear(date = state.selectedDate) { state.carts[date] = []; save(); },
    reference(value) { state.references[state.selectedDate] = String(value).slice(0, 100); save(); },
    move(date, id = null) {
      if (!validDate(date)) throw new Error('Tarkista toimituspäivä.');
      const from = state.selectedDate; if (from === date) return;
      const moving = lines(from).filter((p) => !id || p.id === id);
      for (const p of moving) {
        const existing = lines(date).find((r) => r.id === p.id);
        if (existing) existing.qty = amount(existing.qty + p.qty);
        else lines(date).push(copy(p));
      }
      state.carts[from] = lines(from).filter((p) => !moving.includes(p));
      if (!id) state.selectedDate = date;
      save();
    },
    async add(product, qty = 1, date = state.selectedDate) {
      await ready;
      if (!validDate(date) || !product?.id || !product.name || !Number.isFinite(number(qty)) || amount(number(qty)) <= 0 || number(qty) > 999999) throw new Error('Tarkista tuote ja määrä.');
      const existing = lines(date).find((p) => p.id === String(product.id));
      if (existing) existing.qty = amount(existing.qty + number(qty));
      else lines(date).push({ ...copy(product), id: String(product.id), qty: amount(number(qty)) });
      state.selectedDate = date; save();
    },
  };
  const updateHeader = () => {
    const cartButton = document.querySelector('.header-actions .header-action:last-child');
    const dateButton = document.querySelector('.header-actions .header-action:first-child');
    const t = totals(); const date = state.selectedDate.split('-').reverse().join('.');
    if (cartButton) {
      cartButton.querySelector('.badge').textContent = t.count;
      cartButton.querySelector('b').textContent = t.unpriced ? 'Hinta ei tiedossa' : `${t.net.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
      cartButton.setAttribute('aria-label', `Ostoskori: ${t.count} tuotetta`);
    }
    if (dateButton) {
      dateButton.querySelector('b').textContent = date;
      dateButton.querySelector('.badge').textContent = Object.keys(state.carts).length;
      dateButton.setAttribute('aria-label', `Toimituspäivä ${date}`);
    }
  };
  document.querySelector('.header-actions .header-action:last-child')?.addEventListener('click', () => { location.href = '/cart.html'; });
  document.querySelector('.header-actions .header-action:first-child')?.addEventListener('click', () => {
    if (document.querySelector('#cart-date-dialog')) document.querySelector('[data-cart-action="date"]').click();
    else location.href = '/cart.html#toimituspaiva';
  });
  window.addEventListener('aimo:cart-change', updateHeader);
  window.addEventListener('storage', (ev) => {
    if (ev.key !== KEY || !ev.newValue) return;
    try { const v = JSON.parse(ev.newValue); if (validDate(v.selectedDate) && v.carts) { state = v; window.dispatchEvent(new Event('aimo:cart-change')); } } catch { /* invalid storage does not replace the visible basket */ }
  });
  ready.catch(() => {}); // The cart page reports loading failures; search remains available.
  if (document.querySelector('.header-actions')) import('/storefront-agent.js').catch((error) => console.error('Tilauksen toimintojen lataus epäonnistui:', error));
})();
