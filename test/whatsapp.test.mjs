import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
import { createWhatsAppChannel, createMetaSender, validSignature, extractMessages, formatReply } from '../server/whatsapp/channel.mjs';
import { whatsappSettings } from '../server/whatsapp/runtime.mjs';

const PHONE = '358401234567'; const OTHER = '358409876543';
const settings = { phoneId: '12345', appSecret: 'test-app-secret', verifyToken: 'test-verify', accessToken: 'test-access', apiVersion: 'v23.0', supportContact: 'https://example.com/tuki' };
function fixture(t, options = {}) {
  let time = Date.parse('2026-11-14T12:00:00Z');
  const now = () => time;
  const store = openWhatsAppStore(options.filename || ':memory:', now);
  t.after(() => store.close());
  const sent = []; const calls = [];
  const channel = createWhatsAppChannel({ settings, store, now,
    chat: async (args) => { calls.push(args); return { text: 'Kananmunat: 60 kpl. Toimitus maanantaina.' }; },
    send: async (...args) => { sent.push(args); return 'reply-id'; }, ...options });
  let n = 0;
  const enqueue = (text, phone = PHONE, extra = {}) => store.enqueue({ id: `message-${++n}`, phone, text, sentAt: now(), ...extra });
  async function pair(phone = PHONE, company = 'Ravintola A') {
    const { code } = store.invite(phone, company, 'Anna');
    enqueue(`YHDISTA ${code}`, phone); await channel.processNext();
    return code;
  }
  return { store, channel, calls, sent, enqueue, pair, now, advance: (ms) => { time += ms; } };
}
async function request(channel, method, path, body = '', signature) {
  const raw = Buffer.from(body);
  const req = Readable.from([raw]); req.method = method; req.url = path;
  req.headers = { 'x-hub-signature-256': signature ?? 'sha256=' + crypto.createHmac('sha256', settings.appSecret).update(raw).digest('hex') };
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  const handled = await channel.handle(req, res);
  return { ...res, handled };
}
function payload(now, messages, phoneId = settings.phoneId) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: phoneId }, messages: messages.map((m) => ({ timestamp: String(now / 1000), type: 'text', ...m })),
  } }] }] };
}

