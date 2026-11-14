import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { registerDemoPayment, describeDemoPayment, demoPaymentEmailAllowed, handleDemoPayment } from '../src/demo-payment.ts';

const id = 'AGW-20261114-0001';
const origin = 'https://demo.example';
const now = Date.parse('2026-11-14T12:00:00Z');
const order = { orderId: id, channel: 'whatsapp', status: 'confirmed', createdAt: new Date(now).toISOString(), deliveryDate: '2026-11-18', net: 74.1, lineCount: 1,
  lines: [{ productId: '1234', name: 'Maito <script>', quantity: 20, unit: 'l', net: 74.1 }] };
function setup() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['../schema.sql', '../demo-payment.sql']) db.exec(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
  const DB = { prepare(sql) { let values = []; return { bind(...args) { values = args; return this; }, async first() { return db.prepare(sql).get(...values) || null; },
    async run() { await null; return { meta: { changes: db.prepare(sql).run(...values).changes } }; } }; } };
  db.prepare('INSERT INTO order_events VALUES(?,?,?,?,?,?,?,?)').run(id, now, JSON.stringify({ order, email: { to: 'private@example.com', customerName: 'Private Customer' } }), 'private@example.com', 'pending', 0, now, null);
  const env = { DB, SYNC_TOKEN: 'test-only-' + 'k'.repeat(48), DEMO_PAYMENTS_ENABLED: 'true' };
  let sent = 0;
  const send = async orderId => {
    assert.equal(orderId, id);
    assert.equal(await demoPaymentEmailAllowed(env, id), true);
    // The production callback is the existing idempotent D1 e-mail sender.
    const result = db.prepare("UPDATE order_events SET email_status='sent' WHERE order_id=? AND email_status<>'sent'").run(orderId);
    if (result.changes) sent++;
    return 'sent';
  };
  const request = (capability, action, options = {}) => new Request(`${origin}/api/demo-payments/${id}`, {
    method: action === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${capability}`, ...(action === undefined ? {} : { origin, 'content-type': 'application/json' }), ...options.headers },
    ...(action === undefined ? {} : { body: JSON.stringify(action) }),
  });
  const token = async () => (await describeDemoPayment(env, id, origin)).url.split('.').at(-1);
  return { db, env, send, request, token, sent: () => sent };
}

test('a stored demo order waits for payment; cancelling sends nothing; success and retries send one confirmation', async () => {
  const s = setup();
  try {
    const [first, again] = await Promise.all([registerDemoPayment(s.env, id, now), registerDemoPayment(s.env, id, now + 10)]);
    assert.equal(first.created_at, again.created_at);
    assert.equal(first.amount_net_cents, 7410);
    assert.equal(await demoPaymentEmailAllowed(s.env, id), false);
    const token = await s.token();
    const view = await (await handleDemoPayment(s.request(token), s.env, s.send, now)).json();
    assert.equal(view.order.deliveryDate, '2026-11-18');
    assert.equal(view.payment.status, 'pending');
    assert.doesNotMatch(JSON.stringify(view), /private@example|Private Customer/);
    const cancelled = await (await handleDemoPayment(s.request(token, { simulate: 'cancel' }), s.env, s.send, now + 100)).json();
    assert.equal(cancelled.status, 'pending'); assert.equal(s.sent(), 0);
    const results = await Promise.all([101, 102, 103].map(t => handleDemoPayment(s.request(token, { simulate: 'success' }), s.env, s.send, now + t)));
    for (const result of results) assert.equal((await result.json()).status, 'paid');
    assert.equal(s.sent(), 1); assert.equal(await demoPaymentEmailAllowed(s.env, id), true);
    const paidAt = s.db.prepare('SELECT paid_at FROM demo_payments').get().paid_at;
    await handleDemoPayment(s.request(token, { simulate: 'success' }), s.env, s.send, now + 1000);
    assert.equal(s.db.prepare('SELECT paid_at FROM demo_payments').get().paid_at, paidAt);
    assert.equal(s.sent(), 1);
  } finally { s.db.close(); }
});

test('capabilities are order-specific; forged, expired, cross-origin and amount-changing requests cannot pay', async () => {
  const s = setup();
  try {
    await registerDemoPayment(s.env, id, now);
    const token = await s.token();
    const forged = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
    assert.equal((await handleDemoPayment(s.request(forged, { simulate: 'success' }), s.env, s.send, now)).status, 404);
    assert.equal((await handleDemoPayment(s.request(token, { simulate: 'success' }, { headers: { origin: 'https://other.example' } }), s.env, s.send, now)).status, 403);
    assert.equal((await handleDemoPayment(s.request(token, { simulate: 'success', amount: 0 }), s.env, s.send, now)).status, 400);
    assert.equal((await handleDemoPayment(s.request(token, { simulate: 'success' }, { headers: { 'content-type': 'text/plain' } }), s.env, s.send, now)).status, 400);
    assert.equal((await handleDemoPayment(s.request(token, { simulate: 'success' }), s.env, s.send, now + 86400_000)).status, 410);
    const other = new Request(`${origin}/api/demo-payments/AGW-20261114-0002`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await handleDemoPayment(other, s.env, s.send, now)).status, 404);
    assert.equal(s.sent(), 0); assert.equal(await demoPaymentEmailAllowed(s.env, id), false);
  } finally { s.db.close(); }
});

test('payment persists when e-mail sending fails; repeating the same payment can resume confirmation', async () => {
  const s = setup();
  try {
    await registerDemoPayment(s.env, id, now); const token = await s.token();
    const oldError = console.error; console.error = () => {};
    try {
      const failed = await handleDemoPayment(s.request(token, { simulate: 'success' }), s.env, async () => { throw new Error('mail down'); }, now + 1);
      assert.equal(failed.status, 503);
    } finally { console.error = oldError; }
    assert.equal(await demoPaymentEmailAllowed(s.env, id), true); assert.equal(s.sent(), 0);
    assert.equal((await (await handleDemoPayment(s.request(token, { simulate: 'success' }), s.env, s.send, now + 2)).json()).email, 'sent');
    assert.equal(s.sent(), 1);
  } finally { s.db.close(); }
});

test('disabling new demo payments does not release an unpaid gate; old sent orders and absent totals are not enrolled', async () => {
  const s = setup();
  try {
    s.env.DEMO_PAYMENTS_ENABLED = 'false';
    assert.equal(await registerDemoPayment(s.env, id, now), null);
    assert.equal(await demoPaymentEmailAllowed(s.env, id), true);
    s.env.DEMO_PAYMENTS_ENABLED = 'true';
    s.db.prepare("UPDATE order_events SET email_status='sent'").run();
    assert.equal(await registerDemoPayment(s.env, id, now), null);
    s.db.prepare("UPDATE order_events SET email_status='pending',json=?").run(JSON.stringify({ order: { ...order, net: null } }));
    await assert.rejects(registerDemoPayment(s.env, id, now), /known total/);
    s.db.prepare('UPDATE order_events SET json=?').run(JSON.stringify({ order }));
    await registerDemoPayment(s.env, id, now);
    s.env.DEMO_PAYMENTS_ENABLED = 'false';
    assert.equal(await demoPaymentEmailAllowed(s.env, id), false);
  } finally { s.db.close(); }
});
