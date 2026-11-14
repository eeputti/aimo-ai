import { fileURLToPath } from 'node:url';
export function config(env = process.env) {
  const port = Number(env.PORT || env.TEAM_MCP_PORT || 4750);
  const host = env.TEAM_MCP_HOST || '127.0.0.1';
  const url = new URL(env.TEAM_MCP_PUBLIC_URL || `http://127.0.0.1:${port}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('TEAM_MCP_PUBLIC_URL must be an HTTPS origin (loopback HTTP allowed locally)');
  if (!['127.0.0.1', 'localhost', '0.0.0.0', '::1', '::'].includes(host)) throw new Error('Invalid bind host');
  const redirectOrigins = (env.TEAM_MCP_REDIRECT_ORIGINS || 'https://chatgpt.com,https://chat.openai.com,https://claude.ai,https://claude.com').split(',').map((v) => new URL(v.trim()).origin);
  return { port, host, url, redirectOrigins, db: env.TEAM_MCP_DB || fileURLToPath(new URL('../data/team-mcp.db', import.meta.url)) };
}
