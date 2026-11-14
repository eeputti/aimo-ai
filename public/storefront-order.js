// The storefront uses the same signed offers and mandate checks as the agent console.
export function createStorefrontOrder({ cart, request, uuid = () => crypto.randomUUID(), storage = sessionStorage }) {
  const key = 'aimo.storefront.pending-order.v1';
  let quote = null; let snapshot = ''; let buyerId = ''; let pending = null;
  try { pending = JSON.parse(storage.getItem(key)); } catch { /* storage may be unavailable */ }
  const fingerprint = () => {
    const s = cart.get();
    return JSON.stringify([s.selectedDate, s.references[s.selectedDate] || '', cart.lines().map((p) => [String(p.id), Number(p.qty)]).sort(([a], [b]) => a.localeCompare(b))]);
  };
  const persist = () => {
    // Persist before sending: a lost response can then be retried without a second order.
    storage.setItem(key, JSON.stringify(pending));
  };
  const valid = (buyer) => quote && buyer.id === buyerId && snapshot === fingerprint();
  return {
    get quote() { return quote; },
    get pending() { return pending; },
    valid,
    async prepare(buyer) {
      if (pending) throw new Error('Selvitä ensin aiemman tilauspyynnön tulos painamalla Yritä uudelleen.');
      quote = null;
      await cart.ready;
      const rows = cart.lines();
      if (!rows.length || rows.length > 20) throw new Error('Valitse koriin 1–20 tuotetta ennen tarkistusta.');
      if (rows.some((p) => !p.id || !Number.isFinite(Number(p.qty)) || Number(p.qty) <= 0)) throw new Error('Tarkista tuotteiden määrät.');
      const before = fingerprint();
      const result = await request('/v1/quotes', {
        deliveryDate: cart.get().selectedDate, maxOptions: 3,
        needs: rows.map((p) => ({ ref: String(p.id), candidates: [String(p.id)], quantity: { value: Number(p.qty), unit: 'PCS' }, allowSubstitutes: true })),
      }, buyer);
      if (before !== fingerprint()) throw new Error('Ostoskori muuttui tarkistuksen aikana. Tarkista se uudelleen.');
      if (!Array.isArray(result.needs) || result.needs.length !== rows.length) throw new Error('Tarjous ei kata koko ostoskoria.');
      quote = result; snapshot = before; buyerId = buyer.id;
      return result;
    },
    // Sends the order review e-mail. This never places an order: the customer confirms on the page the e-mail links to.
    async sendReview(buyer, choices, email) {
      if (pending) throw new Error('Selvitä ensin aiemman tilauspyynnön tulos painamalla Yritä uudelleen.');
      if (!valid(buyer)) throw new Error('Ostoskori tai ostaja muuttui. Tarkista hinnat ja saatavuus uudelleen.');
      const rows = cart.lines(); const state = cart.get();
      const selected = quote.needs.map((n, i) => n.options?.[choices[i] ?? 0]);
      if (selected.some((o) => !o?.offer)) throw new Error('Kaikille tuotteille ei ole tarjousta. Muokkaa ostoskoria.');
      // The e-mail order covers the cart as it is: a substitute must first be accepted in the cart.
      if (selected.some((o, i) => o.lines.length !== 1 || o.lines[0].productId !== String(rows[i]?.id) || Number(o.lines[0].quantity) !== Number(rows[i]?.qty) || o.deliveryDate !== state.selectedDate)) throw new Error('Valittu vaihtoehto poikkeaa ostoskorista. Hyväksy korvaava tuote tai päivämuutos ostoskorissa ja tarkista tarjous uudelleen.');
      return request('/api/storefront/order-email', {
        email, deliveryDate: state.selectedDate, reference: state.references[state.selectedDate] || '',
        lines: rows.map((p) => ({ id: String(p.id), qty: Number(p.qty), price: Number(p.price), vat: Number(p.vat) })),
      });
    },
    async submit(buyer, choices) {
      if (!pending) {
        if (!valid(buyer)) throw new Error('Ostoskori tai ostaja muuttui. Tarkista hinnat ja saatavuus uudelleen.');
        const selected = quote.needs.map((n, i) => n.options?.[choices[i] ?? 0]);
        if (selected.some((o) => !o?.offer)) throw new Error('Kaikille tuotteille ei ole tarjousta. Muokkaa ostoskoria.');
        pending = { buyerId: buyer.id, body: { offers: selected.map((o) => o.offer), idempotencyKey: uuid(), buyerReference: cart.get().references[cart.get().selectedDate] || '', requestedBy: 'Verkkokaupan ostoskori' } };
        try { persist(); } catch { pending = null; throw new Error('Tilauspyynnön tallennus ei onnistu. Salli selaimen istuntotallennus ennen tilaamista.'); }
      }
      if (pending.buyerId !== buyer.id) throw new Error('Valitse aiemman tilauspyynnön ostaja ennen uudelleenyritystä.');
      const result = await request('/v1/orders', pending.body, buyer);
      pending = null; quote = null;
      try { storage.removeItem(key); } catch { /* A reload safely retries the same idempotency key. */ }
      return result;
    },
  };
}
