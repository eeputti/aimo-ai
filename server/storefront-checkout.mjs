// The shared shop commits only DEMO orders to the existing gateway ledger. No payments or external orders.
import crypto from 'node:crypto';
import { kv } from './db.mjs';
import { reviewStorefront, validDeliveryDate } from './storefront.mjs';
import { buyers, orders } from './gateway/store.mjs';
import { DEFAULT_MANDATE } from './gateway/mandate.mjs';
import { requestQuote, placeOrder, decideApproval, getOrder } from './gateway/service.mjs';
import { clock, parseApiTime } from './gateway/clock.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const inflight = new Map();
function buyer() {
  const id = 'storefront-demo';
  return buyers.byId(id) || buyers.save({ id, name: 'Verkkokaupan testiasiakas', apiKey: 'demo-storefront-only', approver: 'Verkkokaupan testaaja', mandate: structuredClone(DEFAULT_MANDATE) });
}
function validate(input) {
  if (!validDeliveryDate(input?.deliveryDate) || input.deliveryDate < clock.today() || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 80 || input.lines.some((l) => !l || typeof l.id !== 'string' || !Number.isFinite(l.qty) || l.qty <= 0 || l.qty > 999999 || !Number.isFinite(l.price) || l.price < 0 || !Number.isFinite(l.vat) || l.vat < 0 || l.vat > 100) || new Set(input.lines.map((l) => l.id)).size !== input.lines.length) fail(400, 'Tarkista toimituspäivä, hinnat ja ostoskorin määrät (1–80 tuotetta).');
}
function unchanged(lines, review) {
  return review.ok && lines.every((l) => {
    const p = review.lines.find((r) => r.id === l.id)?.product;
    return p && p.qty === l.qty && Math.abs(p.price - l.price) < .004 && p.vat === l.vat;
  });
}
export async function prepareCheckout(input) {
  validate(input);
  const reviewed = await reviewStorefront(input.lines, input.deliveryDate);
  if (!unchanged(input.lines, reviewed)) fail(409, 'Hinta, määrä tai saatavuus muuttui. Tarkista ostoskori uudelleen.');
  const b = buyer(); const offers = []; const lines = [];
  for (let i = 0; i < input.lines.length; i += 20) {
    const quote = await requestQuote(b, { deliveryDate: input.deliveryDate, maxOptions: 1,
      needs: input.lines.slice(i, i + 20).map((l) => ({ ref: l.id, candidates: [l.id], quantity: { value: l.qty, unit: 'PCS', basis: 'sales' }, allowSubstitutes: false })) });
    for (const need of quote.needs) {
      const option = need.options[0]; const expected = input.lines.find((l) => l.id === need.ref);
      const line = option?.lines?.[0];
      if (!expected || option?.lines.length !== 1 || line.productId !== expected.id || line.quantity !== expected.qty || Math.abs(line.unitPriceNet - expected.price) >= .004 || line.vatRate !== expected.vat || option.deliveryDate !== input.deliveryDate) fail(409, 'Tarjous muuttui. Tarkista ostoskori uudelleen.');
      offers.push(option.offer); lines.push(line);
    }
  }
  const token = crypto.randomUUID();
  const expires = Math.min(clock.now().getTime() + 5 * 60_000, ...lines.filter((l) => l.closingTime).map((l) => parseApiTime(l.closingTime)?.getTime()).filter(Number.isFinite));
  const draft = { token, offers, input, lines, expires, buyerId: b.id };
  kv.set(`storefront.checkout.${token}`, draft);
  const net = Math.round(lines.reduce((s, l) => s + l.lineNet, 0) * 100) / 100;
  const vat = Math.round(lines.reduce((s, l) => s + l.lineNet * l.vatRate / 100, 0) * 100) / 100;
  return { token, deliveryDate: input.deliveryDate, lines, totals: { net, vat, gross: Math.round((net + vat) * 100) / 100 }, expiresAt: new Date(expires).toISOString(), simulated: true };
}
/** 'placed' once the gateway holds an order for this draft, 'ready' while it can still be confirmed, otherwise 'expired' / 'unknown'. Read-only. */
export function checkoutStatus(token) {
  const draft = typeof token === 'string' ? kv.get(`storefront.checkout.${token}`) : null;
  const b = draft && buyers.byId(draft.buyerId);
  if (!b) return 'unknown';
  if (orders.byIdempotency(b.id, token)) return 'placed';
  return draft.expires > clock.now().getTime() ? 'ready' : 'expired';
}
export async function confirmCheckout(token) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) fail(400, 'Virheellinen tilausvahvistus.');
  if (inflight.has(token)) return inflight.get(token);
  const work = (async () => {
    const draft = kv.get(`storefront.checkout.${token}`);
    if (!draft) fail(404, 'Tilausehdotusta ei löydy. Tarkista ostoskori uudelleen.');
    const b = buyers.byId(draft.buyerId);
    let order = orders.byIdempotency(b.id, token);
    if (!order) {
      if (draft.expires <= clock.now().getTime()) fail(409, 'Tilausehdotus vanheni. Tarkista ostoskori uudelleen.');
      const review = await reviewStorefront(draft.input.lines, draft.input.deliveryDate);
      if (!unchanged(draft.input.lines, review)) fail(409, 'Hinta, määrä tai saatavuus muuttui. Tarkista ostoskori uudelleen.');
      order = await placeOrder(b, { offers: draft.offers, idempotencyKey: token, buyerReference: String(draft.input.reference || '').slice(0, 100), requestedBy: 'Verkkokaupan demotilauksen vahvistus' });
    }
    if (order.status === 'pending_approval') order = decideApproval(order.orderId, 'approve', 'Verkkokaupan testaaja');
    if (order.status !== 'confirmed') fail(409, 'Tilausta ei vahvistettu. Tarkista tuotteiden saatavuus uudelleen.');
    return { order: getOrder(b, order.orderId), simulated: true };
  })();
  inflight.set(token, work);
  try { return await work; } finally { inflight.delete(token); }
}
