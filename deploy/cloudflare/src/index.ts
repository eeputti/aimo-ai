import { MAX_BODY_BYTES, parseSnapshot } from "./protocol.ts";
import { parseOrderEvent } from "./order-event.ts";
import { renderOrderEmail } from "./email.ts";
import { registerDemoPayment, demoPaymentEmailAllowed, describeDemoPayment, handleDemoPayment } from "./demo-payment.ts";

// A sender is optional: without one orders are stored and e-mail waits. Either the Cloudflare
// send_email binding EMAIL with ORDER_EMAIL_FROM (needs an onboarded domain), or RESEND_API_KEY.
// Resend without ORDER_EMAIL_FROM uses its test sender, which only delivers to the Resend account's own address.
type OrderEnv = Env & { EMAIL?: SendEmail; ORDER_EMAIL_FROM?: string; RESEND_API_KEY?: string; DEMO_PAYMENTS_ENABLED?: string };
type Mail = { from: string; to: string; subject: string; html: string; text: string };
export const MAX_EMAIL_ATTEMPTS = 3;
export const RESEND_TEST_FROM = "Aimo tilausapuri <onboarding@resend.dev>";
const SEND_LEASE_MS = 60000;

async function sendViaResend(apiKey: string, mail: Mail, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // Resend drops a repeated request with the same key, which narrows the double-send window after a lost D1 update.
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(mail),
  });
  if (!response.ok) throw new Error(`resend ${response.status}`);
  const body = await response.json().catch(() => null) as { id?: string } | null;
  return { messageId: body?.id || "" };
}

function mailSender(env: OrderEnv) {
  if (env.EMAIL && env.ORDER_EMAIL_FROM) {
    const binding = env.EMAIL;
    return { from: env.ORDER_EMAIL_FROM, send: (mail: Mail) => binding.send(mail) };
  }
  if (env.RESEND_API_KEY) {
    const key = env.RESEND_API_KEY;
    return { from: env.ORDER_EMAIL_FROM || RESEND_TEST_FROM, send: (mail: Mail, orderId: string) => sendViaResend(key, mail, `order-confirmation/${orderId}`) };
  }
  return null;
}

async function deliverEmail(env: OrderEnv, orderId: string, origin: string) {
  const row = await env.DB.prepare("SELECT json,email_to,email_status FROM order_events WHERE order_id=?").bind(orderId)
    .first<{ json: string; email_to: string | null; email_status: string }>();
  if (!row) throw new Error("missing");
  if (["sent", "not_requested", "failed"].includes(row.email_status)) return row.email_status;
  if (!await demoPaymentEmailAllowed(env, orderId)) return "awaiting_demo_payment";
  const sender = mailSender(env);
  if (!sender) {
    await env.DB.prepare("UPDATE order_events SET email_status='sender_missing',email_updated_at=? WHERE order_id=? AND email_status IN ('pending','sender_missing')").bind(Date.now(), orderId).run();
    return "sender_missing";
  }
  const now = Date.now();
  // Claim the send so two concurrent retries of the same order cannot both send.
  const claim = await env.DB.prepare(`UPDATE order_events SET email_status='sending',email_attempts=email_attempts+1,email_updated_at=?
    WHERE order_id=? AND email_attempts<? AND (email_status IN ('pending','sender_missing','retry') OR (email_status='sending' AND email_updated_at<?))`)
    .bind(now, orderId, MAX_EMAIL_ATTEMPTS, now - SEND_LEASE_MS).run();
  if (claim.meta.changes === 0) return row.email_status === "sending" ? "sending" : "failed";
  const event = JSON.parse(row.json);
  const mail = renderOrderEmail(event.order, event.email.customerName, origin);
  try {
    const result = await sender.send({ from: sender.from, to: row.email_to!, subject: mail.subject, html: mail.html, text: mail.text }, orderId);
    await env.DB.prepare("UPDATE order_events SET email_status='sent',email_updated_at=?,email_message_id=? WHERE order_id=?").bind(Date.now(), String(result?.messageId || ""), orderId).run();
    return "sent";
  } catch {
    // Never log the recipient or upstream error body.
    console.error(JSON.stringify({ event: "order_email_failed", orderId }));
    await env.DB.prepare(`UPDATE order_events SET email_status=CASE WHEN email_attempts>=? THEN 'failed' ELSE 'retry' END,email_updated_at=? WHERE order_id=?`)
      .bind(MAX_EMAIL_ATTEMPTS, Date.now(), orderId).run();
    const after = await env.DB.prepare("SELECT email_status FROM order_events WHERE order_id=?").bind(orderId).first<{ email_status: string }>();
    return after?.email_status || "retry";
  }
}

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

