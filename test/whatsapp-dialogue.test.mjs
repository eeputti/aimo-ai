import test from 'node:test';
import assert from 'node:assert/strict';
import { openWhatsAppStore } from '../server/whatsapp/store.mjs';
import { createOrderingDialogue, isFreshStart } from '../server/whatsapp/dialogue.mjs';

const ready = { status: 'ready', draftId: 'draft-1', revision: 2, text: '*Tilausluonnos*\nMaito 5 l, 12,34 €\n\nVahvista vastaamalla *TILAA*.' };
function fixture(t, ask) {
  const store = openWhatsAppStore(':memory:'); t.after(() => store.close());
  store.db.prepare('INSERT INTO members VALUES(?,?,?,?)').run('358401234567', 'Testikeittiö', 'Testaaja', 'one');
  const ordered = []; const orderOptions = []; const looked = [];
  const options = { db: store.db, ask, lookup: async (query) => { looked.push(query); return [{ name: 'Valio kuohukerma', contains: ['AM'] }]; } };
  const dialogue = createOrderingDialogue(options);
  let seq = 0;
  const turn = (text, extra = {}) => dialogue.respond({ binding: 'one', messageId: `m${++seq}`, text,
    runOrder: async (input, options) => { ordered.push(input); orderOptions.push(options); return ready; }, ...extra });
  return { store, dialogue, options, ordered, orderOptions, looked, turn };
}
const plan = (route, extra = {}) => ({ json: { route, text: '', lookupQuery: '', suggestionTerm: '', ...extra } });

test('a model greeting uses the requested brand tone without touching the shopping list, and replay is persistent', async (t) => {
  let calls = 0;
  const f = fixture(t, async ({ system }) => { calls++; assert.match(system, /Valio Aimon/); return plan('chat', { text: 'Hei! Kootaan keittiön ostoslista kuntoon. Mitä tarvitaan?' }); });
  const result = await f.turn('Moi');
  assert.match(result.text, /Hei!/); assert.equal(f.ordered.length, 0);
  const reopened = createOrderingDialogue(f.options);
  assert.deepEqual(await reopened.respond({ binding: 'one', messageId: 'm1', text: 'Moi' }), result);
  assert.equal(calls, 1);
});

test('product advice uses catalogue facts and a separate question; only the accepted quantity adds an item', async (t) => {
  const f = fixture(t, async ({ purpose, user }) => {
    if (purpose === 'whatsapp_dialogue') return plan('chat', { lookupQuery: 'kuohukerma' });
    assert.equal(purpose, 'whatsapp_product_advice');
    assert.equal(JSON.parse(user).facts[0].name, 'Valio kuohukerma');
    return { text: 'Kuohukerma sopii vaahdotukseen ja täyteläisiin kastikkeisiin.' };
  });
  const advice = await f.turn('Mihin kuohukerma sopii?');
  assert.equal(advice.messages.length, 2); assert.deepEqual(f.looked, ['kuohukerma']);
  assert.equal(f.ordered.length, 0);
  await f.turn('joo 5 litraa');
  assert.deepEqual(f.ordered, ['Lisää ostoslistalle kuohukerma 5 litraa']);
});

test('an optional addition is grounded, separate from the exact summary, and yes cannot confirm an order', async (t) => {
  const f = fixture(t, async () => plan('order', { suggestionTerm: 'kahvi' }));
  const result = await f.turn('se halvin maito');
  assert.equal(result.messages[0], ready.text); assert.match(result.messages[1], /kahvi/);
  assert.deepEqual(f.ordered, ['se halvin maito']);
  await f.turn('joo');
  assert.equal(f.ordered.at(-1), 'Lisää ostoslistalle kahvi');
  assert.notEqual(f.ordered.at(-1), 'TILAA');
});

test('declining a suggestion preserves the list and explicit TILAA bypasses the conversational model', async (t) => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return plan('order', { suggestionTerm: 'kahvi' }); });
  await f.turn('halvin'); await f.turn('ei kiitos');
  assert.equal(f.ordered.length, 1);
  const before = calls;
  await f.turn('TILAA', { runOrder: async (input) => { assert.equal(input, 'TILAA'); return { status: 'confirmed', text: 'Tallennettu demoon.' }; } });
  assert.equal(calls, before);
});

test('model failure preserves canonical list and required questions as separate messages', async (t) => {
  const f = fixture(t, async () => { throw new Error('provider unavailable'); });
  const canonical = 'Luonnoksessa nyt:\n- maito 5 l\n\nMille päivälle toimitus?';
  const result = await f.turn('5 l maitoa', { runOrder: async () => ({ status: 'collecting', text: canonical }) });
  assert.equal(result.messages.join('\n\n'), canonical);
  assert.equal(result.messages.length, 2);
});

test('revoked identity never receives generated advice, and dietary lists do not get unverified extras', async (t) => {
  const f = fixture(t, async () => plan('chat', { text: 'Tuotetietoja' }));
  assert.equal((await f.turn('Moi', { allowed: () => false })).status, 'error');
  const g = fixture(t, async () => plan('order', { suggestionTerm: 'voi' }));
  const restricted = await g.turn('halvin', { runOrder: async () => ({ ...ready, text: ready.text + '\nHuomioitu: maidoton' }) });
  assert.equal(restricted.messages.length, 1); assert.deepEqual(g.looked, []);
});

