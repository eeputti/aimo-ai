// Real HTTP: browser ordering conversation → the same process/gateway → existing storefront.
// Isolated databases and simulated products; no Meta, model or live Valio calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const skip = !fs.existsSync(new URL('../data/catalog.json', import.meta.url)) && 'data/catalog.json puuttuu';

async function serve(t, ordering = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-local-shop-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/whatsapp-server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, WHATSAPP_PORT: '0', PORT: '0', WHATSAPP_ENABLED: 'false', AIMO_EMBEDDED_STOREFRONT: '',
      WHATSAPP_ORDERING_ENABLED: String(ordering), VALIO_API_KEY: '', ANTHROPIC_API_KEY: '',
      AIMO_DB: path.join(dir, 'prices.db'), GATEWAY_DB: path.join(dir, 'gateway.db'),
      WHATSAPP_DB: path.join(dir, 'whatsapp.db'), WHATSAPP_DRAFT_DB: path.join(dir, 'drafts.db'), WHATSAPP_QUOTE_DB: path.join(dir, 'quotes.db'),
      WHATSAPP_PHONE_NUMBER_ID: '12345', WHATSAPP_ACCESS_TOKEN: 'test', WHATSAPP_APP_SECRET: 'test', WHATSAPP_VERIFY_TOKEN: 'test',
      WHATSAPP_SUPPORT_CONTACT: 'Testin ylläpito', WHATSAPP_API_VERSION: 'v25.0', WHATSAPP_DEMO_PHONE: '',
      DEMO_NOW: '2026-11-14T10:00:00+02:00',
      GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode == null) { child.kill(); await once(child, 'exit'); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let log = '';
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Startup timeout: ${log}`)), 15000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exit ${code}: ${log}`)); });
    const read = (chunk) => {
      log += chunk;
      const match = log.match(/WhatsApp test → http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
  });
  const get = async (url) => {
    const res = await fetch(base + url); assert.equal(res.status, 200); return res.json();
  };
  const post = async (url, body) => {
    const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(res.ok, `${url}: ${res.status} ${res.ok ? '' : await res.text()}`); return res.json();
  };
  return { base, get, post, dir };
}

test('local storefront shows the exact conversation order once and approvals use the same gateway', { skip, timeout: 30000 }, async (t) => {
  const { base, get, post, dir } = await serve(t);
  assert.equal((await get('/healthz')).mode, 'ordering-demo');
  const homepage = await (await fetch(base + '/?shop=orders')).text();
  assert.match(homepage, /aimo-local-shop/);
  assert.match(homepage, /Testikeittiö \(paikallinen demo\)/);
  assert.doesNotMatch(homepage, /554485 VALIO OY/);
  assert.deepEqual((await get('/api/local-shop')).accounts, []);
  assert.equal((await get('/console/state')).orders.length, 0);

  const say = async (text) => (await post('/demo/chat', { text })).text;
  assert.match(await say('20 l maitoa ja 5 l kermaa maanantaiksi'), /laktoositonta vai käykö tavallinen/);
  const options = await say('laktoositon'); assert.match(options, /Maito 20 l/);
  const context = await get('/api/local-shop');
  assert.equal(context.accounts.length, 1);
  assert.equal(context.accounts[0].name, 'Testikeittiö (selaindemo)');
  assert.equal(context.defaultBuyerId, context.accounts[0].buyerId);
  assert.doesNotMatch(JSON.stringify(context), /358000000001|apiKey|demoKey/);
  await post(`/console/buyers/${context.defaultBuyerId}/mandate`, { approval: 'always' });
  assert.match(await say('1'), /\*Kerma 5 l:\*/); // yksi tuoterivi kerrallaan
  assert.match(await say('1'), /Vahvista vastaamalla \*TILAA\*/);
  const done = await say('TILAA'); assert.match(done, /Tilaus AGW-/);
  const state = await get('/console/state');
  assert.equal(state.orders.length, 1);
  let order = state.orders[0];
  assert.equal(order.buyerId, context.defaultBuyerId);
  assert.equal(order.lines.length, 2);
  assert.equal(order.deliveryDate, '2026-11-16');
  assert.equal(order.commit.simulated, true);
  assert.ok(done.includes(order.orderId));
  assert.equal(order.status, 'pending_approval');
  order = await post(`/console/orders/${order.orderId}/approve`, { by: 'Testaaja' });
  assert.equal(order.status, 'confirmed');
  assert.match(await say('TILAA'), /Uutta tilausta ei tehty/);
  assert.equal((await get('/console/state')).orders.length, 1);
  assert.equal((await get(`/console/orders/${order.orderId}`)).orderId, order.orderId);
  assert.equal((await get(`/console/orders/${order.orderId}/audit`)).chain.valid, true);
  // Embedded mode must not seed kitchen proposals or another HTTP server/WhatsApp worker.
  const { DatabaseSync } = await import('node:sqlite');
  const prices = new DatabaseSync(path.join(dir, 'prices.db'), { readOnly: true });
  try { assert.equal(prices.prepare('SELECT count(*) n FROM proposals').get().n, 0); } finally { prices.close(); }

  for (const route of ['/console/reset', '/console/demo', '/api/reset']) {
    assert.equal((await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  }
  for (const headers of [{ 'cf-ray': 'test' }, { 'x-forwarded-for': '203.0.113.1' }, { 'x-forwarded-host': 'example.com' },
    { origin: 'https://example.com' }, { origin: 'invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    const res = await fetch(base + '/console/state', { headers });
    assert.ok([403, 404].includes(res.status));
    assert.doesNotMatch(await res.text(), new RegExp(order.orderId));
  }
  assert.equal((await get('/console/state')).orders.length, 1);
});

test('read-only WhatsApp mode exposes no local storefront or ordering gateway', { skip, timeout: 20000 }, async (t) => {
  const { base, get } = await serve(t, false);
  assert.equal((await get('/healthz')).mode, 'read-only-test');
  for (const route of ['/', '/api/local-shop', '/console/state', '/v1/orders']) assert.equal((await fetch(base + route)).status, 404);
});
