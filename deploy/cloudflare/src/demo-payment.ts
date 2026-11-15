// A demo-only payment gate. No card details, payment provider, or money transfer.
import type { PublicOrder } from "./protocol.ts";

export type DemoPaymentEnv = Pick<Env, "DB" | "SYNC_TOKEN"> & { DEMO_PAYMENTS_ENABLED?: string };
type PaymentRow = { order_id: string; status: "pending" | "paid"; amount_net_cents: number; created_at: number; expires_at: number; paid_at: number | null };
type EventRow = { json: string; email_status: string };
type SendConfirmation = (orderId: string) => Promise<string>;
const TTL = 24 * 3600_000;
const PREFIX = "/api/demo-payments/";
const ORDER_ID = /^AGW-\d{8}-\d{4,12}$/;
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const enabled = (env: DemoPaymentEnv) => env.DEMO_PAYMENTS_ENABLED === "true";

async function paymentRow(env: DemoPaymentEnv, orderId: string) {
  return env.DB.prepare("SELECT * FROM demo_payments WHERE order_id=?").bind(orderId).first<PaymentRow>();
}
async function eventRow(env: DemoPaymentEnv, orderId: string) {
  return env.DB.prepare("SELECT json,email_status FROM order_events WHERE order_id=?").bind(orderId).first<EventRow>();
}
async function signature(env: DemoPaymentEnv, row: PaymentRow) {
  if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 32) throw new Error("Payment link secret missing");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.SYNC_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const data = encoder.encode(`aimo-demo-payment-v1\0${row.order_id}\0${row.created_at}\0${row.expires_at}\0${row.amount_net_cents}`);
  return { key, data };
}
async function linkToken(env: DemoPaymentEnv, row: PaymentRow) {
  const { key, data } = await signature(env, row);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function authenticate(request: Request, env: DemoPaymentEnv, row: PaymentRow) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return false;
  const bytes = Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/") + "="), c => c.charCodeAt(0));
  const { key, data } = await signature(env, row);
  return crypto.subtle.verify("HMAC", key, bytes, data);
}

/** True when the request carries this order's demo payment link capability. Other pages of the same order reuse it. */
export async function verifyDemoPaymentLink(env: DemoPaymentEnv, orderId: string, request: Request) {
  if (!ORDER_ID.test(orderId)) return false;
  const row = await paymentRow(env, orderId);
  return Boolean(row && await authenticate(request, env, row));
}

/** Call after storing the authenticated order event, before attempting e-mail delivery. */
export async function registerDemoPayment(env: DemoPaymentEnv, orderId: string, now = Date.now()) {
  if (!enabled(env)) return null;
  const event = await eventRow(env, orderId);
  if (!event) throw new Error("Order event missing");
  // Existing, already-sent confirmations are never retroactively put behind a payment gate.
  const existing = await paymentRow(env, orderId);
  if (existing || event.email_status === "sent") return existing;
  const order = (JSON.parse(event.json) as { order: PublicOrder }).order;
  if (order.orderId !== orderId || order.status !== "confirmed" || !Number.isFinite(order.net) || order.net === null || order.net < 0) {
    throw new Error("A confirmed order with a known total is required");
  }
  const cents = Math.round(order.net * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid amount");
  await env.DB.prepare(`INSERT INTO demo_payments(order_id,status,amount_net_cents,created_at,expires_at)
    VALUES(?,'pending',?,?,?) ON CONFLICT(order_id) DO NOTHING`).bind(orderId, cents, now, now + TTL).run();
  return paymentRow(env, orderId);
}

/** Existing gates stay in force even when new-session creation is disabled. */
export async function demoPaymentEmailAllowed(env: DemoPaymentEnv, orderId: string) {
  const row = await paymentRow(env, orderId);
  return !row || row.status === "paid";
}

/** Only attach to the intentionally public, synthetic demo order projection. */
export async function describeDemoPayment(env: DemoPaymentEnv, orderId: string, origin: string) {
  const row = await paymentRow(env, orderId);
  if (!row) return null;
  return { mode: "demo" as const, status: row.status, expiresAt: row.expires_at,
    url: `${origin}/demo-payment.html#${row.order_id}.${await linkToken(env, row)}` };
}

async function readAction(request: Request) {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let text = "", bytes = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 1024) { await reader.cancel(); return null; }
    text += decoder.decode(part.value, { stream: true });
  }
  try {
    const input = JSON.parse(text + decoder.decode());
    return input && Object.keys(input).length === 1 && ["success", "cancel"].includes(input.simulate) ? input.simulate : null;
  } catch { return null; }
}

/** Route before the Worker's final 404. Callback uses the existing idempotent e-mail sender. */
export async function handleDemoPayment(request: Request, env: DemoPaymentEnv, sendConfirmation: SendConfirmation, now = Date.now()): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const orderId = url.pathname.slice(PREFIX.length);
  if (!ORDER_ID.test(orderId)) return json({ error: "Demomaksua ei löydy." }, 404);
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Menetelmä ei ole sallittu." }, 405);
  try {
    const row = await paymentRow(env, orderId);
    if (!row || !await authenticate(request, env, row)) return json({ error: "Demomaksulinkki ei ole voimassa." }, 404);
    if (row.status !== "paid" && row.expires_at <= now) return json({ error: "Demomaksulinkki vanhentui. Ota yhteys demon ylläpitäjään." }, 410);
    const event = await eventRow(env, orderId);
    if (!event) return json({ error: "Tilausta ei löydy." }, 404);
    const order = (JSON.parse(event.json) as { order: PublicOrder }).order;
    if (request.method === "GET") {
      // The private recipient and customer name never leave order_events.
      return json({ mode: "demo", order, payment: { status: row.status, amountNetCents: row.amount_net_cents, currency: "EUR", paidAt: row.paid_at }, email: event.email_status });
    }
    if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ error: "Avaa maksusivu alkuperäisestä linkistä." }, 403);
    }
    const action = await readAction(request);
    if (!action) return json({ error: "Valitse demomaksun hyväksyminen tai keskeyttäminen." }, 400);
    if (action === "cancel") return json({ mode: "demo", status: row.status, email: event.email_status });
    // Retried, double-clicked, or concurrent successes preserve the original paid_at.
    await env.DB.prepare("UPDATE demo_payments SET status='paid',paid_at=? WHERE order_id=? AND status='pending' AND expires_at>?")
      .bind(now, orderId, now).run();
    const paid = await paymentRow(env, orderId);
    if (paid?.status !== "paid") return json({ error: "Demomaksulinkki vanhentui." }, 410);
    const email = await sendConfirmation(orderId);
    return json({ mode: "demo", status: "paid", paidAt: paid.paid_at, email });
  } catch {
    // Never log request URLs, capabilities, recipient addresses, or upstream mail errors.
    console.error(JSON.stringify({ event: "demo_payment_failed", orderId }));
    return json({ error: "Demomaksun käsittely ei onnistunut. Voit yrittää samaa toimintoa uudelleen." }, 503);
  }
}
