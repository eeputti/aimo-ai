// E-mail confirmed demo orders: review e-mail -> confirmation page -> (button press) gateway order -> confirmed e-mail.
//
// Safety rules implemented here:
//  - Only the POST in confirm() can place an order. view() is read-only, so link previews, scanners and GET requests never order.
//  - The link token is 256 random bits; only its SHA-256 hash is stored, so a database copy does not reveal usable links.
//  - Orders are placed through prepareCheckout/confirmCheckout, i.e. the gateway's signed offers, mandate checks and idempotency.
//    The review record keeps the same checkout token across retries, so retrying never creates a second order.
//  - Both e-mails are sent with a Resend Idempotency-Key and the confirmed e-mail is only marked sent once, so retries do not duplicate it.
//  - Recipient addresses and the API key are never logged.
import crypto from 'node:crypto';
import { kv } from './db.mjs';
import { clock, parseApiTime } from './gateway/clock.mjs';
import { prepareCheckout, confirmCheckout, checkoutStatus } from './storefront-checkout.mjs';
import { orderMailer } from './order-email.mjs';
import { renderReviewEmail, renderConfirmedEmail, summarize } from './order-email-templates.mjs';

const LINK_TTL_MS = 24 * 3_600_000; // the link also ends at the earliest ordering deadline of the products
const MIN_TTL_MS = 10 * 60_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;
const PER_RECIPIENT = { limit: 3, windowMs: 3_600_000 }; // e-mails actually sent
const ATTEMPTS = { limit: 10, windowMs: 3_600_000 }; // requests per recipient, including ones rejected before sending
const GLOBAL = { limit: 100, windowMs: 3_600_000 };
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const keyOf = (hash) => `order-email.${hash}`;
const fpKey = (fp) => `order-email.fp.${fp}`;

