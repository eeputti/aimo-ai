import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-checkout-'));
const products = Array.from({ length: 25 }, (_, i) => ({ id: String(9900000 + i), name: `Testikananmunat M6 ${i}`, category: '10590', salesUnit: 'RAS', baseUnit: 'RAS', perSales: 1, lot: .01, temp: 'chilled', kg: .36, contains: ['AE'], labels: [], hasAllergenData: true }));
fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(products));
Object.assign(process.env, { AIMO_CATALOG: path.join(dir, 'catalog.json'), AIMO_DB: path.join(dir, 'kitchen.db'), GATEWAY_DB: path.join(dir, 'gateway.db'), VALIO_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_NOW: '2026-11-14T10:00:00+02:00', GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const { reviewStorefront, searchStorefront } = await import('../server/storefront.mjs');
const { prepareCheckout, confirmCheckout } = await import('../server/storefront-checkout.mjs');
const { orders, ledger } = await import('../server/gateway/store.mjs');
const { kv } = await import('../server/db.mjs');
const { closeDatabase } = await import('../server/db.mjs');
const { closeGatewayDatabase } = await import('../server/gateway/store.mjs');
after(() => { closeDatabase(); closeGatewayDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });
const date = '2026-11-16';
async function basket() {
  const r = await reviewStorefront(products.map((p) => ({ id: p.id, qty: 2 })), date);
  return { deliveryDate: date, lines: r.lines.filter((l) => l.ok).map((l) => ({ id: l.id, qty: l.product.qty, price: l.product.price, vat: l.product.vat })) };
}
test('product number lookup keeps the exact product and accepts pack quantity corrections', async () => {
  const input = await basket(); const id = input.lines[0].id;
  const r = await searchStorefront(id, { deliveryDate: date, patches: [{ item: 0, patch: { quantity: { value: 3, unit: 'PCS', basis: 'sales' } } }] });
  assert.equal(r.cards[0].list.length, 1); assert.equal(r.cards[0].list[0].id, id); assert.equal(r.cards[0].list[0].qty, 3);
  await assert.rejects(searchStorefront('99999999999999', { deliveryDate: date }), /ei löydy/);
});
test('shared basket completes a signed gateway demo order once, including concurrent confirm requests', async () => {
  const input = await basket(); assert.ok(input.lines.length > 20);
  const draft = await prepareCheckout({ ...input, reference: 'QA' });
  assert.equal(draft.lines.length, input.lines.length); assert.equal(orders.list().length, 0);
  const [first, second] = await Promise.all([confirmCheckout(draft.token), confirmCheckout(draft.token)]);
  assert.equal(first.order.orderId, second.order.orderId); assert.equal(first.order.status, 'confirmed');
  assert.equal(first.order.commit.simulated, true); assert.equal(first.order.lines.length, input.lines.length);
  const again = await confirmCheckout(draft.token); assert.equal(again.order.orderId, first.order.orderId);
  assert.equal(orders.list().length, 1); assert.equal(ledger.verify().valid, true);
});
test('tampered price, invalid quantity and expired draft never create another order', async () => {
  const input = await basket(); const before = orders.list().length;
  await assert.rejects(prepareCheckout({ ...input, lines: [{ ...input.lines[0], price: 999 }] }), /muuttui/);
  await assert.rejects(prepareCheckout({ ...input, lines: [{ ...input.lines[0], qty: -1 }] }), /Tarkista/);
  const draft = await prepareCheckout(input);
  const saved = kv.get(`storefront.checkout.${draft.token}`); saved.expires = 0; kv.set(`storefront.checkout.${draft.token}`, saved);
  await assert.rejects(confirmCheckout(draft.token), /vanheni/);
  assert.equal(orders.list().length, before);
});
