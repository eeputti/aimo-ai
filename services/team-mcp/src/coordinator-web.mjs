import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { fileURLToPath } from 'node:url';

export function createCoordinatorDashboard(store, port) {
  const app = createMcpExpressApp({ host: '127.0.0.1', allowedHosts: ['127.0.0.1', 'localhost'] });
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'" });
    if (req.headers.origin && !origins.includes(req.headers.origin)) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    next();
  });
  app.get('/snapshot', (req, res) => {
    const match = /^Bearer ([A-Za-z0-9_-]{30,300})$/.exec(req.headers.authorization || '');
    const identity = match && store.authenticate(match[1]);
    if (!identity) { res.status(401).json({ error: 'Syötä oma voimassa oleva tiimiavaimesi.' }); return; }
    if (typeof req.query.project !== 'string') { res.status(400).json({ error: 'Project required' }); return; }
    try { res.json(store.coordination.snapshot(identity.id, req.query.project)); }
    catch { res.status(403).json({ error: 'Projektin käyttöoikeus puuttuu.' }); }
  });
  app.use(express.static(fileURLToPath(new URL('../dashboard/', import.meta.url)), { index: 'index.html', dotfiles: 'deny', fallthrough: false }));
  app.use((err, req, res, next) => { if (res.headersSent) return next(err); res.status(err.status || 500).json({ error: 'Request failed' }); });
  return app;
}
