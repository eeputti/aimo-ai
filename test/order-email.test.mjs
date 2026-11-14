// Order e-mail flow against the real gateway/checkout stack with a synthetic catalog. Resend is a fake fetch: no e-mail is ever sent.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-order-email-'));
const products = Array.from({ length: 25 }, (_, i) => ({ id: String(9900000 + i), name: `Testikananmunat M6 <script>alert(1)</script> & "co" ${i}`, category: '10590', salesUnit: 'RAS', baseUnit: 'RAS', perSales: 1, lot: .01, temp: 'chilled', kg: .36, contains: ['AE'], labels: [], hasAllergenData: true }));
fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(products));
Object.assign(process.env, { AIMO_CATALOG: path.join(dir, 'catalog.json'), AIMO_DB: path.join(dir, 'kitchen.db'), GATEWAY_DB: path.join(dir, 'gateway.db'), VALIO_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_NOW: '2026-11-14T10:00:00+02:00', GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const { reviewStorefront } = await import('../server/storefront.mjs');
const { orders, ledger } = await import('../server/gateway/store.mjs');
const { kv } = await import('../server/db.mjs');
const { createOrderMailer, readEmailConfig } = await import('../server/order-email.mjs');
const { createOrderEmailFlow, validateEmail } = await import('../server/order-email-flow.mjs');
const { handleOrderEmailRequest } = await import('../server/order-email-http.mjs');
const { renderReviewEmail } = await import('../server/order-email-templates.mjs');
const { closeDatabase } = await import('../server/db.mjs');
const { closeGatewayDatabase } = await import('../server/gateway/store.mjs');
after(() => { closeDatabase(); closeGatewayDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });

const API_KEY = 're_test_key_do_not_log_0123456789';
const ENV = { RESEND_API_KEY: API_KEY, ORDER_EMAIL_FROM: 'Valio Aimo <orders@example.test>', ORDER_EMAIL_PUBLIC_URL: 'https://shop.example.test' };
const date = '2026-11-16';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function setup(env = ENV) {
  const sent = []; const failures = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const failure = failures.shift();
    if (failure === 'network') throw new Error('socket hang up');
    if (failure) return new Response('{"message":"nope"}', { status: failure });
    return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200 });
  };
  const mailer = createOrderMailer({ env, fetchImpl });
  return { sent, failures, mailer, flow: createOrderEmailFlow({ mailer }) };
}
async function cart(reference = '') {
  const r = await reviewStorefront(products.map((p) => ({ id: p.id, qty: 2 })), date);
  return { deliveryDate: date, reference, lines: r.lines.filter((l) => l.ok).slice(0, 3).map((l) => ({ id: l.id, qty: l.product.qty, price: l.product.price, vat: l.product.vat })) };
}
const tokenIn = (email) => /confirm\?token=([A-Za-z0-9_-]{43})/.exec(email.body.html)[1];
async function serve(flow, mailer) {
  const server = http.createServer(async (req, res) => { if (!(await handleOrderEmailRequest(req, res, new URL(req.url, 'http://localhost'), { flow, mailer }))) { res.writeHead(404); res.end(); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (token, headers = {}) => fetch(`${base}/order/confirm`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ token }) });
  return { base, post, get: (token, method = 'GET') => fetch(`${base}/order/confirm?token=${token}`, { method }), close: () => new Promise((resolve) => server.close(resolve)) };
}

