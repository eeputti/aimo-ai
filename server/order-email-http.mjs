// GET /order/confirm?token=…  shows the saved order summary. It is read-only (also for HEAD), so e-mail link previews and
// security scanners that fetch the link cannot place an order.
// POST /order/confirm         (form field "token") is the only request that places the order.
import { renderConfirmPage } from './order-email-templates.mjs';
import { orderEmailFlow } from './order-email-flow.mjs';
import { orderMailer } from './order-email.mjs';

const HEADERS = {
  'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function send(req, res, status, html, extra = {}) {
  res.writeHead(status, { ...HEADERS, ...extra });
  res.end(req.method === 'HEAD' ? undefined : html);
}
function readForm(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let data = ''; let bytes = 0;
    req.on('data', (chunk) => { bytes += chunk.length; if (bytes > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; } data += chunk; });
    req.on('end', () => resolve(new URLSearchParams(data)));
    req.on('error', reject);
  });
}

export async function handleOrderEmailRequest(req, res, url, { flow = orderEmailFlow, mailer = orderMailer } = {}) {
  if (url.pathname !== '/order/confirm') return false;
  const plain = (status, text) => send(req, res, status, `<!doctype html><meta charset="utf-8"><title>${text}</title><p>${text}</p>`);
  if (req.method === 'GET' || req.method === 'HEAD') {
    const token = url.searchParams.get('token') || '';
    const { status, html } = renderConfirmPage(flow.view(token), token); // view() never changes state
    send(req, res, status, html); return true;
  }
  if (req.method !== 'POST') { plain(405, 'Method not allowed'); return true; }
  const origin = req.headers.origin; const publicOrigin = mailer.publicOrigin();
  if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && publicOrigin && origin !== publicOrigin)) { plain(403, 'Forbidden'); return true; }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) { plain(415, 'Unsupported content type'); return true; }
  let token;
  try { token = (await readForm(req)).get('token') || ''; } catch (err) { plain(err.status || 400, 'Bad request'); return true; }
  const view = await flow.confirm(token);
  const { status, html } = renderConfirmPage(view, token);
  send(req, res, status, html);
  return true;
}
