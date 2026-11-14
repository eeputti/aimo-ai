import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli, resolveCli, cliArguments } from '../src/runner-process.mjs';
import { childEnvironment, runnerConfig } from '../src/runner-config.mjs';
import { localRunnerState } from '../src/runner-local.mjs';

function script(t, code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-fake-cli-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'fake cli.mjs'); fs.writeFileSync(filename, code);
  return { dir, resolved: { executable: process.execPath, prefix: [filename] } };
}
const settings = { provider: 'codex', access: 'read-only', timeoutMs: 1000 };
test('CLI process receives task data on stdin, not shell arguments, and does not inherit runner credentials', async (t) => {
  const fixture = script(t, `let input='';for await(const c of process.stdin) input+=c;console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({input,args:process.argv.slice(2),key:process.env.TEAM_RUNNER_KEY||null,other:process.env.UNRELATED_SECRET||null})}}));`);
  const prompt = 'Task: $(touch should-never-exist); & echo injected';
  const output = await runCli(settings, { cwd: fixture.dir, prompt, resolved: fixture.resolved, env: { ...process.env, TEAM_RUNNER_KEY: 'private-mcp-key', UNRELATED_SECRET: 'private' } });
  const value = JSON.parse(output); assert.equal(value.input, prompt); assert.equal(value.key, null); assert.equal(value.other, null);
  assert.ok(!value.args.includes(prompt)); assert.ok(!fs.existsSync(path.join(fixture.dir, 'should-never-exist')));
  assert.ok(!cliArguments(settings).some((v) => v.includes('dangerously')));
  assert.equal(childEnvironment({ TEAM_RUNNER_KEY: 'secret', OPENAI_API_KEY: 'api', ANTHROPIC_API_KEY: 'other' }, 'codex').OPENAI_API_KEY, 'api');
  assert.equal(childEnvironment({ ANTHROPIC_API_KEY: 'other', OPENAI_API_KEY: 'api' }, 'claude').OPENAI_API_KEY, undefined);
});
test('CLI timeout, external cancellation, oversized output and nonzero exit are bounded failures', async (t) => {
  const sleeping = script(t, 'setInterval(()=>{},1000);');
  await assert.rejects(runCli({ ...settings, timeoutMs: 80 }, { cwd: sleeping.dir, prompt: 'x', resolved: sleeping.resolved }), { code: 'CLI_TIMEOUT' });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 50);
  await assert.rejects(runCli(settings, { cwd: sleeping.dir, prompt: 'x', resolved: sleeping.resolved, signal: controller.signal }), { code: 'CLI_ABORTED' }); clearTimeout(timer);
  const large = script(t, 'process.stdout.write("x".repeat(2500000),()=>process.exit(0));');
  await assert.rejects(runCli({ ...settings, timeoutMs: 5000 }, { cwd: large.dir, prompt: 'x', resolved: large.resolved }), { code: 'CLI_OUTPUT_LIMIT' });
  const failed = script(t, 'process.stderr.write("PRIVATE ERROR DETAILS");process.exitCode=1;');
  await assert.rejects(runCli(settings, { cwd: failed.dir, prompt: 'x', resolved: failed.resolved }), (e) => e.code === 'CLI_EXIT_FAILED' && !e.message.includes('PRIVATE'));
});
test('Claude output uses its normal permission mode; denied actions are not reported as completed', async (t) => {
  const fixture = script(t, 'for await(const c of process.stdin){} console.log(JSON.stringify({result:"Read the source",is_error:false,permission_denials:[]}));');
  const output = await runCli({ ...settings, provider: 'claude' }, { cwd: fixture.dir, prompt: 'review', resolved: fixture.resolved }); assert.equal(output, 'Read the source');
  const denied = script(t, 'for await(const c of process.stdin){} console.log(JSON.stringify({result:"blocked",is_error:false,permission_denials:[{tool_name:"Write"}]}));');
  await assert.rejects(runCli({ ...settings, provider: 'claude' }, { cwd: denied.dir, prompt: 'review', resolved: denied.resolved }), { code: 'CLI_REPORTED_BLOCKED' });
});
test('Windows npm wrappers resolve to fixed Node package entrypoints without a command interpreter', () => {
  const base = 'C:\\Users\\Test User\\npm';
  const files = new Set([base + '\\codex.cmd', base + '\\node_modules\\@openai\\codex\\bin\\codex.js']);
  const command = resolveCli('codex', 'codex', { platform: 'win32', env: { PATH: base }, exists: (p) => files.has(p) });
  assert.equal(command.executable, process.execPath); assert.equal(command.prefix[0], base + '\\node_modules\\@openai\\codex\\bin\\codex.js');
  assert.throws(() => resolveCli(base + '\\custom.cmd', 'codex', { platform: 'win32', exists: (p) => p.endsWith('custom.cmd') }), { code: 'CLI_SHIM_UNSUPPORTED' });
});
test('runner configuration rejects URL tokens, broad traversal and protected configuration paths', () => {
  const env = { TEAM_RUNNER_URL: 'https://test.example/mcp', TEAM_RUNNER_MEMBER: 'worker', TEAM_RUNNER_KEY: 'k'.repeat(43) };
  assert.equal(runnerConfig(env).access, 'read-only');
  for (const extra of [{ TEAM_RUNNER_URL: 'https://test.example/mcp?token=secret' }, { TEAM_RUNNER_URL: 'http://public.example/mcp' }, { TEAM_RUNNER_PATHS: '../secret' }, { TEAM_RUNNER_PATHS: '.git' }, { TEAM_RUNNER_PATHS: '.env.runner' }, { TEAM_RUNNER_PATHS: '.claude' }, { TEAM_RUNNER_TIMEOUT_SECONDS: '999999' }]) assert.throws(() => runnerConfig({ ...env, ...extra }));
});
test('local lock prevents a second daemon from opening the same journal', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-runner-lock-'));
  const one = localRunnerState(dir, 'first'); t.after(() => { one.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.throws(() => localRunnerState(dir, 'second'), { code: 'RUNNER_LOCKED' });
});
