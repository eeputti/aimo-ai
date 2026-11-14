import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.mjs';
import { createLocalRunner } from '../src/runner.mjs';
import { localRunnerState, git, prepareWorktree, inspectWorktree } from '../src/runner-local.mjs';

function fixture(t, filename = ':memory:') {
  let clock = Date.now(); const store = openStore(filename, () => clock);
  for (const id of ['manager', 'worker', 'other']) store.addMember(id, id, ['aimo-ai']);
  t.after(() => store.close());
  function handoff(resources = ['docs/one.md']) {
    const task = store.claim('manager', { project: 'aimo-ai', title: 'Review docs', description: 'Explain the design', resources });
    return store.handoff('manager', { project: 'aimo-ai', taskId: task.id, expectedRevision: task.revision, to: 'worker', note: 'Review only' });
  }
  const args = (task) => ({ project: 'aimo-ai', taskId: task.id, expectedRevision: task.revision, instanceId: crypto.randomUUID(), claimKey: crypto.randomBytes(32).toString('base64url'), allowedSenders: ['manager'], allowedPaths: ['docs'] });
  return { store, handoff, args, now: () => clock, advance: (ms) => { clock += ms; } };
}
test('runner claim is atomic across SQLite connections, retryable and cannot be overridden by ordinary task tools', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-runner-db-'));
  const f = fixture(t, path.join(dir, 'team.db')); const b = openStore(path.join(dir, 'team.db'), f.now); t.after(() => b.close());
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const task = f.handoff(); const args = f.args(task); const run = f.store.runner.claim('worker', args);
  assert.equal(f.store.runner.claim('worker', args).runId, run.runId);
  assert.throws(() => b.runner.claim('worker', { ...args, instanceId: crypto.randomUUID(), claimKey: crypto.randomBytes(32).toString('base64url') }));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM runner_runs').get().n, 1);
  assert.throws(() => f.store.claim('worker', { project: 'aimo-ai', taskId: task.id }), { code: 'RUNNER_ACTIVE' });
  assert.throws(() => f.store.progress('worker', { project: 'aimo-ai', taskId: task.id, expectedRevision: run.task.revision, note: 'pretend done' }), { code: 'RUNNER_ACTIVE' });
  assert.throws(() => f.store.handoff('worker', { project: 'aimo-ai', taskId: task.id, expectedRevision: run.task.revision, to: 'manager', note: 'pretend handoff' }), { code: 'RUNNER_ACTIVE' });
  assert.equal(f.store.state('manager', { project: 'aimo-ai' }).tasks[0].resources.length, 1);
});
test('runner token binds member, instance and lifetime; completion returns work for review exactly once', (t) => {
  const f = fixture(t); const task = f.handoff(); const args = f.args(task); const run = f.store.runner.claim('worker', args);
  const identity = { project: 'aimo-ai', runId: run.runId, instanceId: args.instanceId, leaseToken: run.leaseToken };
  assert.throws(() => f.store.runner.heartbeat('other', identity), { code: 'RUN_NOT_FOUND' });
  assert.throws(() => f.store.runner.heartbeat('worker', { ...identity, instanceId: crypto.randomUUID() }), { code: 'RUN_NOT_FOUND' });
  assert.throws(() => f.store.runner.heartbeat('worker', { ...identity, leaseToken: 'x'.repeat(43) }), { code: 'RUN_NOT_FOUND' });
  f.advance(30000); assert.ok(f.store.runner.heartbeat('worker', identity).leaseUntil > run.leaseUntil);
  const completion = { ...identity, outcome: 'completed', note: 'Read the file; no code changes.' };
  const receipt = f.store.runner.finish('worker', completion); assert.equal(receipt.owner, 'manager'); assert.equal(receipt.status, 'handed_off');
  f.store.claim('manager', { project: 'aimo-ai', taskId: task.id });
  assert.deepEqual(f.store.runner.finish('worker', completion), receipt);
  assert.throws(() => f.store.runner.finish('worker', { ...completion, note: 'different' }), { code: 'FINISH_CONFLICT' });
  assert.equal(f.store.readMessages('manager', { project: 'aimo-ai' }).messages.filter((m) => m.sender === 'worker').length, 1);
  assert.equal(f.store.state('manager', { project: 'aimo-ai' }).tasks[0].status, 'in_progress');
  assert.ok(!JSON.stringify(f.store.state('manager', { project: 'aimo-ai' })).includes(run.leaseToken));
});
test('expired runs require interruption or explicit human reclamation; sender and path restrictions are enforced', (t) => {
  const f = fixture(t); const task = f.handoff(); const args = f.args(task);
  assert.throws(() => f.store.runner.claim('worker', { ...args, allowedSenders: ['other'] }), { code: 'SENDER_NOT_ALLOWED' });
  assert.throws(() => f.store.runner.claim('worker', { ...args, allowedPaths: ['docs2'] }), { code: 'PATH_NOT_ALLOWED' });
  const run = f.store.runner.claim('worker', args); const identity = { project: 'aimo-ai', runId: run.runId, instanceId: args.instanceId, leaseToken: run.leaseToken };
  f.advance(120001);
  assert.throws(() => f.store.runner.heartbeat('worker', identity), { code: 'RUN_LEASE_LOST' });
  assert.throws(() => f.store.runner.finish('worker', { ...identity, outcome: 'completed', note: 'late' }), { code: 'RUN_LEASE_LOST' });
  assert.equal(f.store.runner.finish('worker', { ...identity, outcome: 'interrupted', note: 'Lost connection; check saved worktree.' }).owner, 'manager');
});
test('local recovery closes an interrupted attempt without executing it twice', async (t) => {
  const f = fixture(t); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-runner-journal-'));
  const instance = crypto.randomUUID(); let journal = localRunnerState(dir, instance); const task = f.handoff(); const args = f.args(task);
  const claimed = f.store.runner.claim('worker', args);
  journal.save({ taskId: task.id, expectedRevision: task.revision, instanceId: args.instanceId, claimKey: args.claimKey, claim: claimed }, 'running'); journal.close();
  journal = localRunnerState(dir, crypto.randomUUID()); t.after(() => { journal.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  let executions = 0;
  const remote = { call: async (name, body) => name === 'get_project_state' ? f.store.state('worker', body) : f.store.runner[name.replace('runner_', '').replace('_task', '')]('worker', body) };
  const runner = createLocalRunner({ project: 'aimo-ai', member: 'worker', paths: ['docs'], senders: ['manager'], key: 'private-key', pollMs: 2000 }, remote, journal, { execute: async () => { executions++; return 'NO'; }, log() {} });
  await runner.tick(); await runner.tick(); assert.equal(executions, 0); assert.equal(journal.pending().length, 0);
  assert.equal(f.store.state('manager', { project: 'aimo-ai' }).tasks[0].owner, 'manager');
});
test('a lost claim response is reconciled from its durable nonce without starting a CLI', async (t) => {
  const f = fixture(t); const task = f.handoff(); const args = f.args(task);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-runner-lost-claim-'));
  const journal = localRunnerState(dir, crypto.randomUUID()); t.after(() => { journal.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  f.store.runner.claim('worker', args); // Server committed, HTTP response never reached the caller.
  journal.save({ taskId: task.id, expectedRevision: task.revision, instanceId: args.instanceId, claimKey: args.claimKey }, 'claiming');
  let executions = 0;
  const remote = { call: async (name, body) => name === 'get_project_state' ? f.store.state('worker', body) : f.store.runner[name.replace('runner_', '').replace('_task', '')]('worker', body) };
  const runner = createLocalRunner({ project: 'aimo-ai', member: 'worker', paths: ['docs'], senders: ['manager'], key: 'private-key' }, remote, journal, { execute: async () => { executions++; }, log() {} });
  await runner.tick(); await runner.tick();
  assert.equal(executions, 0); assert.equal(journal.pending().length, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM runner_runs').get().n, 1);
  assert.equal(f.store.readMessages('manager', { project: 'aimo-ai' }).messages.filter((m) => m.sender === 'worker').length, 1);
});
test('revoking a worker fences its heartbeat and completion and permits explicit human recovery', (t) => {
  const f = fixture(t); const task = f.handoff(); const args = f.args(task); const run = f.store.runner.claim('worker', args);
  const identity = { project: 'aimo-ai', runId: run.runId, instanceId: args.instanceId, leaseToken: run.leaseToken };
  f.store.revokeMember('worker');
  assert.throws(() => f.store.runner.heartbeat('worker', identity));
  assert.throws(() => f.store.runner.finish('worker', { ...identity, outcome: 'completed', note: 'late' }));
  assert.equal(f.store.claim('manager', { project: 'aimo-ai', taskId: task.id }).owner, 'manager');
});
test('isolated Git worktrees preserve the main tree and detect task-scope violations', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-runner-git-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init']); git(dir, ['config', 'user.email', 'test@example.invalid']); git(dir, ['config', 'user.name', 'Test']);
  fs.mkdirSync(path.join(dir, 'docs')); fs.writeFileSync(path.join(dir, 'docs/a.md'), 'original'); git(dir, ['add', '.']); git(dir, ['commit', '-m', 'fixture']);
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-runner-state-')); t.after(() => fs.rmSync(state, { recursive: true, force: true }));
  const work = prepareWorktree({ repo: dir, state, member: 'worker' }, crypto.randomUUID(), crypto.randomUUID());
  fs.writeFileSync(path.join(work.directory, 'docs/a.md'), 'changed');
  assert.deepEqual(inspectWorktree(work, ['docs'], 'workspace-write'), ['docs/a.md']);
  assert.equal(fs.readFileSync(path.join(dir, 'docs/a.md'), 'utf8'), 'original');
  assert.throws(() => inspectWorktree(work, ['docs'], 'read-only'), { code: 'RUNNER_READ_ONLY_CHANGED' });
  fs.writeFileSync(path.join(work.directory, 'outside.md'), 'bad');
  assert.throws(() => inspectWorktree(work, ['docs'], 'workspace-write'), { code: 'RUNNER_OUT_OF_SCOPE' });
});
