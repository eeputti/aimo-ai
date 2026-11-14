import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleSignup, normalizePhone, IP_LIMIT, RETENTION_MS } from '../src/signup.ts';

const origin = 'https://demo.example';
const now = Date.parse('2026-11-15T08:00:00Z');
const SYNC = 'test-only-' + 'k'.repeat(48);
const chat = 'https://wa.me/358400000000?text=Moi';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../signup.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { let values = []; return { bind(...args) { values = args; return this; },
    async first() { return db.prepare(sql).get(...values) || null; },
    async all() { return { results: db.prepare(sql).all(...values) }; },
    async run() { await null; return { meta: { changes: db.prepare(sql).run(...values).changes } }; } }; } };
  const env = { DB, SYNC_TOKEN: SYNC };
  const call = (path, { method = 'GET', body, auth, ip = '198.51.100.1', from = origin, at = now } = {}) => handleSignup(new Request(origin + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(from ? { origin: from } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : {}), 'cf-connecting-ip': ip },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, at);
  const signUp = (fields = {}, options = {}) => call('/api/signups', { method: 'POST', body: { phone: '+358 40 123 4567', name: 'Tuomari', consent: true, ...fields }, ...options });
  const report = (body) => call('/api/signups/result', { method: 'POST', body, auth: SYNC, from: null });
  const pending = async (status = 'pending') => (await (await call(`/api/signups?status=${status}`, { auth: SYNC, from: null })).json()).signups;
  const poll = async (signup) => (await call(`/api/signups/${signup.id}`, { auth: signup.token })).json();
  return { db, call, signUp, report, pending, poll };
}

test('phone numbers are normalised to international digits', () => {
  assert.equal(normalizePhone('+358 40 123 4567'), '358401234567');
  assert.equal(normalizePhone('040-123 4567'), '358401234567');
  assert.equal(normalizePhone('00358401234567'), '358401234567');
  assert.equal(normalizePhone('+46 70 123 45 67'), '46701234567');
  for (const bad of ['', '123', '+0401234567', 'puhelin', '+3584012345678901234']) assert.equal(normalizePhone(bad), null);
});

