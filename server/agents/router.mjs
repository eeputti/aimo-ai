// REITITIN. Ensin säännöt (0 ms, ei kielimallia): suurin osa keittiön viesteistä on "lisää X", "20 % enemmän Y", "poista Z".
// Vain jos säännöt eivät ymmärrä viestiä, kysytään pieneltä kielimallilta. Näin tavallinen pyyntö ei koskaan odota mallia.
// Säännöt lukevat suomea ja englantia ja poimivat viestistä määrän ("1,000", "1 000", "1,5"), yksikön (l, kg, kpl),
// toimituspäivän ("by Monday", "maanantaiksi") ja ruokavaliorajauksen ("lactose-free", "laktoositon").
import { stems, tokenize } from '../catalog.mjs';

// JS:n \b ja \w tuntevat vain ASCII-kirjaimet, joten "lisää" ja "vähennä" eivät päättyisi sananrajaan.
// rx() kääntää ne Unicode-versioiksi; kaikki tämän tiedoston sanasäännöt rakennetaan sen kautta.
const LETTER = '[\\p{L}\\p{N}]';
const BOUNDARY = `(?:(?<=${LETTER})(?!${LETTER})|(?<!${LETTER})(?=${LETTER}))`;
const rx = (src, flags = '') => new RegExp(src.replaceAll('\\b', BOUNDARY).replaceAll('\\w', LETTER), `u${flags}`);

const NUM = '(\\d+(?:[.,]\\d+)?)';
// Yksiköt. Tilavuus ja paino muunnetaan litroiksi ja kiloiksi; kappaleyksiköt (kpl, ltk ...) ovat myyntiyksiköitä.
// Taivutuspääte on rajattu muutamaan kirjaimeen, ettei "kilohaili" tai "pussikeitto" näytä yksiköltä.
const VOLUME = 'litra\\w{0,3}|litro\\w{0,3}|litres?|liters?|desi\\w{0,6}|dl|ml|l';
const WEIGHT = 'kilogram\\w{0,4}|kilo\\w{0,3}|kg|gramma\\w{0,3}|grams?|g';
const COUNT = 'ltk|laatikko\\w{0,3}|laatiko\\w{0,3}|kpl|kappale\\w{0,4}|pss|pussi\\w{0,3}|pkt|paketti\\w{0,3}|paketi\\w{0,3}|prk|purkki\\w{0,3}|purki\\w{0,3}|pl|pullo\\w{0,3}|ras|rasia\\w{0,3}|sk|säkki\\w{0,3}|säki\\w{0,3}|tölkki\\w{0,3}|tölki\\w{0,3}|pcs|pieces?|cases?|box(?:es)?|bottles?|bags?|packs?|cartons?|units?';
const UNIT = `(${VOLUME}|${WEIGHT}|${COUNT})`;

