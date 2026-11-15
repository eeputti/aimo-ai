import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { storefrontCartProjection } from '../server/storefront-whatsapp-sync.mjs';
import { createCartLink } from '../server/whatsapp/cart-link.mjs';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
const row = { id: 'milk', name: 'Testimaito 6 x 1 l', qty: 4, price: 12, vat: 13.5, unit: 'ltk' };
const snapshot = () => ({ source: 'whatsapp:buyer', id: 'draft', revision: 1, state: 'ready', deliveryDate: '2026-11-18', lines: [row] });
async function listen(t, handler) {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('source export uses exact sales packages and prices; unresolved product requests are never invented', () => {
  const list = { id: 'draft', revision: 2, buyerId: 'buyer', companyName: 'Keittiö', status: 'review', deliveryDate: '2026-11-18' };
  const result = storefrontCartProjection(list, { issues: [], lines: [{ productId: 'milk', name: '6 x 1 l', salesUnits: 4, unitPriceNet: 12, vatRate: 13.5, salesUnitLabel: 'ltk', covers: { value: 24, unit: 'L' } }] });
  assert.equal(result.lines[0].qty, 4); assert.equal(result.lines[0].requested.value, 24);
  assert.equal(storefrontCartProjection({ ...list, status: 'needs_product_selection' }, null).state, 'waiting');
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
