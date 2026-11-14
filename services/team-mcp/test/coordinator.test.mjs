import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.mjs';
import { createCoordinator, coordinatorConfig } from '../src/coordinator.mjs';
import { AgentError } from '../src/openai-agent.mjs';

const settings = { ...coordinatorConfig({}), apiKey: 'test-only-key', model: 'test-model' };
const result = { summary: 'Rajapinta odottaa testiä.', reply: 'Tarkista kirjautumisen rajapintatesti ennen luovutusta.' };
function fixture(t, filename = ':memory:') {
  let clock = 1800000000000;
  const store = openStore(filename, () => clock);
  store.addMember('alice', 'Alice', ['aimo-ai']); store.addMember('bob', 'Bob', ['aimo-ai']); store.addMember('outsider', 'Other', ['other']);
  const c = createCoordinator(store, settings, { log() {} });
  t.after(() => store.close());
  const message = (recipient = settings.actor, sender = 'alice', body = 'Mitä rajapinnasta vielä puuttuu?') => store.sendMessage(sender, { project: 'aimo-ai', recipient, subject: 'Rajapinnan tarkistus', body, requestKey: crypto.randomUUID() });
  const ingest = () => store.coordination.ingest(settings);
  const claim = (worker = 'one', maxPerHour = 12) => store.coordination.claim({ ...settings, worker, maxPerHour });
  return { store, c, message, ingest, claim, advance: (ms) => { clock += ms; }, now: () => clock };
}
test('only direct coordinator requests become jobs; observe mode does not call a model', async (t) => {
  const f = fixture(t); let calls = 0;
  const c = createCoordinator(f.store, settings, { log() {}, agent: async () => { calls++; return result; } });
  f.message('bob', 'alice', 'PRIVATE TO BOB'); f.message(undefined); // default argument is coordinator; explicit broadcast below
  f.store.sendMessage('bob', { project: 'aimo-ai', subject: 'Broadcast', body: 'Yhteinen tieto', requestKey: crypto.randomUUID() });
  await c.tick(); await c.tick();
  assert.equal(calls, 0);
  const jobs = f.store.coordination.snapshot('alice', 'aimo-ai').jobs;
  assert.equal(jobs.length, 1); assert.equal(jobs[0].status, 'queued');
  assert.equal(f.store.coordination.snapshot('bob', 'aimo-ai').jobs.length, 0);
  assert.throws(() => f.store.coordination.snapshot('outsider', 'aimo-ai'), /Project not available/);
  assert.ok(!JSON.stringify(f.store.coordination.snapshot('bob', 'aimo-ai')).includes('PRIVATE TO BOB'));
});
test('an API job replies exactly once and generated replies do not trigger new runs', async (t) => {
  const f = fixture(t); let calls = 0;
  const c = createCoordinator(f.store, { ...settings, mode: 'openai' }, { log() {}, agent: async ({ job, context }) => {
    calls++; assert.equal(job.requester, 'alice'); assert.equal(context.project, 'aimo-ai');
    assert.ok(!JSON.stringify(context).includes('OTHER PRIVATE CHAT')); return result;
  } });
  f.message('bob', 'alice', 'OTHER PRIVATE CHAT'); f.message();
  await c.tick(); await c.tick();
  const restarted = createCoordinator(f.store, { ...settings, mode: 'openai' }, { log() {}, agent: async () => { calls++; return result; } });
  await restarted.tick();
  assert.equal(calls, 1);
  const replies = f.store.readMessages('alice', { project: 'aimo-ai' }).messages.filter((m) => m.sender === settings.actor);
  assert.equal(replies.length, 1); assert.match(replies[0].body, /Tarkista kirjautumisen/);
  assert.equal(f.store.coordination.snapshot('alice', 'aimo-ai').jobs[0].status, 'succeeded');
  assert.equal(f.store.coordination.snapshot('bob', 'aimo-ai').jobs.length, 0);
});
test('two SQLite connections fence an expired worker and preserve queued jobs across restart', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-coordinator-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = fixture(t, path.join(dir, 'team.db')); f.message(); f.ingest();
  const second = openStore(path.join(dir, 'team.db'), f.now); t.after(() => second.close());
  const one = f.claim(); assert.ok(one);
  assert.equal(second.coordination.claim({ ...settings, worker: 'two' }), null);
  f.advance(120001);
  const two = second.coordination.claim({ ...settings, worker: 'two' }); assert.ok(two); assert.equal(two.id, one.id); assert.equal(two.attempts, 2);
  assert.throws(() => f.store.coordination.complete(one, 'one', result), { code: 'JOB_LEASE_LOST' });
  second.coordination.complete(two, 'two', result);
  assert.throws(() => second.coordination.complete(two, 'two', result), { code: 'JOB_LEASE_LOST' });
  assert.equal(f.store.readMessages('alice', { project: 'aimo-ai' }).messages.filter((m) => m.sender === settings.actor).length, 1);
  assert.equal(fs.statSync(path.join(dir, 'team.db')).mode & 0o777, 0o600);
});
test('hourly rate budget persists and retries stop after three attempts', async (t) => {
  const f = fixture(t); let calls = 0;
  const c = createCoordinator(f.store, { ...settings, mode: 'openai', maxPerHour: 1 }, { log() {}, agent: async () => { calls++; throw new AgentError('OPENAI_HTTP_429', true); } });
  f.message(); await c.tick();
  assert.equal(calls, 1);
  f.advance(60000); await c.tick(); assert.equal(calls, 1);
  for (let i = 0; i < 2; i++) { f.advance(3600001); await c.tick(); }
  assert.equal(calls, 3);
  let job = f.store.coordination.snapshot('alice', 'aimo-ai').jobs[0]; assert.equal(job.status, 'failed'); assert.equal(job.attempts, 3);
  const notices = f.store.readMessages('alice', { project: 'aimo-ai' }).messages.filter((m) => m.sender === settings.actor);
  assert.equal(notices.length, 1); assert.match(notices[0].body, /OPENAI_HTTP_429/);
  f.advance(3600001); await c.tick(); assert.equal(calls, 3);
});
test('revocation cancels queued jobs and blocks a reply if access disappears during execution', async (t) => {
  const f = fixture(t); f.message(); f.ingest(); f.store.revokeMember('alice');
  assert.equal(f.claim(), null);
  assert.equal(f.store.db.prepare('SELECT status FROM coord_jobs').get().status, 'cancelled');
  f.message(settings.actor, 'bob');
  const c = createCoordinator(f.store, { ...settings, mode: 'openai' }, { log() {}, agent: async () => { f.store.revokeMember('bob'); return result; } });
  await c.tick();
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender=?").get(settings.actor).n, 0);
  assert.equal(f.store.db.prepare("SELECT status FROM coord_jobs WHERE requester='bob'").get().status, 'failed');
  f.store.revokeMember(settings.actor);
  assert.throws(() => createCoordinator(f.store, settings), /Project not available/);
});
test('failed output is private, provider error text is redacted and queue capacity is bounded', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 101; i++) f.message();
  f.ingest();
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM coord_jobs WHERE status='queued'").get().n, 100);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM coord_jobs WHERE error_code='QUEUE_FULL'").get().n, 1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender=? AND body LIKE '%QUEUE_FULL%'").get(settings.actor).n, 1);
  const logs = [];
  const c = createCoordinator(f.store, { ...settings, mode: 'openai' }, { log: (v) => logs.push(v), agent: async () => { throw new Error('SECRET PROVIDER RESPONSE'); } });
  await c.tick();
  assert.ok(!logs.join('').includes('SECRET'));
  assert.ok(!JSON.stringify(f.store.coordination.snapshot('bob', 'aimo-ai')).includes('SECRET'));
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM coord_jobs WHERE error_code='AGENT_FAILED'").get().n, 1);
});
test('coordinator config requires an explicit API mode and credentials, with bounded port/rate settings', () => {
  assert.equal(coordinatorConfig({ OPENAI_API_KEY: 'unused' }).mode, 'observe');
  for (const env of [{ TEAM_COORDINATOR_MODE: 'bad' }, { TEAM_COORDINATOR_MODE: 'openai' }, { TEAM_COORDINATOR_MAX_RUNS_PER_HOUR: '0' }, { TEAM_COORDINATOR_PORT: '0' }, { TEAM_COORDINATOR_ID: '../root' }]) assert.throws(() => coordinatorConfig(env));
  assert.equal(coordinatorConfig({ TEAM_COORDINATOR_MODE: 'openai', OPENAI_API_KEY: 'test', TEAM_COORDINATOR_MODEL: 'test-model' }).mode, 'openai');
});
test('a coordinator cannot impersonate a human member and Retry-After is persisted', (t) => {
  const f = fixture(t);
  assert.throws(() => createCoordinator(f.store, { ...settings, actor: 'alice' }), /existing human member/);
  f.message(); f.ingest(); const job = f.claim();
  f.store.coordination.fail(job, 'one', 'OPENAI_HTTP_429', true, 120000);
  f.advance(119999); assert.equal(f.claim(), null);
  f.advance(1); assert.ok(f.claim());
});
test('three crashed workers leave one terminal failure notice and no fourth API attempt', (t) => {
  const f = fixture(t); f.message(); f.ingest();
  for (let i = 0; i < 3; i++) { assert.equal(f.claim('worker-' + i).attempts, i + 1); f.advance(120001); }
  assert.equal(f.claim('four'), null); assert.equal(f.claim('five'), null);
  const job = f.store.coordination.snapshot('alice', 'aimo-ai').jobs[0];
  assert.equal(job.status, 'failed'); assert.equal(job.attempts, 3);
  const notices = f.store.readMessages('alice', { project: 'aimo-ai' }).messages.filter((m) => m.sender === settings.actor);
  assert.equal(notices.length, 1); assert.match(notices[0].body, /LEASE_EXPIRED/);
});
