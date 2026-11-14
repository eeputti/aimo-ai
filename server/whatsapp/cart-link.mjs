// A short-lived capability for one existing WhatsApp draft. No browser-local cart copy.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { replyWithCartLink, withCartHandoffHint } from './cart-handoff.mjs';

const PAGE = '/whatsapp/cart';
const API = `${PAGE}/api`;
const TTL = 24 * 3600_000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const unavailable = () => fail(410, 'Korilinkki on vanhentunut tai ostoskori on suljettu. Pyydä WhatsAppissa uusi linkki.');
const assets = new Map([
  [PAGE, ['whatsapp-cart.html', 'text/html; charset=utf-8']],
  [`${PAGE}.js`, ['whatsapp-cart.js', 'text/javascript; charset=utf-8']],
  [`${PAGE}.css`, ['whatsapp-cart.css', 'text/css; charset=utf-8']],
  [`${PAGE}/logo.svg`, ['storefront-assets/logo.svg', 'image/svg+xml']],
]);
const headers = {
  'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY', 'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function json(res, status, data) {
  res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12_000) throw fail(413, 'Pyyntö on liian suuri.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'Virheellinen pyyntö.'); }
}

export function createCartLink({ store, ordering, baseUrl, secret, now = Date.now }) {
  if (!baseUrl?.trim()) return null;
  const base = new URL(baseUrl.trim());
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash || !secret) {
    throw new Error('WHATSAPP_PUBLIC_URL tarvitsee julkisen HTTPS-alkuperän ilman polkua.');
  }
  const sign = (payload) => crypto.createHmac('sha256', secret).update(`whatsapp-cart-v1\0${payload}`).digest('base64url');
  const requests = new Map();
  const issue = (member, list) => {
    const payload = Buffer.from(JSON.stringify({ binding: member.binding, draft: list.id, expires: now() + TTL })).toString('base64url');
    return `${base.origin}${PAGE}#${payload}.${sign(payload)}`;
  };
  function authenticate(req) {
    const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
    if (!token || token.length > 1500) throw unavailable();
    const [payload, signature] = token.split('.');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) throw unavailable();
    let claims;
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw unavailable(); }
    if (!claims || typeof claims.binding !== 'string' || typeof claims.draft !== 'string'
        || !Number.isSafeInteger(claims.expires) || claims.expires <= now() || claims.expires > now() + TTL) throw unavailable();
    const member = store.db.prepare('SELECT phone,binding,company,person FROM members WHERE binding=?').get(claims.binding);
    if (!member) throw unavailable();
    return { member, draftId: claims.draft };
  }
  return {
    async chat(args) {
      const list = await ordering.getShoppingList(args.member);
      let dialogue = {};
      if (store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_dialogue'").get()) {
        const row = store.db.prepare('SELECT json FROM wa_dialogue WHERE binding=?').get(args.member.binding);
        if (row) dialogue = JSON.parse(row.json);
      }
      const handoff = await replyWithCartLink({ text: args.messages.at(-1)?.content || '', shoppingList: list,
        lastOrder: dialogue.lastOrder, pendingSuggestion: dialogue.pendingSuggestion, cartHandoff: () => issue(args.member, list) });
      if (handoff) return handoff; // Acknowledgement opens the cart, never submits an order.
      const result = await ordering.chat({ ...args, cartLinkAvailable: true });
      if (result.cartRequested) {
        const current = await ordering.getShoppingList(args.member);
        if (current) {
          const handoff = await replyWithCartLink({ text: 'avaa kori', shoppingList: current, cartHandoff: () => issue(args.member, current) });
          if (result.conversationAnswer) return { ...handoff, messages: [result.conversationAnswer, ...handoff.messages], text: `${result.conversationAnswer}\n\n${handoff.text}` };
          return handoff;
        }
      }
      return withCartHandoffHint(result);
    },
    async handle(req, res, url) {
      if (!assets.has(url.pathname) && url.pathname !== API && url.pathname !== `${API}/chat`) return false;
      try {
        if (assets.has(url.pathname)) {
          if (req.method !== 'GET') throw fail(405, 'Method not allowed');
          const [file, type] = assets.get(url.pathname);
          const content = fs.readFileSync(new URL(`../../public/${file}`, import.meta.url));
          res.writeHead(200, { ...headers, 'content-type': type });
          res.end(content); return true;
        }
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== base.origin)) {
          throw fail(403, 'Pyyntö ei tullut ostoskorisivulta.');
        }
        const { member, draftId } = authenticate(req);
        if (req.method === 'GET' && url.pathname === API) {
          const list = await ordering.getShoppingList(member);
          if (!list || list.id !== draftId) throw unavailable();
          json(res, 200, { shoppingList: list }); return true;
        }
        if (req.method !== 'POST' || url.pathname !== `${API}/chat`) throw fail(405, 'Method not allowed');
        if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw fail(415, 'Lähetä JSON-pyyntö.');
        const input = await body(req);
        if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 4000
            || typeof input.messageId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.messageId)
            || input.expectedList?.id !== draftId || !Number.isSafeInteger(input.expectedList?.revision) || input.expectedList.revision < 0) {
          throw fail(400, 'Tarkista viesti ja ostoskorin versio.');
        }
        const recent = requests.get(member.binding);
        const limit = recent && recent.until > now() ? recent : { until: now() + 60_000, count: 0 };
        if (limit.count >= 10) throw fail(429, 'Liian monta pyyntöä. Odota minuutti ja yritä uudelleen.');
        for (const [binding, window] of requests) if (window.until <= now()) requests.delete(binding);
        limit.count++; requests.set(member.binding, limit);
        // A server-owned binding and expected draft version go through the existing serialized,
        // idempotent ordering bridge. An old link cannot edit or confirm a replacement draft.
        const result = await ordering.chat({ member, messageId: `cart:${member.binding}:${input.messageId}`, receivedAt: now(),
          messages: [{ role: 'user', content: input.text.trim() }], expectedList: input.expectedList });
        json(res, 200, result); return true;
      } catch (error) {
        const status = [400, 403, 409, 410, 413, 415, 405, 429].includes(error.status) ? error.status : 502;
        json(res, status, { error: status === 502 ? 'Ostoskorin käsittely ei onnistunut. Yritä uudelleen.' : error.message }); return true;
      }
    },
  };
}
