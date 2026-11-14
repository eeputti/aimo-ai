import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.mjs';
function fixture(t) {
  let time = 1_800_000_000_000;
  const store = openStore(':memory:', () => time); t.after(() => store.close());
  const alice = store.addMember('alice-gpt', 'Alice ChatGPT', ['aimo-ai']);
  const bob = store.addMember('bob-claude', 'Bob Claude', ['aimo-ai']);
  store.addMember('outsider', 'Other team', ['other']);
  return { store, alice, bob, advance: (ms) => { time += ms; } };
}
const project = 'aimo-ai';
test('identities are credential-bound, project-scoped and immediately revocable', (t) => {
  const { store, alice } = fixture(t);
  assert.equal(store.authenticate(alice).id, 'alice-gpt'); assert.equal(store.authenticate('wrong'), null);
  assert.throws(() => store.state('outsider', { project }), /not available/);
  assert.throws(() => store.sendMessage('alice-gpt', { project, recipient: 'outsider', subject: 'x', body: 'x', requestKey: 'request-1' }), /not available/);
  const rotated = store.rotateMember('alice-gpt'); assert.equal(store.authenticate(alice), null); assert.equal(store.authenticate(rotated).id, 'alice-gpt');
  store.revokeMember('alice-gpt'); assert.equal(store.authenticate(rotated), null);
  assert.equal(store.db.prepare('SELECT key_hash FROM members WHERE id=?').get('alice-gpt').key_hash.includes(rotated), false);
});
test('broadcasts and private replies paginate without leaking direct messages to other members', (t) => {
  const { store } = fixture(t);
  store.addMember('carol', 'Carol', [project]);
  const send = (recipient, requestKey, body = 'Message') => store.sendMessage('alice-gpt', { project, recipient, subject: 'Update', body, requestKey });
  const direct = send('bob-claude', 'message-one'); const broadcast = send(undefined, 'message-two');
  const duplicate = send('bob-claude', 'message-one'); assert.equal(duplicate.seq, direct.seq); assert.equal(duplicate.duplicate, true);
  assert.throws(() => send('bob-claude', 'message-one', 'Changed'), /already used/);
  const carol = store.readMessages('carol', { project }); assert.deepEqual(carol.messages.map((m) => m.seq), [broadcast.seq]);
  const first = store.readMessages('bob-claude', { project, limit: 1 }); assert.equal(first.hasMore, true); assert.equal(first.messages[0].seq, direct.seq);
  const second = store.readMessages('bob-claude', { project, after: first.nextCursor }); assert.equal(second.messages[0].seq, broadcast.seq);
  store.ack('bob-claude', { project, through: second.nextCursor }); assert.equal(store.readMessages('bob-claude', { project }).messages.length, 0);
  assert.equal(store.readMessages('alice-gpt', { project }).messages.length, 2);
  assert.throws(() => store.ack('carol', { project, through: direct.seq }), /visible message/);
  assert.equal(store.state('carol', { project }).events.some((e) => JSON.stringify(e).includes('Message')), false);
});
test('task reservation and directory overlaps are atomic; stale revisions cannot overwrite progress', (t) => {
  const { store } = fixture(t);
  const task = store.claim('alice-gpt', { project, title: 'Cart', resources: ['public/cart.js', 'server/ordering'] });
  assert.throws(() => store.claim('bob-claude', { project, title: 'Conflicting', resources: ['server/ordering/checkout.mjs', 'public/new.js'] }), /reserved/);
  assert.equal(store.state('bob-claude', { project }).tasks.length, 1);
  assert.throws(() => store.claim('bob-claude', { project, taskId: task.id }), /owns/);
  assert.throws(() => store.progress('bob-claude', { project, taskId: task.id, expectedRevision: task.revision, note: 'Pretend' }), /owner/);
  const done = store.progress('alice-gpt', { project, taskId: task.id, expectedRevision: task.revision, status: 'done', note: 'Tests pass', commitSha: 'abcdef123' });
  assert.equal(done.status, 'done'); assert.deepEqual(done.resources, []);
  assert.throws(() => store.progress('alice-gpt', { project, taskId: task.id, expectedRevision: task.revision, note: 'Stale' }), /latest task/);
  assert.equal(store.claim('bob-claude', { project, title: 'Next', resources: ['server/ordering/checkout.mjs'] }).owner, 'bob-claude');
});
test('expired leases can be reclaimed; directory reservations remain intended resources after takeover', (t) => {
  const { store, advance } = fixture(t);
  const task = store.claim('alice-gpt', { project, title: 'First', resources: ['server'], leaseMinutes: 1 });
  advance(60_001);
  assert.equal(store.state('alice-gpt', { project }).tasks[0].leaseExpired, true);
  assert.throws(() => store.progress('alice-gpt', { project, taskId: task.id, expectedRevision: task.revision, note: 'Late' }), /again/);
  const taken = store.claim('bob-claude', { project, taskId: task.id });
  assert.deepEqual(taken.requestedResources, ['server']); assert.equal(taken.resources[0].path, 'server');
  assert.throws(() => store.claim('alice-gpt', { project, title: 'Child', resources: ['server/new.mjs'] }), /reserved/);
  store.revokeMember('bob-claude');
  assert.equal(store.claim('alice-gpt', { project, taskId: task.id }).owner, 'alice-gpt');
});
test('invalid paths and competing project summaries fail without side effects', (t) => {
  const { store } = fixture(t);
  for (const file of ['/etc/passwd', '../secret', 'server/../private', 'server\\x', 'server/*', 'C:/private']) assert.throws(() => store.claim('alice-gpt', { project, title: 'Invalid', resources: [file] }), /relative/);
  assert.equal(store.state('alice-gpt', { project }).tasks.length, 0);
  const board = store.updateBoard('alice-gpt', { project, expectedRevision: 0, summary: 'Checkout ready at abcdef123' });
  assert.equal(board.revision, 1);
  assert.throws(() => store.updateBoard('bob-claude', { project, expectedRevision: 0, summary: 'Overwrite' }), /current project/);
  assert.equal(store.state('bob-claude', { project }).board.summary, board.summary);
});
test('restart preserves credentials, messages, acknowledgement and task state', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-mcp-persist-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'team.db'); const first = openStore(file);
  const key = first.addMember('alice', 'Alice', [project]);
  first.sendMessage('alice', { project, subject: 'Saved', body: 'Persistent', requestKey: 'persist-message' });
  first.claim('alice', { project, title: 'Saved task', resources: ['public/cart.js'] }); first.ack('alice', { project, through: 1 }); first.close();
  const next = openStore(file); t.after(() => next.close());
  assert.equal(next.authenticate(key).id, 'alice'); assert.equal(next.state('alice', { project }).tasks.length, 1);
  assert.equal(next.readMessages('alice', { project }).messages.length, 0); assert.equal(next.readMessages('alice', { project, after: 0 }).messages[0].body, 'Persistent');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('expired member keys stop authentication and allow abandoned work to be reclaimed', (t) => {
  const { store, alice, advance } = fixture(t);
  const task = store.claim('alice-gpt', { project, title: 'Lease', resources: ['server'] });
  advance(90 * 86400_000 + 1);
  assert.equal(store.authenticate(alice), null);
  const renewed = store.rotateMember('alice-gpt'); assert.equal(store.authenticate(renewed).id, 'alice-gpt');
  store.revokeMember('alice-gpt');
  const nextKey = store.addMember('new-member', 'New', [project]); assert.ok(nextKey);
  assert.equal(store.claim('new-member', { project, taskId: task.id }).owner, 'new-member');
});