export function validateEmail(raw) {
  const email = typeof raw === 'string' ? raw.trim() : '';
  const [local = '', domain = ''] = email.split('@');
  if (!email || email.length > 254 || local.length > 64 || /[\s,;<>"'\\()[\]\u0000-\u001f]/.test(email) || !/^[^@]+@[^@]+\.[^@.]{2,}$/.test(email) || domain.startsWith('.') || domain.includes('..')) fail(400, 'Anna kelvollinen sähköpostiosoite.');
  return email;
}

function sameOrder(draft, summary) {
  return draft.deliveryDate === summary.deliveryDate && draft.lines.length === summary.lines.length
    && summary.lines.every((s) => { const l = draft.lines.find((x) => String(x.productId) === s.productId); return l && l.quantity === s.quantity && Math.abs(l.unitPriceNet - s.unitPriceNet) < .004 && l.vatRate === s.vatRate; })
    && Math.abs(draft.totals.gross - summary.totals.gross) < .01;
}

export function createOrderEmailFlow({ mailer = orderMailer, store = kv, prepare = prepareCheckout, place = confirmCheckout, checkout = checkoutStatus, now = () => clock.now().getTime() } = {}) {
  const hits = new Map();
  const requests = new Map(); // fingerprint -> pending request promise (double clicks)
  const confirming = new Map(); // token hash -> pending confirmation promise
  const recent = (key, { windowMs }) => { const t = Date.now(); const list = (hits.get(key) || []).filter((x) => t - x < windowMs); hits.set(key, list); return list; };
  const hasRoom = (key, cfg) => recent(key, cfg).length < cfg.limit;
  const record = (key, cfg) => recent(key, cfg).push(Date.now());
  const load = (hash) => store.get(keyOf(hash));
  const save = (hash, rec) => store.set(keyOf(hash), rec);
  const logoUrl = () => mailer.assetUrl('aimo-logo.png');

  async function createReview({ email, input, fp }) {
    const existing = store.get(fpKey(fp));
    const old = existing?.hash ? load(existing.hash) : null;
    const t = now();
    if (old?.status === 'pending' && old.emails.review === 'sent' && t < old.expiresAt && t - old.createdAt < DUPLICATE_WINDOW_MS) return { sent: true, duplicate: true, expiresAt: new Date(old.expiresAt).toISOString() };
    const who = sha(email.toLowerCase());
    if (!hasRoom(`to:${who}`, PER_RECIPIENT) || !hasRoom('all', GLOBAL) || !hasRoom(`try:${who}`, ATTEMPTS)) fail(429, 'Liian monta sähköpostipyyntöä. Yritä myöhemmin uudelleen.');
    record(`try:${who}`, ATTEMPTS);
    const draft = await prepare(input); // validates the cart and quotes it through the gateway
    const closing = draft.lines.map((l) => l.closingTime && parseApiTime(l.closingTime)?.getTime()).filter(Number.isFinite);
    const expiresAt = Math.min(t + LINK_TTL_MS, ...closing);
    if (expiresAt - t < MIN_TTL_MS) fail(409, 'Tilausaikaraja umpeutuu pian. Tilaa suoraan tai valitse myöhäisempi toimituspäivä.');
    const token = crypto.randomBytes(32).toString('base64url'); const hash = sha(token);
    const summary = summarize({ lines: draft.lines, totals: draft.totals, deliveryDate: draft.deliveryDate, reference: input.reference });
    const rec = { v: 1, id: hash.slice(0, 32), status: 'pending', createdAt: t, expiresAt, email, fingerprint: fp, input: { deliveryDate: input.deliveryDate, reference: summary.reference, lines: input.lines.map((l) => ({ id: l.id, qty: l.qty, price: l.price, vat: l.vat })) }, summary, checkoutToken: null, orderId: null, orderSummary: null, emails: { review: 'unsent', confirmed: 'pending' } };
    save(hash, rec); // persisted before sending, so a link that reached the customer always has a record
    record(`to:${who}`, PER_RECIPIENT); record('all', GLOBAL);
    try {
      const message = renderReviewEmail({ summary, confirmUrl: mailer.confirmUrl(token), expiresAtMs: expiresAt, logoUrl: logoUrl() });
      await mailer.send({ to: email, ...message, idempotencyKey: `order-review-${rec.id}` });
    } catch (err) {
      rec.status = 'failed'; rec.email = null; save(hash, rec); // the customer never got a link: retrying starts clean
      throw err.status === 503 ? err : Object.assign(new Error('Sähköpostin lähetys epäonnistui. Yritä hetken kuluttua uudelleen.'), { status: 502 });
    }
    rec.emails.review = 'sent'; save(hash, rec);
    store.set(fpKey(fp), { hash });
    if (old?.status === 'pending' && existing.hash !== hash) { old.status = 'superseded'; old.email = null; save(existing.hash, old); } // the older link is replaced by the new one
    return { sent: true, duplicate: false, expiresAt: new Date(expiresAt).toISOString() };
  }

  function viewOf(rec) {
    if (!rec) return { state: 'invalid' };
    if (rec.status === 'confirmed') return { state: 'confirmed', order: rec.orderSummary, emailSent: rec.emails.confirmed === 'sent' };
    if (rec.status === 'stale') return { state: 'changed' };
    if (rec.status !== 'pending' || now() >= rec.expiresAt) return { state: 'expired' };
    return { state: 'pending', summary: rec.summary, expiresAt: rec.expiresAt };
  }
  const recordFor = (token) => { if (typeof token !== 'string' || !TOKEN.test(token)) return null; const hash = sha(token); const rec = load(hash); return rec ? { hash, rec } : null; };

  async function sendConfirmed(hash) {
    const rec = load(hash);
    if (rec.emails.confirmed === 'sent') return true;
    if (!rec.email) return false;
    try {
      const message = renderConfirmedEmail({ order: rec.orderSummary, logoUrl: logoUrl() });
      await mailer.send({ to: rec.email, ...message, idempotencyKey: `order-confirmed-${rec.orderSummary.orderId}` });
    } catch { return false; } // the order stays recorded; pressing the button again retries only the e-mail
    rec.emails.confirmed = 'sent'; rec.email = null; save(hash, rec);
    return true;
  }

  async function confirmNow(hash) {
    let rec = load(hash);
    if (rec.status === 'confirmed') return { state: 'confirmed', order: rec.orderSummary, emailSent: await sendConfirmed(hash) };
    const current = viewOf(rec);
    if (current.state !== 'pending') return current;
    let result;
    try {
      let token = rec.checkoutToken;
      if (!token || !['ready', 'placed'].includes(checkout(token))) {
        const draft = await prepare(rec.input);
        if (!sameOrder(draft, rec.summary)) { rec.status = 'stale'; rec.email = null; save(hash, rec); return { state: 'changed' }; }
        token = rec.checkoutToken = draft.token; save(hash, rec); // kept: a retry reuses this token, so the gateway's idempotency applies
      }
      result = await place(token);
    } catch (err) {
      if ([400, 409].includes(err.status) && !rec.checkoutToken) { rec.status = 'stale'; rec.email = null; save(hash, rec); return { state: 'changed' }; }
      console.error('[order-email] confirmation failed', err.status || err.code || 'error');
      return { state: err.status === 409 ? 'changed' : 'unavailable' };
    }
    const o = result.order;
    rec = load(hash);
    rec.status = 'confirmed'; rec.orderId = o.orderId;
    rec.orderSummary = { ...summarize({ lines: o.lines, totals: o.totals, deliveryDate: o.deliveryDate, reference: o.buyerReference }), orderId: o.orderId, placedAtMs: Date.parse(o.createdAt) || now() };
    save(hash, rec);
    return { state: 'confirmed', order: rec.orderSummary, emailSent: await sendConfirmed(hash) };
  }

  return {
    /** Sends the review e-mail. Never places an order. */
    async request(input) {
      if (!mailer.configured()) fail(503, 'Sähköpostin lähetystä ei ole määritetty palvelimelle.');
      if (!input || typeof input !== 'object' || !Array.isArray(input.lines)) fail(400, 'Tarkista ostoskori.');
      const email = validateEmail(input.email);
      const cart = { deliveryDate: input.deliveryDate, reference: typeof input.reference === 'string' ? input.reference.slice(0, 100) : '', lines: input.lines };
      const fp = sha(JSON.stringify([email.toLowerCase(), cart.deliveryDate, cart.reference, input.lines.map((l) => [String(l?.id), Number(l?.qty)]).sort()]));
      if (requests.has(fp)) return requests.get(fp);
      const work = createReview({ email, input: cart, fp }).finally(() => requests.delete(fp));
      requests.set(fp, work);
      return work;
    },
    /** Read-only: what the confirmation page shows. */
    view(token) { const f = recordFor(token); return f ? viewOf(f.rec) : { state: 'invalid' }; },
    /** The only entry point that can place the order. Safe to call repeatedly and concurrently. */
    confirm(token) {
      const f = recordFor(token); if (!f) return Promise.resolve({ state: 'invalid' });
      if (confirming.has(f.hash)) return confirming.get(f.hash);
      const work = confirmNow(f.hash).finally(() => confirming.delete(f.hash));
      confirming.set(f.hash, work);
      return work;
    },
  };
}
export const orderEmailFlow = createOrderEmailFlow();
