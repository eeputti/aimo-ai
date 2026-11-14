import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createDemoBuyerResolver } from '../server/whatsapp/demo-buyer.mjs';
import { createDemoOrderingChat } from '../server/whatsapp/ordering.mjs';
import { createShoppingListHandoff } from '../server/whatsapp/shopping-list.mjs';
import { createLocalShop } from '../server/local-shop.mjs';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
import { openDraftStore } from '../server/order-conversation/store.mjs';
import { createOrderingConversation } from '../server/order-conversation/index.mjs';
import { createRuleInterpreter } from '../server/order-conversation/interpret.mjs';
import { createWhatsAppChannel } from '../server/whatsapp/channel.mjs';
import { shoppingListView } from '../server/shopping-list/index.mjs';
import { storefrontCartProjection } from '../server/storefront-whatsapp-sync.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kahvila-aalto-test-'));
process.env.AIMO_CATALOG = path.join(dir, 'catalog.json');
fs.writeFileSync(process.env.AIMO_CATALOG, JSON.stringify([{ id: 'milk', name: 'Maito', category: '10400' }, { id: 'milk2', name: 'Maito laktoositon', category: '10400' }]));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const { understand } = await import('../server/aimo/understand.mjs');
const PHONE = '358401234567'; const OTHER = '358409876543';
const NOW = Date.parse('2026-11-14T10:00:00Z');
const resolveBuyer = createDemoBuyerResolver({ WHATSAPP_DEMO_PHONE: PHONE, WHATSAPP_DEMO_BUYER_ID: 'kahvila-aalto' });

test('only the configured verified sender maps to Kahvila Aalto; a same-named company does not grant access', () => {
  assert.equal(resolveBuyer({ phone: PHONE, binding: 'a' }).buyerId, 'kahvila-aalto');
  assert.equal(resolveBuyer({ phone: OTHER, binding: 'b', company: 'Kahvila Aalto' }).buyerId, 'whatsapp-demo-b');
  assert.throws(() => createDemoBuyerResolver({ WHATSAPP_DEMO_BUYER_ID: 'kahvila-aalto' }), /WHATSAPP_DEMO_PHONE/);
  assert.notEqual(resolveBuyer({ phone: PHONE, binding: 'a' }).customerId, 'whatsapp-demo:a');
});

