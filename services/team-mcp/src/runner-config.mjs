import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug, resourcePath } from './store.mjs';
import { validPath } from './dispatch.mjs';

export function runnerConfig(env = process.env) {
  let url; try { url = new URL(env.TEAM_RUNNER_URL); } catch { throw new Error('TEAM_RUNNER_URL must be the public /mcp URL'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/mcp' || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('TEAM_RUNNER_URL requires HTTPS (loopback HTTP allowed), /mcp and no query credentials');
  const member = env.TEAM_RUNNER_MEMBER;
  const project = env.TEAM_RUNNER_PROJECT || 'aimo-ai';
  if (!slug(member) || !slug(project) || !/^[A-Za-z0-9_-]{30,100}$/.test(env.TEAM_RUNNER_KEY || '')) throw new Error('Set TEAM_RUNNER_MEMBER, project and its private TEAM_RUNNER_KEY');
  const provider = env.TEAM_RUNNER_PROVIDER || 'codex';
  const access = env.TEAM_RUNNER_ACCESS || 'read-only';
  if (!['codex', 'claude'].includes(provider) || !['read-only', 'workspace-write'].includes(access)) throw new Error('Invalid runner provider or access');
  const senders = (env.TEAM_RUNNER_SENDERS || 'team-coordinator').split(',').map((v) => v.trim());
  const paths = (env.TEAM_RUNNER_PATHS || 'docs').split(',').map((v) => resourcePath(v.trim()));
  if (!senders.length || senders.length > 50 || !senders.every(slug) || paths.length > 50 || !paths.every(validPath)) throw new Error('Invalid sender or path policy');
  const repo = path.resolve(env.TEAM_RUNNER_REPO || fileURLToPath(new URL('../../..', import.meta.url)));
  const state = path.resolve(env.TEAM_RUNNER_STATE || path.join(repo, 'services/team-mcp/data/runner', member));
  const timeoutMs = Number(env.TEAM_RUNNER_TIMEOUT_SECONDS || 600) * 1000;
  const pollMs = Number(env.TEAM_RUNNER_POLL_SECONDS || 5) * 1000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 5000 || timeoutMs > 3600000 || !Number.isInteger(pollMs) || pollMs < 2000 || pollMs > 60000) throw new Error('Invalid runner timeout or poll interval');
  return { url, member, project, key: env.TEAM_RUNNER_KEY, provider, access, senders, paths, repo, state, timeoutMs, pollMs, binary: env.TEAM_RUNNER_BINARY || provider };
}

export function childEnvironment(env = process.env, provider = 'codex') {
  const allowed = new Set(['PATH', 'PATHEXT', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'TERM', 'USER', 'LOGNAME', 'SHELL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR']);
  allowed.add(provider === 'codex' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY');
  return Object.fromEntries(Object.entries(env).filter(([key]) => allowed.has(key.toUpperCase()) || key.startsWith('LC_')));
}
