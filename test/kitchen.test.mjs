import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ei käytetä eikä nollata kehittäjän käynnissä olevan demon kantaa tai API-avaimia.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-kitchen-test-'));
process.env.AIMO_DB = path.join(dir, 'kitchen.db');
process.env.VALIO_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
process.env.DEMO_NOW = '2026-11-14T10:00:00+02:00';
const { kv, history, bookings, wipe } = await import('../server/db.mjs');
const { runDeep } = await import('../server/agents/deep.mjs');
const { DEFAULT_RULES, evaluate, activeLines } = await import('../server/proposal.mjs');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
  wipe();
  kv.set('deliveryDate', '2026-11-16');
  kv.set('kitchen', { name: 'Testikeittiö', demo: true });
  kv.set('rules', { ...DEFAULT_RULES, autonomy: 'auto_within_rules' });
  kv.set('planningRevision', 4);
  kv.set('staples', [{ id: '464201', tags: ['dairy'] }]);
  history.add('2026-W46', '2026-11-09', '464201', 10);
  for (let i = -7; i < 7; i++) {
    const d = new Date('2026-11-16T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    bookings.add(d.toISOString().slice(0, 10), i < 0 ? 10 : 8);
  }
  kv.set('menuEvents', [{ id: 'group', name: 'Ryhmä', includedInBookings: false, groups: [{ date: '2026-11-20', pax: 100 }],
    recipe: [{ productId: '465193', amount: 0.05, unit: 'l' }] }]);
});

test('koko ehdotus: hiljaisempi viikko ja uusi reseptiraaka-aine, myös autonomiatilassa', async () => {
  const p = await runDeep({ reason: 'testi' });
  const milk = activeLines(p).find((l) => l.productId === '464201');
  const cream = activeLines(p).find((l) => l.productId === '465193');
  assert.equal(milk.qty, 8);
  assert.equal(cream.qty, 3); // 5 litraa / 1,75 litraa → 3 pakkausta
  assert.equal(cream.recipeRequired, true);
  assert.equal(cream.state, 'decision');
  assert.ok(cream.options.length > 0);
  assert.ok(cream.options.every((o) => !o.withinPolicy && o.warnings.some((s) => s.includes('Reseptikäyttö'))));
  assert.deepEqual(p.deep.autoDecisions, []);
  assert.deepEqual(p.planningIssues, []);
  assert.equal(p.planningRevision, 4);
});

test('muuntamaton reseptimäärä pysäyttää tilauksen myös uusintatarkistuksessa', async () => {
  kv.set('menuEvents', [{ id: 'invalid', name: 'Virheellinen resepti', includedInBookings: false, groups: [{ date: '2026-11-20', pax: 100 }],
    recipe: [{ productId: '461915', amount: 0.1, unit: 'l' }] }]);
  const p = await runDeep({ reason: 'testi' });
  assert.ok(p.lines.length > 0);
  assert.match(p.planningIssues.join(' '), /ei voida muuntaa/);
  evaluate(p, DEFAULT_RULES);
  assert.equal(p.canOrder, false);
  assert.ok(p.approvals.some((a) => a.type === 'planning'));
});

test('varastovähennys näkyy lopullisessa ostomäärässä', async () => {
  kv.set('menuEvents', []);
  kv.set('inventory', { asOf: '2026-11-16', items: [{ id: 'milk-stock', productId: '464201', amount: 3, unit: 'l', expiresOn: '2026-11-22' }] });
  const p = await runDeep({ reason: 'testi' });
  assert.equal(p.lines.find((l) => l.productId === '464201').qty, 5);
  assert.ok(p.lines[0].reason.sources.includes('Käyttökelpoinen varasto'));
});

test('vanha budjettiraja ei estä tilausta eikä karsi varaston jälkeen laskettua ostotarvetta', async () => {
  kv.set('menuEvents', []);
  for (let i = 0; i < 7; i++) {
    const d = new Date('2026-11-16T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    bookings.add(d.toISOString().slice(0, 10), 12);
  }
  kv.set('inventory', { asOf: '2026-11-16', items: [{ id: 'milk-stock', productId: '464201', amount: 6, unit: 'l', expiresOn: '2026-11-22' }] });
  kv.set('rules', { ...DEFAULT_RULES, budgetCap: 1 }); // vanhan version tallentama asetus
  const p = await runDeep({ reason: 'testi' });
  assert.equal(p.lines[0].qty, 6);
  evaluate(p, { ...DEFAULT_RULES, budgetCap: 1 });
  assert.equal(p.lines[0].qty, 6);
  assert.equal(p.canOrder, true);
  assert.deepEqual(p.approvals, []);
  assert.equal(Object.hasOwn(p.rulesSnapshot, 'budgetCap'), false);
  assert.equal(Object.hasOwn(p.totals, 'budgetCap'), false);
  assert.doesNotMatch(p.briefing, /budjet/i);
});
