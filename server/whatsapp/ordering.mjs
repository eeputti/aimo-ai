// Explicit demo adapter. Production customer identity remains Valio's integration.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createDemoBuyerResolver } from './demo-buyer.mjs';
import { codeHash, phoneNumber } from './store.mjs';
import { createConfiguredLinkAdvice } from './link-advice.mjs';


const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The demo writes orders and price cache rows, so it must never share the storefront's own databases.
export function validateOrderingEnvironment(env = process.env, { cwd = process.cwd(), exists = fs.existsSync } = {}) {
  for (const [name, shared] of [['GATEWAY_DB', 'gateway.db'], ['AIMO_DB', 'aimo.db']]) {
    if (!env[name] || path.resolve(cwd, env[name]) === path.join(ROOT, 'data', shared)) {
      throw new Error(`WhatsApp-tilausdemo tarvitsee oman ${name}-kannan. Katso docs/whatsapp.md.`);
    }
  }
  if (!exists(env.AIMO_CATALOG || path.join(ROOT, 'data', 'catalog.json'))) {
    throw new Error('WhatsApp-tilausdemo tarvitsee paikallisen katalogin (npm run catalog). Katso docs/whatsapp.md.');
  }
}

// Demo-ostajan mandaatti. Ylläpitäjän kutsuma testiasiakas saa tilata 6 000 €:oon asti ilman kuittausta.
// Landing-sivulta itse ilmoittautunut saa pienen rajan: sen ylittävä tilaus jää odottamaan ihmisen hyväksyntää
// (SPEND_CAP_ORDER / SPEND_CAP_DAY), vaikka numero onkin todistettu WhatsApp-viestillä (audit #14).
export const DEMO_BUYER_LIMITS = { admin: { maxOrderNet: 6000, maxDayNet: 8000 }, landing: { maxOrderNet: 300, maxDayNet: 600 } };
export function demoMandate(source, base) {
  return { ...structuredClone(base), approval: 'exceptions', ...(DEMO_BUYER_LIMITS[source] || DEMO_BUYER_LIMITS.landing) };
}

export function bootstrapDemoMember(store, env = process.env) {
  if (!env.WHATSAPP_DEMO_PHONE) return;
  const phone = phoneNumber(env.WHATSAPP_DEMO_PHONE);
  if (store.member(phone)) return; // preserve the binding and draft on restart
  const invitation = store.invite(phone, 'Testikeittiö (demo)', env.WHATSAPP_DEMO_PERSON || 'Testaaja');
  if (!store.pair(phone, codeHash(invitation.code))) throw new Error('Testiasiakkaan yhdistäminen epäonnistui.');
}

