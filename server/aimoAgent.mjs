// AIMO-AGENTTI: ainoa paikka, josta kielimallia kutsutaan.
// Agentti = Aimon ohjeet, skeemat ja tarkistukset valmiin kielimallin päällä. Tehtävät (keittiön reititys ja tarkistus
// llm.mjs, pyynnön tulkinta aimo/model.mjs, portin neuvonantaja gateway/advisor.mjs) antavat ohjeen, syötteen ja skeeman;
// tämä moduuli omistaa asiakkaan, mallivalinnan, kutsuasetukset ja laskurit. Mallin tai toimittajan vaihto tehdään täällä.
// Ilman ANTHROPIC_API_KEY:tä agentti on pois päältä ja sovellus toimii sääntöpohjaisesti.
import { config, llmEnabled } from './config.mjs';

export const AIMO_AGENT = { name: 'Aimo-agentti', provider: 'anthropic' };
export const agentEnabled = llmEnabled;

/** Kaksi nopeutta: 'deep' ajattelee rauhassa taustalla, 'fast' vastaa heti (ajattelu pois, matala effort). */
export const modelFor = (tier = 'fast') => (tier === 'deep' ? config.deepModel : config.fastModel);

let clientPromise;
const getClient = () => (clientPromise ||= import('@anthropic-ai/sdk').then(({ default: Anthropic }) => ({ Anthropic, client: new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 120_000 }) })));

/** Lämmitys käynnistyksessä: SDK muistiin, ettei demon ensimmäinen kutsu ole hitain. */
export async function warmAgent() { if (agentEnabled()) await getClient(); }

export const agentStats = { calls: 0, failed: 0, lastMs: null, lastError: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, byPurpose: {} };

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

/**
 * Yksi mallikutsu.
 * @param {object} o
 * @param {string} o.purpose   tehtävän nimi laskureihin ja lokiin, esim. 'recipe_ideas'
 * @param {'fast'|'deep'} [o.tier]
 * @param {string} o.system    tehtävän ohje (välimuistitetaan)
 * @param {string} o.user      syöte
 * @param {object} [o.schema]  JSON-skeema: vastaus palautetaan myös jäsennettynä kentässä json
 * @param {number} [o.maxTokens]
 * @param {number} [o.timeoutMs]  kutsukohtainen aikakatkaisu; ilman tätä asiakkaan oletus (120 s)
 * @param {number} [o.retries]    kutsukohtaiset uusintayritykset; ilman tätä asiakkaan oletus (1)
 * @param {(text: string) => void} [o.onToken]  striimaa vastauksen pala kerrallaan
 * @returns {Promise<{text: string, json: any, model: string, ms: number, stopReason: string, usage: {input: number, output: number, cacheRead: number}}>}
 * Heittää virheen, jos malli kieltäytyy, vastaus katkeaa tai kutsu epäonnistuu. Kutsuja päättää, miten jatketaan säännöillä.
 */
export async function askAgent({ purpose, tier = 'fast', system, user, schema, maxTokens = 1024, timeoutMs, retries, onToken }) {
  const t0 = performance.now();
  const deep = tier === 'deep';
  const params = {
    model: modelFor(tier),
    max_tokens: maxTokens,
    thinking: deep ? { type: 'adaptive' } : { type: 'disabled' },
    output_config: { effort: deep ? 'high' : 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };
  const opts = {};
  if (timeoutMs != null) opts.timeout = timeoutMs;
  if (retries != null) opts.maxRetries = retries;
  try {
    const { Anthropic, client } = await getClient();
    let msg;
    if (deep) {
      try {
        // Palvelinpuolen fallback: jos turvaluokitin hylkää pyynnön, API ajaa sen varamallilla saman kutsun sisällä.
        msg = await client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, opts).finalMessage();
      } catch (err) {
        if (!(err instanceof Anthropic.BadRequestError)) throw err;
        msg = await client.messages.stream(params, opts).finalMessage(); // malli tai alusta ei tue fallback-betaa
      }
    } else if (onToken) {
      const stream = client.messages.stream(params, opts);
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onToken(event.delta.text);
      }
      msg = await stream.finalMessage();
    } else {
      msg = await client.messages.create(params, opts);
    }
    if (msg.stop_reason === 'refusal') throw new Error('Malli kieltäytyi vastaamasta');
    if (msg.stop_reason === 'max_tokens') throw new Error('Vastaus katkesi (max_tokens)');
    const text = textOf(msg);
    const json = schema ? JSON.parse(text) : null;
    const ms = Math.round(performance.now() - t0);
    const cacheRead = msg.usage?.cache_read_input_tokens || 0;
    const usage = { input: (msg.usage?.input_tokens || 0) + cacheRead, output: msg.usage?.output_tokens || 0, cacheRead };
    agentStats.calls += 1; agentStats.lastMs = ms;
    agentStats.inputTokens += usage.input; agentStats.outputTokens += usage.output; agentStats.cacheReadTokens += cacheRead;
    const p = (agentStats.byPurpose[purpose] ||= { calls: 0, failed: 0, lastMs: null });
    p.calls += 1; p.lastMs = ms;
    return { text, json, model: msg.model, ms, stopReason: msg.stop_reason, usage };
  } catch (err) {
    agentStats.failed += 1; agentStats.lastError = String(err.message || err).slice(0, 200);
    (agentStats.byPurpose[purpose] ||= { calls: 0, failed: 0, lastMs: null }).failed += 1;
    throw err;
  }
}
