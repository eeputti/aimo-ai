// Native Ollama /api/chat adapter. No paid-provider fallback, tools or image requests.
import Ajv from 'ajv';
const validator = new Ajv({ strict: false, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
const validators = new WeakMap();
const MAX_RESPONSE = 8 * 1024 * 1024;
function textBlocks(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error('Ollama tarvitsee tekstisyötteen.');
  return value.map((b) => {
    if (b?.type !== 'text' || typeof b.text !== 'string') throw new Error('Ollama-sovitin tukee vain tekstiä.');
    return b.text;
  }).join('\n\n');
}
export async function askOllama({ settings, model, system, user, turns, schema, maxTokens, timeoutMs = 120_000, onToken, fetchImpl = fetch }) {
  const input = [...(turns || []).map((t) => textBlocks(typeof t === 'string' ? t : [t])), textBlocks(user)].join('\n\n');
  const messages = [{ role: 'system', content: system }, { role: 'user', content: input }];
  if (schema) messages[0].content += '\nPalauta vain JSON-skeeman mukainen JSON-vastaus.';
  let res;
  try {
    res = await fetchImpl(`${settings.ollamaUrl}/api/chat`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', ...(settings.ollamaToken ? { authorization: `Bearer ${settings.ollamaToken}` } : {}) },
      body: JSON.stringify({ model, messages, stream: false, think: false, ...(schema ? { format: schema } : {}),
        options: { num_predict: maxTokens, num_ctx: settings.ollamaContext, temperature: 0 } }),
    });
  } catch { throw new Error('Ollama-yhteys epäonnistui tai aikakatkaistiin.'); }
  if (!res.ok) { await res.body?.cancel(); throw new Error(`Ollama palautti HTTP ${res.status}.`); }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Ollama-vastaus puuttuu.');
  let raw = ''; let size = 0; const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) throw new Error();
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch { await reader.cancel().catch(() => {}); throw new Error('Ollama-vastaus katkesi tai ylitti kokorajan.'); }
  let msg;
  try { msg = JSON.parse(raw); } catch { throw new Error('Ollama ei palauttanut kelvollista vastausta.'); }
  if (!msg || msg.done !== true || msg.done_reason !== 'stop' || msg.message?.tool_calls?.length
    || typeof msg.message?.content !== 'string' || !msg.message.content.trim()) throw new Error('Ollama-vastaus jäi kesken tai ei ole tuettu tekstivastaus.');
  const text = msg.message.content;
  if (schema) {
    let value;
    try { value = JSON.parse(text); } catch { throw new Error('Ollama ei palauttanut kelvollista JSON-vastausta.'); }
    let validate = validators.get(schema);
    if (!validate) { validate = validator.compile(schema); validators.set(schema, validate); }
    if (!validate(value)) throw new Error('Ollama-vastaus ei vastaa pyydettyä JSON-skeemaa.');
  }
  // Buffered callback: do not expose partial structured output or retry after emitting it.
  onToken?.(text);
  const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return { content: [{ type: 'text', text }], model: msg.model || model, stop_reason: 'end_turn',
    usage: { input_tokens: count(msg.prompt_eval_count), output_tokens: count(msg.eval_count) } };
}
