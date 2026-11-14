import fs from 'node:fs';

const ORDER_ID = /^AGW-\d{8}-\d{4,12}$/;

export function handleDemoCheckoutAsset(req, res, url) {
  const file = url.pathname === '/whatsapp/checkout.js' ? 'whatsapp-checkout.js'
    : url.pathname === '/whatsapp/checkout.css' ? 'whatsapp-checkout.css' : null;
  if (!file) return false;
  const headers = { 'content-type': `${file.endsWith('.js') ? 'text/javascript' : 'text/css'}; charset=utf-8`, 'cache-control': 'no-store',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' };
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { ...headers, allow: 'GET, HEAD' }); res.end(); return true;
  }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(new URL(`../../public/${file}`, import.meta.url)));
  return true;
}

// The publisher origin is server configuration. Neither messages nor browser input
// can choose the destination or authorize a payment.
export function withDemoCheckout(ordering, { baseUrl } = {}) {
  if (!baseUrl?.trim()) return ordering;
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Demomaksun osoitteen on oltava julkinen HTTPS-juuriosoite.');
  }
  return { ...ordering, async chat(args) {
    const result = await ordering.chat(args);
    if (result.status !== 'confirmed' || !ORDER_ID.test(result.orderId || '')) return result;
    return { ...result, checkout: { mode: 'demo', url: `${base.origin}/demo-payment.html#${result.orderId}` } };
  } };
}
