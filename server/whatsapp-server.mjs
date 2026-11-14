// Standalone WhatsApp service. Ordering demo uses an isolated gateway database.
import http from 'node:http';
import { createConfiguredWhatsApp } from './whatsapp/runtime.mjs';
import { isLocal } from './whatsapp/web-demo.mjs';

const channel = createConfiguredWhatsApp();
let storefront;
function loadStorefront() {
  // Reuse the HTTP storefront inside this process: one gateway connection, signer and ledger
  // for both channels. Importing the handler must not start another HTTP server or worker.
  process.env.AIMO_EMBEDDED_STOREFRONT = 'true';
  return storefront ||= import('./index.mjs');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (await channel.handle(req, res, url)) return;
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, channel: 'whatsapp', mode: process.env.WHATSAPP_ORDERING_ENABLED === 'true' ? 'ordering-demo' : 'read-only-test' }));
  } else if (process.env.WHATSAPP_ORDERING_ENABLED === 'true' && isLocal(req)) {
    try { await (await loadStorefront()).handleStorefrontRequest(req, res); }
    catch (error) {
      console.error('[local-shop]', error);
      if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Testikaupan avaaminen epäonnistui.' })); }
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
