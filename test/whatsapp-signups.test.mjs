import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWhatsAppStore } from '../server/whatsapp/store.mjs';
import { createSignupLinker, createSignupApi, chatUrlFor, resolveChatUrl, START_TEXT } from '../scripts/whatsapp-signups.mjs';

const chatUrl = chatUrlFor('+358 40 000 0000');

// The Worker's sign-up list as the WhatsApp machine sees it, with the reports it receives.
function fakeApi(pending, linked = []) {
  const reports = [];
  return { reports, pending, linked,
    async list(status) { assert.ok(['pending', 'linked'].includes(status)); return this[status]; },
    async report(phone, status, url) { reports.push({ phone, status, url }); return { ok: true, updated: 1 }; } };
}

test('a new number becomes its own test customer and waits for Meta approval before WhatsApp opens', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const api = fakeApi([{ phone: '+358401234567', name: 'Tuomari', company: 'Ravintola A' }]);
    const logs = [], notes = [];
    const linker = createSignupLinker({ store, api, chatUrl, log: m => logs.push(m), notify: m => notes.push(m) });
    await linker.tick();
    const member = store.member('358401234567');
    assert.equal(member.person, 'Tuomari');
    assert.equal(member.company, 'Ravintola A');
    assert.deepEqual(api.reports, [{ phone: '358401234567', status: 'linked', url: undefined }]);
    assert.match(logs.join('\n'), /approve --phone \+358401234567/);
    assert.equal(notes.length, 1);

    // A retried or repeated pass never re-pairs the customer and never skips the approval.
    await linker.tick();
    assert.equal(store.member('358401234567').binding, member.binding);
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

    await linker.approve('+358 40 123 4567');
    assert.deepEqual(api.reports.at(-1), { phone: '358401234567', status: 'ready', url: chatUrl });
    await linker.tick();
    assert.equal(api.reports.at(-1).status, 'ready');
    assert.equal(store.member('358401234567').binding, member.binding);
  } finally { store.close(); }
});

test('a number paired earlier keeps its cart and history and is ready at once', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const invitation = store.invite('358409999999', 'Testikeittiö', 'Eelis');
    const { codeHash } = await import('../server/whatsapp/store.mjs');
    const existing = store.pair('358409999999', codeHash(invitation.code));
    const api = fakeApi([{ phone: '+358409999999', name: 'Joku muu', company: 'Toinen yritys' }]);
    await createSignupLinker({ store, api, chatUrl, log: () => {} }).tick();
    const after = store.member('358409999999');
    assert.equal(after.binding, existing.binding);
    assert.equal(after.person, 'Eelis');
    assert.deepEqual(api.reports, [{ phone: '358409999999', status: 'ready', url: chatUrl }]);
  } finally { store.close(); }
});

test('auto-ready mode, invalid numbers, approval of unknown numbers and removal', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const api = fakeApi([{ phone: '+358401111111', name: 'A', company: 'Demokeittiö' }, { phone: '12', name: 'B', company: 'X' }]);
    const linker = createSignupLinker({ store, api, chatUrl, autoReady: true, log: () => {} });
    await linker.tick();
    assert.deepEqual(api.reports.map(r => [r.phone, r.status]), [['358401111111', 'ready'], ['12', 'failed']]);
    await assert.rejects(linker.approve('+358402222222'), /ei ole testiasiakas/);
    await linker.remove('+358401111111');
    assert.equal(store.member('358401111111'), undefined);
    assert.deepEqual(api.reports.at(-1), { phone: '358401111111', status: 'removed', url: undefined });
  } finally { store.close(); }
});

test('a restarted watcher restores the manual Meta queue and announces a repeat registration once', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const signup = { phone: '+358401234567', name: 'Kokeilija', company: 'Demokeittiö', createdAt: 1 };
    const api = fakeApi([signup]);
    const first = createSignupLinker({ store, api, chatUrl, log: () => {} });
    await first.tick();
    const binding = store.member('358401234567').binding;
    api.pending = []; api.linked = [signup];
    const logs = [], notices = [];
    const restarted = createSignupLinker({ store, api, chatUrl, log: m => logs.push(m), notify: m => notices.push(m) });
    await restarted.tick(); await restarted.tick();
    assert.equal(notices.length, 1);
    assert.match(logs[0], /Lomake ei lähetä vahvistuskoodia/);
    assert.equal(store.member('358401234567').binding, binding);
    assert.equal(api.reports.at(-1).status, 'linked');
    api.linked = [{ ...signup, createdAt: 2 }];
    await restarted.tick(); await restarted.tick();
    assert.equal(notices.length, 2);
  } finally { store.close(); }
});

test('an interrupted approval is retried from durable state without approving other waiting numbers', async () => {
  const store = openWhatsAppStore(':memory:');
  try {
    const signup = { phone: '+358401234567', name: 'A', company: 'Demokeittiö', createdAt: 1 };
    const other = { ...signup, phone: '+358401234568', name: 'B' };
    const api = fakeApi([signup, other]);
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
