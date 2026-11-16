import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleSignup, normalizePhone, normalizeLinkCode, chatUrlWithCode, IP_LIMIT, PHONE_LIMIT, RETENTION_MS } from '../src/signup.ts';
import { createHash } from 'node:crypto';

const origin = 'https://demo.example';
const now = Date.parse('2026-11-15T08:00:00Z');
const SYNC = 'test-only-' + 'k'.repeat(48);
const chat = 'https://wa.me/358400000000?text=Moi';

const sha = (text) => createHash('sha256').update(text).digest('hex');

function setup(schema = fs.readFileSync(new URL('../signup.sql', import.meta.url), 'utf8')) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
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
  const invites = async () => (await (await call('/api/signups/invites', { auth: SYNC, from: null })).json()).invites;
  const markInvited = (ids) => call('/api/signups/invites', { method: 'POST', body: { ids }, auth: SYNC, from: null });
  return { db, call, signUp, report, pending, poll, invites, markInvited };
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
    assert.deepEqual(await s.poll(signup), { id: signup.id, status: 'linked', chatUrl: null, codeSent: false, verified: false, linkCode: signup.linkCode });
    assert.equal((await s.pending()).length, 0);
    assert.equal((await s.pending('linked')).length, 1);

    // An approval is never undone by a later "linked" report.
    await s.report({ phone: '358401234567', status: 'ready', chatUrl: chat });
    await s.report({ phone: '358401234567', status: 'linked' });
    const ready = await s.poll(signup);
    assert.equal(ready.status, 'ready');
    // The chat link carries this browser's link code on its own last line.
    assert.equal(ready.chatUrl, chatUrlWithCode(chat, normalizeLinkCode(signup.linkCode)));
    assert.equal(new URL(ready.chatUrl).searchParams.get('text'), `Moi\nYHDISTA ${signup.linkCode}`);
    assert.doesNotMatch(JSON.stringify(ready), /401234567"/);

    // The same number signing up again in another browser is ready at once, with its own code.
    const again = await (await s.signUp({}, { ip: '198.51.100.2' })).json();
    assert.equal(again.status, 'ready');
    assert.notEqual(again.linkCode, signup.linkCode);
    assert.match(again.chatUrl, new RegExp(`YHDISTA%20${again.linkCode}$`));
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
    assert.deepEqual(sent, { id: signup.id, status: 'linked', chatUrl: null, codeSent: true, verified: false, linkCode: signup.linkCode });
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

test('the presenter call is offered only while a number waits for approval and only from the live setting', async () => {
  const s = setup();
  try {
    // Without the setting there is no call button.
    const plain = await (await s.signUp()).json();
    assert.equal(plain.call, undefined);

    s.db.prepare("INSERT INTO landing_settings(key,value) VALUES('presenter_phone','358501112223')").run();
    const created = await (await s.signUp({ phone: '040 765 4321' }, { ip: '198.51.100.3' })).json();
    assert.deepEqual(created.call, { tel: '+358501112223', display: '+358 50 111 2223' });
    assert.deepEqual((await s.poll(created)).call, { tel: '+358501112223', display: '+358 50 111 2223' });

    await s.report({ phone: '+358407654321', status: 'linked' });
    assert.equal((await s.poll(created)).call.tel, '+358501112223');
    const coded = await (await s.call(`/api/signups/${created.id}/code`, { method: 'POST', body: { code: '12345' }, auth: created.token })).json();
    assert.equal(coded.call.tel, '+358501112223');

    // Once WhatsApp is ready the number is no longer needed, and a broken value hides the button.
    await s.report({ phone: '+358407654321', status: 'ready', chatUrl: chat });
    assert.equal((await s.poll(created)).call, undefined);
    s.db.prepare("UPDATE landing_settings SET value='soita' WHERE key='presenter_phone'").run();
    assert.equal((await s.poll(plain)).call, undefined);
  } finally { s.db.close(); }
});

test('a sign-up gets a one-time link code; the WhatsApp machine sees only its hash, once', async () => {
  const s = setup();
  try {
    const signup = await (await s.signUp()).json();
    assert.match(signup.linkCode, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    assert.equal(normalizeLinkCode(signup.linkCode.toLowerCase().replace('-', ' ')), signup.linkCode.replace('-', ''));
    for (const bad of ['ABCD-EFG', 'ABCD-EFGI', 'ABCD-EFG0', '', null]) assert.equal(normalizeLinkCode(bad), null);

    // Only the publisher token lists invitations, and the list has the hash, never the code itself.
    assert.equal((await s.call('/api/signups/invites', { auth: signup.token })).status, 401);
    const [invite] = await s.invites();
    assert.deepEqual(Object.keys(invite).sort(), ['codeHash', 'company', 'createdAt', 'expiresAt', 'id', 'name', 'phone']);
    assert.equal(invite.id, signup.id);
    assert.equal(invite.phone, '+358401234567');
    assert.equal(invite.codeHash, sha(signup.linkCode.replace('-', '')));
    assert.doesNotMatch(JSON.stringify(await s.invites()), new RegExp(signup.linkCode.replace('-', '')));
    assert.doesNotMatch(JSON.stringify(await s.pending()), new RegExp(signup.linkCode.replace('-', '')));
    assert.equal(invite.expiresAt, now + RETENTION_MS);

    // Acknowledged invitations leave the list; malformed acknowledgements are refused.
    assert.equal((await s.markInvited(['not-a-uuid'])).status, 400);
    assert.equal((await s.markInvited([])).status, 400);
    assert.equal((await (await s.markInvited([signup.id])).json()).updated, 1);
    assert.deepEqual(await s.invites(), []);

    // An expired code is not invited any more.
    await s.signUp({ phone: '+358405550000' });
    const late = await s.call('/api/signups/invites', { auth: SYNC, from: null, at: now + RETENTION_MS + 1 });
    assert.deepEqual((await late.json()).invites, []);
  } finally { s.db.close(); }
});

test('the number is verified only by the WhatsApp machine; then the code is gone and a new sign-up needs none', async () => {
  const s = setup();
  try {
    const signup = await (await s.signUp()).json();
    await s.report({ phone: '+358401234567', status: 'ready', chatUrl: chat });
    assert.match((await s.poll(signup)).chatUrl, /YHDISTA/);
    assert.equal((await (await s.report({ phone: '358401234567', status: 'verified' })).json()).updated, 1);
    const verified = await s.poll(signup);
    assert.deepEqual([verified.status, verified.verified, verified.linkCode, verified.chatUrl], ['ready', true, null, chat]);
    assert.equal(s.db.prepare('SELECT count(*) n FROM signups WHERE link_code IS NOT NULL OR link_hash IS NOT NULL').get().n, 0);
    // Reporting again changes nothing, and the list shows the number as verified.
    assert.equal((await (await s.report({ phone: '358401234567', status: 'verified' })).json()).updated, 0);
    assert.equal((await s.pending('ready'))[0].verified, true);
    const again = await (await s.signUp({}, { ip: '198.51.100.7' })).json();
    assert.deepEqual([again.status, again.verified, again.linkCode, again.chatUrl], ['ready', true, null, chat]);
    assert.deepEqual(await s.invites(), []);
  } finally { s.db.close(); }
});

test('parallel sign-ups cannot pass the address, number or waiting limits together', async () => {
  const s = setup();
  try {
    // Ten requests at once from one address: the count is taken in the same statement as the insert.
    const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => s.signUp({ phone: `+3584033300${String(i).padStart(2, '0')}` })));
    assert.equal(burst.filter(r => r.status === 201).length, IP_LIMIT);
    assert.equal(burst.filter(r => r.status === 429).length, 10 - IP_LIMIT);
    assert.equal(s.db.prepare('SELECT count(*) n FROM signups').get().n, IP_LIMIT);

    // One number from many addresses: a stranger cannot flood someone else's number.
    const victim = await Promise.all(Array.from({ length: 6 }, (_, i) => s.signUp({ phone: '+358407770000' }, { ip: `203.0.113.${i + 1}` })));
    assert.equal(victim.filter(r => r.status === 201).length, PHONE_LIMIT);
    assert.equal((await s.signUp({ phone: '+358407770000' }, { ip: '203.0.113.50', at: now + 3600_001 })).status, 201);
  } finally { s.db.close(); }
});

