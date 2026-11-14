import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/index.ts';
import { pushOrderEvents } from '../publish-orders.mjs';

const token = 'test-only-' + 'b'.repeat(48);
const order = (id = 'AGW-20261114-0001', status = 'confirmed') => ({ orderId: id, channel: 'whatsapp', status, createdAt: '2026-11-14T12:00:00.000Z',
  deliveryDate: '2026-11-16', net: 74.1, lineCount: 1, lines: [{ productId: '1234', name: 'Laktoositon maito <b>', quantity: 20, unit: 'l', net: 74.1 }] });
const snapshot = (orders) => ({ version: 1, observedAt: Date.now(), totalOrders: orders.length, ledgerHead: '0'.repeat(64), orders });
const event = (o = order(), email = { to: 'testi@example.com', customerName: 'Ravintola <Kulma>' }) =>
  ({ version: 1, observedAt: Date.now(), ledgerHead: '0'.repeat(64), order: o, email });
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return { db, prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) || null; }, async run() { await null; const result = db.prepare(sql).run(...args); return { meta: { changes: result.changes } }; } }; } };
}
function mailer({ fail = 0 } = {}) {
  const sent = [];
  return { sent, async send(message) { await null; if (fail-- > 0) throw new Error('upstream'); sent.push(message); return { messageId: 'm' + sent.length }; } };
}
const post = (env, body, auth = token) => worker.fetch(new Request('https://demo.example/api/order-events', { method: 'POST',
  headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
const row = (env, id = 'AGW-20261114-0001') => env.DB.db.prepare('SELECT * FROM order_events WHERE order_id=?').get(id);

test('a confirmed order is stored once and its confirmation e-mail is sent once, also for concurrent retries', async () => {
  const EMAIL = mailer(), env = { DB: d1(), SYNC_TOKEN: token, EMAIL, ORDER_EMAIL_FROM: 'tilaukset@demo.example' };
  try {
    const [a, b] = await Promise.all([post(env, event()), post(env, event())]);
    const results = [await a.json(), await b.json()];
    assert.equal(EMAIL.sent.length, 1);
    assert.deepEqual(results.map(r => r.duplicate).sort(), [false, true]);
    assert.ok(results.some(r => r.email === 'sent'));
    const again = await (await post(env, event())).json();
    assert.equal(again.duplicate, true); assert.equal(again.email, 'sent'); assert.equal(EMAIL.sent.length, 1);
    const mail = EMAIL.sent[0];
    assert.equal(mail.to, 'testi@example.com'); assert.equal(mail.from, 'tilaukset@demo.example');
    assert.match(mail.subject, /AGW-20261114-0001/);
    assert.match(mail.html, /AGW-20261114-0001/); assert.match(mail.html, /€74\.10/); assert.match(mail.html, /Monday, 16 November 2026/);
    assert.match(mail.html, /Ravintola &lt;Kulma&gt;/); assert.match(mail.html, /maito &lt;b&gt;/);
    assert.doesNotMatch(mail.html, /AIMO-2026-1048|Restaurant Kulma|<b>/);
    assert.match(mail.text, /Total \(VAT 0%\): €74\.10/);
    assert.equal(row(env).email_status, 'sent'); assert.equal(row(env).email_attempts, 1);
    // The recipient is private: the public order route never exposes it.
    assert.doesNotMatch(await (await worker.fetch(new Request('https://demo.example/api/orders'), env)).text(), /testi@example/);
  } finally { env.DB.db.close(); }
});

test('without a configured sender the order waits, and a later retry sends it; failures stop after three attempts', async () => {
  const env = { DB: d1(), SYNC_TOKEN: token };
  try {
    assert.equal((await (await post(env, event())).json()).email, 'sender_missing');
    const EMAIL = mailer();
    Object.assign(env, { EMAIL, ORDER_EMAIL_FROM: 'tilaukset@demo.example' });
    assert.equal((await (await post(env, event())).json()).email, 'sent');
    assert.equal(EMAIL.sent.length, 1);

    const failing = mailer({ fail: 5 }); env.EMAIL = failing;
    const id = 'AGW-20261114-0002';
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await (await post(env, event(order(id)))).json()).email);
    assert.deepEqual(statuses, ['retry', 'retry', 'failed', 'failed']);
    assert.equal(row(env, id).email_attempts, 3); assert.equal(failing.sent.length, 0);

    const none = 'AGW-20261114-0003';
    assert.equal((await (await post(env, event(order(none), null))).json()).email, 'not_requested');
  } finally { env.DB.db.close(); }
});

test('only authenticated, confirmed and valid order events are accepted', async () => {
  const env = { DB: d1(), SYNC_TOKEN: token, EMAIL: mailer(), ORDER_EMAIL_FROM: 'tilaukset@demo.example' };
  try {
    assert.equal((await post(env, event(), 'wrong')).status, 401);
    assert.equal((await post(env, event(order(undefined, 'pending_approval')))).status, 400);
    assert.equal((await post(env, event(order(), { to: 'not an address' }))).status, 400);
    assert.equal((await post(env, event(order(), { to: 'a@b.example\r\nBcc: x@y.example' }))).status, 400);
    assert.equal((await post(env, { ...event(), observedAt: Date.now() - 400000 })).status, 400);
    assert.equal(env.DB.db.prepare('SELECT count(*) n FROM order_events').get().n, 0);
    assert.equal(env.EMAIL.sent.length, 0);
  } finally { env.DB.db.close(); }
});

test('the publisher pushes each newly confirmed order once and keeps retrying while the sender is missing', async () => {
  const env = { DB: d1(), SYNC_TOKEN: token };
  const fetcher = (url, init) => worker.fetch(new Request(url, init), env);
  try {
    const known = new Set(['AGW-20261114-0001']); // baseline: confirmed before the publisher started
    const snap = snapshot([order('AGW-20261114-0001'), order('AGW-20261114-0002'), order('AGW-20261114-0003', 'pending_approval')]);
    const first = await pushOrderEvents({ url: 'https://demo.example', token, snapshot: snap, known, email: { to: 'testi@example.com' }, fetcher });
    assert.deepEqual(first.map(r => [r.orderId, r.email]), [['AGW-20261114-0002', 'sender_missing']]);
    assert.equal(known.has('AGW-20261114-0002'), false);
    Object.assign(env, { EMAIL: mailer(), ORDER_EMAIL_FROM: 'tilaukset@demo.example' });
    const second = await pushOrderEvents({ url: 'https://demo.example', token, snapshot: snap, known, email: { to: 'testi@example.com' }, fetcher });
    assert.deepEqual(second.map(r => [r.orderId, r.duplicate, r.email]), [['AGW-20261114-0002', true, 'sent']]);
    assert.equal((await pushOrderEvents({ url: 'https://demo.example', token, snapshot: snap, known, fetcher })).length, 0);
    assert.equal(env.EMAIL.sent.length, 1);
    assert.equal(row(env, 'AGW-20261114-0001'), undefined);
    await assert.rejects(pushOrderEvents({ url: 'http://demo.example', token, snapshot: snap, known: new Set() }), /HTTPS/);
  } finally { env.DB.db.close(); }
});
