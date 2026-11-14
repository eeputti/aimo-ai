// Explicit demo-only association. A browser or message cannot select its own customer.
import { phoneNumber } from './store.mjs';
export function createDemoBuyerResolver(env = process.env) {
  const target = env.WHATSAPP_DEMO_BUYER_ID?.trim();
  const phone = env.WHATSAPP_DEMO_PHONE?.trim();
  if (target && (!phone || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(target))) throw new Error('WHATSAPP_DEMO_BUYER_ID tarvitsee kelvollisen ostajatunnuksen ja WHATSAPP_DEMO_PHONE-numeron.');
  const normalized = target ? phoneNumber(phone) : null;
  return (member) => {
    const mapped = Boolean(target && member.phone === normalized);
    const buyerId = mapped ? target : `whatsapp-demo-${member.binding}`;
    // A changed buyer never inherits an old customer's draft, quote or confirmation result.
    return { buyerId, customerId: `whatsapp-demo:${member.binding}${mapped ? `:buyer:${buyerId}` : ''}`, mapped };
  };
}
