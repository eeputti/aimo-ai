// AIMO-AGENTTI: ainoa paikka, josta kielimallia kutsutaan.
// Agentti = Aimon ohjeet, skeemat ja tarkistukset valmiin kielimallin päällä. Tehtävät (keittiön reititys ja tarkistus
// WhatsApp-dialogi, pyynnön tulkinta aimo/model.mjs, portin neuvonantaja gateway/advisor.mjs) antavat ohjeen, syötteen ja skeeman;
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

// inputTokens sisältää kaikki syötetokenit: välimuistista luetut (cacheReadTokens, noin 0,1 × hinta) ja välimuistiin
// kirjoitetut (cacheWriteTokens, 1,25 × hinta) mukaan lukien.
export const agentStats = { calls: 0, failed: 0, lastMs: null, lastError: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, byPurpose: {} };

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

/**
 * Käyttäjäviestin sisältö. `turns` on kutsusta toiseen vain kasvava alku (esim. keskustelu vuoro kerrallaan): jokainen
 * vuoro on oma lohkonsa ja viimeinen merkitään välimuistiin, joten seuraava kutsu lukee aiemmat vuorot välimuistista.
 * Välimuisti osuu vain lohkon rajaan, siksi yhteen kasvavaan tekstiin koottu keskustelu ei osu koskaan.
 * `user` on tämän kutsun muuttuva loppu, ja se tulee merkinnän jälkeen.
 */
export function userContent(user, turns) {
  if (!turns?.length) return user;
  const blocks = turns.map((t) => (typeof t === 'string' ? { type: 'text', text: t } : { ...t }));
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  const tail = typeof user === 'string' ? (user ? [{ type: 'text', text: user }] : []) : (user || []);
  return [...blocks, ...tail];
}

/**
 * Yksi mallikutsu.
 * @param {object} o
 * @param {string} o.purpose   tehtävän nimi laskureihin ja lokiin, esim. 'recipe_ideas'
 * @param {'fast'|'deep'} [o.tier]
 * @param {string} o.system    tehtävän ohje (välimuistitetaan)
 * @param {string|Array<object>} o.user      teksti tai multimodaaliset sisältölohkot
 * @param {Array<string|object>} [o.turns]   kutsusta toiseen kasvava alku ennen `user`-osaa, välimuistiin (userContent)
 * @param {object} [o.schema]  JSON-skeema: vastaus palautetaan myös jäsennettynä kentässä json
 * @param {number} [o.maxTokens]
 * @param {number} [o.timeoutMs]  kutsukohtainen aikakatkaisu; ilman tätä asiakkaan oletus (120 s)
 * @param {number} [o.retries]    kutsukohtaiset uusintayritykset; ilman tätä asiakkaan oletus (1)
 * @param {(text: string) => void} [o.onToken]  striimaa vastauksen pala kerrallaan
 * @returns {Promise<{text: string, json: any, model: string, ms: number, stopReason: string, usage: {input: number, output: number, cacheRead: number, cacheWrite: number}}>}
 * Heittää virheen, jos malli kieltäytyy, vastaus katkeaa tai kutsu epäonnistuu. Kutsuja päättää, miten jatketaan säännöillä.
 */
export async function askAgent({ purpose, tier = 'fast', system, user, turns, schema, maxTokens = 1024, timeoutMs, retries, onToken }) {
  const t0 = performance.now();
  const deep = tier === 'deep';
  const params = {
    model: modelFor(tier),
    max_tokens: maxTokens,
    thinking: deep ? { type: 'adaptive' } : { type: 'disabled' },
    output_config: { effort: deep ? 'high' : 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent(user, turns) }],
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
    const cacheWrite = msg.usage?.cache_creation_input_tokens || 0;
    const usage = { input: (msg.usage?.input_tokens || 0) + cacheRead + cacheWrite, output: msg.usage?.output_tokens || 0, cacheRead, cacheWrite };
    agentStats.calls += 1; agentStats.lastMs = ms;
    agentStats.inputTokens += usage.input; agentStats.outputTokens += usage.output; agentStats.cacheReadTokens += cacheRead; agentStats.cacheWriteTokens += cacheWrite;
    const p = (agentStats.byPurpose[purpose] ||= { calls: 0, failed: 0, lastMs: null });
    // Tarkoituskohtaiset tokenit näyttävät, mikä kutsu osuu välimuistiin. Laskurit päivitetään ennen calls-kenttää,
    // koska itsekeskustelun kustannusseuranta (whatsapp-selfplay-batch.mjs) lukee ne calls-kentän muutoshetkellä.
    p.inputTokens = (p.inputTokens || 0) + usage.input; p.cacheReadTokens = (p.cacheReadTokens || 0) + cacheRead; p.cacheWriteTokens = (p.cacheWriteTokens || 0) + cacheWrite;
    p.calls += 1; p.lastMs = ms;
    return { text, json, model: msg.model, ms, stopReason: msg.stop_reason, usage };
  } catch (err) {
    agentStats.failed += 1; agentStats.lastError = String(err.message || err).slice(0, 200);
    (agentStats.byPurpose[purpose] ||= { calls: 0, failed: 0, lastMs: null }).failed += 1;
    throw err;
  }
}

