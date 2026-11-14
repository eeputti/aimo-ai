// One confirmed order pushed by the machine that runs the WhatsApp gateway.
// The order fields are the same allowlist projection as the public snapshot; only the
// optional e-mail recipient and greeting name are extra, and they never reach public routes.
import { parseSnapshot, type PublicOrder } from "./protocol.ts";

export type OrderEvent = { version: 1; observedAt: number; ledgerHead: string; order: PublicOrder; email: { to: string | null; customerName: string | null } };

const EMAIL = /^[^\s@<>()",;:\\]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function parseOrderEvent(value: unknown, now = Date.now()): OrderEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Virheellinen tapahtuma.");
  const e = value as Record<string, unknown>;
  if (e.version !== 1) throw new Error("Virheellinen versio.");
  // Reuse the snapshot validator so both routes accept exactly the same order shape.
  const snapshot = parseSnapshot({ version: 1, observedAt: e.observedAt, ledgerHead: e.ledgerHead, totalOrders: 1, orders: [e.order] }, now);
  const order = snapshot.orders[0];
  if (order.status !== "confirmed") throw new Error("Vain vahvistettu tilaus.");
  const mail = e.email === undefined || e.email === null ? {} : e.email;
  if (typeof mail !== "object" || Array.isArray(mail)) throw new Error("Virheellinen sähköpostitieto.");
  const { to = null, customerName = null } = mail as Record<string, unknown>;
  if (to !== null && (typeof to !== "string" || to.length > 254 || !EMAIL.test(to))) throw new Error("Virheellinen vastaanottaja.");
  if (customerName !== null && (typeof customerName !== "string" || !customerName.trim() || customerName.length > 120 || /[\u0000-\u001f]/u.test(customerName))) throw new Error("Virheellinen nimi.");
  return { version: 1, observedAt: snapshot.observedAt, ledgerHead: snapshot.ledgerHead, order, email: { to: to as string | null, customerName: customerName ? (customerName as string).trim() : null } };
}
