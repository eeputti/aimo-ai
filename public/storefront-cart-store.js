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
  // Reading another day must not create a new delivery tab.
  const lines = (date = state.selectedDate) => state.carts[date] || [];
  const ensureDay = (date) => state.carts[date] ||= [];
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
    select(date) { if (!validDate(date)) throw new Error('Tarkista toimituspäivä.'); if (state.selectedDate === date) return; state.selectedDate = date; ensureDay(date); save(); },
    setQuantity(id, value, date = state.selectedDate) {
      const p = lines(date).find((p) => p.id === id); const qty = number(value);
      if (!p || !Number.isFinite(qty) || amount(qty) <= 0 || qty > 999999) throw new Error('Anna positiivinen määrä, enintään 999 999.');
      p.qty = amount(qty); save();
    },
    remove(id, date = state.selectedDate) { state.carts[date] = lines(date).filter((p) => p.id !== id); save(); },
    clear(date = state.selectedDate) { state.carts[date] = []; save(); },
    removeDate(date = state.selectedDate) {
      const dates = Object.keys(state.carts).sort();
      if (!dates.includes(date)) throw new Error('Toimituspäivää ei löydy.');
      if (dates.length === 1) throw new Error('Säilytä yksi toimituspäivä. Voit tyhjentää sen ostoskorin.');
      delete state.carts[date]; delete state.references[date];
      if (state.selectedDate === date) state.selectedDate = dates.find((d) => d > date) || dates.filter((d) => d < date).at(-1);
      save();
    },
    reference(value) { state.references[state.selectedDate] = String(value).slice(0, 100); save(); },
    move(date, id = null) {
      if (!validDate(date)) throw new Error('Tarkista toimituspäivä.');
      const from = state.selectedDate; if (from === date) return;
      const moving = lines(from).filter((p) => !id || p.id === id);
      if (id && !moving.length) throw new Error('Siirrettävää tuotetta ei löydy.');
      // Validate the complete merge before changing either basket.
      for (const p of moving) if (amount((lines(date).find((r) => r.id === p.id)?.qty || 0) + p.qty) > 999999) throw new Error('Yhdistetty määrä ylittäisi enimmäismäärän 999 999.');
      ensureDay(date);
      for (const p of moving) {
        const existing = lines(date).find((r) => r.id === p.id);
        if (existing) existing.qty = amount(existing.qty + p.qty);
        else lines(date).push(copy(p));
      }
      state.carts[from] = lines(from).filter((p) => !moving.includes(p));
      if (!id) {
        const refs = [...new Set([state.references[date], state.references[from]].filter(Boolean))];
        if (refs.length) state.references[date] = refs.join(' / ');
        delete state.references[from]; delete state.carts[from];
        state.selectedDate = date;
      }
      save();
    },
    async syncWhatsApp(snapshot) {
      await ready;
      if (!snapshot?.enabled || snapshot.state === 'waiting') return false;
      if (!['ready', 'empty'].includes(snapshot.state) || typeof snapshot.source !== 'string') throw new Error('Virheellinen WhatsApp-kori.');
      if (state.whatsappSync?.source && state.whatsappSync.source !== snapshot.source) throw new Error('WhatsApp-asiakas vaihtui. Tarkista asiakas ennen korin synkronointia.');
      if (snapshot.id && state.whatsappSync?.id === snapshot.id && snapshot.revision < state.whatsappSync.revision) throw new Error('Ostoskorin vanha versio hylättiin.');
      const signature = JSON.stringify(snapshot);
      if (state.whatsappSync?.signature === signature) return false;
      const next = copy(state);
      for (const rows of Object.values(next.carts)) for (let i = rows.length - 1; i >= 0; i--) if (rows[i].whatsappSource === snapshot.source) rows.splice(i, 1);
      if (snapshot.state === 'ready') {
        if (!validDate(snapshot.deliveryDate) || !Array.isArray(snapshot.lines) || !snapshot.lines.length) throw new Error('Toimituspäivä tai tuotteet puuttuvat.');
        const rows = next.carts[snapshot.deliveryDate] ||= [];
        for (const line of snapshot.lines) {
          if (!line.id || !line.name || !Number.isFinite(line.qty) || line.qty <= 0 || line.qty > 999999 || !Number.isFinite(line.price) || line.price < 0) throw new Error('Tarkista WhatsApp-korin tuotteet ja määrät.');
          const existing = rows.find((p) => p.id === line.id);
          if (existing && existing.whatsappSource !== snapshot.source) throw new Error('Sama tuote on jo käsin lisätyssä korissa. Tarkista päällekkäiset rivit.');
          const qty = amount((existing?.qty || 0) + line.qty);
          if (qty > 999999) throw new Error('Yhdistetty määrä on liian suuri.');
          if (existing) existing.qty = qty;
          else rows.push({ ...copy(line), whatsappSource: snapshot.source, qty, taxUnknown: line.taxUnknown || line.vat == null });
        }
        next.selectedDate = snapshot.deliveryDate;
      }
      next.whatsappSync = { source: snapshot.source, id: snapshot.id, revision: snapshot.revision, signature };
      // Persist the full replacement once: repeats never add the same products again.
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { throw new Error('Salli ostoskorin tallennus ennen synkronointia.'); }
      state = next; window.dispatchEvent(new Event('aimo:cart-change')); return true;
    },
    async add(product, qty = 1, date = state.selectedDate) {
      return this.addMany([{ product, qty }], date);
    },
    async replace(id, product, qty, date = state.selectedDate, expected = null) {
      await ready;
      if (expected && (state.selectedDate !== date || JSON.stringify(lines(date)) !== expected.lines)) throw new Error('Ostoskori muuttui tarkistuksen aikana. Tarkista tuoterivit uudelleen.');
      if (!validDate(date) || !lines(date).some((p) => p.id === id)) throw new Error('Korvattavaa tuotetta ei löydy.');
      if (!product?.id || !product.name || !Number.isFinite(number(qty)) || amount(number(qty)) <= 0 || number(qty) > 999999) throw new Error('Tarkista tuote ja määrä.');
      // Validate and merge a copy before publishing one basket change.
      const combined = copy(lines(date)).filter((p) => p.id !== id);
      const existing = combined.find((p) => p.id === String(product.id));
      const total = amount((existing?.qty || 0) + number(qty));
      if (total > 999999) throw new Error('Yhdistetty määrä ylittäisi enimmäismäärän 999 999.');
      if (existing) Object.assign(existing, copy(product), { id: String(product.id), qty: total });
      else combined.push({ ...copy(product), id: String(product.id), qty: total });
      state.carts[date] = combined; save();
    },
    async addMany(entries, date = state.selectedDate, expected = null) {
      await ready;
      if (expected && (state.selectedDate !== date || JSON.stringify(lines(date)) !== expected.lines)) throw new Error('Ostoskori muuttui tarkistuksen aikana. Paina lisäystä uudelleen.');
      if (!validDate(date) || !Array.isArray(entries) || !entries.length) throw new Error('Tarkista tuote ja määrä.');
      const combined = copy(lines(date));
      for (const { product, qty } of entries) {
        if (!product?.id || !product.name || !Number.isFinite(number(qty)) || amount(number(qty)) <= 0 || number(qty) > 999999) throw new Error('Tarkista tuote ja määrä.');
        const existing = combined.find((p) => p.id === String(product.id));
        const total = amount((existing?.qty || 0) + number(qty));
        if (total > 999999) throw new Error('Yhdistetty määrä ylittäisi enimmäismäärän 999 999.');
        if (existing) Object.assign(existing, copy(product), { id: String(product.id), qty: total });
        else combined.push({ ...copy(product), id: String(product.id), qty: total });
      }
      state.carts[date] = combined; state.selectedDate = date; save();
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
  // The header selects the search/basket day. Moving an existing basket is a separate cart action.
  let dateDialog;
  window.aimoCart.openDatePicker = async () => {
    await ready;
    if (!dateDialog) {
      dateDialog = document.createElement('dialog'); dateDialog.className = 'delivery-dialog';
      dateDialog.setAttribute('aria-labelledby', 'delivery-title');
      dateDialog.innerHTML = '<form><h2 id="delivery-title">Valitse toimituspäivä</h2><p>Haku ja uudet tuotteet käyttävät valitsemaasi päivää. Muiden päivien tuotteet säilyvät omissa koreissaan.</p><label>Toimituspäivä<input type="date" required></label><p class="delivery-error" role="alert" hidden></p><div class="delivery-actions"><button type="button">Peruuta</button><button type="submit" class="solid-button">Valitse päivä</button></div></form>';
      dateDialog.querySelector('button[type="button"]').addEventListener('click', () => dateDialog.close());
      dateDialog.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        try { window.aimoCart.select(dateDialog.querySelector('input').value); dateDialog.close(); }
        catch (e) { const error = dateDialog.querySelector('[role="alert"]'); error.textContent = e.message; error.hidden = false; }
      });
      document.body.append(dateDialog);
    }
    dateDialog.querySelector('input').value = state.selectedDate;
    dateDialog.querySelector('[role="alert"]').hidden = true;
    if (!dateDialog.open) dateDialog.showModal();
  };
  document.querySelector('.header-actions .header-action:first-child')?.addEventListener('click', () => window.aimoCart.openDatePicker());
  window.addEventListener('aimo:cart-change', updateHeader);
  window.addEventListener('storage', (ev) => {
    if (ev.key !== KEY || !ev.newValue) return;
    try { const v = JSON.parse(ev.newValue); if (validDate(v.selectedDate) && v.carts) { state = v; window.dispatchEvent(new Event('aimo:cart-change')); } } catch { /* invalid storage does not replace the visible basket */ }
  });
  import('/whatsapp-cart-sync.js').then(({ startWhatsAppCartSync }) => startWhatsAppCartSync(window.aimoCart)).catch(() => {});
  ready.catch(() => {}); // The cart page reports loading failures; search remains available.
  if (document.querySelector('.header-actions')) import('/storefront-agent.js').catch((error) => console.error('Tilauksen toimintojen lataus epäonnistui:', error));
})();