test('revoking the number clears conversational history and cached model replies immediately', async (t) => {
  const f = fixture(t, async () => plan('chat', { text: 'Hei!' }));
  await f.turn('Moi');
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM wa_dialogue').get().n, 1);
  f.store.revoke('358401234567');
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM wa_dialogue').get().n, 0);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM wa_dialogue_results').get().n, 0);
});

test('fresh starts accept everyday Finnish but never a partial removal, negation or question about instructions', () => {
  for (const text of ['tyhjää kaikki', 'Tyhjennä koko ostoslista!', 'nollaa kaikki', 'aloitetaan alusta', 'alotetaanko alusta?', 'voitko tyhjentää listan', 'moi, tyhjää kaikki pliis']) assert.equal(isFreshStart(text), true, text);
  for (const text of ['moi', 'älä tyhjennä kaikkea', 'miten voin tyhjentää listan?', 'poista maito', 'tyhjennä maito', 'tyhjää kaikki paitsi voi']) assert.equal(isFreshStart(text), false, text);
});

test('reset clears only this conversation and persists a new order session; retry cannot clear a newer list', async (t) => {
  const f = fixture(t, async () => plan('order', { suggestionTerm: 'kahvi' }));
  await f.turn('se halvin maito');
  f.store.db.prepare('INSERT INTO turns(binding,role,content,created) VALUES(?,?,?,?)').run('one', 'assistant', 'Vanha maitolista 50 l', Date.now());
  f.store.db.prepare('INSERT INTO wa_dialogue VALUES(?,?,?)').run('other', '{"history":["other customer"]}', Date.now());
  const reset = await f.turn('tyhjää kaikki');
  assert.match(reset.text, /ostoslista on tyhjä/);
  assert.equal(f.ordered.at(-1), 'aloita alusta');
  assert.equal(f.orderOptions.at(-1).operation, 'reset');
  const state = JSON.parse(f.store.db.prepare("SELECT json FROM wa_dialogue WHERE binding='one'").get().json);
  assert.equal(state.epoch, 'm2'); assert.equal(state.lastOrder, undefined); assert.equal(state.pendingSuggestion, undefined);
  assert.equal(state.suggested, undefined); assert.equal(state.history.length, 2);
  assert.equal(f.store.history('one').length, 0);
  assert.equal(f.store.db.prepare("SELECT json FROM wa_dialogue WHERE binding='other'").get().json, '{"history":["other customer"]}');
  await f.turn('5 kg voita'); assert.equal(f.orderOptions.at(-1).epoch, 'm2');
  const before = f.store.db.prepare("SELECT json FROM wa_dialogue WHERE binding='one'").get().json;
  const reopened = createOrderingDialogue(f.options);
  assert.deepEqual(await reopened.respond({ binding: 'one', messageId: 'm2', text: 'tyhjää kaikki' }), reset);
  assert.equal(f.store.db.prepare("SELECT json FROM wa_dialogue WHERE binding='one'").get().json, before);
});

test('greetings never replay the old offer even if the model fails or routes the greeting to ordering', async (t) => {
  for (const ask of [async () => plan('order'), async () => { throw new Error('model unavailable'); }]) {
    const f = fixture(t, ask);
    await f.turn('5 l maitoa'); const before = f.ordered.length;
    const greeting = await f.turn('moi');
    assert.match(greeting.text, /Hei!/); assert.doesNotMatch(greeting.text, /12,34|Tilausluonnos/);
    assert.equal(f.ordered.length, before);
  }
});

test('a pure greeting gives the model no old list or history to repeat and preserves the actual shopping list', async (t) => {
  const f = fixture(t, async ({ user }) => {
    const input = JSON.parse(user);
    if (input.message !== 'moi') return plan('order');
    assert.equal(input.history, undefined); assert.equal(input.shoppingList, undefined); assert.equal(input.pendingSuggestion, undefined);
    return plan('chat', { text: 'Moi! Mitä tarvitset keittiöön?' });
  });
  await f.turn('50 l maitoa'); const before = f.ordered.length;
  assert.equal((await f.turn('moi')).text, 'Moi! Mitä tarvitset keittiöön?');
  assert.equal(f.ordered.length, before);
  assert.equal(JSON.parse(f.store.db.prepare("SELECT json FROM wa_dialogue WHERE binding='one'").get().json).lastOrder.text, ready.text);
});

test('the model can recognize a conversational fresh start while a partial deletion stays a line edit', async (t) => {
  const f = fixture(t, async () => plan('reset'));
  await f.turn('heitetääs tää vanha lista pois ja alotetaan uus');
  assert.equal(f.ordered.at(-1), 'aloita alusta');
  const g = fixture(t, async () => plan('order'));
  await g.turn('tyhjennä maito');
  assert.equal(g.ordered.at(-1), 'Poista maito');
});
