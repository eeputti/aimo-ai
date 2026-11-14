import { MAX_BODY_BYTES, parseSnapshot } from "./protocol.ts";

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
    if (url.pathname === "/healthz" && request.method === "GET") return json({ ok: true, mode: "public-order-demo", readOnly: true });
    if (url.pathname === "/api/orders" && request.method === "GET") {
      try {
        const row = await env.DB.prepare("SELECT received_at, json FROM demo_snapshot WHERE id=1").first<{ received_at: number; json: string }>();
        return json(row ? { ...JSON.parse(row.json), receivedAt: row.received_at, serverTime: Date.now() } : { orders: [], totalOrders: 0, receivedAt: null, serverTime: Date.now() });
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
    // Static Assets serves the site. No gateway, pairing, approval or chat write route is exposed.
    return json({ error: "Reittiä ei ole." }, 404);
  },
} satisfies ExportedHandler<Env>;
