import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
test('standalone process watches the same database, serves fresh activity and shuts down cleanly', { timeout: 15000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-coordinator-cli-'));
  const db = path.join(dir, 'team.db'); const store = openStore(db);
  const key = store.addMember('eelis-claude', 'Eelis / Claude', ['aimo-ai']);
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('../src/coordinator-main.mjs', import.meta.url))], {
    env: { ...process.env, TEAM_MCP_DB: db, TEAM_COORDINATOR_MODE: 'observe', TEAM_COORDINATOR_PROJECT: 'aimo-ai', TEAM_COORDINATOR_ID: 'team-coordinator', TEAM_COORDINATOR_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { output += chunk; });
  const closed = once(child, 'close');
  t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await closed; store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const until = Date.now() + 7000;
  while (!output.includes('Tilannenäkymä:')) {
    if (child.exitCode !== null || Date.now() > until) assert.fail('Coordinator startup failed: ' + output);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const snapshot = () => fetch(`http://127.0.0.1:${port}/snapshot?project=aimo-ai`, { headers: { authorization: `Bearer ${key}` } }).then((r) => r.json());
  const task = store.claim('eelis-claude', { project: 'aimo-ai', title: 'Ostoskorin tarkistus', resources: ['public/cart.js'] });
  store.progress('eelis-claude', { project: 'aimo-ai', taskId: task.id, expectedRevision: task.revision, note: 'Testaan määrän muuttamista.' });
  store.sendMessage('eelis-claude', { project: 'aimo-ai', recipient: 'team-coordinator', subject: 'Arvio', body: 'Tarkista suunnitelma.', requestKey: 'standalone-coordinator-test' });
  let view;
  do { view = await snapshot(); if (view.jobs.length) break; await new Promise((resolve) => setTimeout(resolve, 50)); } while (Date.now() < until);
  assert.equal(view.jobs[0].status, 'queued'); assert.equal(view.coordinator.online, true); assert.equal(view.coordinator.mode, 'observe');
  assert.equal(view.agents.find((a) => a.id === 'eelis-claude').tasks[0].note, 'Testaan määrän muuttamista.');
  assert.ok(!output.includes(key)); assert.ok(!output.includes('Tarkista suunnitelma.'));
  child.kill('SIGTERM'); const [code] = await closed; assert.equal(code, 0);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/snapshot?project=aimo-ai`));
});
