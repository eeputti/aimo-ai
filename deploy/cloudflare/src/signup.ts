// WhatsApp demo sign-up for the landing page (Meta test number phase).
// The browser posts a phone number and gets a status token and a one-time link code. The WhatsApp server
// machine polls the sign-ups with the publisher token, prepares an invitation for each code and reports the
// result. The number becomes a customer only when a WhatsApp message "YHDISTA <code>" arrives from that same
// number: the form alone never proves who owns a number (audit #14).
// The Worker never calls that machine. A sign-up's phone number is never returned to a browser.

export type SignupEnv = Pick<Env, "DB" | "SYNC_TOKEN">;
type Status = "pending" | "linked" | "ready" | "failed";
type Row = { id: string; token_hash: string; phone: string; name: string; company: string; status: Status; chat_url: string | null; meta_code: string | null; code_attempts: number;
  link_code: string | null; verified_at: number | null; created_at: number };

const PATH = "/api/signups";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUS_PATH = /^\/api\/signups\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/code)?$/;
export const CODE_ATTEMPTS = 5;
export const RETENTION_MS = 7 * 24 * 3600_000;
export const IP_WINDOW_MS = 3600_000;
export const IP_LIMIT = 5;
// One number can be tried only a few times an hour, so a stranger cannot flood someone else's number.
export const PHONE_WINDOW_MS = 3600_000;
export const PHONE_LIMIT = 3;
export const PENDING_LIMIT = 50;
// The link code works only from the number it was made for, so it may stay valid as long as the sign-up row.
export const LINK_CODE_TTL_MS = RETENTION_MS;
// No I, L, O, 0 or 1: the code is easy to read aloud and to type. 31 symbols, 8 of them.
export const LINK_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_COMMAND = "YHDISTA";
const MAX_BODY = 2048;
const DEFAULT_COMPANY = "Demokeittiö";
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const enc = new TextEncoder();

// Accepts +358 40 123 4567, 00358..., and a Finnish local 040... number. Returns digits without "+".
export function normalizePhone(value: unknown): string | null {
  let phone = String(value ?? "").replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  else if (/^0\d/.test(phone)) phone = "+358" + phone.slice(1);
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone.slice(1) : null;
}

// "abcd-efgh", "ABCD EFGH" and "ABCDEFGH" are the same code. The WhatsApp server uses the same rule.
export function normalizeLinkCode(value: unknown): string | null {
  const code = String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
  return /^[A-HJKMNP-Z2-9]{8}$/.test(code) ? code : null;
}
export const displayLinkCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
function newLinkCode() {
  let code = "";
  // Rejection sampling: 248 is the largest multiple of 31 below 256, so every symbol is equally likely.
  while (code.length < 8) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 248 && code.length < 8) code += LINK_ALPHABET[b % 31];
  return code;
}

function cleanText(value: unknown, max: number) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : null;
}

// Only links that open a WhatsApp chat are stored and shown to the browser.
export function validChatUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 400) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "wa.me" || url.hostname === "api.whatsapp.com") ? url.href : null;
  } catch { return null; }
}

// The chat link keeps the agreed first message and adds the link code on its own last line, so the very
// first message proves the number. Spaces stay %20: WhatsApp would show a "+" literally.
export function chatUrlWithCode(chatUrl: string | null, code: string | null) {
  if (!chatUrl || !code) return chatUrl;
  const url = new URL(chatUrl);
  const text = url.searchParams.get("text") || "";
  const params = [...url.searchParams].filter(([key]) => key !== "text").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  params.push(`text=${encodeURIComponent(`${text ? text + "\n" : ""}${LINK_COMMAND} ${displayLinkCode(code)}`)}`);
  url.search = "?" + params.join("&");
  return validChatUrl(url.href);
}

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function ipHash(env: SignupEnv, ip: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.SYNC_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`aimo-signup-ip-v1\0${ip}`)));
  return [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Same check as the order publisher routes: fixed-size HMACs compared through Web Crypto.
async function publisher(request: Request, env: SignupEnv) {
  const token = env.SYNC_TOKEN;
  if (!token || token.length < 32) return false;
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!supplied || supplied.length > 256) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return crypto.subtle.verify("HMAC", key, signature, enc.encode(supplied));
}

