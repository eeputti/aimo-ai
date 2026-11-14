import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { quantityChoices, quantityLabel } from '../public/aimo-search-quantity.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-search-quantity-'));
process.env.AIMO_DB = path.join(dir, 'kitchen.db');
process.env.GATEWAY_DB = path.join(dir, 'gateway.db');
process.env.VALIO_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
process.env.DEMO_NOW = '2026-11-14T10:00:00+02:00';
const { searchStorefront } = await import('../server/storefront.mjs');
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const date = '2026-11-16';

test('quantity suggestions distinguish milk, flour, eggs and sales packs', () => {
  const milk = quantityChoices({ productType: 'milk' }, [{ litres: 1, kg: 1.03 }]);
  assert.equal(milk.options[0].unit, 'L');
  const flour = quantityChoices({ productTerm: 'vehnäjauho' }, [{ kg: 2 }]);
  assert.equal(flour.options[0].unit, 'KG');
  assert.ok(!flour.options.some((q) => q.unit === 'L'));
  const eggs = quantityChoices({ productType: 'eggs' }, [{ kg: .6 }]);
  assert.equal(eggs.options[0].basis, 'items');
  assert.equal(eggs.options[1].basis, 'sales');
  assert.equal(quantityLabel(eggs.options[0]), 'kpl');
  assert.equal(quantityLabel(eggs.options[1]), 'pakkausta');
  assert.equal(quantityChoices({}, []).options[0].basis, 'sales');
});

test('editing a corrected word replaces only its quantity and keeps filters, other rows and delivery date', async () => {
  const text = 'maeto ja 5 kg vehnäjauhoa maanantaiksi';
  const result = await searchStorefront(text, { deliveryDate: date, llm: false, patches: [
    { item: 0, patch: { claims: ['FREE_FROM_LACTOSE'] } },
    { item: 0, patch: { quantity: { value: 20, unit: 'L' } } },
    { item: 0, patch: { quantity: { value: 2.5, unit: 'L' } } },
  ] });
  assert.equal(result.understood.text, text);
  assert.deepEqual(result.understood.items[0].quantity, { value: 2.5, unit: 'L' });
  assert.deepEqual(result.understood.items[1].quantity, { value: 5, unit: 'KG' });
  assert.equal(result.deliveryDate, date);
  assert.ok(!result.understood.assumptions.some((a) => a.item === 0 && a.code === 'QUANTITY_MISSING'));
  assert.ok(result.cards[0].list.length > 0);
  for (const product of result.cards[0].list) {
    assert.ok(product.labels.includes('FREE_FROM_LACTOSE'));
    assert.ok(product.qty * product.litres >= 2.5);
  }
});

test('quantity edits distinguish individual eggs from packs and target a row even with repeated product names', async () => {
  const eggs = await searchStorefront('kananmunia', { deliveryDate: date, llm: false, patches: [
    { item: 0, patch: { quantity: { value: 10, unit: 'PCS', basis: 'items' } } },
  ] });
  assert.equal(eggs.understood.items[0].quantity.basis, 'items');
  assert.ok(eggs.cards[0].list[0].quantityExplanation.providedItems >= 10);
  const packs = await searchStorefront('kananmunia', { deliveryDate: date, llm: false, patches: [
    { item: 0, patch: { quantity: { value: 2, unit: 'PCS', basis: 'sales' } } },
  ] });
  assert.equal(packs.cards[0].list[0].qty, 2);
  const repeated = await searchStorefront('2 l maitoa ja 4 l maitoa', { deliveryDate: date, llm: false, patches: [
    { item: 1, patch: { quantity: { value: 6, unit: 'L' } } },
  ] });
  assert.deepEqual(repeated.understood.items.map((it) => it.quantity.value), [2, 6]);
});

test('invalid quantity patches preserve the original amount', async () => {
  const invalid = [-1, 0, NaN, Infinity, 100001, '10'];
  const result = await searchStorefront('3 l maitoa', { deliveryDate: date, llm: false, patches: [
    ...invalid.map((value) => ({ item: 0, patch: { quantity: { value, unit: 'L' } } })),
    { item: 0, patch: { quantity: { value: 10, unit: 'INVALID' } } },
    { item: 0, patch: { quantity: { value: 10, unit: 'PCS', basis: 'INVALID' } } },
  ] });
  assert.deepEqual(result.understood.items[0].quantity, { value: 3, unit: 'L' });
});