test('verification handshake, signature and body limits protect the inbox', async (t) => {
  const f = fixture(t);
  assert.equal((await request(f.channel, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=hello')).body, 'hello');
  assert.equal((await request(f.channel, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong')).status, 403);
  assert.equal((await request(f.channel, 'POST', '/webhooks/whatsapp', '{}', 'bad')).status, 403);
  assert.equal((await request(f.channel, 'POST', '/webhooks/whatsapp', '{')).status, 400);
  assert.equal((await request(f.channel, 'POST', '/webhooks/whatsapp', 'x'.repeat(256001))).status, 413);
  assert.equal((await request(f.channel, 'DELETE', '/webhooks/whatsapp')).status, 405);
  assert.equal((await request(f.channel, 'GET', '/other')).handled, false);
  assert.equal(validSignature(Buffer.from('changed'), 'sha256=' + '0'.repeat(64), settings.appSecret), false);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM inbox').get().n, 0);
});

test('batch messages are durably acknowledged before model work; statuses, other numbers, old messages and duplicates are ignored', async (t) => {
  const f = fixture(t); await f.pair();
  const body = JSON.stringify(payload(f.now(), [{ id: 'one', from: PHONE, text: { body: 'munia' } }, { id: 'two', from: PHONE, text: { body: 'jauhoja' } }]));
  assert.equal((await request(f.channel, 'POST', '/webhooks/whatsapp', body)).status, 200);
  await request(f.channel, 'POST', '/webhooks/whatsapp', body);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM inbox WHERE state='pending'").get().n, 2);
  assert.deepEqual(extractMessages(payload(f.now(), [{ id: 'other', from: PHONE, text: { body: 'x' } }], 'different'), settings.phoneId, f.now()), []);
  assert.deepEqual(extractMessages(payload(f.now() - 86400_000, [{ id: 'old', from: PHONE, text: { body: 'x' } }]), settings.phoneId, f.now()), []);
  assert.deepEqual(extractMessages({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [] } }] }] }, settings.phoneId), []);
  await f.channel.processNext(); await f.channel.processNext();
  assert.equal(f.calls.length, 2);
});

test('unpaired sender cannot invoke the model; codes are phone-bound, single-use, hashed and expire', async (t) => {
  const f = fixture(t);
  f.enqueue('Hae munat'); await f.channel.processNext(); assert.equal(f.calls.length, 0);
  const { code } = f.store.invite(PHONE, 'Ravintola A', 'Anna');
  f.enqueue(`YHDISTA ${code}`, OTHER); await f.channel.processNext(); assert.equal(f.store.member(OTHER), undefined);
  f.enqueue(`YHDISTA ${code}`); await f.channel.processNext(); assert.equal(f.store.member(PHONE).company, 'Ravintola A');
  assert.equal(f.store.pair(PHONE, codeHash(code)), null);
  assert.equal(JSON.stringify(f.store.db.prepare('SELECT * FROM inbox').all()).includes(code), false);
  const second = f.store.invite(OTHER, 'Ravintola B', 'Mikko');
  f.advance(600001); assert.equal(f.store.pair(OTHER, codeHash(second.code)), null);
});

test('pairing attempt and per-minute message limits are enforced', async (t) => {
  const f = fixture(t); const { code } = f.store.invite(PHONE, 'A', 'Anna');
  for (let i = 0; i < 5; i++) { f.enqueue('YHDISTA wrong'); await f.channel.processNext(); }
  f.enqueue(`YHDISTA ${code}`); await f.channel.processNext(); assert.equal(f.store.member(PHONE), undefined);
  for (let i = 0; i < 4; i++) assert.equal(f.enqueue('Hei'), true);
  assert.equal(f.enqueue('Liikaa'), false);
});

test('paired conversations keep history, isolate companies and do not execute order tools', async (t) => {
  const f = fixture(t); await f.pair(); await f.pair(OTHER, 'Ravintola B');
  f.enqueue('60 kananmunaa maanantaiksi'); await f.channel.processNext();
  f.enqueue('Entä korvaava tuote?'); await f.channel.processNext();
  assert.equal(f.calls[1].messages.length, 3); assert.equal(f.calls[1].channel, 'whatsapp');
  f.enqueue('Jauhoja', OTHER); await f.channel.processNext();
  assert.equal(f.calls[2].messages.length, 1);
  assert.equal(f.calls[2].messages[0].content, 'Jauhoja');
  assert.equal(f.sent.at(-1)[0], OTHER);
});

test('re-pairing confirms the new identity and cancels replies bound to the old company', async (t) => {
  const f = fixture(t); await f.pair();
  const oldBinding = f.store.member(PHONE).binding;
  const { code } = f.store.invite(PHONE, 'Ravintola B', 'Mikko');
  f.enqueue(`YHDISTA ${code}`);
  f.enqueue('Old-company queued request');
  await f.channel.processNext();
  assert.match(f.sent.at(-1)[1], /Mikko, Ravintola B/);
  assert.notEqual(f.store.member(PHONE).binding, oldBinding);
  const before = f.sent.length;
  await f.channel.processNext();
  assert.equal(f.sent.length, before); assert.equal(f.calls.length, 0);
});

test('delivery retries reuse saved reply and do not make a second model call', async (t) => {
  let fail = false; let sends = 0;
  const f = fixture(t, { send: async () => { sends++; if (fail) throw new Error('META_HTTP_503'); return 'out'; } });
  await f.pair(); fail = true;
  f.enqueue('Munia'); await f.channel.processNext(); assert.equal(f.calls.length, 1);
  f.advance(30_001); fail = false; await f.channel.processNext();
  assert.equal(f.calls.length, 1); assert.equal(sends, 3);
  assert.equal(f.store.db.prepare("SELECT state FROM inbox WHERE kind='text'").get().state, 'done');
});

test('a delayed reply blocks later replies to the same person while other people can proceed', async (t) => {
  let failing = false;
  const f = fixture(t, { send: async (phone) => { if (failing && phone === PHONE) throw new Error('META_HTTP_503'); return 'sent'; } });
  await f.pair(); await f.pair(OTHER, 'Ravintola B'); failing = true;
  f.enqueue('Munia'); f.enqueue('Jauhoja'); f.enqueue('Maitoa', OTHER);
  await f.channel.processNext(); assert.equal(f.calls.length, 1);
  await f.channel.processNext(); assert.equal(f.calls.length, 2);
  assert.equal(f.calls.at(-1).messages.at(-1).content, 'Maitoa');
  assert.equal(await f.channel.processNext(), false);
  f.advance(30_001); failing = false;
  await f.channel.processNext(); await f.channel.processNext();
  assert.equal(f.calls.length, 3); assert.equal(f.calls.at(-1).messages.at(-1).content, 'Jauhoja');
});

test('revocation during model work cancels reply and history; queued messages do not follow a new binding', async (t) => {
  let revoke;
  const f = fixture(t, { chat: async () => { revoke(); return { text: 'private response' }; } });
  await f.pair(); f.enqueue('Munia'); f.enqueue('Jauhoja');
  const before = f.sent.length;
  revoke = () => f.store.revoke(PHONE);
  await f.channel.processNext(); await f.channel.processNext();
  assert.equal(f.sent.length, before); assert.equal(f.store.member(PHONE), undefined);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM turns').get().n, 0);
});

test('unsupported media, human support and model failures return controlled replies', async (t) => {
  const f = fixture(t, { chat: async () => { throw new Error('secret-token-should-not-leak'); } });
  await f.pair(); f.enqueue('', PHONE, { kind: 'unsupported' }); await f.channel.processNext();
  assert.match(f.sent.at(-1)[1], /tekstiviesti/);
  f.enqueue('tuki'); await f.channel.processNext(); assert.match(f.sent.at(-1)[1], /https:\/\/example.com\/tuki/);
  f.enqueue('Munia'); await f.channel.processNext();
  assert.match(f.sent.at(-1)[1], /ei nyt onnistunut/); assert.doesNotMatch(f.sent.at(-1)[1], /secret-token/);
  assert.ok(formatReply('x'.repeat(5000)).length < 4096);
});

test('pending work expires without sending outside service window; transient errors have a bounded retry count', async (t) => {
  let fail = false;
  const f = fixture(t, { send: async () => { if (fail) throw new Error('secret'); return 'out'; } });
  await f.pair();
  f.enqueue('Munia'); f.advance(23 * 3600_000); await f.channel.processNext();
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.db.prepare("SELECT state FROM inbox WHERE kind='text'").get().state, 'expired');
  fail = true; f.enqueue('Jauhoja');
  for (let i = 0; i < 3; i++) { await f.channel.processNext(); f.advance(100_000); }
  const job = f.store.db.prepare("SELECT * FROM inbox WHERE text='Jauhoja'").get();
  assert.equal(job.state, 'failed'); assert.equal(job.attempts, 3); assert.equal(job.error, 'PROCESSING_OR_DELIVERY_ERROR');
});

