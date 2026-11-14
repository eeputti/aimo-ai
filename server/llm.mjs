// Keittiönäkymän kielimallitehtävät: syvä tarkistus, reititys, lyhyt vastaus ja reseptiehdotukset.
// Tässä on vain tehtävien ohjeet ja skeemat. Itse mallikutsun tekee Aimo-agentti (aimoAgent.mjs):
//  - 'deep' (DEEP_MODEL) syvälle tarkistukselle taustalla: saa ajatella rauhassa
//  - 'fast' (FAST_MODEL) reititykseen ja lyhyisiin vastauksiin: ajattelu pois, matala effort
// Ilman ANTHROPIC_API_KEY:tä mitään täältä ei kutsuta ja sovellus toimii sääntöpohjaisesti.
import { askAgent } from './aimoAgent.mjs';

export const llmStats = { calls: 0, lastMs: null, cacheReadTokens: 0, lastError: null };

async function run(task) {
  try {
    const r = await askAgent(task);
    llmStats.calls += 1; llmStats.lastMs = r.ms; llmStats.cacheReadTokens += r.usage.cacheRead;
    return r;
  } catch (err) { llmStats.lastError = String(err.message || err); throw err; }
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
  const r = await run({ purpose: 'deep_review', tier: 'deep', system: DEEP_SYSTEM, user: JSON.stringify(facts), schema: REVIEW_SCHEMA, maxTokens: 16000 });
  return { ...r.json, model: r.model };
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
  const r = await run({ purpose: 'route', system: ROUTER_SYSTEM, user: `Tilauksen rivit:\n${cartLines}\n\nViesti: ${text}`, schema: ROUTE_SCHEMA });
  return r.json.actions || [];
}

// ---------- Lyhyt vastaus kysymykseen, striimattuna ----------
const ANSWER_SYSTEM = `Olet Valio Aimon tilausavustaja ammattikeittiölle. Vastaat keittiöpäällikön kysymykseen hänen nykyisestä tilausehdotuksestaan annettujen faktojen (JSON) perusteella.

Vastaa suomeksi, 1–3 virkettä, suoraan asiaan. Käytä vain faktoissa olevia tuotteita, määriä, hintoja ja päivämääriä. Jos vastaus ei löydy faktoista, sano se suoraan äläkä arvaa: hinnat ja saatavuus tulevat aina Aimon rajapinnasta, ei sinulta. Älä lupaa tehneesi muutoksia; muutokset tekee erillinen toiminto.`;

export async function answerQuestion(question, facts, onToken) {
  const r = await run({ purpose: 'answer', system: ANSWER_SYSTEM, user: `Faktat:\n${JSON.stringify(facts)}\n\nKysymys: ${question}`, onToken });
  return r.text;
}

// ---------- Reseptiehdotukset hakupaneeliin ----------
// Malli ehdottaa ruokia ja raaka-aineet per annos. Tuotteita, hintoja tai saatavuutta se ei päätä: raaka-aineet haetaan katalogista erikseen.
const RECIPE_SYSTEM = `Olet ammattikeittiön reseptiapuri suomalaisessa tukkukaupassa. Saat hakusanan (ruoka, raaka-aine tai tyyli) ja ehdotat 6 erilaista suurkeittiöön sopivaa ruokaa, jotka vastaavat hakua: ensin lähin osuma, sitten muunnelmia (esim. kermainen, kirkas, kasvis, laktoositon) ja lähisukuisia ruokia.

Jokaiselle ruoalle:
- name: ruoan nimi suomeksi, enintään 4 sanaa
- note: 2–5 sanan kuvaus, joka erottaa sen muista (esim. "kermainen, tilliä ja purjoa")
- ingredients: 4–6 pääraaka-ainetta YHDELLE annokselle. name on tukun hakusana perusmuodossa, 1–3 sanaa (esim. "lohifilee", "kuohukerma", "peruna", "kuorittu sipuli"). amount on määrä per annos yksikössä unit: KG kiinteille, L nesteille. Käytä realistisia suurkeittiön annoskokoja (pääraaka-aine 0.08–0.2 kg).
- Liemet ovat tiivistettä tai jauhetta (esim. "kalaliemijauhe", 0.004–0.01 kg per annos), ei valmista nestettä.
- Jätä pois suola, vesi, pippuri ja öljy.

Vastaa vain pyydetyssä JSON-muodossa. Jos haku ei liity ruokaan, palauta tyhjä lista.`;
const RECIPE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'note', 'ingredients'],
        properties: {
          name: { type: 'string' }, note: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'unit'], properties: { name: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string', enum: ['KG', 'L'] } } } },
        },
      },
    },
  },
};
export async function suggestRecipes(query) {
  const r = await run({ purpose: 'recipe_ideas', system: RECIPE_SYSTEM, user: `Haku: ${query}`, schema: RECIPE_SCHEMA, maxTokens: 3000 });
  return { ideas: r.json.ideas || [], model: r.model, ms: r.ms };
}
