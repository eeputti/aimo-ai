// Claude-kytkentä. Kaksi nopeutta:
//  - iso malli (DEEP_MODEL, oletus claude-opus-5-5) syvälle agentille taustalla: saa ajatella rauhassa
//  - pieni malli (FAST_MODEL, oletus claude-haiku-5-5) reititykseen ja lyhyisiin vastauksiin: ajattelu pois, matala effort
// Ilman ANTHROPIC_API_KEY:tä mitään täältä ei kutsuta ja sovellus toimii sääntöpohjaisesti.
import { config } from './config.mjs';

let clientPromise;
async function getClient() {
  if (!clientPromise) clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => ({ Anthropic, client: new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 120_000 }) }));
  return clientPromise;
}
export const llmStats = { calls: 0, lastMs: null, cacheReadTokens: 0, lastError: null };

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
function check(msg) {
  if (msg.stop_reason === 'refusal') throw new Error('Malli kieltäytyi vastaamasta');
  if (msg.stop_reason === 'max_tokens') throw new Error('Vastaus katkesi (max_tokens)');
  llmStats.cacheReadTokens += msg.usage?.cache_read_input_tokens || 0;
  return msg;
}

// ---------- Syvä tarkistus ----------
const DEEP_SYSTEM = `Olet ammattikeittiön hankinnan tarkastaja Valio Aimon tukkutilauksille. Saat JSON-faktapaketin valmiiksi lasketusta tilausehdotuksesta: rivit, määrät, perustelut, signaalit, poikkeamat ja niiden tarkistetut korvaajavaihtoehdot sekä keittiön säännöt.

Tehtäväsi:
1. briefing: kirjoita keittiöpäällikölle 2–4 virkkeen tiivistelmä suomeksi. Kerro mikä on valmista, mikä muuttui tavallisesta ja miksi, ja mihin tarvitaan hänen päätöksensä. Suora ja konkreettinen, luvut mukana. Hän lukee tämän kiireessä puhelimesta.
2. picks: valitse jokaiselle poikkeamalle paras korvaaja ANNETUISTA vaihtoehdoista (productId täsmälleen sellaisenaan) ja perustele yhdellä virkkeellä (why). Painota allergeeniturvallisuutta, sitten käyttötarkoitukseen sopivuutta, toimitusvarmuutta ja hintaa. Jos mikään vaihtoehto ei sovi, jätä poikkeama pois listasta.
3. risks: enintään 3 lyhyttä huomiota asioista, jotka laskenta voi missata (epätavallinen määrä, ristiriita signaalien välillä, heikko toimitusvarmuus kriittisellä tuotteella). Tyhjä lista on hyvä vastaus, jos huomautettavaa ei ole.

Rajat: käytä vain paketissa olevia tuotteita, lukuja ja päivämääriä. Älä keksi hintoja, saatavuuksia tai tuotteita äläkä muuta määriä. Jos tieto puuttuu, sano että se puuttuu.`;

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['briefing', 'picks', 'risks'],
  properties: {
    briefing: { type: 'string' },
    picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['lineId', 'productId', 'why'], properties: { lineId: { type: 'string' }, productId: { type: 'string' }, why: { type: 'string' } } } },
    risks: { type: 'array', items: { type: 'string' } },
  },
};

export async function deepReview(facts) {
  const { Anthropic, client } = await getClient();
  const t0 = performance.now();
  const params = {
    model: config.deepModel,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    system: [{ type: 'text', text: DEEP_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(facts) }],
  };
  let msg;
  try {
    // Palvelinpuolen fallback: jos turvaluokitin hylkää pyynnön, API ajaa sen varamallilla saman kutsun sisällä.
    msg = await client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError)) { llmStats.lastError = String(err.message || err); throw err; }
    msg = await client.messages.stream(params).finalMessage(); // malli tai alusta ei tue fallback-betaa
  }
  llmStats.calls += 1;
  llmStats.lastMs = Math.round(performance.now() - t0);
  return { ...JSON.parse(textOf(check(msg))), model: msg.model };
}

