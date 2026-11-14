// Valmis kokoonpano kytkentää varten (henkilö 1): luonnoskanta, tuotetyökalut ja tulkki oletusriippuvuuksilla.
// Kielimalli on käytössä, kun ANTHROPIC_API_KEY on asetettu; muuten viestit tulkitaan säännöillä.
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
  return { handleTurn, prune() { store.prune(); tools.prune(); }, close() { store.close(); tools.close(); } };
}
