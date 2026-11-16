// Selainkokeilu 17.11.: Valion rajapinta ei vastaa, eikä jäätelöstä ole aiempaa saatavuustietoa. Botti toisti joka päivälle
// "Saatavuutta ei saatu nyt tarkistettua … Kokeile toista päivää". Nyt se kertoo asian kerran, ei kehota vaihtamaan päivää,
// tarjoaa saatavuudeltaan tunnettuja vastaavia tuotteita, ja valinta vaihtaa rivin tuotteen ja kysyy määrän.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VALIO_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
const { createOrderingConversation } = await import('../server/order-conversation/index.mjs');
const { openDraftStore } = await import('../server/order-conversation/store.mjs');
const { guardModelText } = await import('../server/whatsapp/model-guard.mjs');

const clock = Date.parse('2026-11-15T09:00:00+02:00');
const customer = { customerId: 'c1', buyerId: 'b1', bindingVersion: 'v1', deliverySites: [{ id: 's1', label: 'Keittiö' }], permissions: { readProducts: true, placeOrders: true } };
const add = { intent: 'order', deliveryDate: '2026-11-18', ops: [{ op: 'add', productTerm: 'jäätelö', quantity: { value: 1000, unit: 'L' }, claims: [], excludeAllergens: [] }] };
const unknown = (l) => ({ issues: [{ code: 'NO_ORDERABLE_PRODUCT', ref: l.ref, availabilityUnknown: true, nextDeliveryDate: null,
  message: `En saa nyt tarkistettua saatavuutta: ${l.productTerm}. Siksi en voi luvata sitä millekään päivälle.` }], lines: [] });

function engine(suggestFor) {
  const calls = { suggest: 0 };
  const tools = {
    async suggest({ draft }) { calls.suggest += 1; return suggestFor(draft.lines[0], draft); },
    async quote({ draft }) {
      return { quoteId: `Q${draft.revision}`, draftId: draft.id, revision: draft.revision, expiresAt: new Date(clock + 900_000).toISOString(), issues: [], totals: { net: 10 },
        lines: draft.lines.map((l) => ({ ref: l.ref, name: l.selectedName, salesUnits: l.quantity?.value || 1, salesUnitLabel: 'kpl', covers: l.quantity, lineNet: 10 })) };
    },
    async submit() { return { status: 'confirmed', orderId: 'AGW-1', reasons: [] }; },
  };
  const script = { jäätelö: add, perjantai: { intent: 'order', deliveryDate: '2026-11-20', ops: [] }, 'nyt sit?': { intent: 'other', ops: [] },
    '10 kpl': (draft) => ({ intent: 'order', ops: [{ op: 'update', ref: draft.pending.refs[0], quantity: { value: 10, unit: 'PCS' } }] }) };
  const handleTurn = createOrderingConversation({ store: openDraftStore(':memory:', () => clock), tools, now: () => clock,
    interpretTurn: async ({ text, draft }) => { const r = script[text]; return typeof r === 'function' ? r(draft) : r || { intent: 'other', ops: [] }; } });
  let n = 0;
  return { calls, say: (text) => handleTurn({ messageId: `m${++n}`, conversationId: 'c', customer, text, receivedAt: clock }) };
}

test('tuntematon saatavuus ilman vastaavia: ei "kokeile toista päivää", ei päiväkokeiluja, toisto lyhenee', async () => {
  const { say, calls } = engine(unknown);
  const first = await say('jäätelö');
  assert.match(first.text, /En saa nyt tarkistettua saatavuutta: jäätelö/);
  assert.match(first.text, /Toinen päivä ei auta/);
  assert.match(first.text, /poista jäätelö/);
  assert.doesNotMatch(first.text, /Kokeile toista päivää/);
  assert.equal(calls.suggest, 1, 'huomisen kiirekokeilu ei hae seuraavia päiviä, kun tieto puuttuu kaikilta');
  const again = await say('perjantai');
  assert.match(again.text, /^Saatavuutta ei vieläkään saada tarkistettua: jäätelö\. Se puuttuu kaikilta päiviltä/);
  assert.notEqual(again.text, first.text);
});

test('tuntematon saatavuus ja vastaavat tuotteet: rehellinen otsikko, valinta vaihtaa tuotteen ja kysyy määrän', async () => {
  const alt = { productId: '470792', name: 'PH7 MARJAMOUSSE LEIVOS PAKASTE', salesUnits: 1, salesUnitLabel: 'laatikko', covers: null, lineNet: 58.66, labels: [],
    replaceTerm: 'leivos', askQuantity: true };
  const { say } = engine((l) => (l.productTerm === 'jäätelö'
    ? { issues: [], lines: [{ ref: l.ref, total: 1, more: false, exact: false, availabilityUnknown: true, alternatives: true, clarify: [], options: [alt] }] }
    : unknown(l)));
  const shown = await say('jäätelö');
  assert.equal(shown.status, 'choosing');
  assert.match(shown.text, /En saa nyt tarkistettua saatavuutta: jäätelö, joten en voi luvata sitä millekään päivälle\. Näiden vastaavien tuotteiden saatavuus on tiedossa:/);
  assert.match(shown.text, /1\) Ph7 marjamousse leivos pakaste, 1 laatikko, 58,66 €/);
  assert.match(shown.text, /määrä kysytään valinnan jälkeen/);
  assert.doesNotMatch(shown.text, /Tarkkaa osumaa ei löytynyt/);
  const picked = await say('1');
  assert.match(picked.text, /- leivos: PH7 MARJAMOUSSE LEIVOS PAKASTE/i);
  assert.match(picked.text, /Kuinka paljon: leivos\?/);
  const ready = await say('10 kpl');
  assert.equal(ready.status, 'ready');
});

test('mallin vapaasta tekstistä pudotetaan sisäinen sana tilausmoottori', () => {
  const r = guardModelText('Joo, tarkistetaan perjantai 20.11. toimitukselle. Jäätelön saatavuus selviää tilausmoottorista.');
  assert.equal(r.text, 'Joo, tarkistetaan perjantai 20.11. toimitukselle.');
  assert.deepEqual(r.blocked, ['jargon']);
});
