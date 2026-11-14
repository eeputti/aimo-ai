// Valmis kokoonpano kytkentää varten (henkilö 1): luonnoskanta, tuotetyökalut ja tulkki oletusriippuvuuksilla.
// Kielimalli on käytössä, kun ANTHROPIC_API_KEY on asetettu; muuten viestit tulkitaan säännöillä.
import { storefrontCartProjection } from '../storefront-whatsapp-sync.mjs';
import { shoppingListView } from '../shopping-list/index.mjs';
import { openDraftStore } from './store.mjs';
import { createOrderingConversation } from './index.mjs';
import { createRuleInterpreter, createModelInterpreter } from './interpret.mjs';
import { createOrderingTools } from '../order-tools/index.mjs';

/** @param {{draftDb?: string, quoteDb?: string, permissions?: Function, now?: () => number}} [o] */
export async function createConfiguredOrdering({ draftDb = ':memory:', quoteDb = ':memory:', permissions, now } = {}) {
  const [{ understand }, { askAgent, agentEnabled }, { clock }] = await Promise.all([import('../aimo/understand.mjs'), import('../aimoAgent.mjs'), import('../gateway/clock.mjs')]);
  const time = now || (() => clock.now().getTime());
  const store = openDraftStore(draftDb, time);
  const tools = createOrderingTools({ dbPath: quoteDb, now: time, ...(permissions ? { permissions } : {}) });
  const rules = createRuleInterpreter({ understand });
  const interpretTurn = agentEnabled() ? createModelInterpreter({ ask: askAgent, fallback: rules }) : rules;
  const handleTurn = createOrderingConversation({ store, tools, interpretTurn, now: time });
  const exports = new Map();
  return { handleTurn,
    async getStorefrontCart({ conversationId, customer }) {
      const draft = store.active(conversationId); const list = shoppingListView(draft, customer);
      if (!list) return { source: `whatsapp:${customer.buyerId}`, state: 'empty', lines: [] };
      if (list.status !== 'review') return storefrontCartProjection(list, null);
      const key = `${list.id}:${list.revision}`; const previous = exports.get(key);
      if (previous?.until > time()) return previous.value;
      const quote = await tools.quote({ customer, draft });
      const value = storefrontCartProjection(list, quote);
      exports.clear(); exports.set(key, { value, until: Math.min(time() + 30000, Date.parse(quote.expiresAt) || time()) });
      return value;
    },
    getShoppingList({ conversationId, customer }) { return shoppingListView(store.active(conversationId), customer); },
    hasTurnResult({ messageId, customer }) {
      const result = store.result(messageId); const draft = result?.draftId && store.get(result.draftId);
      return Boolean(draft && draft.customerId === customer.customerId && draft.bindingVersion === customer.bindingVersion);
    },
    prune() { store.prune(); tools.prune(); }, close() { store.close(); tools.close(); } };
}
