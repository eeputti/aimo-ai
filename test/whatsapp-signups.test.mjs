import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openWhatsAppStore, codeHash } from '../server/whatsapp/store.mjs';
import { createSignupLinker, createSignupApi, chatUrlFor, resolveChatUrl, START_TEXT } from '../scripts/whatsapp-signups.mjs';

const chatUrl = chatUrlFor('+358 40 000 0000');

// The Worker's sign-up lists as the WhatsApp machine sees it, with the reports it receives.
// Each browser's link code arrives only as its hash (invites), like the real Worker.
const codeHashOf = code => codeHash(code.replace('-', ''));
function fakeApi(pending, linked = [], inviteRows = []) {
  const reports = [], invited = [];
  return { reports, invited, pending, linked, inviteRows,
    async list(status) { assert.ok(['pending', 'linked'].includes(status)); return this[status]; },
    async invites() { return this.inviteRows.filter(i => !invited.includes(i.id)); },
    async markInvited(ids) { invited.push(...ids); return { ok: true, updated: ids.length }; },
    async report(phone, status, url) { reports.push({ phone, status, url }); return { ok: true, updated: 1 }; } };
}
const invite = (phone, code, name = 'Tuomari', company = 'Ravintola A', id = crypto.randomUUID()) =>
  ({ id, phone, name, company, codeHash: codeHashOf(code), expiresAt: Date.now() + 86400_000, createdAt: Date.now() });
// The landing page's chat link: the agreed first message and the code on its own last line.
const codeMessage = (id, phone, code) => ({ id, phone, sentAt: Date.now(), text: `${START_TEXT}\nYHDISTA ${code}` });

test('a new number gets only an invitation; it becomes a customer when its own code arrives from WhatsApp', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const api = fakeApi([{ phone: '+358401234567', name: 'Tuomari', company: 'Ravintola A' }], [], [invite('+358401234567', 'ABCD-EFGH')]);
    const logs = [], notes = [];
    const linker = createSignupLinker({ store, api, chatUrl, log: m => logs.push(m), notify: m => notes.push(m) });
    await linker.tick();
    // The form alone never makes a member (audit #14).
    assert.equal(store.member('358401234567'), undefined);
    assert.equal(store.db.prepare('SELECT count(*) n FROM landing_invites').get().n, 1);
    assert.deepEqual(api.invited, [api.inviteRows[0].id]);
    assert.deepEqual(api.reports, [{ phone: '358401234567', status: 'linked', url: undefined }]);
    assert.match(logs.join('\n'), /approve --phone \+358401234567/);
    assert.match(logs.join('\n'), /YHDISTA-koodi/);
    assert.equal(notes.length, 1);

    // A repeated pass reports the same state and does not invite twice.
    await linker.tick();
    assert.deepEqual(api.reports.at(-1), { phone: '358401234567', status: 'linked', url: undefined });
    assert.equal(notes.length, 1);

    // The code typed on the landing page reaches the presenter once per new code.
    api.pending = [];
    api.linked = [{ phone: '+358401234567', name: 'Tuomari', company: 'Ravintola A', status: 'linked', code: '123456', codeAt: 1 }];
    await linker.tick(); await linker.tick();
    assert.equal(notes.length, 2);
    assert.match(notes[1], /123456/);
    assert.match(logs.join('\n'), /koodi \+358401234567 \(Tuomari\): 123456/);
    api.linked[0] = { ...api.linked[0], code: '654321', codeAt: 2 };
    await linker.tick();
    assert.equal(notes.length, 3);
    api.linked = [];

    // Approval in Meta opens the chat link, but the number is still not a customer.
    await linker.approve('+358 40 123 4567');
    assert.deepEqual(api.reports.at(-1), { phone: '358401234567', status: 'ready', url: chatUrl });
    assert.equal(store.member('358401234567'), undefined);

    // The first WhatsApp message from that number carries the code: now it is a member, with the name the
    // owner typed, and the Worker hears once that the number is verified.
    assert.equal(store.enqueue(codeMessage('wamid.1', '358401234567', 'abcd efgh')), true);
    const job = store.next();
    assert.equal(job.kind, 'signup');
    assert.equal(job.text, codeHashOf('ABCD-EFGH'));
    const member = store.pair(job.phone, job.text, job.id);
    assert.deepEqual([member.person, member.company], ['Tuomari', 'Ravintola A']);
    assert.equal(store.memberSource(member.binding), 'landing');
    assert.equal(store.db.prepare('SELECT count(*) n FROM landing_invites').get().n, 0);
    await linker.tick();
    assert.deepEqual(api.reports.filter(r => r.status === 'verified'), [{ phone: '358401234567', status: 'verified', url: undefined }]);
    await linker.tick();
    assert.equal(api.reports.filter(r => r.status === 'verified').length, 1);
    assert.equal(store.member('358401234567').binding, member.binding);
  } finally { store.close(); }
});

