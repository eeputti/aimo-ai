import test from 'node:test';
import assert from 'node:assert/strict';
import { openWhatsAppStore } from '../server/whatsapp/store.mjs';
import { createWhatsAppChannel } from '../server/whatsapp/channel.mjs';
import { bootstrapDemoMember, createDemoOrderingChat, validateOrderingEnvironment } from '../server/whatsapp/ordering.mjs';
import { createOrderingConversation } from '../server/order-conversation/index.mjs';
import { openDraftStore } from '../server/order-conversation/store.mjs';

const PHONE = '358401234567';
const OTHER = '358409876543';

test('ordering demo requires its own gateway and only bootstraps the configured tester, preserving the binding on restart', (t) => {
  const has = { exists: () => true };
  assert.throws(() => validateOrderingEnvironment({}, has), /oman GATEWAY_DB/);
  assert.throws(() => validateOrderingEnvironment({ GATEWAY_DB: 'data/gateway.db', AIMO_DB: 'data/wa-kitchen.db' }, has), /oman GATEWAY_DB/);
  assert.throws(() => validateOrderingEnvironment({ GATEWAY_DB: 'data/whatsapp-gateway.db' }, has), /oman AIMO_DB/);
  assert.throws(() => validateOrderingEnvironment({ GATEWAY_DB: 'data/whatsapp-gateway.db', AIMO_DB: 'data/aimo.db' }, has), /oman AIMO_DB/);
  const own = { GATEWAY_DB: 'data/whatsapp-gateway.db', AIMO_DB: 'data/whatsapp-kitchen.db' };
  assert.throws(() => validateOrderingEnvironment(own, { exists: () => false }), /katalogin/);
  validateOrderingEnvironment(own, has);
  const store = openWhatsAppStore(':memory:'); t.after(() => store.close());
  bootstrapDemoMember(store, {});
  assert.equal(store.member(PHONE), undefined);
  const env = { WHATSAPP_DEMO_PHONE: PHONE, WHATSAPP_DEMO_PERSON: 'Anna' };
  bootstrapDemoMember(store, env);
  const binding = store.member(PHONE).binding;
  bootstrapDemoMember(store, env);
  assert.equal(store.member(PHONE).binding, binding);
  assert.equal(store.member(OTHER), undefined);
});

test('channel passes Meta message identity to the real draft engine and duplicate receipt does not repeat the turn', async (t) => {
  const store = openWhatsAppStore(':memory:'); t.after(() => store.close());
  bootstrapDemoMember(store, { WHATSAPP_DEMO_PHONE: PHONE });
  const drafts = openDraftStore(':memory:');
  let interpreted = 0; let customer; let permissions;
  const handleTurn = createOrderingConversation({ store: drafts, now: () => Date.parse('2026-11-14T10:00:00Z'),
    tools: { suggest() { throw new Error('Products must wait for the checklist'); } },
    interpretTurn: async () => { interpreted++; return { intent: 'order', ops: [{ op: 'add', productTerm: 'maito', claims: [], excludeAllergens: [] }] }; },
  });
  const bridge = createDemoOrderingChat({ store, phoneId: '12345', loadOrdering: async (p) => {
    permissions = p;
    return { handleTurn: (args) => { customer = args.customer; return handleTurn(args); }, prune() {}, close() { drafts.close(); } };
  } });
  t.after(() => bridge.close());
  const sent = [];
  const channel = createWhatsAppChannel({ settings: { orderingDemo: true, supportContact: 'Testin ylläpito' }, store,
    chat: bridge.chat, send: async (...args) => { sent.push(args); return 'reply'; },
  });
  const message = { id: 'meta-message-id', phone: PHONE, text: 'maitoa', sentAt: Date.now() };
  assert.equal(store.enqueue(message), true);
  await channel.processNext();
  assert.match(sent[0][1], /Mille päivälle toimitus/);
  assert.equal(sent[0][2], 'meta-message-id');
  assert.equal(store.enqueue(message), false);
  assert.equal(interpreted, 1);
  assert.equal(customer.source, 'demo');
  assert.equal(permissions(customer).placeOrders, true);
  assert.equal(permissions({ ...customer, source: 'valio' }).placeOrders, false);
  assert.equal(permissions({ ...customer, buyerId: 'another-buyer' }).readProducts, false);
  store.revoke(PHONE);
  assert.deepEqual(permissions(customer), { readProducts: false, placeOrders: false });
});

test('a binding revoked during lazy startup cannot invoke the draft engine', async (t) => {
  const store = openWhatsAppStore(':memory:'); t.after(() => store.close());
  bootstrapDemoMember(store, { WHATSAPP_DEMO_PHONE: PHONE });
  let release; let start;
  const started = new Promise((resolve) => { start = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const bridge = createDemoOrderingChat({ store, phoneId: '12345', loadOrdering: async () => {
    start(); await gate;
    return { handleTurn() { calls++; }, close() {} };
  } });
  const response = bridge.chat({ member: store.member(PHONE), messageId: 'one', messages: [{ content: 'maitoa' }] });
  await started;
  store.revoke(PHONE); release();
  assert.match((await response).text, /ei ole enää voimassa/);
  assert.equal(calls, 0);
  await bridge.close();
});

test('unregistered sender cannot initialize ordering', async (t) => {
  const store = openWhatsAppStore(':memory:'); t.after(() => store.close());
  let called = false;
  const bridge = createDemoOrderingChat({ store, phoneId: '12345', loadOrdering: () => { called = true; } });
  assert.match((await bridge.chat({ member: { phone: PHONE, binding: 'forged' }, messageId: 'one' })).text, /ei ole voimassa/);
  assert.equal(called, false);
});

test('a failed ordering turn is retried with the same message id and the final fallback never claims an order outcome', async (t) => {
  let clock = Date.now(); const ids = []; const sent = [];
  const store = openWhatsAppStore(':memory:', () => clock); t.after(() => store.close());
  bootstrapDemoMember(store, { WHATSAPP_DEMO_PHONE: PHONE });
  const channel = createWhatsAppChannel({ settings: { orderingDemo: true, supportContact: 'Testin ylläpito' }, store, now: () => clock,
    chat: async ({ messageId }) => { ids.push(messageId); throw new Error('gateway down'); },
    send: async (...args) => { sent.push(args); return 'reply'; },
  });
  store.enqueue({ id: 'turn-1', phone: PHONE, text: 'TILAA', sentAt: clock });
  assert.equal(await channel.processNext(), false);
  assert.equal(sent.length, 0);
  clock += 31_000; assert.equal(await channel.processNext(), false);
  clock += 61_000; assert.equal(await channel.processNext(), true);
  assert.deepEqual(ids, ['turn-1', 'turn-1', 'turn-1']);
  assert.equal(sent.length, 1);
  assert.match(sent[0][1], /käsittely ei nyt onnistunut/);
  assert.doesNotMatch(sent[0][1], /Tilausta ei ole tehty/);
  assert.equal(store.history(store.member(PHONE).binding).length, 0);
});
