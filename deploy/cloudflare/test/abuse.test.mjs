// Väärinkäyttöregressiot Workerin julkaisu-, sähköposti- ja demomaksureiteille. Paikallinen D1-jäljitelmä,
// simuloitu sähköposti, ei verkkokutsuja eikä julkaistua Workeria. Raportti: docs/parallel/whatsapp-abuse.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/index.ts';
import { parseOrderEvent } from '../src/order-event.ts';
import { renderOrderEmail } from '../src/email.ts';
import { describeDemoPayment } from '../src/demo-payment.ts';

const ORIGIN = 'https://demo.example';
const TOKEN = 'abuse-tests-sync-token-' + 'b'.repeat(40);
function setup({ now } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) {
    let params = [];
    return { bind(...values) { params = values; return this; }, async first() { return db.prepare(sql).get(...params) || null; },
      async run() { await null; return { meta: { changes: db.prepare(sql).run(...params).changes } }; },
      async all() { return { results: db.prepare(sql).all(...params) }; } };
  } };
  const sent = [];
  const env = { DB, SYNC_TOKEN: TOKEN, DEMO_PAYMENTS_ENABLED: 'true', ORDER_EMAIL_FROM: 'orders@demo.example',
    EMAIL: { async send(message) { await null; sent.push(message); return { messageId: `m-${sent.length}` }; } } };
  const fetcher = (path, init) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
  return { db, env, sent, fetcher, now };
}
const order = (id = 'AGW-20261115-0101', extra = {}) => ({ orderId: id, status: 'confirmed', channel: 'whatsapp', createdAt: new Date().toISOString(),
  deliveryDate: '2026-11-18', net: 12.5, lineCount: 1, lines: [{ productId: '1234', name: 'Maito', quantity: 2, unit: 'l', net: 12.5 }], ...extra });
const event = (o = order(), email = { to: 'private@example.com', customerName: 'Private' }) => ({ version: 1, observedAt: Date.now(), ledgerHead: '0'.repeat(64), order: o, email });
const publish = (s, body, headers = {}) => s.fetcher('/api/order-events', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('publisher routes reject missing, wrong, truncated or extended tokens, wrong types and oversized bodies', async () => {
  const s = setup();
  for (const path of ['/api/sync', '/api/order-events']) {
    for (const authorization of [undefined, 'Bearer wrong', `Bearer ${TOKEN.slice(0, -1)}`, `Bearer ${TOKEN}x`, `Basic ${TOKEN}`, `Bearer  ${TOKEN}`, TOKEN]) {
      const response = await s.fetcher(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(event()) });
      assert.equal(response.status, 401, `${path} ${authorization}`);
    }
    assert.equal((await s.fetcher(`${path}?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await s.fetcher(path, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await s.fetcher(path, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: 'x'.repeat(300_000) })).status, 400);
  }
  assert.equal((await s.fetcher('/api/signups', { method: 'GET' })).status, 401);
  assert.equal(s.db.prepare('SELECT count(*) n FROM order_events').get().n, 0);
  assert.equal(s.sent.length, 0);
});

test('order events reject unconfirmed orders, header injection in the recipient and control characters in names', () => {
  assert.throws(() => parseOrderEvent(event(order(undefined, { status: 'pending_approval' }))));
  for (const to of ['a@example.com\r\nBcc: victim@example.com', 'a@example.com,b@example.com', '<a@example.com>', 'a b@example.com', `${'a'.repeat(250)}@example.com`]) {
    assert.throws(() => parseOrderEvent(event(order(), { to, customerName: 'X' })), undefined, to);
  }
  assert.throws(() => parseOrderEvent(event(order(), { to: null, customerName: 'A\r\nB' })));
  assert.throws(() => parseOrderEvent(event(order('AGW-1'))));
  assert.throws(() => parseOrderEvent(event(order(undefined, { net: -1 }))));
  assert.throws(() => parseOrderEvent(event(order(undefined, { lines: Array.from({ length: 51 }, () => ({ productId: '1', name: 'x', quantity: 1, unit: 'l', net: 1 })), lineCount: 51 }))));
  assert.throws(() => parseOrderEvent(event(order(undefined, { lines: [{ productId: '1', name: 'a\u0000b', quantity: 1, unit: 'l', net: 1 }] }))));
});

test('the confirmation e-mail escapes hostile product, unit and customer names', () => {
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const mail = renderOrderEmail(order(undefined, { lines: [{ productId: `"><svg onload=alert(3)>`, name: hostile, quantity: 1, unit: '<b>l</b>', net: 1 }] }), hostile, `${ORIGIN}/tilaukset.html"><script>`);
  assert.doesNotMatch(mail.html, /<script|<img src=x|<svg|onload=alert\(3\)>/);
  assert.match(mail.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(mail.subject, /[\r\n<>]/);
});

test('demo payment links are bound to one order, its origin and an explicit action; retries send one e-mail', async () => {
  const s = setup();
  assert.equal((await publish(s, event())).status, 200);
  assert.equal((await publish(s, event(order('AGW-20261115-0102')))).status, 200);
  const link = new URL((await describeDemoPayment(s.env, 'AGW-20261115-0101', ORIGIN)).url);
  const [id, capability] = link.hash.slice(1).split('.');
  const other = new URL((await describeDemoPayment(s.env, 'AGW-20261115-0102', ORIGIN)).url).hash.slice(1).split('.')[1];
  const pay = (orderId, cap, body = { simulate: 'success' }, headers = { origin: ORIGIN }) => s.fetcher(`/api/demo-payments/${orderId}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cap ? { authorization: `Bearer ${cap}` } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await s.fetcher(`/api/demo-payments/${id}`)).status, 404, 'no capability');
  assert.equal((await pay(id, null)).status, 404);
  assert.equal((await pay(id, 'A'.repeat(43))).status, 404, 'guessed capability');
  assert.equal((await pay(id, other)).status, 404, "another order's capability");
  assert.equal((await pay('AGW-20261115-0103', capability)).status, 404, 'unknown order');
  assert.equal((await s.fetcher(`/api/demo-payments/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${capability}` } })).status, 405);
  assert.equal((await s.fetcher('/api/demo-payments/..%2Forders', { headers: { authorization: `Bearer ${capability}` } })).status, 404);
  assert.equal((await pay(id, capability, { simulate: 'success' }, {})).status, 403, 'no origin');
  assert.equal((await pay(id, capability, { simulate: 'success' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await pay(id, capability, { simulate: 'success' }, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await pay(id, capability, { simulate: 'success', amountNetCents: 0 })).status, 400, 'extra fields');
  assert.equal((await pay(id, capability, { simulate: 'refund' })).status, 400);
  assert.equal((await pay(id, capability, JSON.stringify({ simulate: 'success', pad: 'x'.repeat(2000) }))).status, 400, 'oversized');
  assert.equal((await pay(id, capability, { simulate: 'cancel' })).status, 200);
  assert.equal(s.sent.length, 0, 'nothing sent before an explicit success');
  const view = await (await s.fetcher(`/api/demo-payments/${id}`, { headers: { authorization: `Bearer ${capability}` } })).text();
  assert.doesNotMatch(view, /private@example\.com|Private|email_to|SYNC/);
  const results = await Promise.all([pay(id, capability), pay(id, capability), pay(id, capability)]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(s.sent.length, 1);
  assert.equal(s.db.prepare("SELECT count(*) n FROM demo_payments WHERE status='paid'").get().n, 1, 'other orders stay unpaid');
});