test("someone else's number cannot be paired: the code works only from the number it was made for", async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    // A stranger signs up the victim's number and sees the code in their own browser.
    const api = fakeApi([{ phone: '+358409990001', name: 'Hyökkääjä', company: 'Väärä Oy' }], [], [invite('+358409990001', 'WXYZ-2345', 'Hyökkääjä', 'Väärä Oy')]);
    const linker = createSignupLinker({ store, api, chatUrl, autoReady: true, log: () => {} });
    await linker.tick();
    assert.equal(store.member('358409990001'), undefined);
    // The stranger sends the code from their own number: nothing pairs.
    store.enqueue(codeMessage('wamid.x', '358409990002', 'WXYZ-2345'));
    const wrong = store.next();
    assert.equal(store.pair(wrong.phone, wrong.text, wrong.id), null);
    assert.equal(store.member('358409990002'), undefined);
    // The victim never received the code; an ordinary message from the victim does not pair either.
    store.enqueue({ id: 'wamid.v', phone: '358409990001', sentAt: Date.now(), text: 'Moi! Opeta mua tilaamaan tämän kautta.' });
    const plain = store.next();
    assert.equal(plain.kind, 'text');
    store.finish(plain.id, 'done');
    assert.equal(store.member('358409990001'), undefined);
    // A wrong or old code from the right number does not pair.
    store.enqueue(codeMessage('wamid.w', '358409990001', 'WXYZ-2346'));
    const guessed = store.next();
    assert.equal(store.pair(guessed.phone, guessed.text, guessed.id), null);
    await linker.tick();
    assert.equal(api.reports.some(r => r.status === 'verified'), false);
  } finally { store.close(); }
});

test('an expired code, several sign-ups of one number and an existing customer', async () => {
  let clock = Date.parse('2026-11-16T10:00:00Z');
  const store = openWhatsAppStore(':memory:', () => clock);
  try {
    // An existing customer keeps its binding: a new sign-up of the number cannot replace it.
    const invitation = store.invite('358409999999', 'Testikeittiö', 'Eelis');
    const existing = store.pair('358409999999', codeHash(invitation.code));
    const api = fakeApi([{ phone: '+358409999999', name: 'Joku muu', company: 'Toinen yritys' }], [], [invite('+358409999999', 'AAAA-BBBB', 'Joku muu')]);
    const linker = createSignupLinker({ store, api, chatUrl, log: () => {}, now: () => clock });
    await linker.tick();
    assert.equal(store.db.prepare('SELECT count(*) n FROM landing_invites').get().n, 0);
    store.enqueue(codeMessage('wamid.e', '358409999999', 'AAAA-BBBB'));
    const job = store.next();
    assert.equal(store.pair(job.phone, job.text, job.id), null);
    store.finish(job.id, 'done');
    assert.equal(store.member('358409999999').binding, existing.binding);
    assert.equal(store.member('358409999999').person, 'Eelis');
    assert.deepEqual(api.reports.map(r => r.status), ['ready', 'verified']);

    // Two browsers signed up the same new number: each code works, and only the one sent decides the name.
    api.pending = [{ phone: '+358401112222', name: 'Eka', company: 'A', signups: 2 }];
    api.inviteRows.push(invite('+358401112222', 'CCCC-DDDD', 'Eka', 'A'), invite('+358401112222', 'EEEE-FFFF', 'Toka', 'B'));
    await linker.tick();
    assert.equal(store.db.prepare("SELECT count(*) n FROM landing_invites WHERE phone='358401112222'").get().n, 2);
    store.enqueue(codeMessage('wamid.t', '358401112222', 'EEEE-FFFF'));
    const second = store.next();
    const paired = store.pair(second.phone, second.text, second.id);
    assert.deepEqual([paired.person, paired.company], ['Toka', 'B']);
    assert.equal(store.db.prepare("SELECT count(*) n FROM landing_invites WHERE phone='358401112222'").get().n, 0);

    // A code expires with its sign-up; prune removes it.
    api.pending = [{ phone: '+358403334444', name: 'Myöhäinen', company: 'C' }];
    api.inviteRows.push({ ...invite('+358403334444', 'GGGG-HHHH', 'Myöhäinen', 'C'), expiresAt: clock + 60_000 });
    await linker.tick();
    clock += 61_000;
    store.enqueue(codeMessage('wamid.l', '358403334444', 'GGGG-HHHH'));
    const late = store.next();
    assert.equal(store.pair(late.phone, late.text, late.id), null);
    store.prune();
    assert.equal(store.db.prepare("SELECT count(*) n FROM landing_invites WHERE phone='358403334444'").get().n, 0);
  } finally { store.close(); }
});

