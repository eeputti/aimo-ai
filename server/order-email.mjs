// Server-side order e-mail delivery through Resend's Email API (https://resend.com/docs/api-reference/emails/send-email).
// Settings come from the server environment only. Neither the API key nor recipient addresses are ever logged.
const RESEND_URL = 'https://api.resend.com/emails';
const SETTINGS = ['RESEND_API_KEY', 'ORDER_EMAIL_FROM', 'ORDER_EMAIL_PUBLIC_URL'];
const ADDRESS = '[^\\s<>@,;"\\\\]+@[^\\s<>@,;"\\\\]+\\.[A-Za-z]{2,}';
const FROM = new RegExp(`^(?:[^<>\\r\\n@]{1,100}<${ADDRESS}>|${ADDRESS})$`);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Reads and validates the three settings. Reports only the variable names, never their values. */
export function readEmailConfig(env = process.env) {
  const value = (k) => String(env[k] ?? '').trim();
  const missing = SETTINGS.filter((k) => !value(k));
  if (missing.length) return { ok: false, missing, invalid: [] };
  const invalid = [];
  if (/[\r\n]/.test(value('RESEND_API_KEY'))) invalid.push('RESEND_API_KEY');
  if (!FROM.test(value('ORDER_EMAIL_FROM'))) invalid.push('ORDER_EMAIL_FROM');
  let baseUrl = '';
  try {
    const u = new URL(value('ORDER_EMAIL_PUBLIC_URL'));
    const local = LOCAL_HOSTS.has(u.hostname);
    if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) || u.username || u.password || u.search || u.hash) invalid.push('ORDER_EMAIL_PUBLIC_URL');
    else baseUrl = u.origin + u.pathname.replace(/\/+$/, '');
  } catch { invalid.push('ORDER_EMAIL_PUBLIC_URL'); }
  if (invalid.length) return { ok: false, missing: [], invalid };
  return { ok: true, apiKey: value('RESEND_API_KEY'), from: value('ORDER_EMAIL_FROM'), baseUrl };
}

const sendError = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createOrderMailer({ env = process.env, fetchImpl = (...args) => fetch(...args) } = {}) {
  const config = () => readEmailConfig(env);
  return {
    config,
    configured: () => config().ok,
    confirmUrl(token) { const c = config(); return `${c.baseUrl}/order/confirm?token=${encodeURIComponent(token)}`; },
    assetUrl(file) { return `${config().baseUrl}/${file}`; },
    publicOrigin() { const c = config(); return c.ok ? new URL(c.baseUrl).origin : null; },
    /** idempotencyKey makes a retried send a no-op at Resend (it remembers keys for 24 hours). */
    async send({ to, subject, html, text, idempotencyKey }) {
      const c = config();
      if (!c.ok) throw sendError(503, 'EMAIL_NOT_CONFIGURED', 'Order e-mail is not configured');
      if ([to, subject, idempotencyKey].some((v) => typeof v !== 'string' || !v || /[\r\n]/.test(v)) || idempotencyKey.length > 256) throw sendError(400, 'EMAIL_INVALID', 'Invalid e-mail message');
      let response;
      try {
        response = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
          body: JSON.stringify({ from: c.from, to: [to], subject, html, text }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch { throw sendError(502, 'EMAIL_SEND_FAILED', 'E-mail provider could not be reached'); }
      const body = await response.json().catch(() => null); // body is read to free the connection; its text is never logged
      if (!response.ok) throw sendError(502, 'EMAIL_SEND_FAILED', `E-mail provider rejected the message (HTTP ${response.status})`);
      return { id: typeof body?.id === 'string' ? body.id : null };
    },
  };
}
export const orderMailer = createOrderMailer();