async function readJson(request: Request) {
  if (!/^application\/json\b/.test(request.headers.get("content-type") || "")) throw new Error("type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error("size"); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(body));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
  return value as Record<string, unknown>;
}

// The code belongs to this browser's own sign-up; once the number is verified it is no longer needed.
function view(row: Pick<Row, "id" | "status" | "chat_url"> & { meta_code?: string | null; link_code?: string | null; verified_at?: number | null }) {
  const verified = !!row.verified_at;
  const code = !verified && row.link_code ? row.link_code : null;
  return { id: row.id, status: row.status, chatUrl: row.status === "ready" ? chatUrlWithCode(row.chat_url, code) : null,
    codeSent: row.status === "linked" && !!row.meta_code, verified, linkCode: code ? displayLinkCode(code) : null };
}

// "+358 50 123 4567" for a Finnish mobile number, otherwise "+" and the digits as they are.
export function displayPhone(digits: string) {
  const fi = /^358(\d{2})(\d{3})(\d{3,4})$/.exec(digits);
  return fi ? `+358 ${fi[1]} ${fi[2]} ${fi[3]}` : "+" + digits;
}

// While a number waits for Meta's manual approval the page offers a short call to the presenter.
// The number lives only in the live database (landing_settings), and only a person who has just
// signed up sees it. A missing table or a malformed value simply hides the call button.
async function presenterCall(env: SignupEnv, status: Status) {
  if (status !== "pending" && status !== "linked") return {};
  try {
    const row = await env.DB.prepare("SELECT value FROM landing_settings WHERE key='presenter_phone'").first<{ value: string }>();
    const digits = row ? normalizePhone("+" + String(row.value).replace(/^\+/, "")) : null;
    return digits ? { call: { tel: "+" + digits, display: displayPhone(digits) } } : {};
  } catch { return {}; }
}

async function create(request: Request, env: SignupEnv, url: URL, now: number) {
  // A sign-up comes only from this site's own page, never from a cross-site form or script.
  if (request.headers.get("origin") !== url.origin) return json({ error: "Lomake lähetetään vain tältä sivulta." }, 403);
  let body;
  try { body = await readJson(request); } catch { return json({ error: "Virheellinen lomake." }, 400); }
  const phone = normalizePhone(body.phone);
  if (!phone) return json({ error: "Anna puhelinnumero muodossa +358 40 123 4567.", field: "phone" }, 400);
  const name = cleanText(body.name, 60);
  if (!name) return json({ error: "Kerro nimesi.", field: "name" }, 400);
  const company = cleanText(body.company, 80);
  if (company === null) return json({ error: "Yrityksen nimi on liian pitkä.", field: "company" }, 400);
  if (body.consent !== true) return json({ error: "Hyväksy numerosi käyttö tässä demossa.", field: "consent" }, 400);
  if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 32) return json({ error: "Ilmoittautuminen ei ole vielä käytössä." }, 503);

  await env.DB.prepare("DELETE FROM signups WHERE created_at<?").bind(now - RETENTION_MS).run();
  const ip = await ipHash(env, request.headers.get("cf-connecting-ip") || "unknown");

  // A number that is already approved opens WhatsApp at once; one that is linked keeps waiting for approval.
  const known = await env.DB.prepare(`SELECT status,chat_url FROM signups WHERE phone=? AND status IN ('ready','linked')
    ORDER BY CASE status WHEN 'ready' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`).bind(phone).first<{ status: Status; chat_url: string | null }>();
  // A number that has already sent its code from WhatsApp needs no new code.
  const verifiedAt = (await env.DB.prepare("SELECT max(verified_at) AS v FROM signups WHERE phone=?").bind(phone).first<{ v: number | null }>())?.v ?? null;
  const status: Status = known?.status === "ready" && known.chat_url ? "ready" : known ? "linked" : "pending";
  const chatUrl = status === "ready" ? known!.chat_url : null;
  const id = crypto.randomUUID();
  const token = randomToken();
  const code = verifiedAt ? null : newLinkCode();
  // The limits are checked inside the same statement that adds the row: parallel requests cannot all pass
  // a count taken before any of them was written (audit #14).
  const inserted = await env.DB.prepare(`INSERT INTO signups(id,token_hash,phone,name,company,status,chat_url,ip_hash,link_code,link_hash,link_expires,verified_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE (SELECT count(*) FROM signups WHERE ip_hash=? AND created_at>=?) < ?
      AND (SELECT count(*) FROM signups WHERE phone=? AND created_at>=?) < ?
      AND (SELECT count(*) FROM signups WHERE status='pending') < ?`)
    .bind(id, await sha256(token), phone, name, company || DEFAULT_COMPANY, status, chatUrl, ip,
      code, code ? await sha256(code) : null, code ? now + LINK_CODE_TTL_MS : null, verifiedAt, now, now,
      ip, now - IP_WINDOW_MS, IP_LIMIT, phone, now - PHONE_WINDOW_MS, PHONE_LIMIT, PENDING_LIMIT).run();
  if (!inserted.meta.changes) {
    const waiting = await env.DB.prepare("SELECT count(*) AS n FROM signups WHERE status='pending'").first<{ n: number }>();
    const recent = await env.DB.prepare("SELECT count(*) AS n FROM signups WHERE ip_hash=? AND created_at>=?").bind(ip, now - IP_WINDOW_MS).first<{ n: number }>();
    if ((waiting?.n || 0) >= PENDING_LIMIT && (recent?.n || 0) < IP_LIMIT) return json({ error: "Demo on juuri nyt täynnä. Yritä myöhemmin uudelleen." }, 503);
    // The same answer for the address limit and the number limit: the page does not reveal who tried a number.
    return json({ error: "Liian monta ilmoittautumista. Yritä hetken päästä uudelleen." }, 429);
  }
  return json({ ...view({ id, status, chat_url: chatUrl, link_code: code, verified_at: verifiedAt }), ...await presenterCall(env, status), token }, 201);
}

