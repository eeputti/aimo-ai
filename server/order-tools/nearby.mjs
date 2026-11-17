// Vastaavien tuotteiden valitsija, kun pyydetyn tuotteen saatavuutta ei saada (Valion rajapinta alhaalla, tuotteesta ei
// aiempaa tietoa). Malli saa vain pyydetyn tuotteen ja listan tuotenimiä, joiden saatavuus tunnetaan, ja palauttaa
// listan tunnisteita. Malli ei päätä hintaa, saatavuutta eikä tilausta: storefront tarkistaa valitut tavallisella ehdolla,
// ja ostaja valitsee itse. Tulos pidetään muistissa 30 minuuttia, jotta sama tuote ei maksa mallikutsua joka viestissä.
import { askAgent, agentEnabled } from '../aimoAgent.mjs';

const TTL_MS = 30 * 60_000;
const memo = new Map();

const SYSTEM = `Olet suurkeittiön tukkutilausten avustaja. Asiakas pyysi tuotetta, jonka saatavuutta ei juuri nyt saada tarkistettua.
Saat listan tuotteita, joiden saatavuus on tiedossa. Valitse enintään viisi, paras ensin, joita keittiö voisi käyttää SAMAAN tarkoitukseen
pyydetyn tuotteen tilalla (sama ruokalaji, käyttö tai tarjoilu). Esimerkiksi maidon tilalle toinen maito, kerman tilalle kerma tai
kasvipohjainen ruoanvalmistusvalmiste, jälkiruoan tilalle toinen jälkiruoka.
Ehdotus on asiakkaalle vaihtoehto, jonka hän voi hylätä: tuote kelpaa, jos se täyttää saman roolin ateriassa tai menussa,
vaikka se olisi eri tuotetyyppiä (jäätelön tilalle esimerkiksi leivos tai mousse jälkiruoaksi).
Älä valitse tuotetta, joka vain sisältää samaa raaka-ainetta mutta on eri ruokaa, äläkä tuotetta, jonka rooli on eri
(perunat, leivät, siivoustarvikkeet jälkiruoan tilalle). Älä ehdota raaka-ainetta valmiin tuotteen tilalle: pakastemarjat, tuoreet hedelmät,
vihannekset tai jauhot eivät korvaa jäätelöä, leivosta tai valmista kastiketta. Jos mikään listan tuote ei sovi samaan rooliin, palauta tyhjä lista.
Kirjoita ensin role: pyydetyn tuotteen rooli keittiössä yhdellä lauseella (esim. "jälkiruoka, tarjoillaan kylmänä").
Käy sitten lista läpi ja valitse tuotteet, joilla on sama rooli. Käytä vain listan tunnisteita. term on lyhyt yleisnimi suomeksi pienillä kirjaimilla ilman merkkiä ja pakkauskokoa
(esim. "marjamousse-leivos"). reason on yksi lyhyt lause suomeksi siitä, miksi tuote käy tilalle.`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['role', 'picks'],
  properties: { role: { type: 'string' }, picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'term', 'reason'],
    properties: { id: { type: 'string' }, term: { type: 'string' }, reason: { type: 'string' } } } } },
};

const qtyText = (q) => (q?.value ? `${q.value} ${q.unit === 'PCS' ? 'kpl' : q.unit === 'KG' ? 'kg' : 'l'}` : 'ei annettu');

/** @returns {null | ((args: {term: string, quantity: object|null, candidates: {id: string, name: string}[]}) => Promise<object[]>)} */
export function createNearbyPicker({ ask = askAgent, enabled = agentEnabled, now = Date.now } = {}) {
  if (!enabled()) return null; // ilman mallia storefront käyttää saman alaryhmän tuotteita
  return async function pick({ term, quantity, candidates }) {
    const key = `${String(term).toLowerCase()}|${candidates.map((c) => c.id).join(',')}`;
    const hit = memo.get(key);
    if (hit && now() - hit.at < TTL_MS) return hit.picks;
    const list = candidates.map((c) => `${c.id}: ${c.name}`).join('\n');
    const once = async () => {
      const r = await ask({ purpose: 'unknown_availability_alternatives', tier: 'fast', system: SYSTEM, schema: SCHEMA, maxTokens: 600, timeoutMs: 10000, retries: 0,
        user: `Pyydetty tuote: ${term}\nMäärä: ${qtyText(quantity)}\n\nTuotteet, joiden saatavuus on tiedossa:\n${list}` });
      return Array.isArray(r?.json?.picks) ? r.json.picks : [];
    };
    // Sama kysymys antoi jäätelölle leivokset kahdesti kolmesta ja kerran tyhjän listan (17.11.). Tyhjä tulos kysytään
    // siksi kerran uudelleen, eikä tyhjää tallenneta välimuistiin, jotta yksi tyhjä vastaus ei jää voimaan puoleksi tunniksi.
    let picks = await once();
    if (!picks.length) picks = await once();
    if (picks.length) { memo.set(key, { at: now(), picks }); if (memo.size > 200) memo.delete(memo.keys().next().value); }
    return picks;
  };
}

export function clearNearbyMemo() { memo.clear(); }
