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
import { createShoppingListHandoff, LIST_ROUTE } from '../server/whatsapp/shopping-list.mjs';
import { shoppingListView } from '../server/shopping-list/index.mjs';
import { describeShoppingList } from '../public/whatsapp-shopping-list.js';

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
async function fixture(t) {
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
    dialogue: createOrderingDialogue({ db: wa.db, ask: null, now: () => NOW }),
    getShoppingList: ({ conversationId, customer }) => shoppingListView(drafts.active(conversationId), customer),
    hasTurnResult: ({ messageId, customer }) => {
      const result = drafts.result(messageId); const draft = result?.draftId && drafts.get(result.draftId);
      return Boolean(draft && draft.customerId === customer.customerId && draft.bindingVersion === customer.bindingVersion);
    },
    close() {},
  }) });
  const sent = [];
  const channel = createWhatsAppChannel({ settings: { orderingDemo: true, appSecret: 'test-secret', phoneId: '12345', supportContact: 'Ylläpito' }, store: wa,
    chat: bridge.chat, send: async (...args) => { sent.push(args); return 'meta-reply'; }, now: () => NOW });
  const handoff = createShoppingListHandoff({ store: wa, ordering: bridge, defaultPhone: PHONE });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (await channel.handle(req, res, url) || await handoff.handle(req, res, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await channel.stop(); await bridge.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); drafts.close(); wa.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const get = async (buyerId) => {
    const response = await fetch(base + LIST_ROUTE + (buyerId ? `?buyerId=${encodeURIComponent(buyerId)}` : ''));
    assert.equal(response.status, 200); return response.json();
  };
  const post = async (body, headers = {}) => fetch(base + LIST_ROUTE + '/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  async function whatsapp(text, messageId = crypto.randomUUID()) {
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '12345' }, messages: [{ id: messageId, from: PHONE, timestamp: String(NOW / 1000), type: 'text', text: { body: text } }] } }] }] };
    const raw = JSON.stringify(payload);
    const response = await fetch(base + '/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex')}` }, body: raw });
    assert.equal(response.status, 200); await channel.processNext(); return sent.at(-1)?.[1];
  }
  return { wa, bridge, base, get, post, whatsapp, sent, stats: () => ({ submits, parsed }),
    restartDrafts() { drafts.close(); drafts = openDraftStore(path.join(directory, 'drafts.db'), () => NOW); handleTurn = handle(); } };
}
const version = (shoppingList) => shoppingList ? { id: shoppingList.id, revision: shoppingList.revision } : null;

test('signed WhatsApp message becomes a structured list; storefront continues the same persisted draft and confirms only explicitly', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.get()).shoppingList, null);
  assert.match(await f.whatsapp('20 l laktoositonta maitoa ja 5 kg voita maanantaiksi', 'meta-list-1'), /maito/i);
  const initial = await f.get(); const list = initial.shoppingList;
  assert.equal(list.lines.length, 2); assert.equal(list.deliveryDate, '2026-11-16');
  assert.equal(list.lines[0].quantity.value, 20); assert.equal(list.lines[0].quantity.unit, 'L');
  assert.equal(list.lines[1].quantity.value, 5); assert.equal(list.lines[1].quantity.unit, 'KG');
  assert.ok(list.lines[0].claims.includes('FREE_FROM_LACTOSE'));
  assert.equal(list.requiresExplicitConfirmation, true); assert.equal(f.stats().submits, 0);
  assert.doesNotMatch(JSON.stringify(initial), /358401234567|apiKey|bindingVersion|quoteId/);
  assert.match(describeShoppingList(list), /maito: 20 l/);
  assert.equal((await f.get(initial.accounts.find((a) => a.buyerId !== initial.buyerId).buyerId)).shoppingList, null);
  f.restartDrafts(); assert.deepEqual((await f.get()).shoppingList, list);
  await f.whatsapp('20 l laktoositonta maitoa ja 5 kg voita maanantaiksi', 'meta-list-1');
  assert.equal(f.stats().parsed, 1); assert.equal((await f.get()).shoppingList.lines.length, 2);

  const edit = { buyerId: initial.buyerId, expectedList: version(list), messageId: crypto.randomUUID(), text: 'maitoa sittenkin 30 litraa' };
  const result = await (await f.post(edit)).json();
  assert.equal(result.shoppingList.id, list.id); assert.equal(result.shoppingList.lines[0].quantity.value, 30);
  assert.equal((await f.get()).shoppingList.lines[0].quantity.value, 30);
  const retried = await f.post(edit); assert.equal(retried.status, 200); assert.deepEqual(await retried.json(), result);
  assert.equal(f.stats().parsed, 2); assert.equal(f.stats().submits, 0);
  assert.match(await f.whatsapp('näytä'), /30 l/);
  const lateRetry = await f.post(edit); assert.equal(lateRetry.status, 200); // show did not change contents
  const selected = await f.get();
  const choice = await (await f.post({ buyerId: initial.buyerId, expectedList: version(selected.shoppingList), messageId: crypto.randomUUID(), text: '1 1' })).json();
  assert.equal(choice.status, 'ready'); assert.match(choice.text, /TILAA/); assert.equal(f.stats().submits, 0);
  const finalRequest = { buyerId: initial.buyerId, expectedList: version(choice.shoppingList), messageId: crypto.randomUUID(), text: 'TILAA' };
  const confirmed = await (await f.post(finalRequest)).json(); assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.shoppingList, null); assert.equal(f.stats().submits, 1);
  assert.equal((await f.post(finalRequest)).status, 200); assert.equal(f.stats().submits, 1);
});

test('missing details stay missing; stale browser revisions cannot change or approve the WhatsApp list', async (t) => {
  const f = await fixture(t); await f.whatsapp('maitoa');
  const first = await f.get(); assert.equal(first.shoppingList.lines[0].quantity, null);
  assert.ok(first.shoppingList.missing.includes('quantity:L1')); assert.equal(first.shoppingList.deliveryDate, null);
  await f.whatsapp('maitoa 10 litraa');
  const stale = await f.post({ buyerId: first.buyerId, expectedList: version(first.shoppingList), messageId: crypto.randomUUID(), text: 'TILAA' });
  assert.equal(stale.status, 409); assert.equal(f.stats().submits, 0);
  assert.equal((await f.get()).shoppingList.lines[0].quantity.value, 10);
  // Replaying an already applied browser turn after a newer WhatsApp edit must not pair its old
  // summary with a newer version that the browser could then approve without having seen it.
  const current = await f.get();
  const edit = { buyerId: first.buyerId, expectedList: version(current.shoppingList), messageId: crypto.randomUUID(), text: 'maitoa 12 litraa' };
  assert.equal((await f.post(edit)).status, 200);
  await f.whatsapp('maitoa 15 litraa');
  assert.equal((await f.post(edit)).status, 409);
  assert.equal((await f.get()).shoppingList.lines[0].quantity.value, 15);
  const member = f.wa.member(PHONE); f.wa.revoke(PHONE);
  await assert.rejects(() => f.bridge.getShoppingList(member), /voimassa/);
  assert.equal((await f.post({ buyerId: first.buyerId, expectedList: null, messageId: crypto.randomUUID(), text: 'näytä' })).status, 404);
});

test('handoff HTTP endpoints reject proxy, cross-site, forged accounts and malformed requests', async (t) => {
  const f = await fixture(t); await f.whatsapp('maitoa'); const initial = await f.get();
  for (const headers of [{ 'cf-ray': 'test' }, { 'x-forwarded-for': '198.51.100.1' }, { 'x-forwarded-host': 'example.com' },
    { 'x-forwarded-proto': 'https' }, { origin: 'https://example.com' }, { origin: 'invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    const response = await fetch(f.base + LIST_ROUTE, { headers }); assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /Keittiö A|maito/);
  }
  assert.equal((await fetch(f.base + LIST_ROUTE + '?buyerId=forged')).status, 404);
  const body = { buyerId: initial.buyerId, expectedList: version(initial.shoppingList), messageId: crypto.randomUUID(), text: 'näytä' };
  assert.equal((await f.post({ ...body, buyerId: 'forged' })).status, 404);
  assert.equal((await f.post({ ...body, expectedList: undefined })).status, 400);
  assert.equal((await f.post({ ...body, text: '' })).status, 400);
  assert.equal((await f.post({ ...body, text: 'x'.repeat(21_000) })).status, 413);
  assert.equal((await f.post(body, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await fetch(f.base + LIST_ROUTE, { method: 'DELETE' })).status, 405);
});

test('two channels for one binding serialize turns, while another customer can proceed', async (t) => {
  const wa = openWhatsAppStore(':memory:'); t.after(() => wa.close());
  for (const phone of [PHONE, OTHER]) { const invite = wa.invite(phone, 'Demo', 'Test'); wa.pair(phone, codeHash(invite.code)); }
  let release; let started; const start = new Promise((r) => { started = r; }); const gate = new Promise((r) => { release = r; });
  const seen = [];
  const bridge = createDemoOrderingChat({ store: wa, phoneId: '12345', loadOrdering: async () => ({
    async handleTurn({ messageId }) { seen.push(messageId); if (messageId === 'first') { started(); await gate; } return { text: messageId }; }, close() {},
  }) }); t.after(() => bridge.close());
  const say = (phone, messageId) => bridge.chat({ member: wa.member(phone), messageId, messages: [{ role: 'user', content: 'maitoa' }] });
  const first = say(PHONE, 'first'); await start;
  const second = say(PHONE, 'second'); await say(OTHER, 'other');
  assert.deepEqual(seen, ['first', 'other']); release(); await Promise.all([first, second]);
  assert.deepEqual(seen, ['first', 'other', 'second']);
});


test('reset switches conversation epochs; old lists cannot reappear after a new list or restart', async (t) => {
  const f = await fixture(t); await f.whatsapp('maitoa 20 litraa');
  const old = await f.get();
  assert.match(await f.whatsapp('aloitetaan alusta'), /ostoslista on tyhjä/);
  assert.equal((await f.get()).shoppingList, null);
  await f.whatsapp('voita 3 kg');
  const fresh = await f.get();
  assert.notEqual(fresh.shoppingList.id, old.shoppingList.id);
  assert.equal(fresh.shoppingList.lines.length, 1); assert.equal(fresh.shoppingList.lines[0].productTerm, 'voi');
  assert.equal(fresh.shoppingList.lines[0].quantity.value, 3);
  f.restartDrafts(); assert.deepEqual((await f.get()).shoppingList, fresh.shoppingList);
  const stale = await f.post({ buyerId: old.buyerId, expectedList: version(old.shoppingList), messageId: crypto.randomUUID(), text: 'TILAA' });
  assert.equal(stale.status, 409); assert.equal(f.stats().submits, 0);
});

test('re-pairing the same sender gives a new buyer and never transfers the old company list or browser access', async (t) => {
  const f = await fixture(t);
  await f.whatsapp('20 l laktoositonta maitoa maanantaiksi', 'old-company-message');
  const original = await f.get(); const oldMember = f.wa.member(PHONE);
  assert.equal(original.shoppingList.lines[0].quantity.value, 20);
  const invitation = f.wa.invite(PHONE, 'Uusi testiyritys', 'Uusi testaaja');
  assert.match(await f.whatsapp(`YHDISTA ${invitation.code}`), /Uusi testaaja, Uusi testiyritys/);
  const rebound = await f.get();
  assert.notEqual(rebound.buyerId, original.buyerId);
  assert.equal(rebound.shoppingList, null);
  assert.equal(rebound.accounts.some((a) => a.buyerId === original.buyerId), false);
  assert.equal((await fetch(f.base + LIST_ROUTE + '?buyerId=' + encodeURIComponent(original.buyerId))).status, 404);
  assert.equal((await f.post({ buyerId: original.buyerId, expectedList: version(original.shoppingList), messageId: crypto.randomUUID(), text: 'TILAA' })).status, 404);
  await assert.rejects(() => f.bridge.getShoppingList(oldMember), /voimassa/);
  await f.whatsapp('voita 2 kg');
  const fresh = await f.get();
  assert.equal(fresh.shoppingList.lines.length, 1);
  assert.equal(fresh.shoppingList.lines[0].productTerm, 'voi');
  assert.equal(fresh.shoppingList.deliveryDate, null);
  assert.equal(fresh.shoppingList.diet.known, false);
  assert.equal(fresh.shoppingList.companyName, 'Uusi testiyritys');
  // Replayed old-provider receipt cannot resurrect the previous customer binding.
  await f.whatsapp('20 l laktoositonta maitoa maanantaiksi', 'old-company-message');
  f.restartDrafts();
  assert.deepEqual((await f.get()).shoppingList, fresh.shoppingList);
  assert.equal(f.stats().submits, 0);
});
