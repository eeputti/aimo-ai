import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COLLECTIONS, belongsToCollection, collectionLink, collectionLinksFor, collectionBrowseRequest } from '../public/aimo-collections.js';

const ids = (item) => collectionLinksFor(typeof item === 'string' ? { productTerm: item } : item).map((c) => c.id);

test('collection intent distinguishes dairy, plant drinks, chicken meat and eggs', () => {
  assert.deepEqual(ids('maitoa'), ['maidot-ja-piimat', 'maitotaloustuotteet']);
  assert.deepEqual(ids('maitoo'), ['maidot-ja-piimat', 'maitotaloustuotteet']);
  assert.deepEqual(ids('maitotuotteet'), ['maitotaloustuotteet']);
  assert.deepEqual(ids('kuohukerma'), ['kermat', 'maitotaloustuotteet']);
  assert.deepEqual(ids('kauramaito'), ['kasvipohjaiset-juomat']);
  assert.deepEqual(ids('kaurajuoma'), ['kasvipohjaiset-juomat']);
  assert.deepEqual(ids('oat milk'), ['kasvipohjaiset-juomat']);
  assert.deepEqual(ids({ productType: 'milk', claims: ['VEGAN'] }), ['kasvipohjaiset-juomat']);
  assert.deepEqual(ids('kanaa'), ['broileri-ja-kana']);
  assert.deepEqual(ids('broilerin rintafilee'), ['broilerin-rintafileet', 'broileri-ja-kana']);
  assert.deepEqual(ids({ productTerm: 'kana', attributes: { state: 'frozen' } }), ['broileri-pakasteet', 'broileri-ja-kana']);
  assert.deepEqual(ids('kananmunia'), ['kananmunat']);
  for (const term of ['kanakeitto', 'kananmunanuudeli', 'maitosuklaa', 'kermaviili', 'tuntematon']) {
    assert.deepEqual(ids(term), [], term);
  }
  for (const text of ['maitotuotteet', 'Näytä kaikki maitotuotteet', 'selaa maitotaloustuotteita']) assert.equal(collectionBrowseRequest(text), true);
  for (const text of ['20 l maitoa', 'maitotuotteet ja 2 kg kanaa', 'maito']) assert.equal(collectionBrowseRequest(text), false);
});

test('collection contents use catalogue categories, and narrower groups stay inside their parent', () => {
  const catalogue = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url)));
  const snapshot = JSON.parse(fs.readFileSync(new URL('../public/storefront-collections.json', import.meta.url)));
  const included = new Set();
  for (const [id, group] of Object.entries(COLLECTIONS)) {
    const expected = catalogue.filter((p) => belongsToCollection(p, id)).map((p) => p.id);
    assert.ok(expected.length > 0, id);
    assert.deepEqual(snapshot.groups[id], expected, id);
    for (const pid of expected) {
      included.add(pid);
      if (group.parent) assert.ok(snapshot.groups[group.parent].includes(pid));
    }
    assert.equal(new URL(collectionLink(id).href, 'http://localhost').searchParams.get('group'), id);
  }
  assert.equal(snapshot.products.length, included.size);
  for (const p of snapshot.products) {
    assert.ok(included.has(p.id));
    assert.equal(p.price, undefined, 'snapshot does not invent a price');
    assert.equal(p.availability, undefined, 'snapshot does not assert availability');
  }
  assert.equal(belongsToCollection({ category: '10590', name: 'Kananmuna' }, 'broileri-ja-kana'), false);
  assert.equal(belongsToCollection({ category: '18750', name: 'Kalkkunan rintafilee' }, 'broilerin-rintafileet'), false);
  assert.equal(collectionLink('__proto__'), null);
  assert.equal(collectionLink('unknown'), null);
});
