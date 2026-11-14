// A server-side bridge: the storefront browser never receives the source cart capability.
import { isLocal } from './whatsapp/web-demo.mjs';
const ROUTE = '/api/storefront/whatsapp-cart';
export function storefrontCartProjection(list, quote) {
  const base = { source: `whatsapp:${list.buyerId}`, id: list.id, revision: list.revision, companyName: list.companyName, deliveryDate: list.deliveryDate };
  if (list.status !== 'review' || !quote || quote.issues.length) return { ...base, state: 'waiting', lines: [], message: 'Täydennä tuotteen valinta, määrä ja toimitustiedot WhatsAppissa.' };
  return { ...base, state: 'ready', lines: quote.lines.map((line) => ({ id: line.productId, name: line.name, qty: line.salesUnits,
    price: line.unitPriceNet, vat: line.vatRate ?? null, taxUnknown: line.vatRate == null, unit: line.salesUnitLabel,
    requested: line.covers, image: `/img/${encodeURIComponent(line.productId)}` })) };
}
export function createStorefrontWhatsAppSync({ sourceUrl = '', fetchImpl = fetch, now = Date.now } = {}) {
  let source; let token; let configError = false;
  if (sourceUrl) {
    try {
      source = new URL(sourceUrl); token = source.hash.slice(1);
      if (source.username || source.password || source.pathname !== '/whatsapp/cart' || source.search
          || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
          || !(source.protocol === 'https:' || source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname))) throw new Error();
      source = new URL('/whatsapp/cart/api/export', source.origin);
    } catch { configError = true; }
  }
  let cached; let expires = 0; let pending;
  const read = async () => {
    if (cached && expires > now()) return cached;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetchImpl(source, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Lähde ei vastaa');
      const raw = await response.text(); if (raw.length > 64000) throw new Error('Liian suuri vastaus');
      const value = JSON.parse(raw);
      if (typeof value.source !== 'string' || !value.source.startsWith('whatsapp:') || value.source.length > 150
          || !['ready', 'waiting', 'empty'].includes(value.state) || !Array.isArray(value.lines) || value.lines.length > 20
          || value.state === 'ready' && (!/^\d{4}-\d{2}-\d{2}$/.test(value.deliveryDate) || !Number.isSafeInteger(value.revision)
            || value.lines.some((line) => typeof line.id !== 'string' || !line.id || typeof line.name !== 'string' || !Number.isFinite(line.qty) || line.qty <= 0 || line.qty > 999999
              || !Number.isFinite(line.price) || line.price < 0))) throw new Error('Virheellinen kori');
      // Only the explicit projection is sent to the local browser; never arbitrary source fields.
      cached = { enabled: true, source: value.source, id: value.id, revision: value.revision, state: value.state,
        companyName: value.companyName, deliveryDate: value.deliveryDate,
        lines: value.state === 'ready' ? value.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price,
          vat: l.vat, taxUnknown: l.taxUnknown, unit: l.unit, requested: l.requested, image: `/img/${encodeURIComponent(l.id)}` })) : [] };
      expires = now() + 2000; return cached;
    })().finally(() => { pending = null; });
    return pending;
  };
  return { async handle(req, res, url) {
    if (url.pathname !== ROUTE) return false;
    const reply = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); return true; };
    let allowed = isLocal(req) && !req.headers['x-forwarded-host'] && !req.headers['x-forwarded-proto'] && req.headers['sec-fetch-site'] !== 'cross-site';
    try { if (req.headers.origin) allowed &&= new URL(req.headers.origin).origin === `http://${req.headers.host}`; } catch { allowed = false; }
    if (!allowed) return reply(403, { error: 'Kori on tämän paikallisen verkkokaupan käytössä.' });
    if (req.method !== 'GET') return reply(405, { error: 'Method not allowed' });
    if (!sourceUrl) return reply(200, { enabled: false });
    if (configError) return reply(503, { error: 'WhatsApp-korin palvelinyhteys ei ole kunnossa.' });
    try { return reply(200, await read()); }
    catch { return reply(502, { error: 'WhatsApp-koriin ei saatu yhteyttä. Nykyinen ostoskori säilyy.' }); }
  } };
}
