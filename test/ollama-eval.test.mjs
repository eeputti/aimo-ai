import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, inspect } from '../eval/ollama-interpret-cases.mjs';
import { evaluate } from '../scripts/ollama-eval.mjs';
test('interpreter checker rejects wrong amounts, lost restrictions and extra operations', () => {
  const change = CASES.find((c) => c.id === 'change-milk');
  const good = { via: 'model', ops: [{ op: 'update', ref: 'L1', quantity: { value: 30, unit: 'L' } }] };
  assert.deepEqual(inspect(change, good), []);
  assert.ok(inspect(change, { ...good, via: 'rules-fallback' }).length);
  assert.ok(inspect(change, { ...good, ops: [{ ...good.ops[0], quantity: { value: 50, unit: 'L' } }] }).includes('quantity'));
  assert.ok(inspect(change, { ...good, ops: [{ ...good.ops[0], removeClaims: ['FREE_FROM_LACTOSE'] }] }).includes('constraint_removed'));
  assert.ok(inspect(change, { ...good, ops: [...good.ops, { op: 'remove', ref: 'L1' }] }).includes('unexpected_operation'));
  const allergy = CASES.find((c) => c.id === 'milk-allergen');
  assert.ok(inspect(allergy, { via: 'model', ops: [{ op: 'diet', addClaims: ['FREE_FROM_LACTOSE'] }] }).includes('allergen'));
});
test('evaluation continues after model errors and never mutates reusable input cases', async () => {
  const before = structuredClone(CASES); let calls = 0;
  const report = await evaluate(async ({ draft }) => { calls++; draft.lines.push({ productTerm: 'bad' }); throw new Error('offline'); }, { repeat: 2 });
  assert.equal(calls, 24); assert.equal(report.total, 24); assert.equal(report.passed, 0);
  assert.ok(report.results.every((r) => r.failures.includes('model_error')));
  assert.deepEqual(CASES, before);
  await assert.rejects(evaluate(() => {}, { repeat: 0 }));
});
