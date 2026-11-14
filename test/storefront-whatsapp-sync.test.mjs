import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import { createStorefrontWhatsAppSync, storefrontCartProjection } from '../server/storefront-whatsapp-sync.mjs';
import { createCartLink } from '../server/whatsapp/cart-link.mjs';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
const source = fs.readFileSync(new URL('../public/storefront-cart-store.js', import.meta.url), 'utf8');
const seed = JSON.parse(fs.readFileSync(new URL('../public/storefront-cart-data.json', import.meta.url)));
const row = { id: 'milk', name: 'Testimaito 6 x 1 l', qty: 4, price: 12, vat: 13.5, unit: 'ltk' };
const snapshot = (over = {}) => ({ enabled: true, source: 'whatsapp:buyer', id: 'draft', revision: 1, state: 'ready', deliveryDate: '2026-11-18', lines: [row], ...over });
async function cartFixture(storage = new Map()) {
  const window = { dispatchEvent() {}, addEventListener() {} };
  vm.runInNewContext(source, { window, Event, document: { querySelector: () => null },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async () => ({ ok: true, json: async () => structuredClone(seed) }),
  });
  await window.aimoCart.ready; return { cart: window.aimoCart, storage };
}
async function listen(t, handler) {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('automatic native cart sync replaces remote rows once, moves delivery and survives reload without losing local rows', async () => {
  const { cart, storage } = await cartFixture();
  await cart.add({ id: 'local', name: 'Oma tuote', price: 3 }, 2, '2026-11-18');
  await cart.syncWhatsApp(snapshot());
  assert.equal(cart.lines().find((l) => l.id === 'milk').qty, 4);
  assert.equal(cart.lines().find((l) => l.id === 'local').qty, 2);
  assert.equal(await cart.syncWhatsApp(snapshot()), false);
  await cart.syncWhatsApp(snapshot({ revision: 2, deliveryDate: '2026-11-20', lines: [{ ...row, qty: 6 }] }));
  assert.equal(cart.lines('2026-11-18').length, 1); assert.equal(cart.lines()[0].qty, 6);
  const reloaded = (await cartFixture(storage)).cart;
  assert.equal(reloaded.lines()[0].qty, 6);
  assert.equal(await reloaded.syncWhatsApp(snapshot({ revision: 2, deliveryDate: '2026-11-20', lines: [{ ...row, qty: 6 }] })), false);
  await assert.rejects(() => reloaded.syncWhatsApp(snapshot()), /vanha versio/);
  await reloaded.syncWhatsApp(snapshot({ state: 'empty', lines: [], id: null, revision: null }));
  assert.equal(reloaded.lines('2026-11-20').length, 0); assert.equal(reloaded.lines('2026-11-18')[0].id, 'local');
});

test('unresolved lists, customer switches and manual product collisions cannot overwrite the local basket', async () => {
  const { cart } = await cartFixture();
  await cart.add({ ...row }, 1, '2026-11-18'); const before = JSON.stringify(cart.get());
  assert.equal(await cart.syncWhatsApp(snapshot({ state: 'waiting', lines: [] })), false);
  await assert.rejects(() => cart.syncWhatsApp(snapshot()), /käsin/);
  assert.equal(JSON.stringify(cart.get()), before);
  await cart.syncWhatsApp(snapshot({ lines: [{ ...row, id: 'other' }] }));
  await assert.rejects(() => cart.syncWhatsApp(snapshot({ source: 'whatsapp:another' })), /asiakas vaihtui/);
});

test('source export uses exact sales packages and prices; unresolved product requests are never invented', () => {
  const list = { id: 'draft', revision: 2, buyerId: 'buyer', companyName: 'Keittiö', status: 'review', deliveryDate: '2026-11-18' };
  const result = storefrontCartProjection(list, { issues: [], lines: [{ productId: 'milk', name: '6 x 1 l', salesUnits: 4, unitPriceNet: 12, vatRate: 13.5, salesUnitLabel: 'ltk', covers: { value: 24, unit: 'L' } }] });
  assert.equal(result.lines[0].qty, 4); assert.equal(result.lines[0].requested.value, 24);
  assert.equal(storefrontCartProjection({ ...list, status: 'needs_product_selection' }, null).state, 'waiting');
});

test('local relay reads an authenticated source automatically, hides credentials, rejects cross-site and preserves data on network failure', async (t) => {
  const token = `payload.${'a'.repeat(43)}`; let calls = 0; let fail = false; let clock = 1000;
  const relay = createStorefrontWhatsAppSync({ sourceUrl: `https://cart.example/whatsapp/cart#${token}`, now: () => clock,
    fetchImpl: async (url, options) => {
      calls++; assert.equal(String(url), 'https://cart.example/whatsapp/cart/api/export');
      assert.equal(options.headers.authorization, `Bearer ${token}`); assert.equal(options.redirect, 'error');
      if (fail) throw new Error(token); return new Response(JSON.stringify({ ...snapshot(), secret: token }));
    } });
  const base = await listen(t, (req, res) => relay.handle(req, res, new URL(req.url, 'http://localhost')));
  let response = await fetch(base + '/api/storefront/whatsapp-cart'); assert.equal(response.status, 200);
  const raw = await response.text(); assert.doesNotMatch(raw, new RegExp(token)); assert.doesNotMatch(raw, /cart\.example/);
  await fetch(base + '/api/storefront/whatsapp-cart'); assert.equal(calls, 1);
  assert.equal((await fetch(base + '/api/storefront/whatsapp-cart', { headers: { origin: 'https://other.example' } })).status, 403);
  clock += 3000; fail = true; response = await fetch(base + '/api/storefront/whatsapp-cart');
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /payload|cart\.example/);
});

test('existing signed WhatsApp cart authorizes the export but revoked membership cannot read it', async (t) => {
  const store = openWhatsAppStore(':memory:'); t.after(() => store.close());
  const invite = store.invite('358401234567', 'Keittiö', 'Testaaja'); const member = store.pair('358401234567', codeHash(invite.code));
  const list = { id: 'draft', revision: 1, buyerId: 'buyer', status: 'review', lines: [row] };
  const link = createCartLink({ store, baseUrl: 'https://cart.example', secret: 'test-secret', ordering: {
    getShoppingList: async () => list,
    getStorefrontCart: async () => ({ ...snapshot(), enabled: undefined }),
  } });
  const result = await link.chat({ member, messages: [{ content: 'avaa kori' }] });
  const issued = new URL(result.text.split('\n').at(-1)); const token = issued.hash.slice(1);
  const base = await listen(t, (req, res) => link.handle(req, res, new URL(req.url, 'http://localhost')));
  const get = (credential = token) => fetch(base + '/whatsapp/cart/api/export', { headers: { authorization: `Bearer ${credential}` } });
  assert.equal((await get()).status, 200); assert.equal((await get('invalid')).status, 410);
  store.revoke(member.phone); assert.equal((await get()).status, 410);
});
