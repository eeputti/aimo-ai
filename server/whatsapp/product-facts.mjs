// Tuotekysymyksen faktat suoraan Valion tuotetiedoista (data/catalog.json, challenge-aineiston product_data.json).
// Eelis 15.11.: kaikki asiakkaan näkemä tuotetieto tulee Valion datasta. Malli saa muotoilla vastauksen ja antaa yleisen
// ruoanlaittovinkin, mutta allergeenit, ainesosat, alkuperä, säilytys ja merkinnät kirjoittaa koodi näistä kentistä.
// Puuttuva tieto sanotaan puuttuvaksi, sitä ei päätellä tuotenimestä eikä mallin omasta tietämyksestä.
// catalog.mjs tuodaan vasta käytössä: staattinen tuonti lukisi AIMO_CATALOG-polun ennen kuin ajo on asettanut sen.
const labels = () => import('../catalog.mjs');
import { allergenStatus } from '../allergens.mjs';

const B = '(?<![\\p{L}\\d])';
const word = (source) => new RegExp(`${B}(?:${source})`, 'iu');
// Mitä asiakas kysyy. Sama kysymys voi koskea useampaa tietoa ("onko suomalaista ja laktoositonta?").
const KINDS = [
  ['allergens', word('allerg\\p{L}*|sisältää\\p{L}*|sisältäis\\p{L}*|sisältä|laktoos\\p{L}*|gluteen\\p{L}*|maidot\\p{L}*|munat(?:on|tom)\\p{L}*|pähkin\\p{L}*|maapähkin\\p{L}*|seesam\\p{L}*|soija\\p{L}*|äyriäi\\p{L}*|selleri\\p{L}*|sinapp?i\\p{L}*|sulfiit\\p{L}*|lupiini\\p{L}*|vehnä\\p{L}*|keliaak\\p{L}*')],
  ['ingredients', word('ainesos\\p{L}*|raaka-?ain\\p{L}*|lisäain\\p{L}*|koostu\\p{L}*|mistä\\s+(?:se|tää|tämä|toi|tuo)\\s+on\\s+tehty|mitä\\s+(?:siinä|siin|tässä|tuossa)\\s+on')],
  ['origin', word('alkuper\\p{L}*|mistä\\s+maasta|maasta|kotimai\\p{L}*|suomalai\\p{L}*|suomesta|valmistusma\\p{L}*|tuotantoma\\p{L}*|tuontituot\\p{L}*|ulkomai\\p{L}*')],
  ['storage', word('säilyt\\p{L}*|säily\\p{L}*|lämpötil\\p{L}*|kylmäsäily\\p{L}*|pakkase\\p{L}*|huoneenlämp\\p{L}*|jääkaap\\p{L}*')],
  ['labels', word('luomu\\p{L}*|vegaan\\p{L}*|vegan\\p{L}*|vegetaar\\p{L}*|kasvissyöj\\p{L}*|kasvisruokavali\\p{L}*|laktoositon\\p{L}*|gluteeniton\\p{L}*|merkin\\p{L}*|sertifi\\p{L}*|joutsenlip\\p{L}*|avainlip\\p{L}*|msc|reilu\\s+kauppa|reilun\\s+kaupan')],
];
// Valion tuoteluokitusten merkinnät (scripts/build-catalog.mjs LABELS_KEPT) suomeksi.
const LABEL_FI = {
  FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen',
  VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu (EU)', GOODS_FROM_FINLAND_BLUE_SWAN: 'Hyvää Suomesta (Joutsenlippu)',
  MADE_IN_FINLAND_FLAG_WITH_KEY: 'Avainlippu', FINNISH_HEART_SYMBOL: 'Sydänmerkki', MARINE_STEWARDSHIP_COUNCIL_LABEL: 'MSC',
  FAIR_TRADE_MARK: 'Reilu kauppa', RAINFOREST_ALLIANCE: 'Rainforest Alliance',
};
const MISSING = 'ei Valion tuotetiedoissa';
const INGREDIENT_LIMIT = 220; // build-catalog.mjs lyhentää ainesosatekstin tähän pituuteen
const regions = (() => { try { return new Intl.DisplayNames(['fi'], { type: 'region' }); } catch { return null; } })();