const SRC = {
  repeat: '\\b(?:sama(?:t|n)?\\s+(?:ku|kuin|kun)\\s+(?:viime|edellise\\w*)\\s*(?:viiko\\w*|kerra\\w*)?|same\\s+as\\s+last\\s+(?:week|time|order))',
  approve: '^(?:ok(?:ei|ay)?[,.! ]*|joo[,.! ]*|kyllä[,.! ]*|yes[,.! ]*)?(?:hyväksy\\w*|vahvista\\w*|lähetä\\s+tilaus|tilaa\\s+(?:nyt|kaikki)|kaikki\\s+ok|näyttää\\s+hyvältä|approve\\w*|confirm\\w*|(?:send|place|submit)\\s+(?:the\\s+)?order|looks\\s+good)\\b',
  why: '^(?:miksi|minkä\\s+takia|miks|why)\\b',
  question: '\\?|^(?:paljonko|mikä|mitä|onko|kuinka|milloin|mihin|montako|kerro|how|what|when|which|is|are|do|does|can|tell)\\b',
  remove: '\\b(?:poista\\w*|ota\\s+pois|jätä\\s+pois|pois|ei\\s+tarvita|älä\\s+tilaa|ilman|remove\\w*|delete\\w*|drop|cancel\\w*|take\\s+out|leave\\s+out|without|no\\s+more)\\b',
  substitute: '\\b(?:korvaa\\w*|korvaava\\w*|vaihda\\w*|vaihtoehto\\w*|tilalle|jotain\\s+muuta|substitut\\w*|replace\\w*|alternative\\w*|instead(?:\\s+of)?|swap\\w*)\\b',
  search: '\\b(?:etsi\\w*|hae\\w*|näytä\\w*|löytyykö|onko\\s+teillä|mitä\\s+\\w+\\s+on|find|search(?:\\s+for)?|show(?:\\s+me)?|look(?:ing)?\\s+for|do\\s+you\\s+have)\\b',
  add: '\\b(?:lisää\\w*|tarvitsen|tarvitsemme|tarvin|tarviin|tarvitaan|tarvis|haluan|haluamme|ota|tilaa|laita|need|want|order|add|get|buy|would\\s+like)\\b',
  up: '\\b(?:enemmän|lisää\\w*|nosta\\w*|kasvata\\w*|plus|ylös|ylimääräistä|vielä|more|extra|additional|another|increase\\w*|raise)\\b',
  down: '\\b(?:vähemmän|vähennä\\w*|laske\\w*|pienennä\\w*|miinus|alas|less|fewer|decrease\\w*|reduce\\w*|lower)\\b',
  pct: `${NUM}\\s*(?:%|prosentti\\w*|pros\\b|percent\\w*)`,
  double: '\\b(?:tuplaa\\w*|tuplana|tuplat|kaksinkertais\\w*|tupla|double\\w*|twice)\\b',
  half: '\\b(?:puolita\\w*|puolet|puolikas|halve\\w*|half)\\b',
  qty: `${NUM}\\s*${UNIT}?(?=\\s|$|[.,;:)])`,
  // Sanat, jotka kertovat valintaperusteen eivätkä tuotetta: "find an option that meets our requirements based on price".
  note: '\\b(?:options?|requirements?|meets?|criteria|based|vaatimu\\w*|perusteella|kriteeri\\w*)\\b',
};
const RE = Object.fromEntries(Object.entries(SRC).map(([k, src]) => [k, rx(src)]));
const REG = Object.fromEntries(Object.entries(SRC).map(([k, src]) => [k, rx(src, 'g')]));

const FILLER = new Set([
  'enemmän', 'vähemmän', 'viime', 'viikolla', 'tällä', 'kertaa', 'vielä', 'myös', 'sitä', 'tätä', 'kiitos', 'pliis', 'mulle', 'meille', 'tilaukseen', 'koriin', 'listaan', 'mut', 'mutta', 'että', 'ois', 'olisi', 'hyvä', 'vähän', 'paljon', 'kaikki', 'kaikkea', 'määrä', 'määrää', 'tuote', 'tuotetta', 'tuotteelle', 'riville', 'pois', 'nyt', 'sit', 'sitten', 'jotain', 'muuta', 'on', 'näin', 'niin', 'kpl', 'siihen', 'tähän', 'lisäksi', 'viikko', 'viikon', 'tilaus', 'tilausta', 'mun', 'meidän', 'se', 'ne', 'tää', 'toi',
  // englanti
  'we', 'you', 'please', 'of', 'an', 'some', 'to', 'for', 'our', 'my', 'me', 'us', 'your', 'that', 'this', 'these', 'those', 'with', 'by', 'in', 'at', 'and', 'is', 'are', 'there', 'so', 'much', 'many', 'it', 'can', 'could', 'would', 'like', 'have', 'any', 'just', 'also', 'too', 'if', 'or', 'from', 'thanks', 'thank', 'hi', 'hello', 'hey',
]);