export function createDemoOrderingChat({ store, phoneId, draftDb, quoteDb, loadOrdering, resolveBuyer = createDemoBuyerResolver(), supportContact } = {}) {
  let runtime; let pending;
  const queues = new Map();
  function serial(binding, work) {
    const next = (queues.get(binding) || Promise.resolve()).then(work);
    const tail = next.catch(() => {}); queues.set(binding, tail);
    void tail.then(() => { if (queues.get(binding) === tail) queues.delete(binding); });
    return next;
  }
  const epochOf = (binding) => {
    if (!store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_dialogue'").get()) return '';
    const row = store.db.prepare('SELECT json FROM wa_dialogue WHERE binding=?').get(binding);
    return row ? JSON.parse(row.json).epoch || '' : '';
  };
  const conversationId = (customer, epoch = epochOf(customer.bindingVersion)) =>
    `${phoneId}:${customer.customerId}:${customer.bindingVersion}${epoch ? `:session:${epoch}` : ''}`;
  const context = (current) => {
    const identity = resolveBuyer(current);
    return { customerId: identity.customerId, buyerId: identity.buyerId, bindingVersion: current.binding,
      companyName: runtime?.buyerName?.(identity.buyerId) || current.company, personName: current.person, source: 'demo',
      deliverySites: [{ id: 'demo-keittio', label: 'Testikeittiö' }], permissions: { readProducts: true, placeOrders: true } };
  };
  const livePermissions = (customer) => {
    const member = store.db.prepare('SELECT * FROM members WHERE binding=?').get(customer?.bindingVersion || '');
    const identity = member && resolveBuyer(member);
    const allowed = !!member && customer.customerId === identity.customerId
      && customer.buyerId === identity.buyerId && customer.source === 'demo';
    return { readProducts: allowed, placeOrders: allowed };
  };
  const load = loadOrdering || (async (permissions) => {
    const [{ createConfiguredOrdering }, { buyers }, { DEFAULT_MANDATE }, { createConfiguredDialogue }] = await Promise.all([
      import('../order-conversation/runtime.mjs'), import('../gateway/store.mjs'), import('../gateway/mandate.mjs'), import('./dialogue.mjs'),
    ]);
    const ordering = await createConfiguredOrdering({ draftDb, quoteDb, permissions });
    return { ...ordering, buyerName: (id) => buyers.byId(id)?.name, dialogue: await createConfiguredDialogue(store, { supportContact }), links: await createConfiguredLinkAdvice(store), ensureBuyer(customer) {
      const member = store.db.prepare('SELECT * FROM members WHERE binding=?').get(customer.bindingVersion);
      if (member && resolveBuyer(member).mapped && !buyers.byId(customer.buyerId)) throw new Error('Valittua demoasiakasta ei löydy. Alusta kaupan asiakas ennen numeroliitosta.');
      const source = store.memberSource?.(customer.bindingVersion) || 'admin';
      if (!buyers.byId(customer.buyerId)) buyers.save({
        id: customer.buyerId, name: customer.companyName, kind: source === 'landing' ? 'WhatsApp-kokeilija (itse ilmoittautunut)' : 'WhatsApp-testiasiakas',
        apiKey: crypto.randomBytes(32).toString('hex'), approver: 'Testaaja',
        mandate: demoMandate(source, DEFAULT_MANDATE),
      });
    } };
  });
  const getRuntime = () => (pending ||= Promise.resolve().then(() => load(livePermissions)).then((value) => (runtime = value)));
  const bridge = {
    async getAccount(member) {
      return serial(member?.binding, async () => {
        const current = member?.phone && store.member(member.phone);
        if (!current || current.binding !== member.binding) throw Object.assign(new Error('Testiyhteys ei ole voimassa.'), { status: 403 });
        await getRuntime(); const customer = context(current);
        if (!livePermissions(customer).readProducts) throw Object.assign(new Error('Ei käyttöoikeutta.'), { status: 403 });
        return { buyerId: customer.buyerId, companyName: customer.companyName, personName: current.person };
      });
    },
    async getShoppingList(member) {
      return serial(member?.binding, async () => {
        const current = member?.phone && store.member(member.phone);
        if (!current || current.binding !== member.binding) throw Object.assign(new Error('Testiyhteys ei ole voimassa.'), { status: 403 });
        const ordering = await getRuntime(); const customer = context(current);
        if (!livePermissions(customer).readProducts) throw Object.assign(new Error('Testiyhteys ei ole enää voimassa.'), { status: 403 });
        return ordering.getShoppingList?.({ conversationId: conversationId(customer), customer }) || null;
      });
    },
    async getStorefrontCart(member, expectedDraftId) {
      return serial(member?.binding, async () => {
        const current = member?.phone && store.member(member.phone);
        if (!current || current.binding !== member.binding) throw Object.assign(new Error('Testiyhteys ei ole voimassa.'), { status: 403 });
        const ordering = await getRuntime(); const customer = context(current);
        if (!livePermissions(customer).readProducts) throw Object.assign(new Error('Ei käyttöoikeutta.'), { status: 403 });
        const list = ordering.getShoppingList({ conversationId: conversationId(customer), customer });
        if (list && list.id !== expectedDraftId) throw Object.assign(new Error('Korilinkki ei koske nykyistä koria.'), { status: 410 });
        const result = await ordering.getStorefrontCart({ conversationId: conversationId(customer), customer });
        if (!livePermissions(customer).readProducts) throw Object.assign(new Error('Ei käyttöoikeutta.'), { status: 403 });
        return result;
      });
    },
    chat(args) { return serial(args.member?.binding, () => bridge.chatTurn(args)); },
    async chatTurn({ member, messageId, receivedAt, messages, expectedList, cartLinkAvailable = false }) {
      const current = member?.phone && store.member(member.phone);
      if (!current || current.binding !== member.binding || !messageId) {
        return { text: 'Testiyhteys ei ole voimassa. Pyydä ylläpitäjältä uusi yhdistäminen.' };
      }
      const ordering = await getRuntime();
      const customer = context(current);
      if (!livePermissions(customer).readProducts) return { text: 'Testiyhteys ei ole enää voimassa.' };
      if (expectedList !== undefined && !ordering.hasTurnResult?.({ messageId, customer })) {
        const list = ordering.getShoppingList?.({ conversationId: conversationId(customer), customer }) || null;
        if ((list?.id || null) !== (expectedList?.id || null) || (list?.revision ?? null) !== (expectedList?.revision ?? null)) {
          throw Object.assign(new Error('Ostoslista muuttui toisessa kanavassa. Päivitä ja avaa lista uudelleen.'), { status: 409 });
        }
      }
      ordering.ensureBuyer?.(customer);
      const runOrder = (text, { epoch = '', operation = '', context } = {}) => ordering.handleTurn({ messageId: operation ? `${messageId}:${operation}` : messageId, receivedAt, customer, context,
        conversationId: conversationId(customer, epoch),
        text,
      });
      const text = messages.at(-1)?.content || '';
      const respond = (input) => ordering.dialogue ? ordering.dialogue.respond({ binding: current.binding, messageId, text: input, runOrder,
        getShoppingList: ({ epoch = '' } = {}) => ordering.getShoppingList?.({ conversationId: conversationId(customer, epoch), customer }) || null,
        canOpenCart: cartLinkAvailable === true && expectedList === undefined,
        inCart: expectedList !== undefined, receivedAt,
        allowed: () => livePermissions(customer).readProducts }) : runOrder(input);
      const linked = await ordering.links?.respond({ binding: current.binding, messageId, text,
        shoppingList: ordering.getShoppingList?.({ conversationId: conversationId(customer), customer }) || null,
        runOrder: respond, allowed: () => livePermissions(customer).readProducts });
      const result = linked || await respond(text);
      if (!livePermissions(customer).readProducts) return { status: 'error', text: 'Testiyhteys ei ole enää voimassa.' };
      if (expectedList === undefined) return result;
      if (!livePermissions(customer).readProducts) throw Object.assign(new Error('Testiyhteys ei ole enää voimassa.'), { status: 403 });
      // Capture reply + draft under the same per-customer queue. A later WhatsApp turn must not
      // attach a newer revision to an older summary and accidentally authorize that newer list.
      const shoppingList = ordering.getShoppingList?.({ conversationId: conversationId(customer), customer }) || null;
      if (shoppingList && result.draftId && (shoppingList.id !== result.draftId || shoppingList.revision !== result.revision)) {
        throw Object.assign(new Error('Ostoslista muuttui toisessa kanavassa. Päivitä ja avaa lista uudelleen.'), { status: 409 });
      }
      return { ...result, shoppingList };
    },
    prune() { runtime?.prune(); runtime?.dialogue?.prune(); runtime?.links?.prune(); },
    async close() { if (pending) (await pending).close(); },
  };
  return bridge;
}
