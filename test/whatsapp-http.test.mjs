import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { openWhatsAppStore } from '../server/whatsapp/store.mjs';
import { createWhatsAppChannel } from '../server/whatsapp/channel.mjs';

test('HTTP webhook acknowledges before slow agent and worker returns the response', { timeout: 8000 }, async (t) => {
  const store = openWhatsAppStore(':memory:');
  const phone = '358401234567';
  const invitation = store.invite(phone, 'Ravintola A', 'Anna');
  const settings = { phoneId: '123', verifyToken: 'verify', appSecret: 'secret', supportContact: 'https://example.com/support' };
  let release; let modelStarted; const started = new Promise((r) => { modelStarted = r; });
  let delivered; const delivery = new Promise((r) => { delivered = r; });
  const typing = [];
  const channel = createWhatsAppChannel({ settings, store,
    typing: async (id) => { typing.push(id); },
    chat: async () => { assert.equal(typing.at(-1), 'ask'); modelStarted(); return new Promise((r) => { release = () => r({ text: '60 munaa: toimitus maanantaina.' }); }); },
    send: async (to, text) => { if (text.startsWith('60 munaa')) delivered({ to, text }); return 'out'; },
  });
  const server = http.createServer((req, res) => channel.handle(req, res));
  t.after(async () => { release?.(); await channel.stop(); await new Promise((r) => server.close(r)); store.close(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); channel.start();
  const base = `http://127.0.0.1:${server.address().port}/webhooks/whatsapp`;
  assert.equal(await (await fetch(base + '?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123')).text(), '123');
  const post = async (body) => fetch(base, { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', settings.appSecret).update(body).digest('hex') }, body });
  const message = (id, text) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: '123' }, messages: [{ id, from: phone, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
  } }] }] });
  assert.equal((await post('x'.repeat(256001))).status, 413);
  assert.equal((await post(message('pair', `YHDISTA ${invitation.code}`))).status, 200);
  // Process pairing deterministically before sending the first conversation turn.
  await channel.processNext();
  assert.equal((await post(message('ask', '60 munaa maanantaiksi'))).status, 200);
  await started; assert.equal(store.db.prepare("SELECT state FROM inbox WHERE id='ask'").get().state, 'processing');
  release();
  const answer = await delivery;
  assert.equal(answer.to, phone); assert.match(answer.text, /60 munaa/);
});