test('blockers reach inboxes once; handoff moves ownership, frees files and holds the task for the recipient', (t) => {
  const { store, advance } = fixture(t); store.addMember('carol', 'Carol', [project]);
  const task = store.claim('alice-gpt', { project, title: 'Wiring', resources: ['server/whatsapp'] });
  const blocked = store.progress('alice-gpt', { project, taskId: task.id, expectedRevision: task.revision, status: 'blocked', note: 'Token missing' });
  assert.equal(store.readMessages('carol', { project }).messages[0].subject, 'Este: Wiring');
  assert.throws(() => store.progress('alice-gpt', { project, taskId: task.id, expectedRevision: blocked.revision, status: 'blocked', note: 'x', blockedOn: 'outsider' }), /not available/);
  assert.throws(() => store.handoff('alice-gpt', { project, taskId: task.id, expectedRevision: blocked.revision, to: 'alice-gpt', note: 'x' }), /another member/);
  assert.throws(() => store.handoff('alice-gpt', { project, taskId: task.id, expectedRevision: blocked.revision, to: 'outsider', note: 'x' }), /not available/);
  assert.throws(() => store.handoff('alice-gpt', { project, taskId: task.id, expectedRevision: task.revision, to: 'bob-claude', note: 'x' }), /latest task/);
  const handed = store.handoff('alice-gpt', { project, taskId: task.id, expectedRevision: blocked.revision, to: 'bob-claude', note: 'Ready for restart', commitSha: 'abcdef123' });
  assert.equal(handed.owner, 'bob-claude'); assert.equal(handed.leaseExpired, false);
  assert.equal(store.readMessages('carol', { project }).messages.length, 1, 'handoff message is private to the recipient');
  assert.equal(store.readMessages('bob-claude', { project }).messages.at(-1).subject, 'Luovutus: Wiring');
  assert.throws(() => store.handoff('bob-claude', { project, taskId: task.id, expectedRevision: handed.revision, to: 'carol', note: 'x' }), /already handed off/);
  assert.throws(() => store.claim('carol', { project, taskId: task.id }), /owns/);
  assert.equal(store.claim('carol', { project, title: 'Freed file', resources: ['server/whatsapp/a.mjs'], leaseMinutes: 1 }).owner, 'carol');
  assert.throws(() => store.claim('bob-claude', { project, taskId: task.id }), /reserved by carol/);
  advance(60_001);
  assert.equal(store.claim('bob-claude', { project, taskId: task.id }).status, 'in_progress');
  // A handoff nobody picks up does not stay locked forever.
  const second = store.claim('alice-gpt', { project, title: 'Orphan' });
  const orphan = store.handoff('alice-gpt', { project, taskId: second.id, expectedRevision: second.revision, to: 'bob-claude', note: 'x' });
  advance(120 * 60_000 + 1);
  assert.equal(store.claim('carol', { project, taskId: orphan.id }).owner, 'carol');
});

