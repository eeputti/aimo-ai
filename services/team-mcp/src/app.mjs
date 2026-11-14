import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createAuth, SCOPES } from './auth.mjs';
import { createTeamMcp } from './mcp.mjs';
export function createApp(store, settings) {
  const app = createMcpExpressApp({ host: settings.host, allowedHosts: [...new Set([settings.url.hostname, '127.0.0.1', 'localhost', '[::1]'])] });
  app.disable('x-powered-by');
  // Never derive security decisions, redirects, or issuer metadata from proxy headers.
  app.use((req, res, next) => {
    res.set('x-content-type-options', 'nosniff');
    if (req.headers.origin && req.headers.origin !== settings.url.origin) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    next();
  });
  const { provider, page, consent, resource } = createAuth(store, settings.url, settings.redirectOrigins);
  app.use(mcpAuthRouter({ provider, issuerUrl: settings.url, resourceServerUrl: new URL(resource), scopesSupported: SCOPES, resourceName: 'Aimo team coordination' }));
  const loginLimits = new Map();
  app.get('/consent', page);
  app.post('/consent', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    const key = req.socket.remoteAddress || 'unknown'; const now = store.now();
    if (loginLimits.size > 10000) for (const [ip, value] of loginLimits) if (value.expires <= now) loginLimits.delete(ip);
    const current = loginLimits.get(key); const attempt = current?.expires > now ? current : { count: 0, expires: now + 15 * 60_000 };
    attempt.count++; loginLimits.set(key, attempt);
    if (attempt.count > 20) { res.status(429).send('Too many sign-in attempts. Try again in 15 minutes.'); return; }
    consent(req, res);
  });
  app.get('/healthz', (req, res) => res.set('cache-control', 'no-store').json({ ok: true, service: 'aimo-team-mcp' }));
  const gate = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(resource)), expectedResource: new URL(resource) });
  app.all('/mcp', gate, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).set('allow', 'POST').json({ error: 'Stateless MCP uses POST; SSE and session deletion are not enabled' }); return; }
    const server = createTeamMcp(store, req.auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const close = () => { void transport.close(); void server.close(); };
    res.on('close', close);
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed' } }); }
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.status === 413 ? 'Request too large' : 'Request failed' });
  });
  return { app, provider };
}
