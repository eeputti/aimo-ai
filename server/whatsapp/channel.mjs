import crypto from 'node:crypto';
import { phoneNumber } from './store.mjs';

const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= 256_000) chunks.push(chunk);
    });
    req.on('end', () => bytes > 256_000
      ? reject(Object.assign(new Error('Body limit'), { status: 413 }))
      : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Aborted')));
  });
}
export function validSignature(raw, signature, secret) {
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return same(signature.slice(7), expected);
}
export function extractMessages(payload, phoneId, now = Date.now()) {
  const messages = [];
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return messages;
  for (const entry of payload.entry) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    if (!change) continue;
    const value = change.value;
    if (change.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId || !Array.isArray(value.messages)) continue;
    for (const m of value.messages) {
      try {
        const phone = phoneNumber(m.from); const sentAt = Number(m.timestamp) * 1000;
        if (typeof m.id !== 'string' || m.id.length > 250 || !m.id || !Number.isFinite(sentAt) || sentAt > now + 300_000 || sentAt < now - 23 * 3600_000) continue;
        const supported = m.type === 'text' && typeof m.text?.body === 'string' && m.text.body.trim().length > 0 && m.text.body.length <= 4000;
        messages.push({ id: m.id, phone, sentAt, kind: supported ? 'text' : 'unsupported', text: supported ? m.text.body.trim() : '' });
      } catch { /* malformed or unsupported sender */ }
    }
  }
  return messages;
}
export const formatReply = (text) => {
  const clean = String(text || '').replace(/\*\*([^*]+)\*\*/g, '*$1*').trim();
  return clean.length > 3800 ? clean.slice(0, 3700) + '\n\nVastaus lyhennetty. Pyydä lisätiedot yhdestä tuotteesta kerrallaan.' : clean;
};

export function createMetaSender(settings, fetchImpl = fetch) {
  return async (to, text, messageId) => {
    const res = await fetchImpl(`https://graph.facebook.com/${settings.apiVersion}/${settings.phoneId}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${settings.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to,
        context: { message_id: messageId }, type: 'text', text: { preview_url: false, body: text } }),
    });
    // Never expose upstream payloads/tokens in logs or customer replies.
    if (!res.ok) throw new Error(`META_HTTP_${res.status}`);
    const data = await res.json();
    if (!data.messages?.[0]?.id) throw new Error('META_NO_MESSAGE_ID');
    return data.messages[0].id;
  };
}

export function createWhatsAppChannel({ settings, store, chat, send, now = Date.now }) {
  let busy = false; let stopped = false; let timer; let active = Promise.resolve();
  let lastPrune = now();
  const support = `Asiakaspalvelu: ${settings.supportContact}`;
  async function processNext() {
    if (busy || stopped) return false;
    busy = true;
    let job;
    try {
      job = store.next();
      if (!job) return false;
      if (now() - job.sent_at >= 23 * 3600_000) { store.finish(job.id, 'expired'); return true; }
      let reply = job.reply;
      const member = store.member(job.phone);
      // Revocation/re-pairing also invalidates queued conversations and saved replies.
      if (job.binding && member?.binding !== job.binding) { store.finish(job.id, 'cancelled'); return true; }
      if (!reply) {
        let historyBinding;
        if (job.kind === 'pair') {
          const paired = store.pair(job.phone, job.text, job.id);
          if (paired) job.binding = paired.binding;
          reply = paired ? `Testiyhteys yhdistetty: ${paired.person}, ${paired.company}. Voit kysyä tuotteita, hintoja ja toimitusaikoja. Tämä testiversio ei tee tilauksia.\n${support}`
            : 'Yhdistämiskoodi on virheellinen, käytetty tai vanhentunut, tai yrityksiä on liikaa. Pyydä ylläpitäjältä uusi koodi ja tarvittaessa odota 15 minuuttia.';
        } else if (!member || !job.binding) {
          reply = `Numeroasi ei ole yhdistetty asiakastiliin. Pyydä yrityksesi ylläpitäjältä yhdistämiskoodi ja lähetä: YHDISTA koodi\n${support}`;
        } else if (job.kind === 'unsupported') {
          reply = 'Lähetä enintään 4000 merkin tekstiviesti. Tämä testiversio ei käsittele kuvia, ääniviestejä tai liitteitä.';
        } else if (/^(apua|tuki|asiakaspalvelu|help)$/iu.test(job.text)) {
          reply = `Olen Aimon tuoteapuri. Voin hakea tuotteita, hintoja ja toimitusaikoja. Kiireelliset toimitusongelmat ja tilausmuutokset hoitaa asiakaspalvelu.\n${support}`;
        } else {
          try {
            const result = await chat({ messages: [...store.history(member.binding), { role: 'user', content: job.text }], channel: 'whatsapp' });
            reply = formatReply(result.text);
            if (!reply) throw new Error('EMPTY_REPLY');
            historyBinding = member.binding;
          } catch {
            reply = `Tuotehaku ei nyt onnistunut. Yritä hetken kuluttua uudelleen. Tilausta ei ole tehty.\n${support}`;
          }
        }
        // Recheck after a slow model call: a revoked identity must not receive its result.
        if (job.binding && store.member(job.phone)?.binding !== job.binding) { store.finish(job.id, 'cancelled'); return true; }
        store.saveReply(job, reply, historyBinding);
      }
      const replyId = await send(job.phone, reply, job.id);
      store.finish(job.id, 'done', replyId);
      return true;
    } catch (err) {
      if (job) store.retry(job, /^META_HTTP_\d+$/.test(err.message) ? err.message : 'PROCESSING_OR_DELIVERY_ERROR');
      return false;
    } finally { busy = false; }
  }
  return {
    processNext,
    start() {
      if (timer) return;
      store.recover(); store.prune();
      timer = setInterval(() => {
        if (!busy) {
          if (now() - lastPrune >= 3600_000) { store.prune(); lastPrune = now(); }
          active = processNext();
        }
      }, 500);
      timer.unref();
    },
    async stop() { stopped = true; clearInterval(timer); await active; },
    async handle(req, res, url = new URL(req.url, 'http://localhost')) {
      if (url.pathname !== '/webhooks/whatsapp') return false;
      try {
        if (req.method === 'GET') {
          const token = url.searchParams.get('hub.verify_token') || '';
          if (url.searchParams.get('hub.mode') !== 'subscribe' || !same(token, settings.verifyToken)) { json(res, 403, { error: 'Verification failed' }); return true; }
          res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); res.end(url.searchParams.get('hub.challenge') || '');
          return true;
        }
        if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return true; }
        const raw = await rawBody(req);
        if (!validSignature(raw, req.headers['x-hub-signature-256'], settings.appSecret)) { json(res, 403, { error: 'Invalid signature' }); return true; }
        let payload;
        try { payload = JSON.parse(raw.toString('utf8')); } catch { json(res, 400, { error: 'Invalid JSON' }); return true; }
        for (const message of extractMessages(payload, settings.phoneId, now())) store.enqueue(message);
        // Durable receipt only. Model work and sending happen outside the webhook request.
        json(res, 200, { received: true }); return true;
      } catch (err) { json(res, err.status || 500, { error: 'Webhook processing failed' }); return true; }
    },
  };
}
