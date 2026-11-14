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

export function replyChunks(messages) {
  const chunks = [];
  for (const value of messages) {
    let text = String(value || '').replace(/\*\*([^*]+)\*\*/g, '*$1*').trim();
    while (text.length > 3800) {
      const newline = text.lastIndexOf('\n', 3800);
      let end = newline > 1900 ? newline : 3800;
      if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--; // preserve an emoji split across UTF-16 units
      chunks.push(text.slice(0, end)); text = text.slice(end).trimStart();
    }
    if (text) chunks.push(text);
  }
  return chunks;
}

// Signed links are long. A reply whose last line is one of these links is shown as a labelled button;
// the URL and its fragment token stay behind the button instead of filling the chat.
const LINK_BUTTONS = [
  [/^https:\/\/[^\s/?#]+\/whatsapp\/cart#[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/, 'Avaa ostoskori'],
  [/^https:\/\/[^\s/?#]+\/demo-payment\.html#AGW-\d{8}-\d{4,12}$/, 'Siirry maksamaan'],
];
export function linkButton(text) {
  const lines = String(text || '').trimEnd().split('\n');
  const url = lines.pop().trim();
  const label = LINK_BUTTONS.find(([pattern]) => pattern.test(url))?.[1];
  const body = lines.join('\n').trim().replace(/:$/, '.');
  // Meta allows 1024 body characters; any other link stays as ordinary text.
  if (!label || !body || body.length > 1024 || /https?:\/\//i.test(body)) return null;
  return { body, label, url };
}

export function createMetaSender(settings, fetchImpl = fetch, { linkButtons = process.env.WHATSAPP_LINK_BUTTONS !== 'false' } = {}) {
  const post = (to, message) => fetchImpl(`https://graph.facebook.com/${settings.apiVersion}/${settings.phoneId}/messages`, {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${settings.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
  });
  const messageId = async (res) => {
    // Never expose upstream payloads/tokens in logs or customer replies.
    if (!res.ok) throw new Error(`META_HTTP_${res.status}`);
    const data = await res.json();
    if (!data.messages?.[0]?.id) throw new Error('META_NO_MESSAGE_ID');
    return data.messages[0].id;
  };
  return async (to, text) => {
    const button = linkButtons && linkButton(text);
    if (button) {
      const res = await post(to, { type: 'interactive', interactive: { type: 'cta_url', body: { text: button.body },
        action: { name: 'cta_url', parameters: { display_text: button.label, url: button.url } } } });
      // A rejected button (400) was not delivered: send the same reply with the plain link instead.
      if (res.status !== 400) return messageId(res);
    }
    return messageId(await post(to, { type: 'text', text: { preview_url: false, body: text } }));
  };
}

// A typing update also marks this inbound message as read. It is not an outgoing chat message.
export function createMetaTypingIndicator(settings, fetchImpl = fetch) {
  return async (messageId) => {
    const res = await fetchImpl(`https://graph.facebook.com/${settings.apiVersion}/${settings.phoneId}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { authorization: `Bearer ${settings.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }),
    });
    if (!res.ok) throw new Error(`META_TYPING_HTTP_${res.status}`);
  };
}

export function createWhatsAppChannel({ settings, store, chat, send, typing, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, onPrune = () => {} }) {
  let busy = false; let stopped = false; let timer; let active = Promise.resolve();
  const typingUpdates = new Map();
  const updateTyping = (id, force = false) => {
    if (!typing || stopped) return Promise.resolve();
    const prior = typingUpdates.get(id);
    if (!force && prior && now() - prior.at < 20_000) return prior.work;
    let work;
    try { work = Promise.resolve(typing(id)).catch(() => {}); } catch { work = Promise.resolve(); }
    typingUpdates.set(id, { at: now(), work });
    // Cancelled queued work may never be selected by the worker; keep receipt bookkeeping bounded.
    if (typingUpdates.size > 1000) typingUpdates.delete(typingUpdates.keys().next().value);
    return work;
  };
  let lastPrune = now();
  const support = `Asiakaspalvelu: ${settings.supportContact}`;
  async function processNext() {
    if (busy || stopped) return false;
    busy = true;
    let job; let typingTimer; let typingUpdate = Promise.resolve();
    try {
      job = store.next();
      if (!job) return false;
      if (now() - job.sent_at >= 23 * 3600_000) { store.finish(job.id, 'expired'); return true; }
      let reply = job.reply;
      const member = store.member(job.phone);
      // Revocation/re-pairing also invalidates queued conversations and saved replies.
      if (job.binding && member?.binding !== job.binding) { store.finish(job.id, 'cancelled'); return true; }
      if (typing) {
        const indicate = () => {
          if (stopped || now() - job.sent_at >= 23 * 3600_000 || (job.binding && store.member(job.phone)?.binding !== job.binding)) return;
          // Start before model work, without delaying it. Cosmetic failures never retry an order turn.
          typingUpdate = updateTyping(job.id);
        };
        indicate();
        // Meta clears typing on reply or after 25 seconds. Refresh only while this job is active.
        typingTimer = setInterval(indicate, 20_000); typingTimer.unref?.();
      }
      if (!reply) {
        let historyBinding; let parts;
        if (job.kind === 'pair') {
          const paired = store.pair(job.phone, job.text, job.id);
          if (paired) job.binding = paired.binding;
          reply = paired ? `Testiyhteys yhdistetty: ${paired.person}, ${paired.company}. ${settings.orderingDemo ? 'Kerro tuotteet ja määrät, niin kokoan demotilausluonnoksen. Oikeaa Valio-tilausta ei lähetetä.' : 'Voit kysyä tuotteita, hintoja ja toimitusaikoja. Tämä testiversio ei tee tilauksia.'}\n${support}`
            : 'Yhdistämiskoodi on virheellinen, käytetty tai vanhentunut, tai yrityksiä on liikaa. Pyydä ylläpitäjältä uusi koodi ja tarvittaessa odota 15 minuuttia.';
        } else if (!member || !job.binding) {
          reply = `Numeroasi ei ole yhdistetty asiakastiliin. Pyydä yrityksesi ylläpitäjältä yhdistämiskoodi ja lähetä: YHDISTA koodi\n${support}`;
        } else if (job.kind === 'unsupported') {
          reply = 'Lähetä enintään 4000 merkin tekstiviesti. Tämä testiversio ei käsittele kuvia, ääniviestejä tai liitteitä.';
        } else if (/^(apua|tuki|asiakaspalvelu|help)$/iu.test(job.text)) {
          reply = `${settings.orderingDemo ? 'Olen Valio Aimo Tilausapurin demo. Kerro tarvitsemasi tuotteet ja määrät, niin kokoan hyväksyttävän luonnoksen.' : 'Olen Aimon tuoteapuri. Voin hakea tuotteita, hintoja ja toimitusaikoja.'} Kiireelliset toimitusongelmat ja tilausmuutokset hoitaa asiakaspalvelu.\n${support}`;
        } else {
          try {
            const result = await chat({ messages: [...store.history(member.binding), { role: 'user', content: job.text }], channel: 'whatsapp',
              member, messageId: job.id, receivedAt: job.sent_at });
            parts = replyChunks(Array.isArray(result.messages) && result.messages.length ? result.messages : [result.text]);
            reply = parts.join('\n\n');
            if (!reply) throw new Error('EMPTY_REPLY');
            historyBinding = member.binding;
          } catch (err) {
            // Ordering turns are idempotent by Meta message id: retry the same turn instead of guessing whether
            // an order was saved. Only the last attempt answers, and it makes no claim about the order.
            if (settings.orderingDemo && job.attempts < 3) throw err;
            reply = settings.orderingDemo
              ? `Viestin käsittely ei nyt onnistunut. Luonnoksesi säilyy. Lähetä viesti hetken kuluttua uudelleen, niin näet tilanteen ennen kuin vahvistat mitään.\n${support}`
              : `Tuotehaku ei nyt onnistunut. Yritä hetken kuluttua uudelleen. Tilausta ei ole tehty.\n${support}`;
          }
        }
        // Recheck after a slow model call: a revoked identity must not receive its result.
        if (job.binding && store.member(job.phone)?.binding !== job.binding) { store.finish(job.id, 'cancelled'); return true; }
        store.saveReply(job, reply, historyBinding, parts || replyChunks([reply]));
      }
      // Finish the last status request before replying, so a slow typing update cannot arrive after the answer.
      clearInterval(typingTimer); await typingUpdate;
      if (job.binding && store.member(job.phone)?.binding !== job.binding) { store.finish(job.id, 'cancelled'); return true; }
      let replyId;
      for (const part of store.replyParts(job.id, reply)) {
        if (part.reply_id) { replyId = part.reply_id; continue; }
        if (part.part > 0) {
          await updateTyping(job.id, true);
          await pause(400);
        }
        if (job.binding && store.member(job.phone)?.binding !== job.binding) { store.finish(job.id, 'cancelled'); return true; }
        replyId = await send(job.phone, part.text, job.id);
        store.saveReplyPart(job.id, part.part, replyId);
      }
      store.finish(job.id, 'done', replyId);
      return true;
    } catch (err) {
      if (job) store.retry(job, /^META_HTTP_\d+$/.test(err.message) ? err.message : 'PROCESSING_OR_DELIVERY_ERROR');
      return false;
    } finally { clearInterval(typingTimer); if (job) typingUpdates.delete(job.id); busy = false; }
  }
  return {
    processNext,
    start() {
      if (timer) return;
      store.recover(); store.prune(); onPrune();
      timer = setInterval(() => {
        if (!busy) {
          if (now() - lastPrune >= 3600_000) { store.prune(); onPrune(); lastPrune = now(); }
          active = processNext();
        }
      }, 500);
      timer.unref();
    },
    async stop() { stopped = true; clearInterval(timer); await active; await Promise.all([...typingUpdates.values()].map((v) => v.work)); typingUpdates.clear(); },
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
        const accepted = [];
        for (const message of extractMessages(payload, settings.phoneId, now())) if (store.enqueue(message)) accepted.push(message.id);
        // Durable receipt only. Model work and sending happen outside the webhook request.
        json(res, 200, { received: true });
        // Even if another conversation is being processed, acknowledge the new sender immediately.
        for (const id of accepted) updateTyping(id);
        // Wake a running worker immediately instead of waiting for its next 500 ms polling tick.
        if (accepted.length && timer) setImmediate(() => { if (!busy && !stopped) active = processNext(); });
        return true;
      } catch (err) { json(res, err.status || 500, { error: 'Webhook processing failed' }); return true; }
    },
  };
}