// The same answer for an unknown id and a wrong token: the routes do not reveal which sign-ups exist.
async function own(request: Request, env: SignupEnv, id: string) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "")?.[1];
  const row = token ? await env.DB.prepare("SELECT id,token_hash,status,chat_url,meta_code,code_attempts,link_code,verified_at FROM signups WHERE id=?").bind(id).first<Row>() : null;
  return row && row.token_hash === await sha256(token!) ? row : null;
}
const notFound = () => json({ error: "Ilmoittautumista ei löytynyt." }, 404);

async function status(request: Request, env: SignupEnv, id: string) {
  const row = await own(request, env, id);
  return row ? json({ ...view(row), ...await presenterCall(env, row.status) }) : notFound();
}

// Meta sends its test-recipient code to the number only after the presenter adds it in Meta. The person
// types it here and the presenter's machine shows it, so nobody has to pass it on by phone.
async function code(request: Request, env: SignupEnv, url: URL, id: string, now: number) {
  if (request.headers.get("origin") !== url.origin) return json({ error: "Koodi lähetetään vain tältä sivulta." }, 403);
  const row = await own(request, env, id);
  if (!row) return notFound();
  if (row.status !== "linked") return json({ error: row.status === "ready" ? "Numerosi on jo hyväksytty." : "Odota, että numerosi on lisätty apuriin." }, 409);
  if (row.code_attempts >= CODE_ATTEMPTS) return json({ error: "Liian monta yritystä. Kerro koodi Aimo-tiimille." }, 429);
  let body;
  try { body = await readJson(request); } catch { return json({ error: "Virheellinen koodi." }, 400); }
  const digits = String(body.code ?? "").replace(/[\s-]/g, "");
  if (!/^\d{4,8}$/.test(digits)) return json({ error: "Kirjoita WhatsAppiin tullut numerokoodi.", field: "code" }, 400);
  await env.DB.prepare("UPDATE signups SET meta_code=?,code_at=?,code_attempts=code_attempts+1,updated_at=? WHERE id=? AND status='linked'")
    .bind(digits, now, now, id).run();
  return json({ ...view({ ...row, meta_code: digits }), ...await presenterCall(env, row.status) });
}