// Ruokavaliorajaukset. Rajaus on ehto, ei hakusana: tuloksista karsitaan tuotteet, joilla merkintää ei ole (ks. labelFilter).
const CLAIMS = [
  { label: 'FREE_FROM_LACTOSE', fi: 'laktoosit\\w*', en: '(?:lactose(?:\\s|-)*free|free\\s+(?:from|of)\\s+lactose|no\\s+lactose|without\\s+lactose)' },
  { label: 'FREE_FROM_GLUTEN', fi: 'gluteenit\\w*', en: '(?:gluten(?:\\s|-)*free|free\\s+(?:from|of)\\s+gluten|no\\s+gluten|without\\s+gluten)' },
  { label: 'VEGAN', fi: 'vegaani\\w*', en: 'vegan' },
  { label: 'EU_ORGANIC_FARMING', fi: 'luomu\\w*', en: 'organic' },
].map((c) => ({ label: c.label, any: rx(`\\b(?:${c.fi}|${c.en})\\b`), enG: rx(`\\b${c.en}\\b`, 'g'), inName: rx(`\\b(?:${c.fi}|${c.en})`) }));

// Valintaperusteet. Reititin vain kirjaa ne; järjestyksen päättää se, joka vertailee vaihtoehdot.
const PREFER = [
  ['price', '\\b(?:price\\w*|cheap\\w*|cost\\w*|afford\\w*|hinta\\w*|hinna\\w*|halv\\w*|edullis\\w*)\\b'],
  ['availability', '\\b(?:availab\\w*|in\\s+stock|saatavuu\\w*|saatavil\\w*|varasto\\w*)\\b'],
  ['reliability', '\\b(?:reliab\\w*|toimitusvarm\\w*)\\b'],
  ['carbon', '\\b(?:carbon|co2|emission\\w*|sustainab\\w*|hiili\\w*|päästö\\w*|vastuullis\\w*|ympäristö\\w*)\\b'],
].map(([key, src]) => ({ key, re: rx(src), reG: rx(src, 'g') }));

// ---------- Kieli ----------
const EN_MARK = rx('\\b(?:i|we|you|need|want|please|order|add|remove|find|show|search|of|by|for|the|some|more|less|with|without|and|litres?|liters?|pieces?|cases?|box(?:es)?|bottles?|tomorrow|today|next|why|how|what|when|approve|confirm|double|half|instead|same|free|milk|cream)\\b', 'g');
const FI_MARK = rx('\\b(?:lisää\\w*|tarvi\\w*|halua\\w*|poista\\w*|korvaa\\w*|vaihda\\w*|etsi\\w*|hae\\w*|näytä\\w*|tilaa\\w*|laita\\w*|ota|ja|tai|sekä|mutta|kpl|ltk|litra\\w*|enemmän|vähemmän|miksi|paljonko|onko|mikä|mitä|sama\\w*|viime|ensi|hyväksy\\w*|vahvista\\w*|tuplaa\\w*|puolita\\w*|ilman|pois|kiitos)\\b|[äö]', 'g');
const isEnglish = (text) => (text.match(EN_MARK) || []).length > (text.match(FI_MARK) || []).length;

