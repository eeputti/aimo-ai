import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { childEnvironment } from './runner-config.mjs';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export function localRunnerState(directory, instanceId) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, 'instance.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.mkdirSync(lock, { mode: 0o700 }); fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, instanceId }), { mode: 0o600 }); break; }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let owner; try { owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')); } catch { fail('RUNNER_LOCKED'); }
      try { process.kill(owner.pid, 0); fail('RUNNER_LOCKED'); }
      catch (alive) { if (alive.code !== 'ESRCH') throw alive; }
      const old = lock + '.stale-' + crypto.randomUUID();
      try { fs.renameSync(lock, old); fs.rmSync(old, { recursive: true }); } catch { fail('RUNNER_LOCKED'); }
      if (attempt === 1) fail('RUNNER_LOCKED');
    }
  }
  let db;
  try {
    const filename = path.join(directory, 'runs.db'); db = new DatabaseSync(filename); fs.chmodSync(filename, 0o600);
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS runs(task TEXT NOT NULL,revision INTEGER NOT NULL,phase TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(task,revision));');
  } catch (err) { fs.rmSync(lock, { recursive: true }); throw err; }
  return {
    seen: (task, revision) => Boolean(db.prepare('SELECT task FROM runs WHERE task=? AND revision=?').get(task, revision)),
    forget(task, revision) { db.prepare('DELETE FROM runs WHERE task=? AND revision=?').run(task, revision); },
    save(data, phase) { db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?,?)').run(data.taskId, data.expectedRevision, phase, JSON.stringify(data)); },
    pending: () => db.prepare("SELECT data FROM runs WHERE phase<>'finished'").all().map((r) => JSON.parse(r.data)),
    close() { db.close(); try { const owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')); if (owner.instanceId === instanceId) fs.rmSync(lock, { recursive: true }); } catch (err) { if (err.code !== 'ENOENT') throw err; } },
  };
}
export function git(repo, args) {
  const env = childEnvironment(process.env); delete env.OPENAI_API_KEY; delete env.ANTHROPIC_API_KEY;
  try { return execFileSync('git', ['-C', repo, ...args], { env, encoding: 'utf8', timeout: 30000, maxBuffer: 4_000_000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { fail('RUNNER_GIT_FAILED'); }
}
export function prepareWorktree(settings, taskId, runId) {
  if (fs.realpathSync(git(settings.repo, ['rev-parse', '--show-toplevel']).trim()) !== fs.realpathSync(settings.repo)) fail('RUNNER_REPO_NOT_ROOT');
  const branch = `runner/${settings.member}/${taskId.slice(0, 8)}-${runId.slice(0, 8)}`;
  const directory = path.join(settings.state, 'worktrees', runId);
  fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  git(settings.repo, ['worktree', 'add', '-b', branch, directory, 'HEAD']);
  return { directory, branch, base: git(directory, ['rev-parse', 'HEAD']).trim() };
}
export function inspectWorktree(worktree, resources, access) {
  if (git(worktree.directory, ['rev-parse', 'HEAD']).trim() !== worktree.base) fail('RUNNER_HEAD_CHANGED');
  const tracked = git(worktree.directory, ['diff', '--name-only', '--no-renames', '-z', 'HEAD']);
  const extra = git(worktree.directory, ['ls-files', '--others', '--exclude-standard', '-z']);
  const changed = [...new Set((tracked + extra).split('\0').filter(Boolean))];
  if (changed.some((file) => !resources.some((root) => file === root || file.startsWith(root + '/')))) fail('RUNNER_OUT_OF_SCOPE');
  if (access === 'read-only' && changed.length) fail('RUNNER_READ_ONLY_CHANGED');
  return changed;
}
