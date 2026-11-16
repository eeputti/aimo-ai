import { fileURLToPath } from 'node:url';
import { openWhatsAppStore } from './store.mjs';
import { createMetaSender, createMetaTypingIndicator, createWhatsAppChannel } from './channel.mjs';
import { replyToAssistant } from '../assistant.mjs';
import { bootstrapDemoMember, createDemoOrderingChat, validateOrderingEnvironment } from './ordering.mjs';
import { createShoppingListHandoff } from './shopping-list.mjs';
import { createWebDemo } from './web-demo.mjs';
import { createCartLink } from './cart-link.mjs';
import { createStorefrontCartPage } from './storefront-cart.mjs';
import { withDemoCheckout, handleDemoCheckoutAsset } from './checkout.mjs';
import { createWebChat } from './web-chat.mjs';
import { createMediaReader, createMetaMediaFetcher } from './media.mjs';
import { createConfiguredTranscriber } from './transcribe.mjs';
import { llmEnabled } from '../config.mjs';

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
    ordering = createDemoOrderingChat({ store, phoneId: settings.phoneId, supportContact: settings.supportContact,
      draftDb: process.env.WHATSAPP_DRAFT_DB || fileURLToPath(new URL('../../data/whatsapp-drafts.db', import.meta.url)),
      quoteDb: process.env.WHATSAPP_QUOTE_DB || fileURLToPath(new URL('../../data/whatsapp-quotes.db', import.meta.url)),
    });
    // Maksulinkki on tilauksen oma: sen tunniste lasketaan tilauksen luontiajasta (gatewayn kanta, sama prosessi).
    ordering = withDemoCheckout(ordering, { baseUrl: process.env.CLOUDFLARE_DEMO_URL, secret: process.env.WEBCHAT_SECRET?.trim(),
      orderCreatedAt: async (orderId) => (await import('../gateway/store.mjs')).orders.get(orderId)?.createdAt || null });
  }
  const cartLink = ordering ? createCartLink({ store, ordering, baseUrl: process.env.WHATSAPP_PUBLIC_URL, secret: settings.appSecret }) : null;
  // Korilinkin sivu kaupan ostoskorin ulkoasulla. Vain staattiset tiedostot; API pysyy cartLinkissä.
  const storefrontCart = cartLink ? createStorefrontCartPage() : null;
  // Kuvat ja ääniviestit vain tilaustilassa. Ääniviestit tarvitsevat erikseen valitun litterointipalvelun (transcribe.mjs).
  const media = ordering && process.env.WHATSAPP_MEDIA !== 'false' ? createMediaReader({ db: store.db, fetchMedia: createMetaMediaFetcher(settings),
    vision: llmEnabled(), transcriber: createConfiguredTranscriber() }) : null;
  const channel = createWhatsAppChannel({ settings, store, chat: cartLink?.chat || ordering?.chat || replyToAssistant, media,
    onPrune: () => { ordering?.prune(); media?.prune(); }, send: createMetaSender(settings), typing: createMetaTypingIndicator(settings) });
  // Selaindemo on olemassa vain tilaustilassa, jolloin kannat ovat eristetyt.
  const webDemo = ordering ? createWebDemo({ store, chat: ordering.chat }) : null;
  // Workers-sivuston selainkeskustelu: vain WEBCHAT_SECRETin tunteva Worker voi kutsua.
  const webChat = cartLink ? createWebChat({ store, chat: cartLink.chat, cartLink: cartLink.linkFor, shoppingList: (member) => ordering.getShoppingList(member),
    secret: process.env.WEBCHAT_SECRET?.trim() }) : null;
  const shoppingLists = ordering ? createShoppingListHandoff({ store, ordering, defaultPhone: process.env.WHATSAPP_DEMO_PHONE }) : null;
  return { ...channel, store,
    // Pilviversio siivoaa ajastetusti, koska siellä ei ole start()-silmukkaa.
    prune() { store.prune(); ordering?.prune(); media?.prune(); },
    async handle(req, res, url = new URL(req.url, 'http://localhost')) { return (cartLink ? handleDemoCheckoutAsset(req, res, url) : false) || (storefrontCart ? storefrontCart.handle(req, res, url) : false) || (cartLink ? await cartLink.handle(req, res, url) : false) || (webChat ? await webChat.handle(req, res, url) : false) || (await channel.handle(req, res, url)) || (shoppingLists ? await shoppingLists.handle(req, res, url) : false) || (webDemo ? webDemo.handle(req, res, url) : false); },
    async close() {
      try { await channel.stop(); await ordering?.close(); }
      finally { store.close(); }
    } };
}
