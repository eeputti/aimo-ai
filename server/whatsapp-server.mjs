// Standalone WhatsApp service: no storefront catalogue or order databases required.
import http from 'node:http';
import { createConfiguredWhatsApp } from './whatsapp/runtime.mjs';

const channel = createConfiguredWhatsApp();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (await channel.handle(req, res, url)) return;
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, channel: 'whatsapp', mode: 'read-only-test' }));
  } else { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.WHATSAPP_PORT || process.env.PORT || 4748), () => {
  channel.start(); console.log(`WhatsApp test → http://localhost:${server.address().port}/webhooks/whatsapp`);
});
async function shutdown() {
  server.close(); await channel.close(); server.closeAllConnections();
}
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