// ---------- Nopea reititin ----------
const ROUTER_SYSTEM = `Muunnat keittiöpäällikön vapaamuotoisen viestin (suomea, usein puhekieltä tai sanelua) tilauksen muokkaustoiminnoiksi. Saat nykyisen tilauksen rivit muodossa "lineId | tuote | määrä yksikkö" ja viestin.

Toiminnot (type):
- repeat_last: "sama kuin viime viikolla"
- adjust: muuta olemassa olevan rivin määrää. mode: set (tasan value), delta (lisää/vähennä value yksikköä), pct (value prosenttia, negatiivinen = vähemmän), mult (kerro luvulla value). Anna lineId, jos rivi on tilauksessa.
- add: lisää tuote, jota tilauksessa ei ole. term = tuotteen hakusana perusmuodossa (esim. "kuohukerma"), value = määrä jos annettu.
- remove: poista rivi (lineId tai term).
- substitute: käyttäjä haluaa korvaavan tai toisen vaihtoehdon riville.
- why: käyttäjä kysyy miksi rivillä on tietty määrä.
- search: käyttäjä haluaa vain nähdä vaihtoehtoja, ei lisätä.
- approve: käyttäjä haluaa hyväksyä tai lähettää tilauksen.
- question: muu kysymys tilauksesta, budjetista, toimituksesta tai tuotteista. term = kysymys sellaisenaan.

Yksi viesti voi sisältää monta toimintoa: palauta ne kaikki järjestyksessä. term on aina perusmuodossa ilman määriä. Jos viesti koskee useaa riviä ("kaikkea kermaa"), palauta oma adjust jokaiselle riville. Älä keksi rivejä tai tuotteita, joita viestissä ei mainita.`;

const ROUTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['type'],
        properties: {
          type: { type: 'string', enum: ['repeat_last', 'adjust', 'add', 'remove', 'substitute', 'why', 'search', 'approve', 'question'] },
          term: { type: 'string' },
          lineId: { type: 'string' },
          mode: { type: 'string', enum: ['set', 'delta', 'pct', 'mult'] },
          value: { type: 'number' },
        },
      },
    },
  },
};

export async function routeWithLLM(text, cartLines) {
  const { client } = await getClient();
  const t0 = performance.now();
  const msg = check(await client.messages.create({
    model: config.fastModel,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ROUTE_SCHEMA } },
    system: [{ type: 'text', text: ROUTER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Tilauksen rivit:\n${cartLines}\n\nViesti: ${text}` }],
  }));
  llmStats.calls += 1;
  llmStats.lastMs = Math.round(performance.now() - t0);
  return JSON.parse(textOf(msg)).actions || [];
}

// ---------- Lyhyt vastaus kysymykseen, striimattuna ----------
const ANSWER_SYSTEM = `Olet Valio Aimon tilausavustaja ammattikeittiölle. Vastaat keittiöpäällikön kysymykseen hänen nykyisestä tilausehdotuksestaan annettujen faktojen (JSON) perusteella.

Vastaa suomeksi, 1–3 virkettä, suoraan asiaan. Käytä vain faktoissa olevia tuotteita, määriä, hintoja ja päivämääriä. Jos vastaus ei löydy faktoista, sano se suoraan äläkä arvaa: hinnat ja saatavuus tulevat aina Aimon rajapinnasta, ei sinulta. Älä lupaa tehneesi muutoksia; muutokset tekee erillinen toiminto.`;

export async function answerQuestion(question, facts, onToken) {
  const { client } = await getClient();
  const t0 = performance.now();
  const stream = client.messages.stream({
    model: config.fastModel,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: ANSWER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Faktat:\n${JSON.stringify(facts)}\n\nKysymys: ${question}` }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onToken(event.delta.text);
  }
  const msg = check(await stream.finalMessage());
  llmStats.calls += 1;
  llmStats.lastMs = Math.round(performance.now() - t0);
  return textOf(msg);
}
