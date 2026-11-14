import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCases, workerArguments } from '../scripts/whatsapp-profiles-eval.mjs';
import { PROFILES, inspectBasket } from '../eval/whatsapp-profiles-100.mjs';

const sample = () => ({ id: 'D01', persona: { business: 'Testikeittiö', person: 'testiostaja', style: 'lyhyt' },
  first: '2 l laktoositonta maitoa 20.11.2026', moves: [], answers: 'Tavallinen pakkaus',
  date: '2026-11-20', lines: [{ term: 'maito', value: 2, unit: 'L', need: 'laktoositon' }], absent: [], outcome: 'order' });
function fixture(t, cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-cases-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'cases.json'); fs.writeFileSync(file, JSON.stringify(cases)); return file;
}
test('default profiles remain unchanged', () => assert.equal(loadCases(), PROFILES));
test('external expectations survive worker snapshot and use existing strict checks', (t) => {
  const file = fixture(t, [sample()]); const profiles = loadCases(file);
  assert.equal(profiles[0].lines[0].claim, 'FREE_FROM_LACTOSE');
  assert.match(profiles[0].goal, /Tavallinen pakkaus/);
  assert.deepEqual(inspectBasket(profiles[0], { deliveryDate: '2026-11-20', lines: [{ productTerm: 'maito', quantity: { value: 2, unit: 'L' } }] }), ['claim:maito']);
  const snapshot = fixture(t, profiles); assert.deepEqual(loadCases(snapshot), profiles);
  assert.deepEqual(workerArguments('runner.mjs', ['D01'], 'out.json', snapshot).slice(-2), ['--cases', snapshot]);
});
test('stop cases keep their actual product goal', (t) => {
  const entry = sample(); entry.outcome = 'stop'; entry.lines[0] = { term: 'testituote', value: 1, unit: 'KG' };
  const [profile] = loadCases(fixture(t, [entry])); assert.equal(profile.blocked, true); assert.match(profile.goal, /testituote/);
});
test('invalid cases fail before model calls', (t) => {
  for (const change of [(p) => { p.lines[0].need = 'unknown'; }, (p) => { p.lines[0].value = -1; },
    (p) => { p.date = '2026-02-30'; }, (p) => { p.outcome = 'anything'; }]) {
    const entry = sample(); change(entry); assert.throws(() => loadCases(fixture(t, [entry])), /Invalid case/);
  }
  assert.throws(() => loadCases(fixture(t, [sample(), sample()])), /duplicate id/);
  assert.throws(() => loadCases(fixture(t, [])), /non-empty/);
});