test('configuration is validated without echoing values, and https is required except for localhost', () => {
  assert.equal(readEmailConfig(ENV).ok, true);
  assert.deepEqual(readEmailConfig({}).missing, ['RESEND_API_KEY', 'ORDER_EMAIL_FROM', 'ORDER_EMAIL_PUBLIC_URL']);
  assert.deepEqual(readEmailConfig({ ...ENV, ORDER_EMAIL_PUBLIC_URL: 'http://shop.example.test' }).invalid, ['ORDER_EMAIL_PUBLIC_URL']);
  assert.deepEqual(readEmailConfig({ ...ENV, ORDER_EMAIL_PUBLIC_URL: 'https://shop.example.test/?x=1' }).invalid, ['ORDER_EMAIL_PUBLIC_URL']);
  assert.equal(readEmailConfig({ ...ENV, ORDER_EMAIL_PUBLIC_URL: 'http://localhost:4747/' }).baseUrl, 'http://localhost:4747');
  assert.deepEqual(readEmailConfig({ ...ENV, ORDER_EMAIL_FROM: 'not an address' }).invalid, ['ORDER_EMAIL_FROM']);
  for (const bad of ['', 'a@b', 'a b@example.test', 'a@example.test, b@example.test', 'a@example.test\r\nBcc: x@example.test', '<a@example.test>']) assert.throws(() => validateEmail(bad), /sähköpostiosoite/);
});

test('review e-mail: Resend request, escaped content, Confirm order link, and no order from sending, opening or previewing the link', async () => {
  const { sent, flow, mailer } = setup(); const before = orders.list().length;
  const input = { ...(await cart('<b>ref</b>')), email: 'customer1@example.test' };
  const first = await flow.request(input);
  assert.equal(first.sent, true); assert.equal(first.duplicate, false); assert.match(first.expiresAt, /^2026-11-1\d/);
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.equal(mail.url, 'https://api.resend.com/emails');
  assert.equal(mail.headers.authorization, `Bearer ${API_KEY}`); assert.match(mail.headers['idempotency-key'], /^order-review-[a-f0-9]{32}$/);
  assert.deepEqual(mail.body.to, ['customer1@example.test']); assert.equal(mail.body.from, ENV.ORDER_EMAIL_FROM);
  const { html, text } = mail.body;
  assert.match(html, /Confirm order<\/a>/); assert.match(html, /href="https:\/\/shop\.example\.test\/order\/confirm\?token=[A-Za-z0-9_-]{43}"/);
  assert.ok(html.indexOf('Confirm order</a>') > html.indexOf('Total</td>')); // the button sits below the summary
  assert.ok(!html.includes('<script>alert(1)') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot; '));
  assert.ok(!html.includes('<b>ref</b>') && html.includes('&lt;b&gt;ref&lt;/b&gt;'));
  assert.ok(!html.includes('customer1@example.test') && !text.includes('customer1@example.test'));
  assert.match(text, /Confirm order: https:\/\/shop\.example\.test\/order\/confirm\?token=/);
  const token = tokenIn(mail);
  assert.equal(kv.get(`order-email.${sha(token)}`).status, 'pending'); assert.equal(kv.get(`order-email.${token}`), null); // only the hash is stored
  const server = await serve(flow, mailer);
  try {
    for (const method of ['GET', 'GET', 'HEAD']) {
      const res = await server.get(token, method);
      assert.equal(res.status, 200); assert.match(res.headers.get('cache-control'), /no-store/); assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      if (method === 'GET') { const page = await res.text(); assert.match(page, /Nothing has been ordered yet/); assert.match(page, /<button type="submit">Confirm order<\/button>/); assert.ok(!page.includes('<script>alert(1)')); }
    }
    assert.equal((await server.get('x'.repeat(43))).status, 404);
  } finally { await server.close(); }
  assert.equal(orders.list().length, before); assert.equal(sent.length, 1); // still no order and no second e-mail
});

test('only the confirmation POST places the order; retries and concurrent presses give one order and one confirmed e-mail', async () => {
  const { sent, flow, mailer } = setup(); const before = orders.list().length;
  await flow.request({ ...(await cart('PO-7')), email: 'customer2@example.test' });
  const token = tokenIn(sent[0]); const server = await serve(flow, mailer);
  try {
    const results = await Promise.all([server.post(token), server.post(token), server.post(token)]);
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
    const page = await results[0].text(); assert.match(page, /Order confirmed/); const orderId = /AGW-\d{8}-\d{4}/.exec(page)[0];
    assert.equal((await (await server.post(token)).text()).includes(orderId), true);
    assert.equal((await (await server.get(token)).text()).includes(orderId), true);
    assert.equal(orders.list().length, before + 1);
    const confirmed = sent.filter((m) => m.body.subject.startsWith('Order AGW-'));
    assert.equal(sent.length, 2); assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].headers['idempotency-key'], `order-confirmed-${orderId}`); assert.deepEqual(confirmed[0].body.to, ['customer2@example.test']);
    const { html, text } = confirmed[0].body; const stored = orders.list().find((o) => o.orderId === orderId);
    assert.ok(stored);
    for (const l of stored.lines) { assert.ok(text.includes(l.productId) && text.includes(`€${l.unitPriceNet.toFixed(2)}`) && text.includes(`€${l.lineNet.toFixed(2)}`)); assert.ok(html.includes(`Qty ${l.quantity}`)); }
    for (const part of [orderId, 'Monday, 16 November 2026', 'Subtotal (excl. VAT)', `€${stored.totals.net.toFixed(2)}`, `€${stored.totals.vat.toFixed(2)}`, `€${stored.totals.gross.toFixed(2)}`, 'PO-7']) assert.ok(html.includes(part) && text.includes(part), part);
    assert.ok(!html.includes('Confirm order</a>'));
    const record = kv.get(`order-email.${sha(token)}`); assert.equal(record.email, null); assert.equal(record.emails.confirmed, 'sent'); // address dropped once nothing is left to send
    assert.equal(ledger.verify().valid, true);
  } finally { await server.close(); }
});

