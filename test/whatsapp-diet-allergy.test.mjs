// Itsepeli V033 (17.11.2026, TYOLOKI): maitoallergiselle lapselle ("5 l jäätelöä, lapsella maitoallergia") näytettiin ensimmäisenä
// halvin jäätelö, jolta allergeenitieto puuttuu ("tarkista itse"), vaikka allergeenivapaaksi todennettuja vaihtoehtoja oli.
// Koko tilauksen allergiakiellossa tuote ilman allergeenitietoa sallitaan yhä (tuoreilla kasviksilla tietoa ei ole), mutta vain
// silloin, kun todennettua vaihtoehtoa ei ole: muuten se jää "Näytä lisää" -sivulle. Ei mallia, katalogia eikä verkkoa.
import test from 'node:test';
import assert from 'node:assert/strict';

const { createOrderingTools } = await import('../server/order-tools/index.mjs');

const customer = { customerId: 'c1', buyerId: 'b1', bindingVersion: 'v1', permissions: { readProducts: true, placeOrders: true } };
const products = {
  nodata: { hasAllergenData: false, contains: [] }, // "Mansikkajäätelö Maidoton", ei allergeenitietoa
  vegan1: { hasAllergenData: true, contains: ['AY'] },
  vegan2: { hasAllergenData: true, contains: [] },
  milk: { hasAllergenData: true, contains: ['AM'] },
  carrot1: { hasAllergenData: false, contains: [] },
  carrot2: { hasAllergenData: false, contains: [] },
  puree: { hasAllergenData: true, contains: [] }, // porkkanasose: tieto on, ei maitoa
};
const option = (id, price) => ({ id, name: `jäätelö ${id}`, qty: 1, unitLabel: 'kpl', litres: 5, price, labels: [], availability: { deliveryDate: '2026-11-18', stock: 50 } });
const tools = (found) => createOrderingTools({ product: (id) => products[id], buyer: (id) => ({ id }), search: async () => found, requestQuote: async () => ({ needs: [] }), placeOrder: async () => ({}) });
const draftOf = (term, diet) => ({ id: 'd1', revision: 1, deliveryDate: '2026-11-18', diet: { known: true, claims: [], excludeAllergens: diet },
  lines: [{ ref: 'L1', productTerm: term, quantity: { value: 5, unit: 'L' }, claims: [], excludeAllergens: [] }] });

test('V033: maitoallergiassa todennetut vaihtoehdot ensin, tuote ilman allergeenitietoa vasta lisäsivulla', async () => {
  const t = tools([option('nodata', 9.62), option('vegan1', 11.61), option('vegan2', 12.84), option('milk', 8)]);
  const s = await t.suggest({ customer, draft: draftOf('jäätelö', ['AM']) });
  assert.deepEqual(s.lines[0].options.map((o) => o.productId), ['vegan1', 'vegan2'], 'halvin tuote ilman allergeenitietoa oli ensimmäinen');
  assert.equal(s.lines[0].more, true, 'tuote ilman tietoa jää lisäsivulle');
  const more = await t.suggest({ customer, draft: draftOf('jäätelö', ['AM']), exclude: { L1: ['vegan1', 'vegan2'] } });
  assert.deepEqual(more.lines[0].options.map((o) => o.productId), ['nodata']);
  assert.match(more.lines[0].options[0].warning, /allergeenitieto puuttuu/);
});

test('V033: kun kiellettyä allergeenia ei ole haun tuotteissa (tuoreet kasvikset), tuote ilman tietoa näytetään varoituksella kuten ennen', async () => {
  const s = await tools([option('carrot1', 3), option('carrot2', 4), option('puree', 5)]).suggest({ customer, draft: draftOf('porkkana', ['AM']) });
  assert.deepEqual(s.lines[0].options.map((o) => o.productId), ['carrot1', 'carrot2', 'puree'], 'tuoreet porkkanat eivät väisty porkkanasoseen tieltä');
  assert.ok(s.lines[0].options.slice(0, 2).every((o) => /allergeenitieto puuttuu/.test(o.warning)));
  // Ilman allergiakieltoa järjestys on ennallaan: halvin ensin.
  const open = await tools([option('nodata', 9.62), option('vegan1', 11.61)]).suggest({ customer, draft: draftOf('jäätelö', []) });
  assert.equal(open.lines[0].options[0].productId, 'nodata');
});