test('auto-ready mode, invalid numbers, approval of unknown numbers and removal', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const api = fakeApi([{ phone: '+358401111111', name: 'A', company: 'Demokeittiö' }, { phone: '12', name: 'B', company: 'X' }], [], [invite('+358401111111', 'JJJJ-KKKK', 'A', 'Demokeittiö')]);
    const linker = createSignupLinker({ store, api, chatUrl, autoReady: true, log: () => {} });
    await linker.tick();
    assert.deepEqual(api.reports.map(r => [r.phone, r.status]), [['358401111111', 'ready'], ['12', 'failed']]);
    assert.equal(store.member('358401111111'), undefined);
    await assert.rejects(linker.approve('+358402222222'), /ei ole ilmoittautunut/);
    await linker.remove('+358401111111');
    assert.equal(store.db.prepare('SELECT count(*) n FROM landing_invites').get().n, 0);
    assert.deepEqual(api.reports.at(-1), { phone: '358401111111', status: 'removed', url: undefined });
  } finally { store.close(); }
});

test('a restarted watcher restores the manual Meta queue and announces a repeat registration once', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const signup = { phone: '+358401234567', name: 'Kokeilija', company: 'Demokeittiö', createdAt: 1 };
    const api = fakeApi([signup], [], [invite(signup.phone, 'MMMM-NNNN', 'Kokeilija', 'Demokeittiö')]);
    const first = createSignupLinker({ store, api, chatUrl, log: () => {} });
    await first.tick();
    api.pending = []; api.linked = [signup];
    const logs = [], notices = [];
    const restarted = createSignupLinker({ store, api, chatUrl, log: m => logs.push(m), notify: m => notices.push(m) });
    await restarted.tick(); await restarted.tick();
    assert.equal(notices.length, 1);
    assert.match(logs[0], /Lomake ei lähetä vahvistuskoodia/);
    assert.equal(store.db.prepare('SELECT count(*) n FROM landing_invites').get().n, 1);
    assert.equal(api.reports.at(-1).status, 'linked');
    api.linked = [{ ...signup, createdAt: 2, signups: 2 }];
    await restarted.tick(); await restarted.tick();
    assert.equal(notices.length, 2);
    assert.match(logs.at(-1), /2 ilmoittautumista eri selaimista/);
  } finally { store.close(); }
});

test('an interrupted approval is retried from durable state without approving other waiting numbers', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const signup = { phone: '+358401234567', name: 'A', company: 'Demokeittiö', createdAt: 1 };
    const other = { ...signup, phone: '+358401234568', name: 'B' };
    const api = fakeApi([signup, other], [], [invite(signup.phone, 'PPPP-QQQQ', 'A'), invite(other.phone, 'RRRR-SSSS', 'B')]);
    const linker = createSignupLinker({ store, api, chatUrl, log: () => {} });
    await linker.tick();
    api.pending = []; api.linked = [signup, other];
    const report = api.report;
    api.report = async () => { throw new Error('network interrupted'); };
    await assert.rejects(linker.approve(signup.phone), /network interrupted/);
    api.report = report;
    const recovered = createSignupLinker({ store, api, chatUrl, log: () => {} });
    assert.deepEqual(await recovered.tick(), [{ phone: '358401234567', status: 'ready' }]);
    assert.deepEqual(api.reports.at(-1), { phone: '358401234567', status: 'ready', url: chatUrl });
    assert.equal(store.db.prepare('SELECT approved_at FROM landing_signups WHERE phone=?').get('358401234568').approved_at, null);
  } finally { store.close(); }
});

