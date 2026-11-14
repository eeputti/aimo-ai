import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest, combineSearchResults } from '../public/aimo-request-intent.js';

test('tavallinen luettelo pysyy tuotteina eikä valmisruokaa tulkita reseptiksi', () => {
  for (const text of ['100 kananmunaa ja 5 kg kanaa', '10 kg lohikeittoa', 'lihaa ja kanaa']) assert.deepEqual(routeRequest(text), { productText: text, recipe: null });
});
test('reseptipyynnöstä löytyvät ruoka, annokset ja päivä', () => {
  assert.deepEqual(routeRequest('Tarvitsen reseptin kermainen lohikeitto 120 annosta perjantaiksi'), { productText: '', recipe: { query: 'kermainen lohikeitto', portions: 120, deliveryText: 'perjantaiksi' } });
  assert.deepEqual(routeRequest('Lohikeitto sata annosta'), { productText: '', recipe: { query: 'lohikeitto', portions: 100, deliveryText: '' } });
  assert.equal(routeRequest('resepti makaronilaatikkoon').recipe.portions, null);
  assert.equal(routeRequest('resepti').recipe.query, '');
  assert.deepEqual(routeRequest('Tarvitsen 100 annosta lohikeittoa').recipe, { query: 'lohikeitto', portions: 100, deliveryText: '' });
  assert.equal(routeRequest('resepti lohikeittoon 2,5 annosta').recipe.portions, 2.5);
});
test('samasta lauseesta säilyvät reseptin lisäksi luetellut tuotteet', () => {
  const out = routeRequest('100 kananmunaa ja 5 kg kanaa ja tarvitsen reseptin lohikeittoon 50 annosta');
  assert.equal(out.productText, '100 kananmunaa ja 5 kg kanaa');
  assert.deepEqual(out.recipe, { query: 'lohikeitto', portions: 50, deliveryText: '' });
  assert.equal(routeRequest('resepti lohikeittoon ja 5 kg voita').productText, '5 kg voita');
  assert.equal(routeRequest('100 kananmunaa ja tarvitsen esim tämmösen reseptin lohikeittoon').productText, '100 kananmunaa');
});
test('eri hakujen tulokset yhdistyvät ilman raaka-aineiden tai tuoterivien katoamista', () => {
  const result = (name) => ({ deliveryDate: '2026-11-20', understood: { items: [{ productTerm: name }], assumptions: [], unparsed: [] }, cards: [{ item: 0, list: [name] }] });
  const eggs = result('kananmuna'); const soup = result('lohifilee');
  const merged = combineSearchResults(eggs, soup);
  assert.deepEqual(merged.understood.items.map(i => i.productTerm), ['kananmuna', 'lohifilee']);
  assert.deepEqual(merged.cards.map(c => c.item), [0, 1]);
  assert.equal(soup.cards[0].item, 0);
  assert.throws(() => combineSearchResults(eggs, { ...soup, deliveryDate: '2026-11-21' }), /eri toimituspäivät/);
});