/** Mitä tuotetietoja viesti kysyy: allergens, ingredients, origin, storage, labels. Tyhjä = ei tuotefaktakysymys. */
const ALLERGEN_WORD = word('allerg\\p{L}*|laktoos\\p{L}*|gluteen\\p{L}*|maidot\\p{L}*|munat(?:on|tom)\\p{L}*|pähkin\\p{L}*|maapähkin\\p{L}*|seesam\\p{L}*|soija\\p{L}*|äyriäi\\p{L}*|selleri\\p{L}*|sinapp?i\\p{L}*|sulfiit\\p{L}*|lupiini\\p{L}*|vehnä\\p{L}*|keliaak\\p{L}*');
export function factKinds(text) {
  const t = String(text || '');
  const kinds = KINDS.filter(([, re]) => re.test(t)).map(([kind]) => kind);
  // "Mitä se sisältää?" ilman nimettyä allergeenia kysyy myös ainesosia.
  if (kinds.includes('allergens') && !ALLERGEN_WORD.test(t) && !kinds.includes('ingredients')) kinds.push('ingredients');
  return kinds;
}

export function countryName(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  const name = regions?.of(c);
  return name && name !== c ? name : `maakoodi ${c}`;
}

/** Yhden tuotteen pyydetyt tiedot riveinä. Kentät vain katalogista; puuttuva kenttä kerrotaan puuttuvaksi. */
export async function factLines(p, kinds) {
  const { allergenName, TEMP_LABEL } = await labels();
  const list = (codes) => (codes || []).map(allergenName).join(', ');
  const rows = [];
  const want = new Set(kinds);
  if (want.has('allergens')) {
    if (!p.hasAllergenData) rows.push(`Allergeenit: ${MISSING}, tarkista pakkauksesta`);
    else {
      rows.push(`Allergeenit: ${p.contains?.length ? list(p.contains) : 'ei merkittyjä allergeeneja'}`);
      if (p.mayContain?.length) rows.push(`Voi sisältää: ${list(p.mayContain)}`);
      if (p.freeFrom?.length) rows.push(`Merkitty sisältämättömäksi: ${list(p.freeFrom)}`);
    }
  }
  if (want.has('labels') || want.has('allergens')) {
    const labels = (p.labels || []).map((l) => LABEL_FI[l]).filter(Boolean);
    if (want.has('labels') || labels.some((l) => /laktoos|gluteen|vegaan/u.test(l))) rows.push(`Merkinnät: ${labels.length ? labels.join(', ') : 'ei merkintöjä'}`);
  }
  if (want.has('ingredients')) {
    const text = String(p.ingredients || '').trim();
    rows.push(text ? `Pääainesosat: ${text}${text.length >= INGREDIENT_LIMIT ? '… (lyhennetty)' : ''}` : `Ainesosat: ${MISSING}`);
  }
  if (want.has('origin')) rows.push(`Alkuperämaa: ${countryName(p.country) || MISSING}`);
  if (want.has('storage')) {
    const temp = TEMP_LABEL[p.temp];
    rows.push(temp ? `Lämpötilaluokka: ${temp.toLocaleLowerCase('fi-FI')}. Tarkempaa säilytysohjetta ei ole Valion tuotetiedoissa` : `Säilytys: ${MISSING}`);
  }
  return rows;
}

/**
 * Valion tuotetietojen vastaus WhatsAppiin, tai null jos kysymys ei koske tuotetietoja tai tuotetta ei löytynyt.
 * @param {object[]} products katalogituotteet parhaat ensin (vähintään id ja name)
 */
