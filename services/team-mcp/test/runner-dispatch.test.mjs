import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.mjs';
import { createCoordinator, coordinatorConfig } from '../src/coordinator.mjs';
import { dispatchPolicy } from '../src/dispatch.mjs';
function fixture(t) {
  const store = openStore(':memory:'); for (const id of ['manager', 'one', 'two']) store.addMember(id, id, ['aimo-ai']);
  t.after(() => store.close());
  const dispatch = dispatchPolicy({ TEAM_COORDINATOR_WORKERS: 'one,two', TEAM_COORDINATOR_DISPATCH_SENDERS: 'manager', TEAM_COORDINATOR_DISPATCH_PATHS: 'docs' });
  const config = { ...coordinatorConfig({}), mode: 'openai', dispatch };
  const ask = (subject = '[DELEGATE] Review two files') => store.sendMessage('manager', { project: 'aimo-ai', recipient: config.actor, subject, body: 'Divide review work', requestKey: crypto.randomUUID() });
  const run = (assignments) => createCoordinator(store, config, { log() {}, agent: async () => ({ summary: 'Review plan', reply: 'Suggested review split', assignments }) });
  return { store, config, ask, run };
}
const assignment = (to, file) => ({ to, title: 'Review ' + file, description: 'Explain the source; do not modify it.', resources: [file] });
test('explicit delegation atomically creates and hands off bounded tasks exactly once', async (t) => {
  const f = fixture(t); const coordinator = f.run([assignment('one', 'docs/a.md'), assignment('two', 'docs/b.md')]);
  f.ask(); await coordinator.tick(); await coordinator.tick();
  const state = f.store.state('manager', { project: 'aimo-ai' });
  assert.equal(state.tasks.length, 2); assert.ok(state.tasks.every((task) => task.status === 'handed_off'));
  assert.deepEqual(new Set(state.tasks.map((task) => task.owner)), new Set(['one', 'two']));
  assert.equal(f.store.readMessages('one', { project: 'aimo-ai' }).messages.length, 1);
  assert.match(f.store.readMessages('manager', { project: 'aimo-ai' }).messages.at(-1).body, /Luovutetut tehtävät/);
});
test('a malformed, out-of-scope or overlapping second assignment rolls back the whole plan', async (t) => {
  for (const second of [assignment('two', 'docs/a.md'), assignment('two', 'server/outside.mjs'), assignment('manager', 'docs/b.md'), assignment('two', 'docs/../secret'), assignment('two', '.env')]) {
    const f = fixture(t); const coordinator = f.run([assignment('one', 'docs/a.md'), second]);
    f.ask(); await coordinator.tick();
    assert.equal(f.store.state('manager', { project: 'aimo-ai' }).tasks.length, 0);
    assert.equal(f.store.readMessages('one', { project: 'aimo-ai' }).messages.length, 0);
    assert.equal(f.store.db.prepare('SELECT status FROM coord_jobs').get().status, 'failed');
  }
});
test('ordinary analysis and runner result messages cannot trigger a recursive delegation', async (t) => {
  const f = fixture(t); const coordinator = f.run([assignment('one', 'docs/a.md')]);
  f.ask('Runnerin tulos: review'); await coordinator.tick();
  assert.equal(f.store.state('manager', { project: 'aimo-ai' }).tasks.length, 0);
  assert.equal(f.store.db.prepare('SELECT error_code FROM coord_jobs').get().error_code, 'INVALID_ASSIGNMENT');
});
