// Tuotekysymyksen faktat suoraan Valion tuotetiedoista (data/catalog.json, challenge-aineiston product_data.json).
// Eelis 15.11.: kaikki asiakkaan näkemä tuotetieto tulee Valion datasta. Malli saa muotoilla vastauksen ja antaa yleisen
// ruoanlaittovinkin, mutta allergeenit, ainesosat, alkuperä, säilytys ja merkinnät kirjoittaa koodi näistä kentistä.
// Puuttuva tieto sanotaan puuttuvaksi, sitä ei päätellä tuotenimestä eikä mallin omasta tietämyksestä.
// catalog.mjs tuodaan vasta käytössä: staattinen tuonti lukisi AIMO_CATALOG-polun ennen kuin ajo on asettanut sen.
const labels = () => import('../catalog.mjs');

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
export async function factsReply(products, kinds) {
  const shown = (products || []).filter((p) => p?.id && p.name).slice(0, 2);
  if (!kinds?.length || !shown.length) return null;
  const blocks = await Promise.all(shown.map(async (p) => [`*${p.name}* (tuotenro ${p.id}):`, ...(await factLines(p, kinds)).map((r) => `- ${r}`)].join('\n')));
  return `Valion tuotetiedoista:\n${blocks.join('\n\n')}`;
}

const stems = (text) => String(text || '').toLocaleLowerCase('fi-FI').split(/[^\p{L}\d]+/u).filter((w) => w.length > 2).map((w) => (w.length > 4 ? w.slice(0, -1) : w));
/**
 * Mistä tuotteesta kysytään: ensin ostoskorin valittu tuote, jonka nimeen hakusana osuu (tai ainoa valittu, kun hakusanaa
 * ei ole: "onko se laktoositon?"), sitten katalogihaun osumat. Palauttaa katalogin omat tuotteet, ei mallin tekstiä.
 */
export function factProducts({ query = '', hits = [], shoppingList = null, product = () => null }) {
  const terms = stems(query);
  const selected = (shoppingList?.lines || []).filter((l) => l.selectedProductId).map((l) => ({ line: l, p: product(l.selectedProductId) })).filter((x) => x.p);
  const onTerm = (x) => terms.some((t) => stems(`${x.line.productTerm} ${x.p.name}`).some((w) => w.includes(t) || t.includes(w)));
  const fromCart = terms.length ? selected.filter(onTerm) : selected.length === 1 ? selected : [];
  const out = [...fromCart.map((x) => x.p), ...hits.map((h) => product(h?.id) || h)];
  const seen = new Set();
  return out.filter((p) => p?.id && !seen.has(String(p.id)) && seen.add(String(p.id)));
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
