import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, pushedCommit } from '../src/cli.mjs';
test('two local agents share one database file: claim, conflict, blocker, handoff, accept, done', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-cli-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { TEAM_MCP_DB: path.join(dir, 'team.db') };
  const cli = (...argv) => run(argv, env); // every call opens and closes the store, like separate processes
  cli('join', '--id', 'codex', '--name', 'Codex'); cli('join', '--id', 'claude-code', '--name', 'Claude Code');
  assert.throws(() => cli('status', '--as', 'nobody'), /UNKNOWN_MEMBER|ei ole/);
  assert.match(cli('claim', '--as', 'claude-code', '--title', 'Kytkentä', '--files', 'server/whatsapp,package.json'), /Varattu [0-9a-f]{8}/);
  const id = JSON.parse(cli('status', '--as', 'codex', '--json')).tasks[0].id;
  assert.throws(() => cli('claim', '--as', 'codex', '--title', 'Sama', '--files', 'server/whatsapp/runtime.mjs'), /reserved by claude-code/);
  cli('block', '--as', 'claude-code', '--task', id.slice(0, 8), '--note', 'Tarvitsen restartin', '--on', 'codex');
  assert.match(cli('status', '--as', 'codex'), /ESTEET:\n.*Kytkentä/);
  assert.match(cli('inbox', '--as', 'codex', '--ack'), /Este: Kytkentä[\s\S]*Tarvitsen restartin[\s\S]*Kuitattu/);
  assert.equal(cli('inbox', '--as', 'codex'), 'Ei uusia viestejä.');
  assert.throws(() => cli('handoff', '--as', 'claude-code', '--task', id, '--to', 'codex', '--note', 'x', '--commit', 'ffffffffffffffffffffffffffffffffffffffff'), /ei löydy/);
  assert.match(cli('handoff', '--as', 'claude-code', '--task', id, '--to', 'codex', '--note', 'Valmis, testit 20/20'), /luovutettu: codex, ILMAN commitia/);
  assert.match(cli('status', '--as', 'codex'), /LUOVUTETTU[^\n]*\n.*codex: Kytkentä/);
  assert.match(cli('inbox', '--as', 'codex', '--ack'), /Luovutus: Kytkentä[\s\S]*Valmis, testit 20\/20/);
  assert.match(cli('accept', '--as', 'codex', '--task', id.slice(0, 6)), /on nyt sinulla/);
  assert.match(cli('done', '--as', 'codex', '--task', id, '--note', 'Restart tehty'), /valmis, ei commitia/);
  assert.match(cli('status', '--as', 'claude-code'), /Ei avoimia[\s\S]*Viimeksi valmistuneet/);
  assert.match(cli('board', '--as', 'codex', '--set', 'Tilauspolku käytössä'), /rev 1/);
});
test('a commit may be cited as shared only when a remote branch contains it', () => {
  const fake = (remote) => (args) => (args[0] === 'rev-parse' ? 'a'.repeat(40) : remote);
  assert.deepEqual(pushedCommit(undefined, false, fake('')), {});
  assert.throws(() => pushedCommit('HEAD', false, fake('')), /NOT_PUSHED|ei ole yhdessäkään/);
  assert.equal(pushedCommit('HEAD', true, fake('')).pushed, false);
  assert.equal(pushedCommit('HEAD', false, fake('  origin/HEAD -> origin/main\n  origin/main')).pushed, true);
  assert.throws(() => pushedCommit('nope', false, () => null), /ei löydy/);
});
