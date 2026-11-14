import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { childEnvironment } from './runner-config.mjs';

const failure = (code) => Object.assign(new Error(code), { code });
export function resolveCli(binary, provider, { platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  const paths = platform === 'win32' ? path.win32 : path;
  const candidates = paths.isAbsolute(binary) ? [binary] : (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : path.delimiter).flatMap((dir) => platform === 'win32' ? ['.exe', '.cmd', ''].map((ext) => paths.join(dir, binary + ext)) : [paths.join(dir, binary)]);
  const found = candidates.find(exists);
  if (!found) throw failure('CLI_NOT_FOUND');
  if (/\.(cmd|bat)$/i.test(found)) {
    const entry = paths.join(paths.dirname(found), 'node_modules', ...(provider === 'codex' ? ['@openai', 'codex', 'bin', 'codex.js'] : ['@anthropic-ai', 'claude-code', 'cli.js']));
    if (!exists(entry)) throw failure('CLI_SHIM_UNSUPPORTED');
    return { executable: process.execPath, prefix: [entry] };
  }
  return { executable: found, prefix: [] };
}
export function cliArguments(settings) {
  return settings.provider === 'codex'
    ? ['--ask-for-approval', 'never', 'exec', '--sandbox', settings.access, '--ephemeral', '--json', '-']
    : ['--print', '--output-format', 'json', '--permission-mode', settings.access === 'read-only' ? 'plan' : 'acceptEdits', '--tools', settings.access === 'read-only' ? 'Read,Glob,Grep' : 'Read,Glob,Grep,Edit,Write'];
}
export function parseCliResult(provider, stdout) {
  if (provider === 'claude') {
    let data; try { data = JSON.parse(stdout); } catch { throw failure('CLI_OUTPUT_INVALID'); }
    if (data.is_error || data.permission_denials?.length || typeof data.result !== 'string') throw failure('CLI_REPORTED_BLOCKED');
    return data.result.slice(0, 4000);
  }
  const lines = stdout.split(/\r?\n/).filter((v) => v.trim()); let answer = '';
  for (const line of lines) {
    let value; try { value = JSON.parse(line); } catch { throw failure('CLI_OUTPUT_INVALID'); }
    if (value.type === 'turn.failed' || value.type === 'error') throw failure('CLI_REPORTED_BLOCKED');
    if (value.type === 'item.completed' && value.item?.type === 'agent_message') answer = value.item.text;
  }
  if (!answer) throw failure('CLI_OUTPUT_INVALID');
  return answer.slice(0, 4000);
}
export async function runCli(settings, { cwd, prompt, signal, spawnImpl = spawn, resolved, env = process.env }) {
  if (signal?.aborted) throw failure('CLI_ABORTED');
  const command = resolved || resolveCli(settings.binary, settings.provider, { env });
  const child = spawnImpl(command.executable, [...command.prefix, ...cliArguments(settings)], { cwd, env: childEnvironment(env, settings.provider), shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  let bytes = 0, stdout = '', reason, closed = false, force;
  const kill = (code) => {
    reason ||= code;
    if (closed || !child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      force = setTimeout(() => { if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 2000); force.unref();
    }
  };
  const stop = () => kill('CLI_ABORTED');
  const timer = setTimeout(() => kill('CLI_TIMEOUT'), settings.timeoutMs);
  signal?.addEventListener('abort', stop, { once: true }); if (signal?.aborted) stop();
  child.stdin.on('error', () => {});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes > 2_000_000) kill('CLI_OUTPUT_LIMIT'); else stdout += chunk; });
  child.stderr.on('data', (chunk) => { bytes += chunk.length; if (bytes > 2_000_000) kill('CLI_OUTPUT_LIMIT'); });
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', () => reject(failure('CLI_START_FAILED'))); child.once('close', (value) => { closed = true; resolve(value); }); child.stdin.end(prompt); });
    if (reason) throw failure(reason);
    if (code !== 0) throw failure('CLI_EXIT_FAILED');
    return parseCliResult(settings.provider, stdout);
  } finally { clearTimeout(timer); clearTimeout(force); signal?.removeEventListener('abort', stop); }
}