test('old open tasks stay visible after more than 100 completed tasks', (t) => {
  const { store, advance } = fixture(t);
  const active = store.claim('alice-gpt', { project, title: 'Still reserved', resources: ['shared'] });
  for (let i = 0; i < 105; i++) {
    advance(1);
    const task = store.claim('bob-claude', { project, title: `Finished ${i}` });
    store.progress('bob-claude', { project, taskId: task.id, expectedRevision: task.revision, status: 'done', note: 'Complete' });
  }
  const tasks = store.state('bob-claude', { project }).tasks;
  assert.equal(tasks.length, 101);
  assert.equal(tasks.find((task) => task.id === active.id).resources[0].path, 'shared');
  assert.equal(tasks.filter((task) => task.status === 'done').length, 100);
});

test('expired handoffs and unavailable owners are visible; expired owners cannot hand work off', (t) => {
  const { store, advance } = fixture(t);
  const task = store.claim('alice-gpt', { project, title: 'Handoff', leaseMinutes: 1 });
  advance(60_000);
  assert.throws(() => store.handoff('alice-gpt', { project, taskId: task.id, expectedRevision: task.revision, to: 'bob-claude', note: 'Late' }), /again/);
  assert.equal(store.state('alice-gpt', { project }).tasks[0].owner, 'alice-gpt');
  const renewed = store.claim('alice-gpt', { project, taskId: task.id });
  const handed = store.handoff('alice-gpt', { project, taskId: task.id, expectedRevision: renewed.revision, to: 'bob-claude', note: 'Ready' });
  assert.equal(handed.ownerAvailable, true);
  advance(120 * 60_000);
  assert.equal(store.state('alice-gpt', { project }).tasks[0].leaseExpired, true);
  store.revokeMember('bob-claude');
  assert.equal(store.state('alice-gpt', { project }).tasks[0].ownerAvailable, false);
});