export async function factsReply(products, kinds, question = '') {
  const shown = (products || []).filter((p) => p?.id && p.name).slice(0, 2);
  if (!kinds?.length || !shown.length) return null;
  const blocks = await Promise.all(shown.map(async (p) => {
    const direct = await directAnswer(p, question);
    return [`*${p.name}* (tuotenro ${p.id}):${direct ? ` ${direct}` : ''}`, ...(await factLines(p, kinds)).map((r) => `- ${r}`)].join('\n');
  }));
  return `Valion tuotetiedoista:\n${blocks.join('\n\n')}`;
}

// Kyllä/ei-kysymykseen vastataan ensin suoraan ("Onko HK Coleslaw munaton?" → "Ei: sisältää kananmunaa."), sitten tiedot
// (Haiku-mittaus 16.11. A2). Vastaus tulee samoista Valion kentistä kuin rivit. Puuttuva tieto ei ole kyllä eikä ei.
const YES_NO = word('onko|onks|onkohan|onhan|sisältääkö|sisältäskö|sisältäiskö|sopiiko|käykö|voiko|pitääkö|onx');
const PARTITIVE = { AE: 'kananmunaa', AM: 'maitoa', AN: 'pähkinöitä', AP: 'maapähkinää', AY: 'soijaa', AF: 'kalaa', AS: 'seesamia', BM: 'sinappia', BC: 'selleriä', UW: 'vehnää', AW: 'gluteeniviljoja', AC: 'äyriäisiä', AU: 'sulfiitteja', NL: 'lupiinia', UM: 'nilviäisiä' };
// [sana kysymyksessä, GS1-koodi]. Tarkempi ensin: maapähkinä ennen pähkinää.
const FREE_OF = [['maapähkinät(?:on|tö)', 'AP'], ['pähkinät(?:on|tö)', 'AN'], ['munat(?:on|to)', 'AE'], ['maidot(?:on|to)', 'AM'], ['soijat(?:on|to)', 'AY'], ['kalat(?:on|to)', 'AF'],
  ['seesamit(?:on|to)', 'AS'], ['sinapit(?:on|to)', 'BM'], ['sellerit(?:on|tö)', 'BC'], ['vehnät(?:on|tö)', 'UW']].map(([re, code]) => [word(re), code]);
const CONTAINS_OF = [['maapähkin', 'AP'], ['pähkin', 'AN'], ['kananmun|munaa|munia', 'AE'], ['maitoa|maito\\b|maidon', 'AM'], ['soija', 'AY'], ['kalaa', 'AF'], ['seesam', 'AS'], ['sinapp?i', 'BM'],
  ['selleri', 'BC'], ['vehnä', 'UW'], ['gluteeni(?!t)', 'AW'], ['äyriäi', 'AC'], ['sulfiit', 'AU']].map(([re, code]) => [word(re), code]);

