import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorefrontOrder } from '../public/storefront-order.js';

function fixture(request) {
  const state = { selectedDate: '2026-11-16', references: { '2026-11-16': 'TEST-42' } };
  const rows = [{ id: '464306', qty: 2 }];
  const cart = { ready: Promise.resolve(), get: () => state, lines: () => rows };
  const data = new Map(); const storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const calls = [];
  const quote = { needs: [{ options: [{ offer: 'signed.original' }, { offer: 'signed.substitute' }] }] };
  const api = async (url, body, buyer) => { calls.push({ url, body, buyer }); return request ? request(url, body) : url === '/v1/quotes' ? quote : { orderId: 'AGW-test', status: 'pending_approval' }; };
  const options = { cart, storage, request: api, uuid: () => 'idempotency-test-42' };
  return { state, rows, calls, quote, options, flow: createStorefrontOrder(options), buyer: { id: 'buyer' } };
}

test('cart quantities use sales units, and only explicitly selected signed offers are ordered', async () => {
  const f = fixture();
  await f.flow.prepare(f.buyer);
  assert.deepEqual(f.calls[0].body.needs[0], { ref: '464306', candidates: ['464306'], quantity: { value: 2, unit: 'PCS' }, allowSubstitutes: true });
  assert.equal(f.calls.length, 1); // Checking prices never places an order.
  const order = await f.flow.submit(f.buyer, [1]);
  assert.equal(order.status, 'pending_approval');
  assert.deepEqual(f.calls[1].body.offers, ['signed.substitute']);
  assert.equal(f.calls[1].body.buyerReference, 'TEST-42');
  assert.equal(f.flow.quote, null);
});

test('quantity, date, reference or buyer changes invalidate the quote', async () => {
  for (const mutate of [f => f.rows[0].qty++, f => f.state.selectedDate = '2026-11-17', f => f.state.references['2026-11-16'] = 'changed', f => f.buyer = { id: 'other' }]) {
    const f = fixture(); await f.flow.prepare(f.buyer); mutate(f);
    await assert.rejects(f.flow.submit(f.buyer, []), /muuttui/);
    assert.equal(f.calls.length, 1);
  }
});

test('an unavailable line prevents partial submission of a basket', async () => {
  const f = fixture(); f.quote.needs[0].options = [];
  await f.flow.prepare(f.buyer);
  await assert.rejects(f.flow.submit(f.buyer, []), /Kaikille/);
  assert.equal(f.calls.length, 1);
});

test('lost order response retries the identical payload and key, including after page reload', async () => {
  let failures = 1;
  const f = fixture(async (url) => {
    if (url === '/v1/quotes') return { needs: [{ options: [{ offer: 'signed.offer' }] }] };
    if (failures--) throw new Error('Connection lost');
    return { orderId: 'same-order', duplicate: true };
  });
  await f.flow.prepare(f.buyer);
  await assert.rejects(f.flow.submit(f.buyer, []), /Connection lost/);
  const reloaded = createStorefrontOrder(f.options);
  await assert.rejects(reloaded.prepare(f.buyer), /aiemman/);
  await assert.rejects(reloaded.submit({ id: 'other' }, []), /Valitse/);
  const result = await reloaded.submit(f.buyer, []);
  assert.equal(result.orderId, 'same-order');
  assert.deepEqual(f.calls[1].body, f.calls[2].body);
  assert.equal(reloaded.pending, null);
});

test('basket changes during price check do not become a usable quote', async () => {
  const f = fixture(async () => { f.rows[0].qty = 5; return { needs: [{ options: [{ offer: 'stale' }] }] }; });
  await assert.rejects(f.flow.prepare(f.buyer), /tarkistuksen aikana/);
  assert.equal(f.flow.quote, null);
});

test('a successful order stays submitted even if session storage cleanup fails', async () => {
  const f = fixture();
  f.options.storage.removeItem = () => { throw new Error('storage blocked'); };
  await f.flow.prepare(f.buyer);
  const result = await f.flow.submit(f.buyer, []);
  assert.equal(result.orderId, 'AGW-test');
  await assert.rejects(f.flow.submit(f.buyer, []), /muuttui/);
  assert.equal(f.calls.length, 2);
});