async function authorized(request: Request, token: string) {
  if (!token || token.length < 32) return false;
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!supplied || supplied.length > 256) return false;
  // Compare fixed-size HMACs through Web Crypto, without an early-exit string comparison.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return crypto.subtle.verify("HMAC", key, signature, enc.encode(supplied));
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Tyhjä pyyntö.");
  let bytes = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("Liian suuri pyyntö."); }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") return json({ ok: true, mode: "public-order-demo", readOnly: false, demoPayments: true });
    if (url.pathname === "/api/orders" && request.method === "GET") {
      try {
        const row = await env.DB.prepare("SELECT received_at, json FROM demo_snapshot WHERE id=1").first<{ received_at: number; json: string }>();
        if (!row) return json({ orders: [], totalOrders: 0, receivedAt: null, serverTime: Date.now() });
        const snapshot = JSON.parse(row.json);
        const orders = await Promise.all(snapshot.orders.map(async (order: { orderId: string }) => {
          const demoPayment = await describeDemoPayment(env, order.orderId, url.origin);
          return demoPayment ? { ...order, demoPayment } : order;
        }));
        return json({ ...snapshot, orders, receivedAt: row.received_at, serverTime: Date.now() });
      } catch { return json({ error: "Tilausyhteyttä valmistellaan." }, 503); }
    }
    if (url.pathname === "/api/sync" && request.method === "POST") {
      if (!(await authorized(request, env.SYNC_TOKEN))) return json({ error: "Ei julkaisuoikeutta." }, 401);
      if (!/^application\/json\b/.test(request.headers.get("content-type") || "")) return json({ error: "JSON vaaditaan." }, 415);
      let snapshot;
      try { snapshot = parseSnapshot(await readBody(request)); }
      catch { return json({ error: "Virheellinen tilannekuva." }, 400); }
      try {
        const result = await env.DB.prepare(`INSERT INTO demo_snapshot(id,observed_at,received_at,json) VALUES(1,?,?,?)
          ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,received_at=excluded.received_at,json=excluded.json
          WHERE excluded.observed_at > demo_snapshot.observed_at`)
          .bind(snapshot.observedAt, Date.now(), JSON.stringify(snapshot)).run();
        return json({ ok: true, updated: result.meta.changes > 0, orders: snapshot.orders.length });
      } catch { console.error(JSON.stringify({ event: "snapshot_write_failed" })); return json({ error: "Tallennus ei onnistunut." }, 503); }
    }
    if (url.pathname === "/api/order-events" && request.method === "POST") {
      if (!(await authorized(request, env.SYNC_TOKEN))) return json({ error: "Ei julkaisuoikeutta." }, 401);
      if (!/^application\/json\b/.test(request.headers.get("content-type") || "")) return json({ error: "JSON vaaditaan." }, 415);
      let event;
      try { event = parseOrderEvent(await readBody(request)); }
      catch { return json({ error: "Virheellinen tilaustapahtuma." }, 400); }
      try {
        const now = Date.now();
        const inserted = await env.DB.prepare(`INSERT INTO order_events(order_id,received_at,json,email_to,email_status,email_updated_at)
          VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO NOTHING`)
          .bind(event.order.orderId, now, JSON.stringify(event), event.email.to, event.email.to ? "pending" : "not_requested", now).run();
        await registerDemoPayment(env as OrderEnv, event.order.orderId);
        const email = await deliverEmail(env as OrderEnv, event.order.orderId, url.origin);
        return json({ ok: true, orderId: event.order.orderId, duplicate: inserted.meta.changes === 0, email });
      } catch { console.error(JSON.stringify({ event: "order_event_write_failed" })); return json({ error: "Tallennus ei onnistunut." }, 503); }
    }
    const payment = await handleDemoPayment(request, env as OrderEnv, orderId => deliverEmail(env as OrderEnv, orderId, url.origin));
    if (payment) return payment;
    // Payment actions only simulate a payment. Publishing order events still needs the server's token.
    return json({ error: "Reittiä ei ole." }, 404);
  },
} satisfies ExportedHandler<Env>;
