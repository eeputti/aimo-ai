import test from 'node:test';
import assert from 'node:assert/strict';
import { cartSelection } from '../public/aimo-cart-selection.js';
import { addReviewedProducts } from '../public/storefront-cart-actions.js';
const result = { understood: { items: [{ quantity: null }], unparsed: [] }, cards: [{ status: 'ok', list: [{ id: 'eggs', qty: 1 }] }] };
test('assemble is actionable without a quantity; an explicit pack selection satisfies that need', () => {
  assert.deepEqual(cartSelection(result), { enabled: true, missingQuantity: 0, entries: [{ id: 'eggs', qty: 1 }] });
  assert.deepEqual(cartSelection(result, new Set([0])), { enabled: true, missingQuantity: -1, entries: [] });
  assert.equal(cartSelection({ ...result, handoff: { code: 'UNKNOWN' } }).enabled, false);
  assert.equal(cartSelection({ ...result, cards: [{ status: 'no_match', list: [] }] }).enabled, false);
  assert.equal(cartSelection({ ...result, understood: { ...result.understood, unparsed: ['unknown'] } }).enabled, false);
});
function fixture() {
  let lines = [{ id: 'eggs', name: 'Eggs', qty: 2 }]; const additions = [];
  const cart = { ready: Promise.resolve(), get: () => ({ selectedDate: '2026-11-16' }), lines: () => structuredClone(lines), addMany: async (rows) => { additions.push(rows); } };
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.lines[0].qty, 5);
    return { ok: true, json: async () => ({ ok: true, lines: [{ id: 'eggs', ok: true, product: { id: 'eggs', name: 'Eggs', price: 3, vat: 13.5, qty: 5, unitLabel: 'ras' } }] }) };
  };
  return { cart, additions, fetchImpl, change: () => { lines[0].qty++; } };
}
test('search and recipe additions combine repeated products and review existing plus new quantities once', async () => {
  const f = fixture();
  await addReviewedProducts(f.cart, [{ id: 'eggs', qty: 1 }, { id: 'eggs', qty: 2 }], '2026-11-16', f);
  assert.equal(f.additions.length, 1); assert.equal(f.additions[0].length, 1); assert.equal(f.additions[0][0].qty, 3);
  assert.equal(f.additions[0][0].product.price, 3);
});
test('edits during fresh review and incomplete review results prevent all additions', async () => {
  const f = fixture(); const fetchOriginal = f.fetchImpl;
  f.fetchImpl = async (...args) => { const r = await fetchOriginal(...args); f.change(); return r; };
  await assert.rejects(addReviewedProducts(f.cart, [{ id: 'eggs', qty: 3 }], '2026-11-16', f), /muuttui/);
  assert.equal(f.additions.length, 0);
  const g = fixture(); g.fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, lines: [] }) });
  await assert.rejects(addReviewedProducts(g.cart, [{ id: 'eggs', qty: 3 }], '2026-11-16', g), /kesken/);
  assert.equal(g.additions.length, 0);
});