async function list(request: Request, env: SignupEnv, url: URL) {
  if (!await publisher(request, env)) return json({ error: "Ei julkaisuoikeutta." }, 401);
  const wanted = url.searchParams.get("status") || "pending";
  if (!["pending", "linked", "ready", "failed"].includes(wanted)) return json({ error: "Tuntematon tila." }, 400);
  // One row per number. The name is the first sign-up's, so a later sign-up of the same number cannot rename
  // it in the presenter's list; "signups" and "codeSignups" show when several browsers used the same number.
  // Newest first, so old leftover rows cannot hide new sign-ups behind the limit.
  const rows = await env.DB.prepare(`SELECT s.phone,s.status,max(s.created_at) AS created_at,count(*) AS signups,max(s.verified_at) AS verified_at,
    (SELECT f.name FROM signups f WHERE f.phone=s.phone AND f.status=s.status ORDER BY f.created_at,f.id LIMIT 1) AS name,
    (SELECT f.company FROM signups f WHERE f.phone=s.phone AND f.status=s.status ORDER BY f.created_at,f.id LIMIT 1) AS company,
    (SELECT c.meta_code FROM signups c WHERE c.phone=s.phone AND c.status='linked' AND c.meta_code IS NOT NULL ORDER BY c.code_at DESC LIMIT 1) AS code,
    (SELECT max(c.code_at) FROM signups c WHERE c.phone=s.phone AND c.status='linked') AS code_at,
    (SELECT count(*) FROM signups c WHERE c.phone=s.phone AND c.status='linked' AND c.meta_code IS NOT NULL) AS code_signups
    FROM signups s WHERE s.status=? GROUP BY s.phone ORDER BY created_at DESC LIMIT 100`).bind(wanted)
    .all<{ phone: string; name: string; company: string; status: Status; created_at: number; signups: number; verified_at: number | null; code: string | null; code_at: number | null; code_signups: number }>();
  return json({ signups: (rows.results || []).map(r => ({ phone: "+" + r.phone, name: r.name, company: r.company, status: r.status, createdAt: r.created_at,
    signups: r.signups, verified: !!r.verified_at,
    ...(r.status === "linked" && r.code ? { code: r.code, codeAt: r.code_at, codeSignups: r.code_signups } : {}) })) });
}

// Link codes the WhatsApp machine has not turned into invitations yet. Only the code's hash leaves the Worker;
// the machine stores it and accepts "YHDISTA <code>" only from the same number.
async function invites(request: Request, env: SignupEnv, now: number) {
  if (!await publisher(request, env)) return json({ error: "Ei julkaisuoikeutta." }, 401);
  const rows = await env.DB.prepare(`SELECT id,phone,name,company,link_hash,link_expires,created_at FROM signups
    WHERE invited_at IS NULL AND verified_at IS NULL AND link_hash IS NOT NULL AND link_expires>? AND status<>'failed'
    ORDER BY created_at LIMIT 100`).bind(now)
    .all<{ id: string; phone: string; name: string; company: string; link_hash: string; link_expires: number; created_at: number }>();
  return json({ invites: (rows.results || []).map(r => ({ id: r.id, phone: "+" + r.phone, name: r.name, company: r.company,
    codeHash: r.link_hash, expiresAt: r.link_expires, createdAt: r.created_at })) });
}