// ---------- Toimituspäivä ----------
const DAYS_FI = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'];
const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const pad = (n) => String(n).padStart(2, '0');
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Viikonpäivän seuraava esiintymä, aikaisintaan huomenna: lauantaina sanottu "maanantaiksi" on ylihuominen. */
const nextWeekday = (iso, dow) => addDays(iso, ((dow - new Date(`${iso}T12:00:00Z`).getUTCDay() + 7) % 7) || 7);
const DATE_RULES = [
  [rx(`\\b(?:ensi\\s+|tulevaksi\\s+)?(${DAYS_FI.join('|')})(?:ksi|ks|na|lle|hin|n)?(?:\\s+mennessä)?\\b`, 'g'), (m, t) => nextWeekday(t, DAYS_FI.indexOf(m[1]))],
  [rx(`\\b(?:(?:by|on|for|before|until)\\s+)?(?:(?:next|this)\\s+)?(${DAYS_EN.join('|')})\\b`, 'g'), (m, t) => nextWeekday(t, DAYS_EN.indexOf(m[1]))],
  [rx('\\b(?:ylihuomiseksi|ylihuomenna)(?:\\s+mennessä)?\\b', 'g'), (m, t) => addDays(t, 2)],
  [rx('\\b(?:huomiseksi|huomiselle|huomenna|huomiseen)(?:\\s+mennessä)?\\b', 'g'), (m, t) => addDays(t, 1)],
  [rx('\\b(?:(?:by|for|until)\\s+)?the\\s+day\\s+after\\s+tomorrow\\b', 'g'), (m, t) => addDays(t, 2)],
  [rx('\\b(?:(?:by|for|until)\\s+)?tomorrow\\b', 'g'), (m, t) => addDays(t, 1)],
  [rx('\\b(?:tänään|täksi\\s+päiväksi|(?:by\\s+|for\\s+)?today)\\b', 'g'), (m, t) => t],
  [/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (m) => `${m[1]}-${m[2]}-${m[3]}`],
  [rx('(?<![\\d.,])(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})?(?!\\d)(?:\\s*mennessä)?', 'g'), (m, t) => {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    const year = m[3] ? Number(m[3]) : Number(t.slice(0, 4));
    const iso = `${year}-${pad(mo)}-${pad(d)}`;
    return !m[3] && iso < t ? `${year + 1}-${pad(mo)}-${pad(d)}` : iso; // "5.1." joulukuussa tarkoittaa ensi tammikuuta
  }],
];
function extractDate(text, today) {
  let date = null; let phrase = null; let out = text;
  for (const [re, resolve] of DATE_RULES) {
    out = out.replace(re, (...args) => {
      const iso = resolve(args, today);
      if (!iso) return args[0];
      if (!date) { date = iso; phrase = args[0].trim(); }
      return ' ';
    });
  }
  return { text: out, date, phrase };
}

// ---------- Luvut ----------
/**
 * Tuhaterottimet pois ja desimaalipilkku pisteeksi, ennen kuin viesti pilkotaan pilkuista lausekkeiksi.
 * "1 000" ja "1.000" ovat tuhat. "1,000" on englanniksi tuhat, mutta suomeksi pilkku on desimaalierotin:
 * "2,500 kg" voi olla 2,5 tai 2500, joten se merkitään epäselväksi eikä arvata varmana.
 */
function normalizeNumbers(text, english) {
  let ambiguous = false;
  const join = (sep) => (m, head, rest) => head + rest.replaceAll(sep, '');
  let s = text.replace(/[   ]/g, ' ');
  s = s.replace(/(?<![\d.,])([1-9]\d{0,2})((?: \d{3})+)(?![\d])/g, join(' '));
  s = s.replace(/(?<![\d.,])([1-9]\d{0,2})((?:\.\d{3})+)(?![\d])/g, join('.'));
  s = s.replace(/(?<![\d.,])([1-9]\d{0,2})((?:,\d{3})+)(?![\d])/g, (m, head, rest) => {
    if (english) return head + rest.replaceAll(',', '');
    ambiguous = true;
    return m;
  });
  s = s.replace(/(\d),(?=\d)/g, '$1.');
  return { text: s, ambiguous };
}
const num = (s) => Number(String(s).replace(',', '.'));
function unitOf(raw) {
  if (!raw) return null;
  if (/^ml$/.test(raw)) return { unit: 'l', factor: 0.001 };
  if (/^(dl|desi)/.test(raw)) return { unit: 'l', factor: 0.1 };
  if (/^(l$|litr|lite)/.test(raw)) return { unit: 'l', factor: 1 };
  if (/^(kg|kilo)/.test(raw)) return { unit: 'kg', factor: 1 };
  if (/^(g$|gram)/.test(raw)) return { unit: 'kg', factor: 0.001 };
  return null; // kappaleyksikkö: määrä on myyntiyksiköitä
}

export const splitClauses = (text) => text.split(/\s*(?:,|;|\.\s|\.$|\s+ja\s+|\s+sekä\s+|\s+mutta\s+|\s+mut\s+|\s+plus\s+|\s+and\s+)\s*/).map((s) => s.trim()).filter(Boolean);