test('the presenter list keeps the first name of a number, shows repeats and lists the newest first', async () => {
  const s = setup();
  try {
    await s.signUp({ phone: '+358401110001', name: 'Oikea Omistaja', company: 'Ravintola A' });
    await s.signUp({ phone: '+358401110001', name: 'Joku Muu', company: 'Väärä Oy' }, { ip: '198.51.100.2', at: now + 1000 });
    await s.signUp({ phone: '+358401110002', name: 'Uusin' }, { ip: '198.51.100.3', at: now + 2000 });
    const rows = await s.pending();
    assert.deepEqual(rows.map(r => [r.phone, r.name, r.company, r.signups]), [
      ['+358401110002', 'Uusin', 'Demokeittiö', 1],
      ['+358401110001', 'Oikea Omistaja', 'Ravintola A', 2],
    ]);
    // Each browser still has its own invitation, with the name it typed.
    assert.deepEqual((await s.invites()).filter(i => i.phone === '+358401110001').map(i => i.name), ['Oikea Omistaja', 'Joku Muu']);

    // Two browsers typed a Meta code for the same number: the presenter sees that there are two.
    const signups = s.db.prepare("SELECT id FROM signups WHERE phone='358401110001' ORDER BY created_at").all();
    await s.report({ phone: '+358401110001', status: 'linked' });
    s.db.prepare("UPDATE signups SET meta_code=?, code_at=? WHERE id=?").run('11111', now + 3000, signups[0].id);
    s.db.prepare("UPDATE signups SET meta_code=?, code_at=? WHERE id=?").run('22222', now + 4000, signups[1].id);
    const [linked] = await s.pending('linked');
    assert.deepEqual([linked.name, linked.code, linked.codeSignups], ['Oikea Omistaja', '22222', 2]);
  } finally { s.db.close(); }
});

test('the migration adds the link code columns to the earlier live table without losing rows', async () => {
  // The signups table as it was created on the live database before audit #14.
  const before = `CREATE TABLE signups (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, phone TEXT NOT NULL, name TEXT NOT NULL, company TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'linked', 'ready', 'failed')), chat_url TEXT, meta_code TEXT, code_at INTEGER,
    code_attempts INTEGER NOT NULL DEFAULT 0, ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE landing_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO signups VALUES('00000000-0000-4000-8000-000000000001','x','358409990000','Vanha','Demokeittiö','linked',NULL,NULL,NULL,0,'ip',${now},${now});`;
  const s = setup(before + fs.readFileSync(new URL('../signup-verify.sql', import.meta.url), 'utf8'));
  try {
    // The old row keeps its state and has no code to invite; new sign-ups work as on a fresh table.
    assert.deepEqual((await s.pending('linked')).map(r => [r.phone, r.name]), [['+358409990000', 'Vanha']]);
    assert.deepEqual(await s.invites(), []);
    const signup = await (await s.signUp()).json();
    assert.equal((await s.invites())[0].id, signup.id);
    assert.throws(() => s.db.exec(fs.readFileSync(new URL('../signup-verify.sql', import.meta.url), 'utf8')), /duplicate column/);
  } finally { s.db.close(); }
});