async function invited(request: Request, env: SignupEnv, now: number) {
  if (!await publisher(request, env)) return json({ error: "Ei julkaisuoikeutta." }, 401);
  let body;
  try { body = await readJson(request); } catch { return json({ error: "Virheellinen pyyntö." }, 400); }
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
  if (!ids.length || ids.length > 100 || ids.length !== (body.ids as unknown[]).length) return json({ error: "Virheelliset tunnisteet." }, 400);
  const changed = await env.DB.prepare(`UPDATE signups SET invited_at=?,updated_at=? WHERE invited_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(now, now, ...ids).run();
  return json({ ok: true, updated: changed.meta.changes });
}

async function result(request: Request, env: SignupEnv, now: number) {
  if (!await publisher(request, env)) return json({ error: "Ei julkaisuoikeutta." }, 401);
  let body;
  try { body = await readJson(request); } catch { return json({ error: "Virheellinen pyyntö." }, 400); }
  // The WhatsApp machine stores numbers as bare international digits.
  const phone = normalizePhone(/^[1-9]\d+$/.test(String(body.phone)) ? "+" + body.phone : body.phone);
  if (!phone) return json({ error: "Virheellinen numero." }, 400);
  if (body.status === "removed") {
    const removed = await env.DB.prepare("DELETE FROM signups WHERE phone=?").bind(phone).run();
    return json({ ok: true, updated: removed.meta.changes });
  }
  // Linked never undoes an approval and a failure only ends a sign-up that is still waiting.
  // Verified: the number sent its link code from WhatsApp. The code is no longer needed anywhere.
  if (body.status === "verified") {
    const verified = await env.DB.prepare("UPDATE signups SET verified_at=?,link_code=NULL,link_hash=NULL,updated_at=? WHERE phone=? AND verified_at IS NULL").bind(now, now, phone).run();
    return json({ ok: true, updated: verified.meta.changes });
  }
  const statements: Record<string, string> = {
    ready: "UPDATE signups SET status='ready',chat_url=?,meta_code=NULL,updated_at=? WHERE phone=?",
    linked: "UPDATE signups SET status='linked',chat_url=NULL,updated_at=? WHERE phone=? AND status IN ('pending','failed')",
    failed: "UPDATE signups SET status='failed',chat_url=NULL,updated_at=? WHERE phone=? AND status='pending'",
  };
  const sql = typeof body.status === "string" ? statements[body.status] : undefined;
  if (!sql) return json({ error: "Tuntematon tila." }, 400);
  let update;
  if (body.status === "ready") {
    const chatUrl = validChatUrl(body.chatUrl);
    if (!chatUrl) return json({ error: "WhatsApp-linkki puuttuu tai on virheellinen." }, 400);
    update = env.DB.prepare(sql).bind(chatUrl, now, phone);
  } else update = env.DB.prepare(sql).bind(now, phone);
  const changed = await update.run();
  return json({ ok: true, updated: changed.meta.changes });
}

export async function handleSignup(request: Request, env: SignupEnv, now = Date.now()): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PATH)) return null;
  try {
    if (url.pathname === PATH && request.method === "POST") return await create(request, env, url, now);
    if (url.pathname === PATH && request.method === "GET") return await list(request, env, url);
    if (url.pathname === PATH + "/result" && request.method === "POST") return await result(request, env, now);
    if (url.pathname === PATH + "/invites" && request.method === "GET") return await invites(request, env, now);
    if (url.pathname === PATH + "/invites" && request.method === "POST") return await invited(request, env, now);
    const match = STATUS_PATH.exec(url.pathname);
    if (match && !match[2] && request.method === "GET") return await status(request, env, match[1]);
    if (match && match[2] && request.method === "POST") return await code(request, env, url, match[1], now);
  } catch {
    // Never log the phone number or the request body.
    console.error(JSON.stringify({ event: "signup_failed", path: url.pathname.startsWith(PATH + "/") ? "status" : "collection" }));
    return json({ error: "Ilmoittautumista valmistellaan. Yritä hetken päästä uudelleen." }, 503);
  }
  return json({ error: "Reittiä ei ole." }, 404);
}
