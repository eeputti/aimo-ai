// Standalone WhatsApp service. Ordering demo uses an isolated gateway database.
import http from 'node:http';
import { createConfiguredWhatsApp } from './whatsapp/runtime.mjs';
import { isLocal } from './whatsapp/web-demo.mjs';

const channel = createConfiguredWhatsApp();
let localApp;
function loadLocalApp() {
  // Local order diagnostics share the same gateway connection, signer and ledger.
  // The retired full storefront and kitchen are not loaded; importing starts no server or worker.
  process.env.AIMO_EMBEDDED_STOREFRONT = 'true';
  return localApp ||= import('./index.mjs');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (await channel.handle(req, res, url)) return;
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, channel: 'whatsapp', mode: process.env.WHATSAPP_ORDERING_ENABLED === 'true' ? 'ordering-demo' : 'read-only-test' }));
  } else if (process.env.WHATSAPP_ORDERING_ENABLED === 'true' && isLocal(req)) {
    try { await (await loadLocalApp()).handleStorefrontRequest(req, res); }
    catch (error) {
      console.error('[local-orders]', error);
      if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Paikallisten tilaustyökalujen avaaminen epäonnistui.' })); }
      else res.end();
    }
  } else { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.WHATSAPP_PORT || process.env.PORT || 4748), () => {
  channel.start(); console.log(`WhatsApp test → http://localhost:${server.address().port}/webhooks/whatsapp`);
});
async function shutdown() {
  server.close(); await channel.close(); server.closeAllConnections();
}
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
