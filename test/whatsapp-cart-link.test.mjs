import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
import { openDraftStore } from '../server/order-conversation/store.mjs';
import { createOrderingConversation } from '../server/order-conversation/index.mjs';
import { createRuleInterpreter } from '../server/order-conversation/interpret.mjs';
import { createDemoOrderingChat } from '../server/whatsapp/ordering.mjs';
import { createOrderingDialogue } from '../server/whatsapp/dialogue.mjs';
import { createWhatsAppChannel } from '../server/whatsapp/channel.mjs';
import { createCartLink } from '../server/whatsapp/cart-link.mjs';
const LIST_ROUTE = '/whatsapp/cart/api';
import { shoppingListView } from '../server/shopping-list/index.mjs';

// Synthetic public product names only: exercise the real Finnish parser without challenge data.
const catalogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-catalog-'));
process.env.AIMO_CATALOG = path.join(catalogDir, 'catalog.json');
fs.writeFileSync(process.env.AIMO_CATALOG, JSON.stringify([
  { id: 'milk-1', name: 'Maito', category: '10400' }, { id: 'milk-2', name: 'Maito laktoositon', category: '10400' },
  { id: 'butter-1', name: 'Voi', category: '10500' }, { id: 'butter-2', name: 'Voi suolaton', category: '10500' },
]));
after(() => fs.rmSync(catalogDir, { recursive: true, force: true }));
const { understand } = await import('../server/aimo/understand.mjs');

const NOW = Date.parse('2026-11-14T10:00:00Z');
const PHONE = '358401234567';
const OTHER = '358409876543';
async function fixture(t, { ask = null } = {}) {
  let clock = NOW;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-handoff-'));
  const wa = openWhatsAppStore(path.join(directory, 'wa.db'), () => NOW);
  let drafts = openDraftStore(path.join(directory, 'drafts.db'), () => NOW);
  for (const [phone, company] of [[PHONE, 'Keittiö A'], [OTHER, 'Keittiö B']]) {
    const invitation = wa.invite(phone, company, 'Testaaja'); wa.pair(phone, codeHash(invitation.code));
  }
  let submits = 0; let parsed = 0;
  const rules = createRuleInterpreter({ understand });
  const tools = {
    async suggest({ draft }) {
      return { issues: [], lines: draft.lines.map((line) => ({ ref: line.ref, options: [{ productId: `P-${line.ref}`, name: `${line.productTerm} testituote`, salesUnits: 1, salesUnitLabel: 'ltk', covers: line.quantity, lineNet: 10 }] })) };
    },
    async quote({ draft }) {
      return { quoteId: `Q-${draft.id}-${draft.revision}`, expiresAt: new Date(NOW + 3600_000).toISOString(), issues: [], totals: { net: 20 },
        lines: draft.lines.map((line) => ({ ref: line.ref, name: line.selectedName, salesUnits: 1, salesUnitLabel: 'ltk', lineNet: 10, covers: line.quantity })) };
    },
    async submit() { submits++; return { status: 'confirmed', orderId: 'TEST-ORDER-1', reasons: [] }; },
  };
  const handle = () => createOrderingConversation({ store: drafts, tools, now: () => NOW,
    interpretTurn: async (args) => { parsed++; return rules(args); } });
  let handleTurn = handle();
  const bridge = createDemoOrderingChat({ store: wa, phoneId: '12345', loadOrdering: async () => ({
    handleTurn: (args) => handleTurn(args),
    dialogue: createOrderingDialogue({ db: wa.db, ask, now: () => NOW }),
    getShoppingList: ({ conversationId, customer }) => shoppingListView(drafts.active(conversationId), customer),
    hasTurnResult: ({ messageId, customer }) => {
      const result = drafts.result(messageId); const draft = result?.draftId && drafts.get(result.draftId);
      return Boolean(draft && draft.customerId === customer.customerId && draft.bindingVersion === customer.bindingVersion);
    },
    close() {},
  }) });
  const cart = createCartLink({ store: wa, ordering: bridge, baseUrl: 'https://cart.example.test', secret: 'cart-test-secret', now: () => clock });
  const sent = [];
  const channel = createWhatsAppChannel({ settings: { orderingDemo: true, appSecret: 'test-secret', phoneId: '12345', supportContact: 'Ylläpito' }, store: wa,
    chat: cart.chat, send: async (...args) => { sent.push(args); return 'meta-reply'; }, now: () => NOW });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (await channel.handle(req, res, url) || await cart.handle(req, res, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await channel.stop(); await bridge.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); drafts.close(); wa.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const read = (token, extra = {}) => fetch(base + LIST_ROUTE, { headers: { authorization: `Bearer ${token}`, ...extra } });
  const post = (token, input, extra = {}) => fetch(base + LIST_ROUTE + '/chat', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body: JSON.stringify(input) });
  async function whatsapp(text, messageId = crypto.randomUUID()) {
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '12345' }, messages: [{ id: messageId, from: PHONE, timestamp: String(NOW / 1000), type: 'text', text: { body: text } }] } }] }] };
    const raw = JSON.stringify(payload);
    const response = await fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex')}` }, body: raw });
    assert.equal(response.status, 200); await channel.processNext(); return sent.filter((part) => part[2] === messageId).map((part) => part[1]).join('\n\n');
  }
  return { wa, bridge, cart, base, read, post, whatsapp, sent, advance: (ms) => { clock += ms; }, stats: () => ({ submits, parsed }),
    restartDrafts() { drafts.close(); drafts = openDraftStore(path.join(directory, 'drafts.db'), () => NOW); handleTurn = handle(); } };
}
const version = (shoppingList) => shoppingList ? { id: shoppingList.id, revision: shoppingList.revision } : null;