test('verified sender uses Kahvila Aalto in ordering and shop; WhatsApp quantity changes replace native cart rows once', async (t) => {
  const waPath = path.join(dir, 'wa.db');
  const wa = openWhatsAppStore(waPath, () => NOW); t.after(() => wa.close());
  for (const phone of [PHONE, OTHER]) { const invitation = wa.invite(phone, 'Testikeittiö', 'Testaaja'); wa.pair(phone, codeHash(invitation.code)); }
  const member = wa.member(PHONE); const drafts = openDraftStore(':memory:', () => NOW); t.after(() => drafts.close());
  const buyer = { id: 'kahvila-aalto', name: 'Kahvila Aalto', apiKey: 'private-demo-key', mandate: { approval: 'always', maxOrderNet: 75 } };
  const originalBuyer = structuredClone(buyer); let submits = 0; let lastCustomer; let permissions;
  const quote = ({ draft }) => ({ quoteId: 'test-quote', expiresAt: new Date(NOW + 60000).toISOString(), issues: [], totals: { net: 10 },
    lines: draft.lines.map((line) => ({ ref: line.ref, productId: 'milk', name: 'Maito 6 x 1 l', salesUnits: Math.ceil(line.quantity.value / 6), salesUnitLabel: 'ltk', covers: { value: Math.ceil(line.quantity.value / 6) * 6, unit: 'L' }, unitPriceNet: 12, lineNet: 12 * Math.ceil(line.quantity.value / 6), vatRate: 13.5 })) });
  const handleTurn = createOrderingConversation({ store: drafts, now: () => NOW, interpretTurn: createRuleInterpreter({ understand }), tools: {
    suggest: async ({ draft }) => ({ issues: [], lines: draft.lines.map((line) => ({ ref: line.ref, options: [{ productId: 'milk', name: 'Maito 6 x 1 l', salesUnits: Math.ceil(line.quantity.value / 6), salesUnitLabel: 'ltk', lineNet: 12 }] })) }),
    quote: async (args) => quote(args), submit: async () => { submits++; throw new Error('No order is authorized by syncing'); },
  } });
  const bridge = createDemoOrderingChat({ store: wa, phoneId: '12345', resolveBuyer, loadOrdering: async (p) => {
    permissions = p;
    return { buyerName: (id) => id === buyer.id ? buyer.name : undefined,
      ensureBuyer: (customer) => { assert.equal(customer.buyerId, buyer.id); },
      handleTurn: (args) => { lastCustomer = args.customer; return handleTurn(args); },
      getShoppingList: ({ conversationId, customer }) => shoppingListView(drafts.active(conversationId), customer),
      getStorefrontCart: ({ conversationId, customer }) => { const draft = drafts.active(conversationId); return storefrontCartProjection(shoppingListView(draft, customer), quote({ draft })); }, close() {},
    };
  } }); t.after(() => bridge.close());
  const channel = createWhatsAppChannel({ store: wa, settings: { orderingDemo: true, supportContact: 'Test' }, now: () => NOW,
    chat: bridge.chat, send: async () => 'simulated-meta-delivery' });
  let seq = 0;
  const say = async (text) => { wa.enqueue({ id: `test-${++seq}`, phone: PHONE, text, sentAt: NOW }); await channel.processNext(); };
  await say('20 l laktoositonta maitoa maanantaiksi'); await say('1');
  assert.equal(lastCustomer.buyerId, 'kahvila-aalto'); assert.equal(lastCustomer.companyName, 'Kahvila Aalto');
  const list = await bridge.getShoppingList(member); assert.equal(list.buyerId, 'kahvila-aalto');
  const shop = createLocalShop({ whatsappDb: waPath, defaultPhone: PHONE, buyers: () => [buyer], resolveBuyer });
  assert.equal(shop.context().defaultBuyerId, 'kahvila-aalto'); assert.equal(shop.context().accounts[0].name, 'Kahvila Aalto');
  const handoff = createShoppingListHandoff({ store: wa, ordering: bridge, defaultPhone: PHONE, resolveBuyer });
  let output;
  await handoff.handle({ method: 'GET', headers: { host: 'localhost:4749' }, socket: { remoteAddress: '127.0.0.1' } },
    { writeHead(status) { assert.equal(status, 200); }, end(raw) { output = JSON.parse(raw); } }, new URL('http://localhost/api/assistant/whatsapp-list?buyerId=kahvila-aalto'));
  assert.equal(output.shoppingList.buyerId, 'kahvila-aalto');
  assert.equal(output.accounts.find((a) => a.buyerId === 'kahvila-aalto').companyName, 'Kahvila Aalto');
  const seed = JSON.parse(fs.readFileSync(new URL('../public/storefront-cart-data.json', import.meta.url)));
  const storage = new Map(); const window = { dispatchEvent() {}, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(new URL('../public/storefront-cart-store.js', import.meta.url), 'utf8'), { window, Event,
    document: { querySelector: () => null }, fetch: async () => ({ ok: true, json: async () => structuredClone(seed) }),
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  const cart = window.aimoCart; await cart.ready;
  await cart.syncWhatsApp({ enabled: true, ...await bridge.getStorefrontCart(member, list.id) });
  assert.equal(cart.lines()[0].qty, 4); assert.equal(cart.get().whatsappSync.source, 'whatsapp:kahvila-aalto');
  await say('maitoa 30 litraa');
  const update = { enabled: true, ...await bridge.getStorefrontCart(member, list.id) };
  await cart.syncWhatsApp(update); await cart.syncWhatsApp(update);
  assert.equal(cart.lines().length, 1); assert.equal(cart.lines()[0].qty, 5);
  assert.equal(cart.get().selectedDate, '2026-11-16'); assert.equal(submits, 0);
  assert.deepEqual(buyer, originalBuyer);
  assert.equal(permissions({ ...lastCustomer, buyerId: 'another-company' }).readProducts, false);
  wa.revoke(PHONE); assert.equal(permissions(lastCustomer).readProducts, false);
  await assert.rejects(() => bridge.getStorefrontCart(member, list.id), /voimassa/);
});