function termOf(clause) {
  let s = ` ${clause} `;
  for (const key of ['repeat', 'remove', 'substitute', 'search', 'add', 'up', 'down', 'double', 'half', 'note', 'pct', 'qty']) s = s.replace(REG[key], ' ');
  for (const p of PREFER) s = s.replace(p.reG, ' ');
  return tokenize(s).filter((t) => !FILLER.has(t)).join(' ');
}

/** Karsii hakutuloksista tuotteet, joilta pyydetty merkintä puuttuu. Nimessä oleva sama sana kelpaa, koska osa merkinnöistä puuttuu datasta. */
export function labelFilter(labels) {
  if (!labels?.length) return undefined;
  const claims = CLAIMS.filter((c) => labels.includes(c.label));
  return (p) => claims.every((c) => p.labels?.includes(c.label) || c.inName.test(`${p.name} ${p.nameEn || ''}`.toLowerCase()));
}

/**
 * @param {string} raw käyttäjän viesti
 * @param {{today?: string}} [opts] today = "nyt" ISO-päivänä (testit ja demokello)
 * @returns {{actions: Array, confidence: number, via: 'säännöt', lang: 'fi'|'en', deliveryDate?: string, dateText?: string, prefer?: string[], notes?: string[]}}
 *   Määrätoiminnossa unit on 'l' tai 'kg', kun käyttäjä antoi tilavuuden tai painon; value on silloin litroja tai kiloja, muuten myyntiyksiköitä.
 */