test('restart retains identity, history, deduplication and saved replies', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-wa-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'wa.db');
  const first = openWhatsAppStore(filename);
  first.invite(PHONE, 'A', 'Anna');
  const invite = first.db.prepare('SELECT hash FROM invites').get(); first.pair(PHONE, invite.hash);
  first.enqueue({ id: 'persistent', phone: PHONE, text: 'Munia', sentAt: Date.now() });
  const job = first.next(); first.saveReply(job, 'Vastaus', first.member(PHONE).binding); first.close();
  const second = openWhatsAppStore(filename); t.after(() => second.close()); second.recover();
  assert.equal(second.next().reply, 'Vastaus'); assert.equal(second.history(second.member(PHONE).binding).length, 2);
  assert.equal(second.enqueue({ id: 'persistent', phone: PHONE, text: 'duplicate', sentAt: Date.now() }), false);
});

test('Meta sender uses configured endpoint, bearer and reply context; upstream errors are redacted', async () => {
  const send = createMetaSender(settings, async (url, options) => {
    assert.equal(url, 'https://graph.facebook.com/v23.0/12345/messages');
    assert.equal(options.headers.authorization, 'Bearer test-access');
    const body = JSON.parse(options.body);
    assert.equal(body.to, PHONE); assert.equal(body.context.message_id, 'inbound'); assert.equal(body.text.body, 'Hei');
    return { ok: true, json: async () => ({ messages: [{ id: 'sent' }] }) };
  });
  assert.equal(await send(PHONE, 'Hei', 'inbound'), 'sent');
  const bad = createMetaSender(settings, async () => ({ ok: false, status: 401 }));
  await assert.rejects(bad(PHONE, 'Hei', 'inbound'), /META_HTTP_401/);
});

test('enabling channel requires explicit configuration', () => {
  assert.throws(() => whatsappSettings({}), /puuttuu/);
  const env = Object.fromEntries(Object.entries({ PHONE_NUMBER_ID: settings.phoneId, ACCESS_TOKEN: settings.accessToken, APP_SECRET: settings.appSecret, VERIFY_TOKEN: settings.verifyToken, SUPPORT_CONTACT: settings.supportContact, API_VERSION: settings.apiVersion }).map(([k, v]) => ['WHATSAPP_' + k, v]));
  assert.equal(whatsappSettings(env).phoneId, settings.phoneId);
  assert.throws(() => whatsappSettings({ ...env, WHATSAPP_API_VERSION: '../bad' }), /virheellinen/);
});