/**
 * Keskustelu, jossa malli käyttää etä-MCP-palvelimen työkaluja (Claude API:n MCP connector, beta).
 * Anthropic ottaa yhteyden MCP-palvelimeen palvelinpuolella; tämä funktio vain striimaa tekstin ja työkalukutsujen nimet.
 * @param {object} o
 * @param {string} o.purpose
 * @param {string} o.system
 * @param {{role: 'user'|'assistant', content: any}[]} o.messages
 * @param {{name: string, url: string, token?: string}} o.mcp
 * @param {(text: string) => void} [o.onText]
 * @param {(toolName: string) => void} [o.onTool]
 * @param {number} [o.maxTokens]
 * @param {string[]} [o.allowedTools] Enable only these remote tools; other tools stay disabled.
 * @returns {Promise<{text: string, model: string, ms: number, toolCalls: number, usage: {input: number, output: number, cacheRead: number}}>}
 */
export async function chatWithMcp({ purpose, system, messages, mcp, onText, onTool, maxTokens = 16000, allowedTools }) {
  const t0 = performance.now();
  const MCP_BETA = 'mcp-client-2025-11-20';
  const base = {
    model: modelFor('deep'),
    max_tokens: maxTokens,
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    mcp_servers: [{ type: 'url', url: mcp.url, name: mcp.name, ...(mcp.token ? { authorization_token: mcp.token } : {}) }],
    tools: [{ type: 'mcp_toolset', mcp_server_name: mcp.name, ...(allowedTools ? { default_config: { enabled: false }, configs: Object.fromEntries(allowedTools.map((name) => [name, { enabled: true }])) } : {}) }],
  };
  const history = [...messages];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let text = ''; let toolCalls = 0; let msg; let useFallback = true;
  try {
    const { Anthropic, client } = await getClient();
    // pause_turn: palvelinpuolen työkalusilmukka keskeytyi; jatketaan lähettämällä vastaus takaisin sellaisenaan.
    for (let round = 0; round < 4; round++) {
      const params = { ...base, messages: history, betas: useFallback ? [MCP_BETA, 'server-side-fallback-2026-07-01'] : [MCP_BETA], ...(useFallback ? { fallbacks: 'default' } : {}) };
      let streamed = false;
      try {
        const stream = client.beta.messages.stream(params);
        for await (const event of stream) {
          if (event.type === 'content_block_start' && event.content_block.type === 'mcp_tool_use') { streamed = true; toolCalls += 1; onTool?.(event.content_block.name); }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') { streamed = true; text += event.delta.text; onText?.(event.delta.text); }
        }
        msg = await stream.finalMessage();
      } catch (err) {
        // Fallback-beta ei ole käytettävissä tällä mallilla tai alustalla: sama pyyntö ilman sitä, jos mitään ei vielä striimattu.
        if (useFallback && !streamed && err instanceof Anthropic.BadRequestError) { useFallback = false; round -= 1; continue; }
        throw err;
      }
      const cacheRead = msg.usage?.cache_read_input_tokens || 0;
      usage.input += (msg.usage?.input_tokens || 0) + cacheRead; usage.output += msg.usage?.output_tokens || 0; usage.cacheRead += cacheRead;
      if (msg.stop_reason !== 'pause_turn') break;
      history.push({ role: 'assistant', content: msg.content });
    }
    if (msg.stop_reason === 'refusal') throw new Error('Malli kieltäytyi vastaamasta');
    if (msg.stop_reason === 'max_tokens') throw new Error('Vastaus katkesi (max_tokens)');
    if (msg.stop_reason === 'pause_turn') throw new Error('Työkalukutsuja oli liikaa yhdelle vastaukselle');
    const ms = Math.round(performance.now() - t0);
    agentStats.calls += 1; agentStats.lastMs = ms;
    agentStats.inputTokens += usage.input; agentStats.outputTokens += usage.output; agentStats.cacheReadTokens += usage.cacheRead;
    const p = (agentStats.byPurpose[purpose] ||= { calls: 0, failed: 0, lastMs: null });
    p.calls += 1; p.lastMs = ms;
    return { text, model: msg.model, ms, toolCalls, usage };
  } catch (err) {
    agentStats.failed += 1; agentStats.lastError = String(err.message || err).slice(0, 200);
    (agentStats.byPurpose[purpose] ||= { calls: 0, failed: 0, lastMs: null }).failed += 1;
    throw err;
  }
}
