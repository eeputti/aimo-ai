// Kirjoittaa-ilmaisin pilvessä: pyyntö valmistuu ennen jonon käsittelyä, ja sen virhe kirjataan estämättä vastausta.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
import { createWhatsAppChannel, createMetaTypingIndicator } from '../server/whatsapp/channel.mjs';

const settings = { phoneId: '1', verifyToken: 'v', appSecret: 's', supportContact: 'Testin tuki', orderingDemo: true,
  apiVersion: 'v25.0', accessToken: 'test-token' };
const PHONE = '358401000001';

function setup({ typing, events }) {
  const store = openWhatsAppStore(':memory:');
  const { code } = store.invite(PHONE, 'Testikeittiö', 'Testaaja');
  store.pair(PHONE, codeHash(code));
  const channel = createWhatsAppChannel({ settings, store, typing, concurrency: 2,
    chat: async () => { events.push('chat'); return { text: 'Mille päivälle toimitus?' }; },
    send: async () => { events.push('send'); return `out-${events.length}`; } });
  return { store, channel };
}
async function webhook(channel, id, text) {
  const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: settings.phoneId },
    messages: [{ from: PHONE, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] }));
  const req = Readable.from([raw]); req.method = 'POST'; req.url = '/webhooks/whatsapp';
  req.headers = { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', settings.appSecret).update(raw).digest('hex') };
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  assert.equal(await channel.handle(req, res), true);
  assert.equal(res.status, 200);
}

test('pilven järjestys: ilmaisinpyyntö valmistuu ennen kuin jono ja mallityö alkavat', async () => {
  const events = [];
  const { channel } = setup({ events, typing: async (id) => { await new Promise((r) => setTimeout(r, 30)); events.push(`typing:${id}`); } });
  await webhook(channel, 'wamid.1', 'moi');
  // Kuten server/cloud.mjs: odota ilmaisin, sitten käsittele jono.
  await channel.typingSettled();
  assert.deepEqual(events, ['typing:wamid.1']);
  assert.equal(await channel.drain(2000), 1);
  assert.deepEqual(events, ['typing:wamid.1', 'chat', 'send']);
  await channel.stop();
});

test('Metan hylkäämä ilmaisin kirjataan virhekoodilla ilman viestin sisältöä, ja vastaus lähtee silti', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(String(line)));
  const events = [];
  const fetchImpl = async () => new Response(JSON.stringify({ error: { code: 131047, message: 'salainen sisältö' } }), { status: 400 });
  const { channel } = setup({ events, typing: createMetaTypingIndicator(settings, fetchImpl) });
  await webhook(channel, 'wamid.2', 'moi');
  await channel.typingSettled();
  assert.equal(await channel.drain(2000), 1);
  assert.deepEqual(events, ['chat', 'send']);
  assert.equal(warnings.length, 1);
  assert.deepEqual(JSON.parse(warnings[0]), { event: 'typing_failed', error: 'META_TYPING_HTTP_400_131047' });
  assert.ok(!warnings[0].includes('salainen') && !warnings[0].includes(PHONE) && !warnings[0].includes('test-token'));
  await channel.stop();
});

test('aikakatkaisu kirjataan lyhyesti TIMEOUT-tunnuksella', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (line) => warnings.push(String(line)));
  const events = [];
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const { channel } = setup({ events, typing: async () => { throw timeout; } });
  await webhook(channel, 'wamid.3', 'moi');
  await channel.typingSettled();
  assert.deepEqual(warnings.map((w) => JSON.parse(w)), [{ event: 'typing_failed', error: 'TIMEOUT' }]);
  await channel.stop();
});