async function directAnswer(p, question) {
  const q = String(question || '');
  if (!YES_NO.test(q)) return null;
  const has = (label) => (p.labels || []).includes(label);
  const allergen = (code, asksFree) => {
    const s = allergenStatus([code], p); const part = PARTITIVE[code] || 'allergeenia';
    if (s.contains.length) return asksFree ? `Ei: sisältää ${part}.` : `Kyllä: sisältää ${part}.`;
    if (s.mayContain.length) return `Ei varmasti: voi sisältää ${part}.`;
    if (s.unknown) return 'En voi sanoa: allergeenitieto puuttuu Valion tuotetiedoista.';
    return asksFree ? `Kyllä: ${part} ei ole merkitty tuotteen allergeeneihin.` : `Ei: ${part} ei ole merkitty tuotteen allergeeneihin.`;
  };
  if (word('gluteenit\\p{L}*|keliaak\\p{L}*').test(q)) {
    if (has('FREE_FROM_GLUTEN')) return 'Kyllä: merkitty gluteenittomaksi.';
    const a = allergen('AW', true);
    return a.startsWith('Kyllä') ? 'Ei gluteeniton-merkintää Valion tuotetiedoissa, mutta gluteeniviljoja ei ole merkitty allergeeneihin.' : a;
  }
  if (word('laktoosit\\p{L}*').test(q)) {
    if (has('FREE_FROM_LACTOSE')) return 'Kyllä: merkitty laktoosittomaksi.';
    return allergenStatus(['AM'], p).contains.length ? 'Ei: ei laktoositon-merkintää, ja tuote sisältää maitoa.' : 'Ei laktoositon-merkintää Valion tuotetiedoissa.';
  }
  const free = FREE_OF.find(([re]) => re.test(q));
  if (free) return allergen(free[1], true);
  if (word('vegaan\\p{L}*').test(q)) return has('VEGAN') ? 'Kyllä: merkitty vegaaniseksi.' : 'Ei vegaaninen-merkintää Valion tuotetiedoissa.';
  if (word('luomu\\p{L}*').test(q)) return has('EU_ORGANIC_FARMING') ? 'Kyllä: luomu (EU).' : 'Ei luomumerkintää Valion tuotetiedoissa.';
  if (word('suomalai\\p{L}*|kotimai\\p{L}*|suomesta').test(q)) {
    const c = String(p.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return 'En voi sanoa: alkuperämaa ei ole Valion tuotetiedoissa.';
    return c === 'FI' ? 'Kyllä: alkuperämaa Suomi.' : `Ei: alkuperämaa ${countryName(c)}.`;
  }
  if (word('pakkase\\p{L}*|pakast\\p{L}*').test(q) && p.temp) return p.temp === 'frozen' ? 'Kyllä: pakaste.' : `Ei: lämpötilaluokka ${p.temp === 'chilled' ? 'kylmä' : 'kuiva'}.`;
  if (word('huoneenlämp\\p{L}*').test(q) && p.temp) return p.temp === 'ambient' ? 'Kyllä: lämpötilaluokka kuiva.' : `Ei: lämpötilaluokka ${p.temp === 'frozen' ? 'pakaste' : 'kylmä'}.`;
  const contains = CONTAINS_OF.find(([re]) => re.test(q));
  if (contains && word('sisält\\p{L}*').test(q)) return allergen(contains[1], false);
  return null;
}

const stems = (text) => String(text || '').toLocaleLowerCase('fi-FI').split(/[^\p{L}\d]+/u).filter((w) => w.length > 2).map((w) => (w.length > 4 ? w.slice(0, -1) : w));
// Kysymyksen sanat, jotka eivät nimeä tuotetta: tuotefaktan sanat (KINDS, ALLERGEN_WORD) ja kysymyssanat.
const QUESTION_WORD = word('onko|onks|onkohan|onhan|sisältääkö|sisältäskö|mistä|mitä|miten|missä|voiko|pitääkö|sopiiko|käykö|teidän|tuote\\p{L}*|tulee|laittaa|meillä|kiitos|keliaakiko\\p{L}*|maitoallerg\\p{L}*');
const nameTerms = (text) => String(text || '').toLocaleLowerCase('fi-FI').split(/[^\p{L}\d]+/u)
  .filter((w) => w.length > 2 && !QUESTION_WORD.test(w) && !ALLERGEN_WORD.test(w) && !KINDS.some(([, re]) => re.test(w))).map((w) => (w.length > 4 ? w.slice(0, -1) : w));
const plain = (text) => String(text || '').toLocaleLowerCase('fi-FI').replace(/[®™*]/gu, '').replace(/\s+/gu, ' ').trim();
/**
 * Mistä tuotteesta kysytään: ensin ostoskorin valittu tuote, jonka nimeen hakusana osuu (tai ainoa valittu, kun hakusanaa
 * ei ole: "onko se laktoositon?"), sitten katalogihaun osumat. Palauttaa katalogin omat tuotteet, ei mallin tekstiä.
 * Hausta jää vain kysytty tuote (Haiku-mittaus 16.11. A2): nimi, joka on kirjoitettu viestiin sellaisenaan, tai osumat, joiden
 * nimeen osuu eniten kysymyksen tuotesanoja. Pelkkä merkki ("HK" Suomipekonissa) tai ruokavaliosana ("gluteeniton") ei riitä,
 * ja jos mikään osuma ei koske kysyttyä tuotetta, palautetaan tyhjä, jolloin vastaus kertoo, ettei tuotetta löytynyt.
 */
export function factProducts({ query = '', message = '', hits = [], shoppingList = null, product = () => null }) {
  const terms = stems(query);
  const selected = (shoppingList?.lines || []).filter((l) => l.selectedProductId).map((l) => ({ line: l, p: product(l.selectedProductId) })).filter((x) => x.p);
  const onTerm = (x) => terms.some((t) => stems(`${x.line.productTerm} ${x.p.name}`).some((w) => w.includes(t) || t.includes(w)));
  const fromCart = terms.length ? selected.filter(onTerm) : selected.length === 1 ? selected : [];
  let found = hits.map((h) => product(h?.id) || h).filter((p) => p?.id && p.name);
  const asked = [...new Set([...nameTerms(query), ...nameTerms(message)])];
  if (asked.length && found.length) {
    const said = plain(`${message} ${query}`);
    const exact = found.filter((p) => plain(p.name).length >= 8 && said.includes(plain(p.name)));
    const score = (p) => { const own = stems(p.name); return asked.filter((t) => own.some((w) => w.includes(t) || t.includes(w))).length; };
    const best = Math.max(...found.map(score));
    found = exact.length ? exact : best > 0 ? found.filter((p) => score(p) === best) : [];
  }
  const out = [...fromCart.map((x) => x.p), ...found];
  const seen = new Set();
  return out.filter((p) => p?.id && !seen.has(String(p.id)) && seen.add(String(p.id)));
}

let names;
/** Viestiin sellaisenaan kirjoitettu katalogin tuotenimi ("Mistä maasta APPELSIINI JAFFA tulee?"), pisin ensin, enintään kaksi. */
export async function namedInMessage(text) {
  const said = plain(text);
  if (said.length < 8) return [];
  const { loadCatalog } = await labels();
  names ||= loadCatalog().products.map((p) => [plain(p.name), p]).filter(([n]) => n.length >= 8);
  return names.filter(([n]) => said.includes(n)).sort((a, b) => b[0].length - a[0].length).slice(0, 2).map(([, p]) => p);
}

// Mallin vapaan tekstin virke, joka väittää tuotteen allergeeneista, ainesosista, alkuperästä, säilytyksestä tai merkinnöistä.
// Nämä tulevat vain koodin Valion-tietoriveistä, joten virke pudotetaan (myös oikealta kuulostava, koska lähdettä ei tiedetä).
const PRODUCT_CLAIM = word('allergeen\\p{L}*|laktoos\\p{L}*|gluteen\\p{L}*|maidot\\p{L}*|munat(?:on|tom)\\p{L}*|pähkinät\\p{L}*|vegaan\\p{L}*|luomu\\p{L}*|alkuper\\p{L}*|kotimai\\p{L}*|ulkomai\\p{L}*|tuontitavar\\p{L}*|suomalai\\p{L}*|valmistusma\\p{L}*|valmistett\\p{L}*|tuotett(?:u|ua|uja)|säily\\p{L}*|ainesos\\p{L}*|raaka-ainee\\p{L}*|lisäain\\p{L}*|sisältää|sisältä(?:ä|vät)|ei\\s+sisällä|voi\\s+sisältää');
/** Poistaa mallin tekstistä tuotefaktaväitteet. Kysymykset ("Onko laktoosittomuus tarpeen?") saavat jäädä. */
export function withoutProductClaims(text) {
  const raw = String(text || '');
  if (!PRODUCT_CLAIM.test(raw)) return raw;
  return raw.split(/\n/u).map((line) => line.split(/(?<=[.!?])\s+/u).filter((s) => s.trim() && (s.trim().endsWith('?') || !PRODUCT_CLAIM.test(s))).join(' '))
    .filter((line) => line.trim()).join('\n').trim();
}