test('a failed confirmed e-mail leaves the order recorded; pressing the button again retries only the e-mail, with the same idempotency key', async () => {
  const { sent, failures, flow, mailer } = setup(); const before = orders.list().length;
  await flow.request({ ...(await cart('r3')), email: 'customer3@example.test' });
  const token = tokenIn(sent[0]); const server = await serve(flow, mailer);
  try {
    failures.push(500);
    const first = await (await server.post(token)).text();
    assert.match(first, /not been sent yet/); assert.equal(orders.list().length, before + 1);
    assert.match(await (await server.get(token)).text(), /not been sent yet/); assert.equal(sent.length, 2); // GET never sends
    const second = await (await server.post(token)).text();
    assert.match(second, /A confirmation e-mail has been sent/); assert.equal(sent.length, 3);
    assert.equal(sent[1].headers['idempotency-key'], sent[2].headers['idempotency-key']);
    await server.post(token); assert.equal(sent.length, 3); assert.equal(orders.list().length, before + 1);
  } finally { await server.close(); }
});

test('review e-mail failures create no usable link and a retry starts clean; double clicks send one e-mail', async () => {
  const { sent, failures, flow } = setup();
  const input = { ...(await cart('r4')), email: 'customer4@example.test' };
  failures.push('network');
  await assert.rejects(flow.request(input), (e) => e.status === 502 && !/socket|example\.test/.test(e.message));
  assert.equal(kv.get(`order-email.${sha(tokenIn(sent[0]))}`).status, 'failed');
  failures.push(503); await assert.rejects(flow.request(input), (e) => e.status === 502);
  const [a, b] = await Promise.all([flow.request(input), flow.request(input)]);
  assert.equal(sent.length, 3); assert.deepEqual(a, b); // one more send for two simultaneous requests
  assert.equal((await flow.request(input)).duplicate, true); assert.equal(sent.length, 3); // and none for a repeat soon after
});