test('a sign-up waits for the WhatsApp machine, then needs approval, then opens WhatsApp', async () => {
  const s = setup();
  try {
    const created = await s.signUp({ company: 'Ravintola <b>A</b>' });
    assert.equal(created.status, 201);
    const signup = await created.json();
    assert.equal(signup.status, 'pending');
    assert.match(signup.token, /^[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(JSON.stringify(signup), /358401234567/);
    assert.deepEqual((await s.pending()).map(r => [r.phone, r.name, r.company]), [['+358401234567', 'Tuomari', 'Ravintola b A /b']]);

    assert.equal((await (await s.report({ phone: '+358401234567', status: 'linked' })).json()).updated, 1);
    assert.deepEqual(await s.poll(signup), { id: signup.id, status: 'linked', chatUrl: null, codeSent: false });
    assert.equal((await s.pending()).length, 0);
    assert.equal((await s.pending('linked')).length, 1);

    // An approval is never undone by a later "linked" report.
    await s.report({ phone: '358401234567', status: 'ready', chatUrl: chat });
    await s.report({ phone: '358401234567', status: 'linked' });
    const ready = await s.poll(signup);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.chatUrl, chat);
    assert.doesNotMatch(JSON.stringify(ready), /401234567"/);

    // The same number signing up again in another browser is ready at once.
    const again = await (await s.signUp({}, { ip: '198.51.100.2' })).json();
    assert.equal(again.status, 'ready');
    assert.equal(again.chatUrl, chat);
  } finally { s.db.close(); }
});

test('the status of a sign-up needs its own token and never exposes the number', async () => {
  const s = setup();
  try {
    const signup = await (await s.signUp()).json();
    const other = await (await s.signUp({ phone: '0401111111' })).json();
    for (const wrong of [other.token, 'x'.repeat(43), undefined]) {
      const response = await s.call(`/api/signups/${signup.id}`, { auth: wrong });
      assert.equal(response.status, 404);
    }
    assert.equal((await s.call('/api/signups/00000000-0000-4000-8000-000000000000', { auth: signup.token })).status, 404);
    // The publisher routes need the publisher token.
    assert.equal((await s.call('/api/signups')).status, 401);
    assert.equal((await s.call('/api/signups', { auth: signup.token })).status, 401);
    assert.equal((await s.call('/api/signups/result', { method: 'POST', body: { phone: '+358401234567', status: 'ready', chatUrl: chat }, auth: signup.token })).status, 401);
  } finally { s.db.close(); }
});

test('invalid forms, foreign origins, unsafe chat links and floods are refused', async () => {
  const s = setup();
  try {
    assert.equal((await s.signUp({ phone: '123' })).status, 400);
    assert.equal((await (await s.signUp({ phone: '123' })).json()).field, 'phone');
    assert.equal((await (await s.signUp({ name: ' ' })).json()).field, 'name');
    assert.equal((await (await s.signUp({ consent: 'yes' })).json()).field, 'consent');
    assert.equal((await (await s.signUp({ company: 'x'.repeat(81) })).json()).field, 'company');
    assert.equal((await s.signUp({}, { from: 'https://evil.example' })).status, 403);
    assert.equal((await s.signUp({}, { from: null })).status, 403);
    const big = await s.call('/api/signups', { method: 'POST', body: { phone: '+358401234567', name: 'x'.repeat(3000), consent: true } });
    assert.equal(big.status, 400);
    assert.equal(s.db.prepare('SELECT count(*) n FROM signups').get().n, 0);

    await s.signUp();
    for (const bad of ['http://wa.me/358', 'https://evil.example/wa.me', 'javascript:alert(1)', undefined]) {
      assert.equal((await s.report({ phone: '+358401234567', status: 'ready', chatUrl: bad })).status, 400);
    }
    assert.equal((await s.report({ phone: '+358401234567', status: 'paid' })).status, 400);

    for (let i = 1; i < IP_LIMIT; i++) assert.equal((await s.signUp({ phone: `+35840222000${i}` })).status, 201);
    assert.equal((await s.signUp({ phone: '+358402229999' })).status, 429);
    assert.equal((await s.signUp({ phone: '+358402229999' }, { ip: '198.51.100.9' })).status, 201);
    assert.equal((await s.signUp({ phone: '+358402229999' }, { ip: '198.51.100.9', at: now + 3600_001 })).status, 201);
  } finally { s.db.close(); }
});

test('a removed number leaves no rows, and old sign-ups are deleted', async () => {
  const s = setup();
  try {
    const signup = await (await s.signUp()).json();
    assert.equal((await (await s.report({ phone: '+358401234567', status: 'removed' })).json()).updated, 1);
    assert.equal((await s.poll(signup)).error, 'Ilmoittautumista ei löytynyt.');
    await s.signUp({ phone: '+358403333333' });
    await s.signUp({ phone: '+358404444444' }, { at: now + RETENTION_MS + 1 });
    assert.deepEqual(s.db.prepare('SELECT phone FROM signups').all().map(r => r.phone), ['358404444444']);
    assert.equal(await handleSignup(new Request(origin + '/api/orders'), { DB: null, SYNC_TOKEN: SYNC }), null);
  } finally { s.db.close(); }
});

test("Meta's code typed on the page reaches only the presenter's machine and is cleared on approval", async () => {
  const s = setup();
  try {
    const signup = await (await s.signUp()).json();
    const sendCode = (code, options = {}) => s.call(`/api/signups/${signup.id}/code`, { method: 'POST', body: { code }, auth: signup.token, ...options });
    assert.equal((await sendCode('123456')).status, 409); // not linked yet
    await s.report({ phone: '+358401234567', status: 'linked' });
    assert.equal((await sendCode('12')).status, 400);
    assert.equal((await sendCode('123456', { from: 'https://evil.example' })).status, 403);
    assert.equal((await sendCode('123456', { auth: 'y'.repeat(43) })).status, 404);
    const sent = await (await sendCode('123 456')).json();
    assert.deepEqual(sent, { id: signup.id, status: 'linked', chatUrl: null, codeSent: true });
    assert.equal((await s.poll(signup)).codeSent, true);
    const [linked] = await s.pending('linked');
    assert.equal(linked.code, '123456');
    assert.equal(typeof linked.codeAt, 'number');
    // The code is never in the browser's own status or the pending list.
    assert.doesNotMatch(JSON.stringify(await s.poll(signup)), /123456/);
    for (let i = 0; i < 4; i++) assert.equal((await sendCode('654321')).status, 200);
    assert.equal((await sendCode('111111')).status, 429);
    await s.report({ phone: '+358401234567', status: 'ready', chatUrl: chat });
    assert.equal(s.db.prepare('SELECT count(*) n FROM signups WHERE meta_code IS NOT NULL').get().n, 0);
    assert.equal((await sendCode('123456')).status, 409);
  } finally { s.db.close(); }
});