const linkToken = (reply) => new URL(reply.match(/https:\/\/cart\.example\.test\/whatsapp\/cart#[\w.-]+/)[0]).hash.slice(1);
async function startCart(f, text) { await f.whatsapp(text); return linkToken(await f.whatsapp('avaa kori')); }
const input = (list, text) => ({ text, messageId: crypto.randomUUID(), expectedList: version(list) });

test('WhatsApp link opens the same saved basket without copying, quoting or ordering on GET; edits stay shared', async (t) => {
  const f = await fixture(t);
  const token = await startCart(f, '20 l laktoositonta maitoa ja 5 kg voita maanantaiksi');
  const response = await f.read(token, { 'cf-ray': 'public-tunnel', 'x-forwarded-proto': 'https' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { shoppingList: first } = await response.json();
  assert.equal(first.lines.length, 2); assert.equal(first.deliveryDate, '2026-11-16');
  assert.equal(first.lines[0].quantity.value, 20);
  assert.deepEqual(first, await f.bridge.getShoppingList(f.wa.member(PHONE)));
  assert.doesNotMatch(JSON.stringify(first), /358401234567|bindingVersion|apiKey|quoteId/);
  assert.equal(f.stats().submits, 0); assert.equal(f.stats().parsed, 1);
  f.restartDrafts(); assert.deepEqual((await (await f.read(token)).json()).shoppingList, first);
  const edited = await f.post(token, input(first, 'maitoa sittenkin 30 litraa'));
  assert.equal(edited.status, 200); const { shoppingList: next } = await edited.json();
  assert.equal(next.id, first.id); assert.equal(next.lines[0].quantity.value, 30);
  assert.equal((await f.bridge.getShoppingList(f.wa.member(PHONE))).lines[0].quantity.value, 30);
  assert.match(await f.whatsapp('näytä'), /30 l/);
  assert.equal(f.stats().submits, 0);
});

test('a natural link request reaches the real cart capability through the model without submitting or changing the cart', async (t) => {
  const ask = async ({ purpose, user }) => {
    assert.equal(purpose, 'whatsapp_dialogue');
    const input = JSON.parse(user); assert.equal(input.capabilities.cartLink, true);
    return { json: { route: input.message.includes('näyttää hyvältä') ? 'cart' : 'order', text: '', lookupQuery: '', suggestionTerm: '', openCart: input.message.includes('näyttää hyvältä') } };
  };
  const f = await fixture(t, { ask });
  await f.whatsapp('20 l laktoositonta maitoa maanantaiksi');
  const before = await f.bridge.getShoppingList(f.wa.member(PHONE));
  const text = await f.whatsapp('ok näyttää hyvältä, laita linkki tulemaan');
  const token = linkToken(text); assert.match(text, /Tässä linkki ostoskoriisi/); assert.doesNotMatch(text, /TILAA|en pysty/);
  const current = (await (await f.read(token)).json()).shoppingList;
  assert.deepEqual(current, before); assert.equal(f.stats().submits, 0);
});

test('browser reviews and explicitly confirms exactly once; a stale version cannot approve unseen WhatsApp changes', async (t) => {
  const f = await fixture(t);
  const token = await startCart(f, '20 l laktoositonta maitoa ja 5 kg voita maanantaiksi');
  const first = (await (await f.read(token)).json()).shoppingList;
  const half = await (await f.post(token, input(first, '1'))).json();
  assert.equal(half.status, 'choosing'); // yksi tuoterivi kerrallaan
  const choice = await (await f.post(token, input(half.shoppingList, '1'))).json();
  assert.equal(choice.status, 'ready'); assert.match(choice.text, /TILAA/);
  await f.whatsapp('maitoa sittenkin 30 litraa');
  assert.equal((await f.post(token, input(choice.shoppingList, 'TILAA'))).status, 409);
  assert.equal(f.stats().submits, 0);
  const current = (await (await f.read(token)).json()).shoppingList;
  const review = await (await f.post(token, input(current, 'näytä'))).json();
  assert.equal(review.status, 'ready'); assert.match(review.text, /30 l/);
  const confirm = input(review.shoppingList, 'TILAA');
  const result = await f.post(token, confirm); assert.equal(result.status, 200);
  assert.equal((await result.json()).status, 'confirmed'); assert.equal(f.stats().submits, 1);
  const retry = await f.post(token, confirm); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).status, 'confirmed'); assert.equal(f.stats().submits, 1);
  assert.equal((await f.read(token)).status, 410);
});

test('capability rejects forgery, expiry, new lists, re-pairing and attempts to choose another buyer', async (t) => {
  const f = await fixture(t); const token = await startCart(f, 'maitoa 20 litraa');
  assert.equal((await f.read('')).status, 410);
  assert.equal((await f.read(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'))).status, 410);
  assert.equal((await f.read(token, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.read(token, { 'sec-fetch-site': 'cross-site' })).status, 403);
  const first = (await (await f.read(token)).json()).shoppingList;
  const edited = await f.post(token, { ...input(first, 'maitoa 25 litraa'), buyerId: 'another-buyer', member: f.wa.member(OTHER) });
  assert.equal(edited.status, 200);
  assert.equal(await f.bridge.getShoppingList(f.wa.member(OTHER)), null);
  await f.whatsapp('aloitetaan alusta'); await f.whatsapp('voita 3 kg');
  assert.equal((await f.read(token)).status, 410);
  assert.equal((await f.post(token, input(first, 'TILAA'))).status, 409);
  const freshToken = linkToken(await f.whatsapp('avaa kori'));
  const invitation = f.wa.invite(PHONE, 'Uusi yritys', 'Testi'); f.wa.pair(PHONE, codeHash(invitation.code));
  assert.equal((await f.read(freshToken)).status, 410);
  await f.whatsapp('maitoa 10 litraa'); const newToken = linkToken(await f.whatsapp('avaa kori'));
  f.advance(24 * 3600_000 + 1); assert.equal((await f.read(newToken)).status, 410);
  assert.equal(f.stats().submits, 0);
});

test('page and previews expose no cart data, scripts or capabilities; malformed writes and other routes stay closed', async (t) => {
  const f = await fixture(t); const token = await startCart(f, 'maitoa 20 litraa');
  const page = await fetch(f.base + '/whatsapp/cart'); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.doesNotMatch(await page.text(), /Keittiö A|358401234567|Bearer|20 litraa/);
  for (const path of ['/whatsapp/cart.js', '/whatsapp/cart.css', '/whatsapp/cart/logo.svg']) assert.equal((await fetch(f.base + path)).status, 200);
  assert.equal((await fetch(f.base + '/v1/orders')).status, 404);
  const list = (await (await f.read(token)).json()).shoppingList;
  assert.equal((await f.post(token, { ...input(list, 'TILAA'), expectedList: null })).status, 400);
  assert.equal((await f.post(token, input(list, 'x'.repeat(13000)))).status, 413);
  assert.equal((await f.post(token, input(list, 'näytä'), { 'content-type': 'text/plain' })).status, 415);
  assert.equal(f.stats().submits, 0);
});

test('link route is opt-in and refuses non-HTTPS or ambiguous configured origins', () => {
  assert.equal(createCartLink({}), null);
  for (const baseUrl of ['http://example.test', 'https://example.test/path', 'https://example.test/?token=x', 'https://user:pass@example.test']) {
    assert.throws(() => createCartLink({ baseUrl, secret: 'test' }), /HTTPS/);
  }
});

test('ready WhatsApp summary asks for ok; ok and legacy TILAA open the cart without submitting or invoking the model', async (t) => {
  const f = await fixture(t);
  await f.whatsapp('20 l laktoositonta maitoa ja 5 kg voita maanantaiksi');
  await f.whatsapp('1');
  const review = await f.whatsapp('1');
  assert.match(review, /Vastaa \*ok\*/); assert.doesNotMatch(review, /TILAA/);
  const before = f.stats();
  for (const message of ['ok', 'okei', 'joo', 'TILAA']) {
    const token = linkToken(await f.whatsapp(message));
    assert.equal((await f.read(token)).status, 200);
  }
  assert.deepEqual(f.stats(), before); assert.equal(f.stats().submits, 0);
});

test('browser writes have a per-customer limit without blocking reads or making an order', async (t) => {
  const f = await fixture(t); const token = await startCart(f, 'maitoa 20 litraa');
  for (let i = 0; i < 10; i++) {
    const { shoppingList } = await (await f.read(token)).json();
    assert.equal((await f.post(token, input(shoppingList, 'näytä'))).status, 200);
  }
  const { shoppingList } = await (await f.read(token)).json();
  assert.equal((await f.post(token, input(shoppingList, 'näytä'))).status, 429);
  assert.equal((await f.read(token)).status, 200);
  f.advance(60_001);
  assert.equal((await f.post(token, input(shoppingList, 'näytä'))).status, 200);
  assert.equal(f.stats().submits, 0);
});
