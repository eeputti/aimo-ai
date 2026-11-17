import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { demoEnvironment, demoSettings, ownState } from '../deploy/selfhost-demo/settings.mjs';

test('demo gets its own state and never inherits paid API keys, production paths or Node options', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfhost-settings-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = demoEnvironment({ DEMO_STATE_DIR: dir, DEMO_MODEL: 'qwen3:14b', ANTHROPIC_API_KEY: 'personal', VALIO_API_KEY: 'production',
    GATEWAY_DB: '/production/gateway.db', WHATSAPP_DB: '/production/inbox.db', TURSO_AUTH_TOKEN: 'secret', NODE_OPTIONS: '--require=bad', AIMO_MODEL_PROVIDER: 'anthropic' });
  assert.equal(env.AIMO_MODEL_PROVIDER, 'ollama'); assert.equal(env.DEMO_MODEL, 'qwen3:14b');
  assert.equal(env.ANTHROPIC_API_KEY, ''); assert.equal(env.VALIO_API_KEY, '');
  assert.equal(env.GATEWAY_DB, path.join(dir, 'gateway.db'));
  assert.equal(env.TURSO_AUTH_TOKEN, undefined); assert.equal(env.WHATSAPP_DB, undefined); assert.equal(env.NODE_OPTIONS, undefined);
  fs.writeFileSync(path.join(dir, 'important.db'), 'keep');
  assert.throws(() => ownState(dir), /tyhjä oma/); assert.equal(fs.readFileSync(path.join(dir, 'important.db'), 'utf8'), 'keep');
  fs.unlinkSync(path.join(dir, 'important.db')); ownState(dir); ownState(dir);
  assert.throws(() => demoSettings({ DEMO_MODEL: 'qwen3:cloud' }), /paikallinen/);
});

test('isolated browser demo: real core updates carts, retries safely, isolates browsers and survives restart', { timeout: 25000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfhost-http-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let modelCalls = 0; let fail = false;
  const op = (over = {}) => ({ op: 'add', ref: '', productTerm: '', quantityValue: 0, quantityUnit: '', quantityBasis: '', addClaims: [], removeClaims: [], excludeAllergens: [], option: 0, ...over });
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const model = http.createServer(async (req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }] })); return; }
    let raw = ''; for await (const part of req) raw += part;
    const request = JSON.parse(raw); modelCalls++;
    assert.equal(request.model, 'qwen3:14b'); assert.equal(request.options.use_mmap, true); assert.equal(request.keep_alive, '30m');
    if (fail) { res.writeHead(503); res.end(); return; }
    const content = request.messages[1].content;
    const state = JSON.parse(content.split('Luonnoksen tila:\n')[1].split('\n\nOstajan viesti:')[0]);
    const ops = state.lines.length ? [op({ op: 'update', ref: state.lines[0].ref, quantityValue: 30, quantityUnit: 'L' })]
      : [op({ productTerm: 'laktoositonta maito', quantityValue: 20, quantityUnit: 'L', addClaims: ['FREE_FROM_LACTOSE'] }), op({ op: 'diet' })];
    res.end(JSON.stringify({ done: true, done_reason: 'stop', message: { content: JSON.stringify({ intent: 'order', deliveryDate: state.lines.length ? '' : date, ops }) } }));
  });
  model.listen(0, '127.0.0.1'); await once(model, 'listening'); t.after(() => model.close());
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise((r) => reservation.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child; let logs = '';
  const start = async () => {
    child = spawn(process.execPath, ['deploy/selfhost-demo/start.mjs'], { env: { ...process.env, DEMO_STATE_DIR: dir, DEMO_PORT: String(port), DEMO_MODEL: 'qwen3:14b',
      DEMO_OLLAMA_URL: `http://127.0.0.1:${model.address().port}`, ANTHROPIC_API_KEY: 'unused-personal-key', VALIO_API_KEY: 'unused-valio-key', GATEWAY_DB: '/production/never.db' }, stdio: ['ignore','pipe','pipe'] });
    child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
    for (let n = 0; n < 100; n++) {
      if (child.exitCode != null) throw new Error(logs);
      try { if ((await fetch(base)).ok) return; } catch {}
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(logs);
  };
  const stop = async () => { if (child?.exitCode == null) { child.kill('SIGTERM'); await once(child, 'exit'); } };
  t.after(stop);
  await start();
  const root = await fetch(base); assert.match(await root.text(), /Erillinen demo/);
  const cookie = root.headers.get('set-cookie').split(';')[0];
  const getCart = async (c = cookie) => (await (await fetch(base + '/api/cart', { headers: { cookie: c } })).json()).cart;
  const say = async (text, id = crypto.randomUUID()) => (await (await fetch(base + '/api/chat', { method:'POST', headers:{ 'content-type':'application/json',cookie }, body: JSON.stringify({text,id}) })).json());
  assert.equal((await (await fetch(base + '/api/status')).json()).ready, true);
  const id = crypto.randomUUID(); const first = await say(`20 l laktoositonta maitoa ${date}`, id);
  assert.equal(first.cart.lines[0].quantity.value, 20);
  await say('same retry', id); assert.equal(modelCalls, 1);
  const ready = await say('1'); assert.doesNotMatch(ready.text, /TILAA/);
  const selected = await getCart(); assert.equal(selected.lines[0].selectedProductId, 'demo-milk-lf');
  const change = await say('maitoa 30 litraa'); assert.equal(modelCalls, 1, 'explicit quantity edit must not call a model'); assert.equal(change.cart.lines.length, 1); assert.equal(change.cart.lines[0].quantity.value, 30);
  const other = (await fetch(base)).headers.get('set-cookie').split(';')[0]; assert.equal(await getCart(other), null);
  fail = true; await say('mallipalvelin poikki'); assert.equal((await getCart()).lines[0].quantity.value, 30);
  const calls = modelCalls; const order = await say('TILAA'); assert.doesNotMatch(order.status, /confirmed/); assert.equal(modelCalls, calls);
  const denied = await fetch(base + '/api/chat', { method:'POST',headers:{origin:'https://other.test','content-type':'application/json'},body:'{}' }); assert.equal(denied.status,403);
  assert.equal((await fetch(base,{ headers:{'x-forwarded-for':'1.2.3.4'} })).status,403);
  await stop(); await start(); assert.equal((await getCart()).lines[0].quantity.value, 30);
  assert.equal(fs.existsSync(path.join(dir,'gateway.db')), false, 'production gateway never opened');
  await stop();
});
