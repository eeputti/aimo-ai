// Tilausapuri (/assistant.html): Danielin ostosagentti sivuston kautta.
// Selain → POST /api/assistant/chat → Claude (aimoAgent.chatWithMcp) → Danielin MCP-palvelin (Render) → Valion rajapinta.
// Vastaus striimataan selaimeen SSE-tapahtumina: status, tool, text, done, error.
// Vaatii ANTHROPIC_API_KEY, ASSISTANT_MCP_URL ja ASSISTANT_MCP_TOKEN. Kutsut maksetaan ANTHROPIC_API_KEY-avaimelta.
import { config, llmEnabled } from './config.mjs';
import { chatWithMcp } from './aimoAgent.mjs';

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

// Työkalujen nimet käyttäjälle näkyviksi tilaviesteiksi.
const TOOL_LABEL = {
  search_products: 'Haetaan tuotteita',
  quote: 'Tarkistetaan hinnat, saatavuus ja korvaajat',
  get_prices: 'Haetaan hintoja',
  get_availability: 'Tarkistetaan saatavuutta',
  get_product_details: 'Haetaan tuotetietoja',
  data_status: 'Tarkistetaan tuotedataa',
  ping: 'Tarkistetaan yhteyttä',
};

function helsinkiToday() {
  const now = new Date();
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(now); // YYYY-MM-DD
  const label = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).format(now);
  return { iso, label };
}

function systemPrompt() {
  const { iso, label } = helsinkiToday();
  return `Olet Valio Aimon tilausapuri ravintoloille ja muille ammattiasiakkaille. Käytät valio-aimo-työkaluja: hae tuotteet search_products-työkalulla ja kutsu sitten quote-työkalua kerran kaikille valituille tuotteille.

Tänään on ${label} (${iso}), Suomen aikaa. Muunna käyttäjän päivämäärät ("maanantaiksi", "huomiseksi") muotoon YYYY-MM-DD tämän perusteella. Jos päivää ei mainita, käytä seuraavaa arkipäivää ja mainitse se.

Vastaa lyhyesti ja aina taulukolla, ei johdantoa:
| Tuote | Aikaisin toimitus | Tilaa viimeistään | Hinta (alv 0) | Korvaava tuote |
Arvot quote-työkalun kentistä sellaisenaan (earliestDelivery, orderDeadline, price). Korvaava tuote: "–", jos ok = true; muuten ensimmäinen substitutes-tuote muodossa "Nimi (id), toimitus, hinta" tai lyhyt syy ja "ei korvaajaa". Puuttuva tieto "–". Älä keksi hintoja tai päivämääriä.
Taulukon alle enintään kaksi lyhyttä huomiota, vain jos tarpeen. Vastaa käyttäjän kielellä.`;
}

function validMessages(body) {
  const list = Array.isArray(body?.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const out = [];
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (content) out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift(); // keskustelu alkaa käyttäjältä
  return out.length && out.at(-1).role === 'user' ? out : null;
}

/** Herättää ilmaisen Render-palvelun ennen mallikutsua, ettei MCP-yhteys aikakatkaistu kylmäkäynnistykseen. */
async function wakeMcp() {
  try {
    const r = await fetch(new URL('/healthz', config.assistantMcpUrl), { signal: AbortSignal.timeout(90_000) });
    return r.ok;
  } catch { return false; }
}

export const assistantStatus = () => ({ enabled: llmEnabled() && Boolean(config.assistantMcpUrl), model: config.deepModel });

export async function handleAssistantChat(req, res, body) {
  const writeJson = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
  if (!llmEnabled()) return writeJson(503, { error: 'Tilausapuri ei ole käytössä: ANTHROPIC_API_KEY puuttuu palvelimelta.' });
  if (!config.assistantMcpUrl) return writeJson(503, { error: 'Tilausapuri ei ole käytössä: ASSISTANT_MCP_URL puuttuu palvelimelta.' });
  const messages = validMessages(body);
  if (!messages) return writeJson(400, { error: 'Viesti puuttuu tai keskustelu on virheellinen.' });

  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15_000);
  let closed = false;
  res.on('close', () => { closed = true; clearInterval(keepAlive); });
  try {
    send('status', { text: 'Yhdistetään tuotepalveluun' });
    if (!(await wakeMcp())) send('status', { text: 'Tuotepalvelu heräilee, yritetään silti' });
    if (closed) return;
    send('status', { text: 'Mietitään' });
    const r = await chatWithMcp({
      purpose: 'assistant_chat',
      system: systemPrompt(),
      messages,
      mcp: { name: 'valio-aimo', url: config.assistantMcpUrl, token: config.assistantMcpToken },
      onTool: (name) => send('tool', { name, text: TOOL_LABEL[name] || name }),
      onText: (t) => send('text', { t }),
    });
    send('done', { ms: r.ms, model: r.model, toolCalls: r.toolCalls });
  } catch (err) {
    console.error('[assistant]', err);
    send('error', { text: `Vastaus epäonnistui: ${String(err.message || err).slice(0, 300)}` });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
}
