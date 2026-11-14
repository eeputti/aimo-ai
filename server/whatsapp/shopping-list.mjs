// Local-demo handoff into the storefront assistant. Shares the existing draft and never copies
// it to a browser cart. Production must supply Valio's authenticated customer resolver instead.
import { createDemoBuyerResolver } from './demo-buyer.mjs';
import { isLocal } from './web-demo.mjs';

export const LIST_ROUTE = '/api/assistant/whatsapp-list';
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000) throw Object.assign(new Error('Pyyntö on liian suuri.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Virheellinen pyyntö.'), { status: 400 }); }
}
export function createShoppingListHandoff({ store, ordering, defaultPhone, resolveBuyer = createDemoBuyerResolver() }) {
  const members = () => store.db.prepare('SELECT phone,binding,company,person FROM members ORDER BY company,person,binding').all();
  const id = (member) => resolveBuyer(member).buyerId;
  const find = (buyerId) => members().find((member) => id(member) === buyerId);
  return {
    async handle(req, res, url) {
      if (url.pathname !== LIST_ROUTE && url.pathname !== `${LIST_ROUTE}/chat`) return false;
      let sameOrigin = true;
      try { if (req.headers.origin) sameOrigin = new URL(req.headers.origin).origin === `http://${req.headers.host}`; }
      catch { sameOrigin = false; }
      if (!isLocal(req) || !sameOrigin || req.headers['sec-fetch-site'] === 'cross-site'
          || req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto']) {
        json(res, 403, { error: 'WhatsApp-ostoslista on käytettävissä vain paikallisessa testikaupassa.' }); return true;
      }
      try {
        if (req.method === 'GET' && url.pathname === LIST_ROUTE) {
          const all = members();
          const buyerId = url.searchParams.get('buyerId');
          const member = buyerId ? find(buyerId) : all.find((m) => m.phone === String(defaultPhone || '').replace(/^\+/, '')) || all[0];
          if (buyerId && !member) { json(res, 404, { error: 'Testiasiakkuutta ei löydy.' }); return true; }
          const shoppingList = member ? await ordering.getShoppingList(member) : null;
          json(res, 200, { mode: 'local-demo', accounts: await Promise.all(all.map(async (m) => ordering.getAccount ? ordering.getAccount(m) : { buyerId: id(m), companyName: m.company, personName: m.person })),
            buyerId: member ? id(member) : null, shoppingList }); return true;
        }
        if (req.method === 'POST' && url.pathname === `${LIST_ROUTE}/chat`) {
          if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
            json(res, 415, { error: 'Lähetä JSON-pyyntö.' }); return true;
          }
          const body = await readBody(req);
          const member = typeof body?.buyerId === 'string' && find(body.buyerId);
          if (!member) { json(res, 404, { error: 'Testiasiakkuutta ei löydy.' }); return true; }
          const expected = body.expectedList;
          if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000
              || typeof body.messageId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.messageId)
              || (expected !== null && (!expected || typeof expected.id !== 'string' || expected.id.length > 100
                || !Number.isSafeInteger(expected.revision) || expected.revision < 0))) {
            json(res, 400, { error: 'Tarkista viesti ja ostoslistan versio.' }); return true;
          }
          // The browser cannot supply customer identity, bindings, history or a server approval.
          const result = await ordering.chat({ member, messageId: `shop:${member.binding}:${body.messageId}`, receivedAt: Date.now(),
            messages: [{ role: 'user', content: body.text.trim() }], expectedList: expected });
          // The bridge captures the reply and list atomically and checks revocation after tools.
          json(res, 200, result); return true;
        }
        json(res, 405, { error: 'Method not allowed' }); return true;
      } catch (error) {
        const status = [400, 403, 409, 413].includes(error.status) ? error.status : 502;
        json(res, status, { error: status === 502 ? 'Ostoslistan käsittely ei onnistunut. Yritä uudelleen.' : error.message }); return true;
      }
    },
  };
}
