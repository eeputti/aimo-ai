import { fileURLToPath } from 'node:url';
import { openWhatsAppStore } from './store.mjs';
import { createMetaSender, createWhatsAppChannel } from './channel.mjs';
import { replyToAssistant } from '../assistant.mjs';

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
  const store = openWhatsAppStore(whatsappDbPath());
  const channel = createWhatsAppChannel({ settings, store, chat: replyToAssistant, send: createMetaSender(settings) });
  return { ...channel, async close() { await channel.stop(); store.close(); } };
}
