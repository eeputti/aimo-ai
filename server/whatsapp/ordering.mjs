// Explicit demo adapter. Production customer identity remains Valio's integration.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { codeHash, phoneNumber } from './store.mjs';

const customerId = (binding) => `whatsapp-demo:${binding}`;
const buyerId = (binding) => `whatsapp-demo-${binding}`;

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

export function bootstrapDemoMember(store, env = process.env) {
  if (!env.WHATSAPP_DEMO_PHONE) return;
  const phone = phoneNumber(env.WHATSAPP_DEMO_PHONE);
  if (store.member(phone)) return; // preserve the binding and draft on restart
  const invitation = store.invite(phone, 'Testikeittiö (demo)', env.WHATSAPP_DEMO_PERSON || 'Testaaja');
  if (!store.pair(phone, codeHash(invitation.code))) throw new Error('Testiasiakkaan yhdistäminen epäonnistui.');
}

export function createDemoOrderingChat({ store, phoneId, draftDb, quoteDb, loadOrdering } = {}) {
  let runtime; let pending;
  const livePermissions = (customer) => {
    const member = store.db.prepare('SELECT binding FROM members WHERE binding=?').get(customer?.bindingVersion || '');
    const allowed = !!member && customer.customerId === customerId(member.binding)
      && customer.buyerId === buyerId(member.binding) && customer.source === 'demo';
    return { readProducts: allowed, placeOrders: allowed };
  };
  const load = loadOrdering || (async (permissions) => {
    const [{ createConfiguredOrdering }, { buyers }, { DEFAULT_MANDATE }, { createConfiguredDialogue }] = await Promise.all([
      import('../order-conversation/runtime.mjs'), import('../gateway/store.mjs'), import('../gateway/mandate.mjs'), import('./dialogue.mjs'),
    ]);
    const ordering = await createConfiguredOrdering({ draftDb, quoteDb, permissions });
    return { ...ordering, dialogue: await createConfiguredDialogue(store), ensureBuyer(customer) {
      if (!buyers.byId(customer.buyerId)) buyers.save({
        id: customer.buyerId, name: customer.companyName, kind: 'WhatsApp-testiasiakas',
        apiKey: crypto.randomBytes(32).toString('hex'), approver: 'Testaaja',
        mandate: { ...structuredClone(DEFAULT_MANDATE), approval: 'exceptions', maxOrderNet: 6000, maxDayNet: 8000 },
      });
    } };
  });
  const getRuntime = () => (pending ||= Promise.resolve().then(() => load(livePermissions)).then((value) => (runtime = value)));
  return {
    async chat({ member, messageId, receivedAt, messages }) {
      const current = member?.phone && store.member(member.phone);
      if (!current || current.binding !== member.binding || !messageId) {
        return { text: 'Testiyhteys ei ole voimassa. Pyydä ylläpitäjältä uusi yhdistäminen.' };
      }
      const customer = {
        customerId: customerId(current.binding), buyerId: buyerId(current.binding), bindingVersion: current.binding,
        companyName: current.company, personName: current.person, source: 'demo',
        deliverySites: [{ id: 'demo-keittio', label: 'Testikeittiö' }],
        permissions: { readProducts: true, placeOrders: true },
      };
      const ordering = await getRuntime();
      if (!livePermissions(customer).readProducts) return { text: 'Testiyhteys ei ole enää voimassa.' };
      ordering.ensureBuyer?.(customer);
      const runOrder = (text) => ordering.handleTurn({ messageId, receivedAt, customer,
        conversationId: `${phoneId}:${customer.customerId}:${current.binding}`,
        text,
      });
      const text = messages.at(-1)?.content || '';
      return ordering.dialogue ? ordering.dialogue.respond({ binding: current.binding, messageId, text, runOrder,
        allowed: () => livePermissions(customer).readProducts }) : runOrder(text);
    },
    prune() { runtime?.prune(); runtime?.dialogue?.prune(); },
    async close() { if (pending) (await pending).close(); },
  };
}