test('members linked straight from the form before audit #14 stay, but are reported verified only after Meta approval', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    // The earlier watcher paired the number at once and wrote a three-column landing row.
    store.db.exec('CREATE TABLE landing_signups (phone TEXT PRIMARY KEY, linked_at INTEGER NOT NULL, approved_at INTEGER)');
    const old = store.invite('358405556666', 'Demokeittiö', 'Vanha');
    const member = store.pair('358405556666', codeHash(old.code));
    store.db.prepare('INSERT INTO landing_signups VALUES(?,?,?)').run('358405556666', 1, null);
    const api = fakeApi([], [{ phone: '+358405556666', name: 'Vanha', company: 'Demokeittiö', status: 'linked' }]);
    const linker = createSignupLinker({ store, api, chatUrl, log: () => {} });
    await linker.tick();
    assert.equal(api.reports.some(r => r.status === 'verified'), false);
    assert.equal(store.member('358405556666').binding, member.binding);
    await linker.approve('+358405556666');
    api.linked = [];
    await linker.tick();
    assert.deepEqual(api.reports.map(r => r.status), ['ready', 'verified']);
  } finally { store.close(); }
});

test('a Worker from before audit #14 is noticed and no new number is linked', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const api = fakeApi([{ phone: '+358407778888', name: 'A', company: 'B' }]);
    api.invites = async () => null;
    const logs = [];
    const linker = createSignupLinker({ store, api, chatUrl, log: m => logs.push(m) });
    await linker.tick(); await linker.tick();
    assert.deepEqual(api.reports, []);
    assert.equal(logs.filter(l => /signup-verify\.sql/.test(l)).length, 1);
    const calls = [];
    const real = createSignupApi({ baseUrl: 'https://demo.example', token: 'x'.repeat(40), fetch: async (url) => {
      calls.push(url); return new Response(JSON.stringify({ error: 'Reittiä ei ole.' }), { status: 404 });
    } });
    assert.equal(await real.invites(), null);
    assert.equal(calls[0], 'https://demo.example/api/signups/invites');
  } finally { store.close(); }
});

test('the chat link opens the assistant with the agreed first message, and the API sends the token', async () => {
  assert.equal(chatUrlFor('+358 40 000 0000'), `https://wa.me/358400000000?text=${encodeURIComponent(START_TEXT)}`);
  assert.throws(() => chatUrlFor('abc'), /numeroa/);
  assert.equal(await resolveChatUrl({ WHATSAPP_CHAT_URL: 'https://wa.me/358400000000' }), 'https://wa.me/358400000000');
  await assert.rejects(resolveChatUrl({ WHATSAPP_CHAT_URL: 'https://evil.example/wa' }), /WhatsApp-linkki/);
  const metaCalls = [];
  const fromMeta = await resolveChatUrl({ WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'meta-test' }, async (url, init) => {
    metaCalls.push([url, init.headers.authorization]);
    return new Response(JSON.stringify({ display_phone_number: '+1 555 010 0000' }));
  });
  assert.equal(fromMeta, chatUrlFor('15550100000'));
  assert.match(metaCalls[0][0], /\/123\?fields=display_phone_number$/);

  const calls = [];
  const api = createSignupApi({ baseUrl: 'https://demo.example/', token: 'x'.repeat(40), fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(url.includes('result') ? { ok: true, updated: 2 } : { signups: [] }));
  } });
  assert.deepEqual(await api.list(), []);
  assert.equal((await api.report('358401234567', 'ready', chatUrl)).updated, 2);
  assert.equal(calls[0].url, 'https://demo.example/api/signups?status=pending');
  assert.equal(calls[1].init.headers.authorization, `Bearer ${'x'.repeat(40)}`);
  assert.deepEqual(JSON.parse(calls[1].init.body), { phone: '358401234567', status: 'ready', chatUrl });
  assert.throws(() => createSignupApi({ baseUrl: 'https://demo.example', token: 'short' }), /TOKEN/);
});

test('a self-signed customer gets a small order limit; larger orders wait for a person', async () => {
  const { demoMandate, DEMO_BUYER_LIMITS } = await import('../server/whatsapp/ordering.mjs');
  const base = { approval: 'always', maxOrderNet: null, maxDayNet: null, bannedAllergens: ['AP'] };
  assert.deepEqual(demoMandate('landing', base), { ...base, approval: 'exceptions', maxOrderNet: 300, maxDayNet: 600 });
  assert.deepEqual(demoMandate('admin', base), { ...base, approval: 'exceptions', ...DEMO_BUYER_LIMITS.admin });
  // An unknown source never gets the large limit.
  assert.equal(demoMandate('something', base).maxOrderNet, 300);
  assert.deepEqual(base.bannedAllergens, ['AP']);
});