export function routeByRules(raw, opts = {}) {
  const today = opts.today || todayIso();
  const base = (raw || '').toLowerCase().replace(/[!]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return { actions: [], confidence: 0, via: 'säännöt' };
  const lang = isEnglish(base) ? 'en' : 'fi';
  const dated = extractDate(base, today);
  const numbered = normalizeNumbers(dated.text, lang === 'en');
  const text = numbered.text.replace(/\s+/g, ' ').trim();
  const meta = { via: 'säännöt', lang, ...(dated.date ? { deliveryDate: dated.date, dateText: dated.phrase } : {}) };
  const actions = [];
  let confidence = numbered.ambiguous ? 0.5 : 1;

  if (RE.approve.test(text) && text.split(' ').length <= 5) return { actions: [{ type: 'approve' }], confidence: 1, ...meta };
  if (RE.why.test(text)) return { actions: [{ type: 'why', term: termOf(text.replace(RE.why, '')) }], confidence: 0.9, ...meta };

  let rest = text;
  if (RE.repeat.test(rest)) { actions.push({ type: 'repeat_last' }); rest = rest.replace(RE.repeat, ' ').trim(); }
  else if (RE.question.test(text) && !RE.add.test(text) && !RE.pct.test(text)) return { actions: [{ type: 'question', term: raw.trim() }], confidence: 0.7, ...meta };

  const notes = []; const prefer = new Set();
  let carryVerb = null; // "lisää lohta, kermaa ja perunaa" → sama verbi koskee koko listaa
  for (const sentence of rest.split(/(?<=[.?])\s+/)) {
    const prefs = PREFER.filter((p) => p.re.test(sentence)).map((p) => p.key);
    prefs.forEach((k) => prefer.add(k));
    // Myöhempi virke, josta ei jää tuotetta jäljelle, on ohje ("valitse hinnan ja saatavuuden perusteella"), ei tilausrivi.
    if (actions.length && !/\d/.test(sentence) && (prefs.length || RE.note.test(sentence)) && !termOf(sentence)) { notes.push(sentence.replace(/[.\s]+$/, '')); continue; }

    for (const clauseRaw of splitClauses(sentence)) {
      const labels = CLAIMS.filter((c) => c.any.test(clauseRaw)).map((c) => c.label);
      // Englanniksi rajaus irrotetaan hakusanasta ("lactose-free milk" → milk + ehto). Suomeksi sana jää hakuun, koska se on tuotenimissä.
      const clause = lang === 'en' ? CLAIMS.reduce((s, c) => s.replace(c.enG, ' '), clauseRaw) : clauseRaw;
      const extra = labels.length ? { labels } : {};
      const term = termOf(clause);
      const pct = clause.match(RE.pct);
      const qty = clause.replace(RE.pct, ' ').match(RE.qty);
      const dir = RE.down.test(clause) ? -1 : 1;
      if (RE.remove.test(clause)) { carryVerb = 'remove'; actions.push({ type: 'remove', term }); }
      else if (RE.substitute.test(clause)) { carryVerb = null; actions.push({ type: 'substitute', term }); }
      else if (pct) actions.push({ type: 'adjust', term, mode: 'pct', value: dir * num(pct[1]) });
      else if (RE.double.test(clause)) actions.push({ type: 'adjust', term, mode: 'mult', value: 2 });
      else if (RE.half.test(clause)) actions.push({ type: 'adjust', term, mode: 'mult', value: 0.5 });
      else if (RE.search.test(clause)) actions.push({ type: 'search', term, ...extra });
      else if (qty && term) {
        const unit = unitOf(qty[2]);
        actions.push({ type: 'qty', term, value: unit ? +(num(qty[1]) * unit.factor).toFixed(3) : num(qty[1]), ...(unit ? { unit: unit.unit } : {}), relative: RE.up.test(clause) || RE.down.test(clause), dir, addVerb: RE.add.test(clause) || carryVerb === 'add', ...extra });
      }
      else if (term && (RE.add.test(clause) || carryVerb === 'add' || !carryVerb)) { carryVerb = 'add'; actions.push({ type: 'add', term, ...extra }); }
      else if (term && carryVerb === 'remove') actions.push({ type: 'remove', term });
      else confidence = Math.min(confidence, 0.3);
      if (RE.add.test(clause)) carryVerb = 'add';
      const last = actions.at(-1);
      if (last && ['adjust', 'remove', 'substitute', 'search', 'qty', 'add'].includes(last.type) && !last.term) confidence = Math.min(confidence, 0.4);
    }
  }
  if (!actions.length) confidence = 0;
  // Pitkä vapaa lause ilman selvää rakennetta on parempi antaa kielimallille.
  if (actions.length === 1 && actions[0].type === 'add' && tokenize(actions[0].term).length > 3) confidence = Math.min(confidence, 0.45);
  if (actions.some((a) => ['add', 'search', 'qty'].includes(a.type) && tokenize(a.term || '').length > 4)) confidence = Math.min(confidence, 0.45);
  return { actions, confidence, ...meta, ...(prefer.size ? { prefer: [...prefer] } : {}), ...(notes.length ? { notes } : {}) };
}

// Lämmitys: Unicode-säännöt käännetään vasta ensimmäisellä käytöllä (mitattu noin 40 ms), joten ajetaan ne kerran jo latauksessa.
// Sen jälkeen reititys vie alle 0,1 ms viestiltä.
for (const sample of ['i need 1,000 litres of lactose-free milk by monday', 'lisää 1 000 l laktoositonta maitoa maanantaiksi ja 20 % enemmän kermaa']) routeByRules(sample);

/** Osuuko hakusana tilausriviin? Yhdyssanan pääosa (kuohu|kerma) on vahvempi osuma kuin määriteosa (maito|rahka). */
export function matchLines(lines, term) {
  const q = tokenize(term);
  if (!q.length) return [];
  const scored = [];
  for (const line of lines) {
    const toks = tokenize(`${line.name} ${line.brand || ''}`);
    let total = 0; let ok = true;
    for (const qt of q) {
      let best = 0;
      for (const st of stems(qt)) {
        if (st.length < 3) continue;
        for (const t of toks) {
          const s = t === st ? 1 : t.endsWith(st) ? 0.9 : t.startsWith(st) ? (t.length - st.length <= 3 ? 0.8 : 0.5) : 0;
          if (s > best) best = s;
        }
      }
      if (!best) { ok = false; break; }
      total += best;
    }
    if (ok) scored.push({ line, score: total / q.length });
  }
  if (!scored.length) return [];
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score >= top - 0.12).map((s) => s.line);
}
