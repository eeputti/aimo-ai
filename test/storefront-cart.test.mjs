import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/storefront-cart-store.js', import.meta.url), 'utf8');
const seed = JSON.parse(fs.readFileSync(new URL('../public/storefront-cart-data.json', import.meta.url), 'utf8'));
async function fixture(storage = new Map()) {
  const requests = []; const events = [];
  const window = { dispatchEvent: (e) => events.push(e.type), addEventListener() {} };
  vm.runInNewContext(source, { window, document: { querySelector: () => null }, Event,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    fetch: async (url) => { requests.push(url); return { ok: true, json: async () => structuredClone(seed) }; },
  });
  await window.aimoCart.ready;
  return { cart: window.aimoCart, requests, events, storage };
}

test('reference basket reproduces the real cart totals and never fetches agent orders', async () => {
  const f = await fixture(); const t = f.cart.totals();
  assert.equal(t.count, 10); assert.equal(t.net, 1534.73);
  assert.equal(t.vat['13.5'], 204.84); assert.equal(t.vat['25.5'], 4.43);
  assert.equal(t.reservation, 174.40); assert.equal(t.total, 1918.40);
  assert.deepEqual(f.requests, ['/storefront-cart-data.json']);
});

test('search additions merge by product and date, survive reload, and do not mutate reference data', async () => {
  const f = await fixture();
  await f.cart.add({ id: 'test-product', name: 'Testituote', price: 2.5, vat: 13.5, unit: 'kpl' }, 2, '2026-11-20');
  await f.cart.add({ id: 'test-product', name: 'Testituote', price: 2.5, vat: 13.5, unit: 'kpl' }, 3, '2026-11-20');
  assert.equal(f.cart.lines().length, 1); assert.equal(f.cart.lines()[0].qty, 5);
  assert.equal(f.cart.lines('2026-11-16').length, 10);
  const next = await fixture(f.storage);
  assert.equal(next.cart.get().selectedDate, '2026-11-20'); assert.equal(next.cart.totals().net, 12.5);
  assert.equal(seed.cart.carts['2026-11-16'][0].qty, 3);
});

test('moving a line removes only that line; moving a basket merges quantities on the destination day', async () => {
  const { cart } = await fixture();
  cart.move('2026-11-18', '8076442');
  assert.equal(cart.get().selectedDate, '2026-11-16');
  assert.equal(cart.lines().length, 9); assert.equal(cart.lines('2026-11-18')[0].qty, 1);
  await cart.add({ id: '8076442', name: 'Vöner', price: 36.95, vat: 13.5 }, 2, '2026-11-16');
  cart.move('2026-11-18');
  assert.equal(cart.lines('2026-11-16').length, 0);
  assert.equal(cart.lines().find((p) => p.id === '8076442').qty, 3);
});

test('invalid quantities and calendar dates do not change the cart; clear affects only the chosen day', async () => {
  const { cart } = await fixture();
  for (const qty of [-1, 0, NaN, Infinity, 1000000]) assert.throws(() => cart.setQuantity('8097348', qty));
  for (const date of ['2026-99-99', '2026-02-30', '', 'tomorrow']) assert.throws(() => cart.select(date));
  assert.equal(cart.lines()[0].qty, 3);
  cart.setQuantity('9901719', '1,8'); assert.equal(cart.lines().find((p) => p.id === '9901719').qty, 1.8);
  cart.select('2026-11-18'); cart.clear(); assert.equal(cart.lines('2026-11-16').length, 10);
});

test('unknown price and tax remain explicit instead of inventing a payable total', async () => {
  const { cart } = await fixture();
  await cart.add({ id: 'unknown', name: 'Tuntematon verokanta', price: 10, taxUnknown: true, vat: null }, 1, '2026-11-20');
  assert.equal(cart.totals().taxUnknown, true); assert.equal(cart.totals().net, 10);
  assert.equal(Object.keys(cart.totals().vat).length, 0);
  await cart.add({ id: 'unpriced', name: 'Tuntematon hinta', price: null, vat: 13.5 }, 1);
  assert.equal(cart.totals().unpriced, true);
});

test('kilogram quantities retain gram precision while currency rounds to cents', async () => {
  const { cart } = await fixture();
  await cart.add({ id: 'weighed', name: 'Punnittava tuote', unit: 'kg', step: .001, price: 10, vat: 13.5 }, .001, '2026-11-20');
  assert.equal(cart.lines()[0].qty, .001); assert.equal(cart.totals().net, .01);
  cart.setQuantity('weighed', '.123'); assert.equal(cart.lines()[0].qty, .123);
});

test('saved baskets use lightweight reference photos while preserving quantities and custom image URLs', async () => {
  const saved = structuredClone(seed.cart);
  const rows = saved.carts[saved.selectedDate];
  rows[0].qty = 7; rows[0].image = `/storefront-assets/${rows[0].id}.jpg`;
  rows[1].image = 'https://example.com/custom.webp';
  const { cart } = await fixture(new Map([['aimo.storefront.cart.v1', JSON.stringify(saved)]]));
  assert.equal(cart.lines()[0].qty, 7);
  assert.match(cart.lines()[0].image, /\/optimized\/.*\.webp$/);
  assert.equal(cart.lines()[1].image, 'https://example.com/custom.webp');
});
