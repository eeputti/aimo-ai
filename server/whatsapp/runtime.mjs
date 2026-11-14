import { fileURLToPath } from 'node:url';
import { openWhatsAppStore } from './store.mjs';
import { createMetaSender, createMetaTypingIndicator, createWhatsAppChannel } from './channel.mjs';
import { replyToAssistant } from '../assistant.mjs';
import { bootstrapDemoMember, createDemoOrderingChat, validateOrderingEnvironment } from './ordering.mjs';
import { createWebDemo } from './web-demo.mjs';

export const whatsappDbPath = () => process.env.WHATSAPP_DB || fileURLToPath(new URL('../../data/whatsapp.db', import.meta.url));
export function whatsappSettings(env = process.env) {
  const settings = {
    phoneId: env.WHATSAPP_PHONE_NUMBER_ID?.trim(), accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim(),
    appSecret: env.WHATSAPP_APP_SECRET?.trim(), verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim(),
    supportContact: env.WHATSAPP_SUPPORT_CONTACT?.trim(), apiVersion: env.WHATSAPP_API_VERSION?.trim(),
  };
  if (Object.values(settings).some((v) => !v)) throw new Error('WhatsApp-asetuksia puuttuu. Katso docs/whatsapp.md.');
  if (!/^\d+$/.test(settings.phoneId) || !/^v\d+\.\d+$/.test(settings.apiVersion)) throw new Error('WhatsApp-numeron tunniste tai Graph API -versio on virheellinen.');
  return settings;
}
export function createConfiguredWhatsApp() {
  const settings = whatsappSettings();
  settings.orderingDemo = process.env.WHATSAPP_ORDERING_ENABLED === 'true';
  if (settings.orderingDemo) validateOrderingEnvironment();
  const store = openWhatsAppStore(whatsappDbPath());
  let ordering;
  if (settings.orderingDemo) {
    bootstrapDemoMember(store);
    ordering = createDemoOrderingChat({ store, phoneId: settings.phoneId,
      draftDb: process.env.WHATSAPP_DRAFT_DB || fileURLToPath(new URL('../../data/whatsapp-drafts.db', import.meta.url)),
      quoteDb: process.env.WHATSAPP_QUOTE_DB || fileURLToPath(new URL('../../data/whatsapp-quotes.db', import.meta.url)),
    });
  }
  const channel = createWhatsAppChannel({ settings, store, chat: ordering?.chat || replyToAssistant,
    onPrune: () => ordering?.prune(), send: createMetaSender(settings), typing: createMetaTypingIndicator(settings) });
  // Selaindemo on olemassa vain tilaustilassa, jolloin kannat ovat eristetyt.
  const webDemo = ordering ? createWebDemo({ store, chat: ordering.chat }) : null;
  return { ...channel,
    async handle(req, res, url = new URL(req.url, 'http://localhost')) { return (await channel.handle(req, res, url)) || (webDemo ? webDemo.handle(req, res, url) : false); },
    async close() {
      try { await channel.stop(); await ordering?.close(); }
      finally { store.close(); }
    } };
}
