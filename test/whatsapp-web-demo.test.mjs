import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { openWhatsAppStore } from '../server/whatsapp/store.mjs';
import { createWebDemo, isLocal, WEB_DEMO_PHONE } from '../server/whatsapp/web-demo.mjs';

async function serve(t, chat) {
  const store = openWhatsAppStore(':memory:');
  const demo = createWebDemo({ store, chat });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!(await demo.handle(req, res, url))) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((r) => server.close(r)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (text, headers = {}) => fetch(`${base}/demo/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ text }) });
  return { base, post, store };
}

test('browser demo runs the same ordering chat for its own test customer, one turn at a time', async (t) => {
  const seen = []; let active = 0; let overlap = false;
  const { base, post, store } = await serve(t, async ({ member, messageId, messages }) => {
    if (++active > 1) overlap = true;
    await new Promise((r) => setTimeout(r, 20)); active--;
    seen.push({ phone: member.phone, binding: member.binding, messageId, text: messages.at(-1).content });
    return { text: `*Luonnos* ${messages.at(-1).content}`, status: 'collecting' };
  });
  const page = await fetch(`${base}/demo`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Valio Aimo Tilausapuri/);
  const [a, b] = await Promise.all([post('20 l maitoa'), post('laktoositon')]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  const reply = await a.json();
  assert.equal(reply.text, '*Luonnos* 20 l maitoa');
  assert.equal(reply.status, 'collecting');
  assert.equal(overlap, false);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((s) => s.phone === WEB_DEMO_PHONE && s.binding === store.member(WEB_DEMO_PHONE).binding && /^web-/.test(s.messageId)));
  assert.notEqual(seen[0].messageId, seen[1].messageId);
  const logo = await fetch(`${base}/demo/logo.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await logo.arrayBuffer()).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal((await fetch(`${base}/demo/logo.png`, { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 403);
  assert.equal((await post('')).status, 400);
  assert.equal((await post('x'.repeat(4001))).status, 400);
});

test('browser demo is refused through a tunnel, from another site and as a form post; failures do not claim an order', async (t) => {
  let calls = 0;
  const { base, post } = await serve(t, async () => { calls++; throw new Error('down'); });
  for (const headers of [{ 'cf-connecting-ip': '203.0.113.9' }, { 'x-forwarded-for': '203.0.113.9' }, { origin: 'https://example.com' }]) {
    assert.equal((await post('maitoa', headers)).status, 403);
  }
  assert.equal((await fetch(`${base}/demo`, { headers: { 'cf-ray': 'abc' } })).status, 403);
  assert.equal((await fetch(`${base}/demo/chat`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"text":"maitoa"}' })).status, 403);
  assert.equal(calls, 0);
  const failed = await post('maitoa');
  assert.equal(failed.status, 502);
  assert.doesNotMatch((await failed.json()).error, /tilau/i);
  const req = (remoteAddress, host, extra = {}) => ({ socket: { remoteAddress }, headers: { host, ...extra } });
  assert.equal(isLocal(req('127.0.0.1', 'localhost:4749')), true);
  assert.equal(isLocal(req('192.168.1.20', 'localhost:4749')), false);
  assert.equal(isLocal(req('127.0.0.1', 'tournaments.trycloudflare.com')), false);
});
