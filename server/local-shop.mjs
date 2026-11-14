// A local storefront for the WhatsApp demo's existing orders. Never starts a channel worker.
import { DatabaseSync } from 'node:sqlite';
import { isLocal } from './whatsapp/web-demo.mjs';

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
export function createLocalShop({ whatsappDb, defaultPhone, buyers }) {
  function context() {
    // Read-only: opening this storefront must not recover jobs, pair a number or start a second worker.
    const db = new DatabaseSync(whatsappDb, { readOnly: true });
    let members;
    try { members = db.prepare('SELECT phone,binding,company,person FROM members').all(); }
    finally { db.close(); }
    const existing = new Set(buyers().map((b) => b.id));
    const accounts = members.map((m) => ({ buyerId: `whatsapp-demo-${m.binding}`, name: m.company, personName: m.person, deliverySite: 'Testikeittiö' }))
      .filter((m) => existing.has(m.buyerId));
    const preferred = members.find((m) => m.phone === String(defaultPhone || '').replace(/^\+/, ''));
    const defaultBuyerId = preferred && accounts.find((a) => a.buyerId === `whatsapp-demo-${preferred.binding}`)?.buyerId;
    return { mode: 'local-demo', accounts, defaultBuyerId: defaultBuyerId || accounts[0]?.buyerId || null };
  }
  return {
    context,
    handle(req, res, url) {
      let originAllowed = true;
      try { if (req.headers.origin) originAllowed = new URL(req.headers.origin).origin === `http://${req.headers.host}`; }
      catch { originAllowed = false; }
      if (!isLocal(req) || req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto']
          || !originAllowed || req.headers['sec-fetch-site'] === 'cross-site') {
        json(res, 403, { error: 'Testikauppa toimii vain palvelinkoneen omasta selaimesta.' }); return true;
      }
      if (['/console/reset', '/console/demo', '/api/reset'].includes(url.pathname)) {
        json(res, 403, { error: 'WhatsAppin tilauksia ei voi nollata tästä testikaupasta.' }); return true;
      }
      if (url.pathname === '/api/local-shop' && req.method === 'GET') { json(res, 200, context()); return true; }
      return false;
    },
    decorateHtml(html) {
      return html.replace('</head>', '<meta name="aimo-local-shop" content="whatsapp-demo"></head>')
        .replace(/(<span class="customer">)[^<]*/, '$1Testikeittiö (paikallinen demo)')
        .replace(/(<span class="user-name">)[^<]*/, '$1Testaaja');
    },
  };
}
