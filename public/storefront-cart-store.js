// Storefront-only basket. Never reads or writes the kitchen proposal or gateway orders.
(() => {
  const KEY = 'aimo.storefront.cart.v1';
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
  const number = (n) => Number(String(n).replace(',', '.'));
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
      if (saved && validDate(saved.selectedDate) && saved.carts && Object.values(saved.carts).every((rows) => Array.isArray(rows) && rows.every((p) => p.id && p.name && number(p.qty) > 0 && Number.isFinite(number(p.qty))))) state = { ...saved, references: saved.references || {} };
    } catch { /* a missing or invalid saved basket starts from the reference snapshot */ }
    window.dispatchEvent(new Event('aimo:cart-change'));
  });
  const totals = (date = state.selectedDate) => {
    const rows = lines(date); const vat = {}; let net = 0;
    const unpriced = rows.some((p) => p.price == null);
    for (const p of rows) {
      if (p.price == null) continue;
      const amount = money(p.qty * p.price); net += amount;
      vat[p.vat ?? 13.5] = (vat[p.vat ?? 13.5] || 0) + amount * (p.vat ?? 13.5) / 100;
    }
    net = money(net);
    for (const rate of Object.keys(vat)) vat[rate] = money(vat[rate]);
    const gross = money(net + Object.values(vat).reduce((a, b) => a + b, 0));
    const reservation = money(gross * .1);
    return { count: rows.length, net, vat, gross, reservation, total: money(gross + reservation), unpriced };
  };
  window.aimoCart = {
    ready, totals, get: () => copy(state), lines: (date) => copy(lines(date)),
    get storageAvailable() { return storageAvailable; },
    select(date) { if (!validDate(date)) throw new Error('Tarkista toimituspäivä.'); state.selectedDate = date; lines(date); save(); },
    setQuantity(id, value, date = state.selectedDate) {
      const p = lines(date).find((p) => p.id === id); const qty = number(value);
      if (!p || !Number.isFinite(qty) || qty <= 0 || qty > 999999) throw new Error('Anna määrä väliltä 0–999 999.');
      p.qty = money(qty); save();
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
        if (existing) existing.qty = money(existing.qty + p.qty);
        else lines(date).push(copy(p));
      }
      state.carts[from] = lines(from).filter((p) => !moving.includes(p));
      if (!id) state.selectedDate = date;
      save();
    },
    async add(product, qty = 1, date = state.selectedDate) {
      await ready;
      if (!validDate(date) || !product?.id || !product.name || !Number.isFinite(number(qty)) || number(qty) <= 0 || number(qty) > 999999) throw new Error('Tarkista tuote ja määrä.');
      const existing = lines(date).find((p) => p.id === String(product.id));
      if (existing) existing.qty = money(existing.qty + number(qty));
      else lines(date).push({ ...copy(product), id: String(product.id), qty: money(number(qty)) });
      state.selectedDate = date; save();
    },
  };
})();