test('unconfigured server, bad input and rate limits send nothing and place nothing', async () => {
  const none = setup({}); const input = { ...(await cart('r5')), email: 'customer5@example.test' };
  await assert.rejects(none.flow.request(input), (e) => e.status === 503 && /määritetty/.test(e.message)); assert.equal(none.sent.length, 0);
  const { sent, flow } = setup();
  await assert.rejects(flow.request({ ...input, email: 'nope' }), (e) => e.status === 400);
  await assert.rejects(flow.request({ ...input, lines: [{ ...input.lines[0], price: 999 }] }), (e) => e.status === 409);
  await assert.rejects(flow.request({ ...input, lines: [{ ...input.lines[0], qty: -1 }] }), (e) => e.status === 400);
  assert.equal(sent.length, 0);
  for (const ref of ['a', 'b', 'c']) await flow.request({ ...input, reference: ref });
  await assert.rejects(flow.request({ ...input, reference: 'd' }), (e) => e.status === 429); assert.equal(sent.length, 3);
});

test('changed prices, expired links, cross-site posts and malformed requests place no order', async () => {
  const { sent, flow, mailer } = setup(); const before = orders.list().length;
  await flow.request({ ...(await cart('r6')), email: 'customer6@example.test' });
  await flow.request({ ...(await cart('r7')), email: 'customer6@example.test' });
  const [changed, expired] = sent.map(tokenIn); const server = await serve(flow, mailer);
  try {
    const rec = kv.get(`order-email.${sha(changed)}`); rec.summary.lines[0].unitPriceNet += 1; kv.set(`order-email.${sha(changed)}`, rec);
    const res = await server.post(changed); assert.equal(res.status, 409); assert.match(await res.text(), /Order not placed/);
    assert.equal((await server.post(changed)).status, 409); // stays closed
    const old = kv.get(`order-email.${sha(expired)}`); old.expiresAt = 0; kv.set(`order-email.${sha(expired)}`, old);
    assert.equal((await server.get(expired)).status, 410); assert.equal((await server.post(expired)).status, 410);
    const fresh = await cart('r8'); await flow.request({ ...fresh, email: 'customer6@example.test' }); const token = tokenIn(sent.at(-1));
    assert.equal((await server.post(token, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await server.post(token, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await fetch(`${server.base}/order/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).status, 415);
    assert.equal((await fetch(`${server.base}/order/confirm`, { method: 'PUT' })).status, 405);
    assert.equal((await server.post('not-a-token')).status, 404);
  } finally { await server.close(); }
  assert.equal(orders.list().length, before); assert.equal(sent.length, 3);
});

test('recipient addresses, tokens and the API key are never logged', async () => {
  const logs = []; const saved = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) { saved[m] = console[m]; console[m] = (...args) => logs.push(args.map(String).join(' ')); }
  const { sent, failures, flow, mailer } = setup(); let server;
  try {
    await flow.request({ ...(await cart('r9')), email: 'private-person@example.test' });
    const token = tokenIn(sent[0]); server = await serve(flow, mailer);
    failures.push(500, 'network'); await server.post(token); await server.post(token);
    await assert.rejects(flow.request({ ...(await cart('r10')), email: 'private-person@example.test', lines: [] }), () => true);
  } finally { await server?.close(); for (const m of Object.keys(saved)) console[m] = saved[m]; }
  assert.ok(logs.every((l) => !/private-person|re_test_key|[A-Za-z0-9_-]{43}/.test(l)), logs.join('\n'));
});

test('the review e-mail template escapes hostile values in every field it renders', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const { html } = renderReviewEmail({ summary: { deliveryDate: evil, reference: evil, lines: [{ productId: evil, name: evil, quantity: 1, unitLabel: evil, unitPriceNet: 1, vatRate: evil, lineNet: 1 }], totals: { net: 1, vat: 0, gross: 1 } }, confirmUrl: `https://shop.example.test/order/confirm?token=${evil}`, expiresAtMs: Date.now(), logoUrl: 'https://shop.example.test/aimo-logo.png' });
  assert.ok(!html.includes('<img src=x') && !html.includes('onerror=alert(1)>'));
});
