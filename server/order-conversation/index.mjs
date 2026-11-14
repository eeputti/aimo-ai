// Tilauskeskustelu (TYONJAKO.md, v1-sopimus, henkilö 2).
// Luonnos säilyy palvelimella viestien välillä. Kielimalli tai säännöt tulkitsevat viestin muutoksiksi (interpret.mjs),
// mutta jokainen muutos tarkistetaan ja toteutetaan täällä, ja kaikki vastaustekstit hintoineen kootaan koodissa
// työkalujen palauttamista tiedoista. Tilaus lähtee vain, kun ostaja vastaa TILAA juuri näytettyyn yhteenvetoon.
import crypto from 'node:crypto';
import { CLAIMS } from './interpret.mjs';
import { helsinkiLabel, parseApiTime } from '../gateway/clock.mjs';

const UNIT_FI = { L: 'l', KG: 'kg', PCS: 'kpl' };
const CLAIM_FI = { FREE_FROM_LACTOSE: 'laktoositon', LOW_LACTOSE: 'vähälaktoosinen', FREE_FROM_GLUTEN: 'gluteeniton', VEGAN: 'vegaaninen', VEGETARIAN: 'kasvis', EU_ORGANIC_FARMING: 'luomu' };
const ALLERGEN_FI = { AM: 'maidoton', AW: 'ei gluteeniviljoja', AE: 'munaton', AN: 'pähkinätön', AP: 'ei maapähkinää', AF: 'kalaton', AY: 'soijaton', AC: 'ei äyriäisiä', AS: 'ei seesamia', BC: 'ei selleriä', BM: 'ei sinappia' };
// Gluteeniton-merkintä ja gluteeniviljojen kielto ovat ostajalle sama asia: näytetään kerran.
const dietLabel = (d) => [...d.claims.map((c) => CLAIM_FI[c]), ...d.excludeAllergens.filter((a) => !(a === 'AW' && d.claims.includes('FREE_FROM_GLUTEN'))).map((a) => ALLERGEN_FI[a] || `ei allergeenia ${a}`)].filter(Boolean).join(', ');
// Vahvistus tunnistetaan koodissa, ei mallilla. Pelkkä "joo" ei ole tilauslupa.
const CONFIRM = /^(tilaa|vahvista|vahvistan|hyväksy|hyväksyn|(kyllä|joo|ok|okei)[,\s]+(tilaa|vahvista|vahvistan))[\s.!]*$/iu;
const VAGUE_YES = /^(joo|kyllä|ok|okei|jep|juu|selvä|hyvä|sopii)[\s.!]*$/iu;
const CANCEL = /^(peru|peruuta|tyhjennä|aloita alusta)\b/iu;
// Pelkkä kiitos ei muuta luonnosta eikä tulosta koko listaa uudelleen.
const THANKS = /^(kiitos|kiitti|kiitoksia|kiitän|thx|thanks|tack)(\s+(paljon|tosi paljon|kovasti|avusta))?[\s.!]*$/iu;
const HELP = 'Kirjoita tuotteet ja määrät, esim. "20 l laktoositonta maitoa ja 5 kg voita maanantaiksi".';
// Toimituspäivä kysytään ensin ja yksin: saatavuus ja vaihtoehdot riippuvat päivästä.
const DATE_QUESTION = 'Mille päivälle toimitus? Haen sen jälkeen sille päivälle toimitettavat vaihtoehdot.';
// Vaihtoehtolistan vastaukset tunnistetaan koodissa, jotta numero viittaa aina viimeksi näytettyyn listaan.
const PICK = /^(?:nro\s*|numero\s*)?(\d{1,2})[.)]?(?:\s*kiitos)?[.!\s]*$/iu;
const SHOW = /^(?:näytä(?:\s+(?:lista|ostoslista|tilaus|yhteenveto))?|lista)[.!?\s]*$/iu;
const MORE = /^(?:(?:näytä|anna|hae|katso)\s+)?(?:lisää|muita|muut|enemmän)(?:\s+(?:vaihtoehtoja|vaihtoehdot|tuotteita|tuotteet))?(?:\s+kiitos)?[.!?\s]*$|^onko\s+(?:muita|muuta|lisää)(?:\s+(?:vaihtoehtoja|tuotteita))?[?.!\s]*$/iu;
const CHEAPEST = /^(?:(?:otetaan|ota|laita|valitse|se|joo)\s+)*(?:halvin|halvinta|halvimman|halvempi|edullisin|edullisinta)(?:\s+(?:vaihtoehto|kiitos))?[.!\s]*$/iu;
// Kiire: asiakas haluaa toimituksen mahdollisimman pian. Kellonaikatoive kirjataan, mutta sitä ei luvata:
// tilausjärjestelmä kertoo vain toimituspäivän ja tilausaikarajan.
const RUSH = /(?:^|[\s,.!?])(?:tänään|tänää|heti|nyt\s+heti|asap|kiire\p{L}*|pikaisesti|pikana|mahd(?:ollisimman)?\.?\s+pian|aikaisin\s+mahdollinen)(?=$|[\s,.!?])/iu;
const TIME_WISH = /(?:ennen|viimeistään)\s+(?:klo|kello)\s*\d{1,2}(?:[.:]\d{2})?|(?:klo|kello)\s*\d{1,2}(?:[.:]\d{2})?\s*(?:mennessä|asti)|(?:huomenna\s+)?aamu(?:lla|ks(?:i|een)?|päivällä|seitsemäksi)|aamuun|iltapäivällä/iu;
const RUSH_DATE_QUESTION = 'Mille päivälle toimitus? Jos on kiire, kirjoita esim. "huomenna", niin katson aikaisimman päivän, jolle ehtii.';
const DATE_YES = /^(?:1[.)]?|kyllä|joo|juu|jep|ok|okei|sopii|vaihda|vaihdetaan|käy)(?:[,\s]+(?:kiitos|vaan|vain|sopii|käy|vaihda|vaihdetaan|se))*[.!\s]*$/iu;
const DATE_NO = /^(?:2[.)]?|ei|ei kiitos|pidetään|pidä|ei käy)(?:[,\s]+(?:kiitos|pidetään|pidä|se|sama|päivä))*[.!\s]*$/iu;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Myyntierän sana lukumäärän kanssa: "5 rasiaa", "1 rasia". Tuntematon tunnus näytetään sellaisenaan.
const PACK = { ras: ['rasia', 'rasiaa'], ltk: ['laatikko', 'laatikkoa'], pkt: ['paketti', 'pakettia'], pss: ['pussi', 'pussia'], prk: ['purkki', 'purkkia'],
  pl: ['pullo', 'pulloa'], krt: ['kartonki', 'kartonkia'], kan: ['kanisteri', 'kanisteria'], sk: ['säkki', 'säkkiä'], kää: ['kääre', 'käärettä'] };

const num = (n) => String(+Number(n).toFixed(3)).replace('.', ',');
const eur = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
const qty = (q) => (q ? `${num(q.value)} ${UNIT_FI[q.unit]}` : '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const helsinki = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(new Date(ms));
const dateLabel = (iso) => new Intl.DateTimeFormat('fi-FI', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const validQuantity = (q) => q && Number.isFinite(q.value) && q.value > 0 && q.value <= 100000 && ['L', 'KG', 'PCS'].includes(q.unit);
const cleanQuantity = (q) => ({ value: q.value, unit: q.unit, ...(q.unit === 'PCS' && ['items', 'sales'].includes(q.basis) ? { basis: q.basis } : {}) });
const lineLabel = (l) => `${l.productTerm}${l.quantity ? ` ${qty(l.quantity)}` : ''}${[...l.claims.map((c) => CLAIM_FI[c]), ...(l.excludeAllergens.length ? [`ei allergeeneja ${l.excludeAllergens.join(', ')}`] : [])].filter(Boolean).map((x) => ` (${x})`).join('')}`;
// Sisältö, jonka muutos kasvattaa revisiota ja mitätöi tarjouksen ja hyväksynnän.
const content = (d) => JSON.stringify([d.deliveryDate, d.deliverySiteId, d.diet.claims, d.diet.excludeAllergens, d.lines.map((l) => [l.ref, l.productTerm, l.quantity, l.claims, l.excludeAllergens, l.selectedProductId || null, l.answeredClaims || []])]);

function newDraft(customer) {
  return { id: `WD-${crypto.randomUUID()}`, state: 'active', revision: 0, customerId: customer.customerId, bindingVersion: customer.bindingVersion,
    deliveryDate: null, deliverySiteId: customer.deliverySites?.length === 1 ? customer.deliverySites[0].id : null,
    diet: { known: false, claims: [], excludeAllergens: [] }, lines: [], offered: {}, seen: {}, quote: null, pending: null, lastRef: null, lastRefTurn: -1, turn: 0, seq: 0 };
}

/** Toteuttaa tulkin ehdottamat muutokset. Tuntematon ref, kelvoton määrä tai tarjoamaton vaihtoehto ohitetaan ja raportoidaan. */
function apply(draft, turn, customer, today) {
  const notes = turn.note ? [String(turn.note).slice(0, 300)] : [];
  const touch = (ref) => { draft.lastRef = ref; draft.lastRefTurn = draft.turn; };
  const find = (ref) => draft.lines.find((l) => l.ref === ref);
  const claims = (list) => [...new Set((list || []).filter((c) => CLAIMS.includes(c)))];
  const allergens = (list) => [...new Set((list || []).filter((a) => /^[A-Z]{2}$/.test(a)))];
  if (turn.deliveryDate) {
    if (!validDate(turn.deliveryDate) || turn.deliveryDate < today) notes.push('Toimituspäivän pitää olla tuleva päivä.');
    else {
      // Toinen päivä: aiemmin näytetyt vaihtoehdot, hinnat ja saatavuus eivät enää päde.
      if (draft.deliveryDate !== turn.deliveryDate) { draft.offered = {}; draft.seen = {}; }
      draft.deliveryDate = turn.deliveryDate;
    }
  }
  for (const o of (turn.ops || []).slice(0, 30)) {
    const line = o.ref ? find(o.ref) : null;
    // Viestissä mainittu ruokavaatimus tarkoittaa, että asia on käsitelty: sitä ei kysytä enää erikseen.
    if (['add', 'update'].includes(o.op) && (claims([...(o.claims || []), ...(o.addClaims || [])]).length || allergens(o.excludeAllergens).length)) draft.diet.known = true;
    if (o.op === 'diet') {
      // Koko tilauksen ruokavalio. Tyhjä vastaus ("ei") kirjaa vain, että asia on kysytty.
      const before = JSON.stringify(draft.diet);
      draft.diet = { known: true, claims: claims([...draft.diet.claims, ...(o.addClaims || [])]), excludeAllergens: allergens([...draft.diet.excludeAllergens, ...(o.excludeAllergens || [])]) };
      if (before !== JSON.stringify(draft.diet) && (draft.diet.claims.length || draft.diet.excludeAllergens.length)) { for (const l of draft.lines) { l.selectedProductId = null; l.selectedName = null; l.selectedWarning = null; } draft.offered = {}; draft.seen = {}; }
      continue;
    }
    if (o.op === 'add' && typeof o.productTerm === 'string' && o.productTerm.trim()) {
      if (draft.lines.length >= 20) { notes.push('Luonnoksessa voi olla enintään 20 riviä.'); continue; }
      const ref = `L${++draft.seq}`;
      draft.lines.push({ ref, productTerm: o.productTerm.trim().slice(0, 80), quantity: validQuantity(o.quantity) ? cleanQuantity(o.quantity) : null, claims: claims(o.claims), excludeAllergens: allergens(o.excludeAllergens), selectedProductId: null, selectedName: null, selectedWarning: null });
      touch(ref);
    } else if (o.op === 'update' && line) {
      const before = JSON.stringify([line.productTerm, line.claims, line.excludeAllergens]);
      if (o.quantity) {
        if (!validQuantity(o.quantity)) notes.push(`Tarkista määrä: ${line.productTerm}.`);
        else {
          // Näytettyjen vaihtoehtojen myyntierät ja hinnat laskettiin vanhalle määrälle.
          if (JSON.stringify(line.quantity) !== JSON.stringify(cleanQuantity(o.quantity))) { delete draft.offered[line.ref]; delete draft.seen?.[line.ref]; }
          line.quantity = cleanQuantity(o.quantity);
        }
      }
      if (typeof o.productTerm === 'string' && o.productTerm.trim()) {
        if (line.productTerm !== o.productTerm.trim()) line.answeredClaims = [];
        line.productTerm = o.productTerm.trim().slice(0, 80);
      }
      line.claims = claims([...line.claims, ...(o.addClaims || [])]).filter((c) => !(o.removeClaims || []).includes(c));
      line.excludeAllergens = allergens([...line.excludeAllergens, ...(o.excludeAllergens || [])]);
      // Tuotteen tai ruokavaatimuksen muutos vaatii uuden tuotevalinnan. Määrän muutos säilyttää valinnan ja tarkistetaan tarjouksessa.
      if (before !== JSON.stringify([line.productTerm, line.claims, line.excludeAllergens])) { line.selectedProductId = null; line.selectedName = null; delete draft.offered[line.ref]; delete draft.seen?.[line.ref]; }
      touch(line.ref);
    } else if (o.op === 'remove' && line) {
      draft.lines = draft.lines.filter((l) => l !== line); delete draft.offered[line.ref]; delete draft.seen?.[line.ref];
    } else if (o.op === 'select' && line) {
      const option = draft.offered[line.ref]?.[o.option - 1];
      if (!option) { notes.push(`Valitse numero näytetyistä vaihtoehdoista: ${line.productTerm}.`); continue; }
      line.selectedProductId = option.productId; line.selectedName = option.name; line.selectedWarning = option.warning || null;
    } else if (o.op === 'no_preference') {
      if (draft.pending?.kind === 'preference') {
        for (const ref of draft.pending.refs) {
          if (o.ref && o.ref !== ref) continue;
          const target = find(ref);
          if (target) target.answeredClaims = [...new Set([...(target.answeredClaims || []), draft.pending.claim])];
        }
      } else draft.diet.known = true;
    } else if (o.op === 'site') {
      const site = customer.deliverySites?.[o.option - 1];
      if (site) draft.deliverySiteId = site.id; else notes.push('Valitse toimituspaikka numerolla.');
    }
  }
  return notes;
}

// Muutosesimerkki tilauksen omista riveistä: ei neuvota muuttamaan maitoa, jos tilauksessa ei ole maitoa.
function changeHint(draft) {
  const first = draft.lines.find((l) => l.quantity); const last = draft.lines[draft.lines.length - 1];
  if (!first || !last) return 'Voit vielä muuttaa määriä tai poistaa rivejä.';
  const more = first.quantity.value >= 4 ? Math.ceil(first.quantity.value * 1.5) : first.quantity.value + 1;
  return `Voit vielä muuttaa, esim. "${first.productTerm} ${qty({ value: more, unit: first.quantity.unit })}" tai "poista ${last.productTerm}".`;
}

const joinFi = (names) => (names.length < 2 ? names[0] || '' : `${names.slice(0, -1).join(', ')} ja ${names.at(-1)}`);
const packWord = (n, label) => { const w = PACK[label]; return w ? (Number(n) === 1 ? w[0] : w[1]) : label; };
// Vaihtoehto ostajan omassa yksikössä: myyntierä ja sen kattama määrä, esim. "5 rasiaa (50 munaa)".
function optionLabel(o, line) {
  const c = o.covers;
  const items = c?.unit === 'PCS' && line.quantity?.basis === 'items';
  const covers = !c ? '' : items ? ` (${num(c.value)} ${/kananmun/iu.test(line.productTerm) ? 'munaa' : 'kpl'})`
    : c.unit === 'PCS' && c.value === o.salesUnits ? '' : ` (${qty(c)})`;
  return `${o.name}, ${num(o.salesUnits)} ${packWord(o.salesUnits, o.salesUnitLabel)}${covers}, ${eur(o.lineNet)}${o.warning ? ` (${o.warning})` : ''}`;
}

function summary(draft, q, customer) {
  const site = customer.deliverySites?.find((s) => s.id === draft.deliverySiteId);
  const warn = (ref) => { const w = draft.lines.find((l) => l.ref === ref)?.selectedWarning; return w ? `\n   Huom: ${w}` : ''; };
  const rows = q.lines.map((l, i) => `${i + 1}. ${l.name}: ${num(l.salesUnits)} ${l.salesUnitLabel}${l.covers && !(l.covers.unit === 'PCS' && l.covers.value === l.salesUnits) ? ` (${qty(l.covers)})` : ''}, ${eur(l.lineNet)}${warn(l.ref)}`);
  const diet = dietLabel(draft.diet);
  const cutoff = q.lines.map((l) => l.cutoffLabel).filter(Boolean)[0];
  return [`*Tilausluonnos*, toimitus ${dateLabel(draft.deliveryDate)}${site ? `, ${site.label}` : ''}`, ...(diet ? [`Huomioitu: ${diet}`] : []), ...rows, `Yhteensä ${eur(q.totals.net)} (alv 0 %)`,
    ...(cutoff ? [`Tilattava viimeistään ${cutoff}.`] : []), ...(draft.timeWish ? [timeWishNote(draft)] : []), '', `Vahvista vastaamalla *TILAA*. ${changeHint(draft)}`].join('\n');
}
const timeWishNote = (draft) => `Toivoit toimitusta "${draft.timeWish}": kellonaikaa en näe tilausjärjestelmästä, joten en voi luvata sitä. Toimituspäivä on ${dateLabel(draft.deliveryDate)}`;

/**
 * @param {object} o
 * @param {ReturnType<import('./store.mjs').openDraftStore>} o.store
 * @param {{suggest: Function, quote: Function, submit: Function}} o.tools henkilön 3 työkalut (server/order-tools)
 * @param {(input: {text: string, draft: object, today: string, now: number}) => Promise<{intent: string, deliveryDate?: string, ops: object[]}>} o.interpretTurn
 * @param {() => number} [o.now]
 */
export function createOrderingConversation({ store, tools, interpretTurn, now = Date.now }) {
  // Kysyy puuttuvat tiedot, näyttää vaihtoehdot tai yhteenvedon. Ei koskaan valitse tuotetta, päivää tai ruokavaatimusta itse.
  /** opts.again = { ref, more } näyttää saman rivin listan uudelleen, opts.more hakee sille seuraavat vaihtoehdot. */
  async function advance(draft, customer, depth = 0, opts = {}) {
    draft.pending = null;
    if (!draft.lines.length) return { status: 'collecting', text: `Luonnos on tyhjä. ${HELP}` };
    const list = draft.lines.map((l) => `- ${lineLabel(l)}${l.selectedName ? `: ${l.selectedName}` : ''}`).join('\n');
    // Toimituspäivä ensin ja yksin: saatavuus, hinnat ja vaihtoehdot riippuvat päivästä. Mainitut tuotteet säilyvät luonnoksessa.
    if (!draft.deliveryDate) {
      draft.pending = { kind: 'checklist', asks: ['date'], refs: [] };
      return { status: 'collecting', text: `Luonnoksessa nyt:\n${list}\n\n${draft.rush ? RUSH_DATE_QUESTION : DATE_QUESTION}` };
    }
    // Sitten määrät. Ruokavaliotarkennus kysytään vasta, kun oikeat tilattavat vaihtoehdot eroavat siinä;
    // asiakkaan itse ilmoittamat vaatimukset pätevät aina.
    const noQty = draft.lines.filter((l) => !l.quantity);
    const questions = []; const asks = [];
    if (noQty.length) { questions.push(`Kuinka paljon: ${noQty.map((l) => l.productTerm).join(', ')}?`); asks.push('quantity'); }
    if (asks.length) draft.pending = { kind: 'checklist', asks, refs: noQty.map((l) => l.ref) };
    if (!draft.deliverySiteId && customer.deliverySites?.length > 1 && !questions.length) {
      questions.push(`Mihin toimitetaan? ${customer.deliverySites.map((s, i) => `${i + 1}) ${s.label}`).join(' ')}`);
      if (!draft.pending) draft.pending = { kind: 'site', refs: [] };
    }
    if (questions.length) return { status: 'collecting', text: `Luonnoksessa nyt:\n${list}\n\n${questions.join('\n')}` };

    const open = draft.lines.filter((l) => !l.selectedProductId);
    if (open.length) {
      // Yksi tuoterivi kerrallaan: numerot 1-3 viittaavat aina viimeksi näytettyyn listaan, seuraava numero hakee lisää.
      draft.seen ||= {};
      const problems = []; let x = null; let line = null;
      const again = opts.again && open.find((l) => l.ref === opts.again.ref && draft.offered[l.ref]?.length);
      if (again && opts.more && opts.again.more === false) {
        // Lisärivi jäi pois, koska muita tälle päivälle tilattavia ei ollut: ei uutta hakua.
        problems.push(`Muita vaihtoehtoja päivälle ${dateLabel(draft.deliveryDate)} ei löytynyt: ${again.productTerm}.`);
      } else if (again && opts.more) {
        const shownIds = draft.seen[again.ref]?.length ? draft.seen[again.ref] : draft.offered[again.ref].map((o) => o.productId);
        const s = await tools.suggest({ customer, draft: { ...draft, lines: [again] }, exclude: { [again.ref]: shownIds } });
        if (s.lines[0]?.options?.length) {
          x = s.lines[0]; line = again;
          draft.seen[again.ref] = [...new Set([...shownIds, ...x.options.map((o) => o.productId)])];
        } else {
          problems.push(...(s.issues.length ? s.issues.map((i) => i.message) : [`Muita vaihtoehtoja ei löytynyt: ${again.productTerm}.`]));
          // Ei uusia: sama lista ilman lisäpyyntöä, jotta numerot pysyvät samoina.
          if (s.issues.some((i) => i.code === 'NO_MORE_OPTIONS')) opts = { again: { ...opts.again, more: false } };
        }
      }
      if (!x && again) { x = { ref: again.ref, options: draft.offered[again.ref], more: opts.again.more === true, exact: opts.again.exact }; line = again; }
      // Kiireellinen päivä (tänään, huomenna tai kiireeksi sanottu): jos pyydetylle päivälle ei ehdi, haetaan aikaisin
      // päivä, jolle sama tuote on tilattavissa, ja kysytään päivän vaihtoa. Ostajan hylkäämää vaihtoa ei tarjota uudestaan.
      const today = helsinki(now());
      const urgent = draft.rush || draft.deliveryDate <= addDays(today, 1);
      if (!x) {
        for (const l of open) {
          const s = await tools.suggest({ customer, draft: { ...draft, lines: [l] } });
          if (s.lines[0]?.options?.length) { problems.push(...s.issues.map((i) => i.message)); x = s.lines[0]; line = l; draft.seen[l.ref] = x.options.map((o) => o.productId); break; }
          const none = s.issues.find((i) => i.code === 'NO_ORDERABLE_PRODUCT' && i.ref === l.ref);
          if (none && urgent && !(draft.keptDates || []).includes(draft.deliveryDate)) {
            let earliest = none.nextDeliveryDate && none.nextDeliveryDate > draft.deliveryDate ? none.nextDeliveryDate : null;
            for (let k = 1; !earliest && k <= 5; k += 1) {
              const probe = await tools.suggest({ customer, draft: { ...draft, deliveryDate: addDays(draft.deliveryDate, k), lines: [l] } });
              if (probe.lines[0]?.options?.length) earliest = addDays(draft.deliveryDate, k);
            }
            if (earliest) {
              const from = draft.deliveryDate;
              draft.pending = { kind: 'date_offer', date: earliest, from, refs: [l.ref] };
              const when = from === today ? 'Tänään' : from === addDays(today, 1) ? `Huomiseksi (${dateLabel(from)})` : `Päivälle ${dateLabel(from)}`;
              return { status: 'collecting', text: [...problems, `${when} ei enää ehdi: ${l.productTerm}. Aikaisin toimitettava päivä on ${dateLabel(earliest)}`,
                `Vaihdetaanko koko tilauksen toimitus päivälle ${dateLabel(earliest)}?`, `1) kyllä, ${dateLabel(earliest)}`, `2) ei, pidetään ${dateLabel(from)}`].join('\n') };
            }
          }
          problems.push(...s.issues.map((i) => i.message));
        }
      }
      if (!x) return { status: 'collecting', text: `${problems.join('\n')}\nKokeile toista päivää tai tarkenna tuotetta. Tilausta ei ole tehty.` };
      draft.offered[x.ref] = x.options;
      const preference = !again && !draft.diet.known && (x.clarify || []).find((claim) => !line.answeredClaims?.includes(claim)
        && !line.claims.includes(claim) && !draft.diet.claims.includes(claim));
      if (preference) {
        draft.pending = { kind: 'preference', refs: [x.ref], claim: preference };
        return { status: 'collecting', text: `Luonnoksessa nyt:\n${list}\n\n${cap(line.productTerm)}: haluatko laktoositonta vai käykö tavallinen?\n1) laktoositon\n2) tavallinen käy` };
      }
      const moreNo = x.more ? x.options.length + 1 : null;
      draft.pending = { kind: 'choose', refs: [x.ref], options: x.options.length, more: moreNo, ...(x.exact === false ? { exact: false } : {}) };
      const numbers = x.options.map((_, i) => String(i + 1));
      const how = numbers.length === 1 ? 'Vastaa 1.' : `Vastaa ${numbers.slice(0, -1).join(', ')} tai ${numbers.at(-1)}.`;
      const later = open.filter((l) => l.ref !== x.ref).map((l) => l.productTerm);
      const diet = dietLabel(draft.diet);
      // Myyntierä voi olla tarvetta suurempi: kerrotaan, ettei tarvetta ole muutettu. Pelkät luomuvaihtoehdot mainitaan.
      const covered = x.options.filter((o) => o.covers?.unit === line.quantity.unit).map((o) => o.covers.value);
      const smallest = covered.length ? Math.min(...covered) : null;
      const notes = [...(smallest > line.quantity.value ? [`Tarve on ${qty(line.quantity)}; pienin näistä myyntieristä kattaa ${qty({ value: smallest, unit: line.quantity.unit })}.`] : []),
        ...(!line.claims.includes('EU_ORGANIC_FARMING') && x.options.every((o) => o.labels?.includes('EU_ORGANIC_FARMING')) ? ['Näytetyt vaihtoehdot ovat luomua.'] : [])];
      // Kiireessä tilausaikaraja näkyy jo vaihtoehdoissa (aikaisin näytetyistä, työkalujen tiedoista). Kellonaikaa ei luvata.
      const cutoffAt = urgent ? x.options.map((o) => o.cutoff).filter((c) => parseApiTime(c)).sort((a, b) => parseApiTime(a) - parseApiTime(b))[0] : null;
      const day = draft.deliveryDate === today ? 'Tämän päivän toimitukseen' : draft.deliveryDate === addDays(today, 1) ? 'Huomiselle' : `Päivälle ${dateLabel(draft.deliveryDate)}`;
      if (cutoffAt) notes.push(`${day} ehtii tilata ${helsinkiLabel(cutoffAt)} asti.`);
      if (draft.timeWish && !draft.timeWishNoted) { notes.push(timeWishNote(draft)); draft.timeWishNoted = true; }
      const block = [`Toimitus ${dateLabel(draft.deliveryDate)}, hinnat alv 0 %.${diet ? ` Huomioitu: ${diet}.` : ''}`,
        ...(x.exact === false ? [`Tarkkaa osumaa ei löytynyt: ${line.productTerm}. Lähimmät tilattavat vaihtoehdot:`] : []),
        `*${cap(lineLabel(line))}:*`, ...x.options.map((o, i) => `${i + 1}) ${optionLabel(o, line)}`),
        ...(moreNo ? [`${moreNo}) Näytä lisää vaihtoehtoja`] : []), ...notes,
        `${how}${later.length ? ` Sen jälkeen valitaan ${joinFi(later)}.` : ''}`].join('\n');
      return { status: 'choosing', text: [...problems, block].join('\n\n') };
    }

    const q = await tools.quote({ customer, draft });
    if (q.issues.length) {
      // Tilattavaksi kelpaamaton valinta puretaan, jotta ostaja valitsee uudelleen. Mitään ei vaihdeta hiljaa.
      for (const i of q.issues) { const l = draft.lines.find((line) => line.ref === i.ref); if (l) { l.selectedProductId = null; l.selectedName = null; l.selectedWarning = null; delete draft.offered[l.ref]; } }
      const text = `${q.issues.map((i) => i.message).join('\n')}\nTilausta ei ole tehty.`;
      if (depth < 1 && q.issues.some((i) => i.ref)) { const next = await advance(draft, customer, depth + 1); return { ...next, text: `${text}\n\n${next.text}` }; }
      return { status: 'collecting', text };
    }
    draft.quote = { quoteId: q.quoteId, revision: draft.revision, expiresAt: q.expiresAt };
    return { status: 'ready', text: summary(draft, q, customer) };
  }

  async function confirm(draft, customer) {
    if (!draft.quote || draft.quote.revision !== draft.revision) {
      const next = await advance(draft, customer);
      return { ...next, text: `Vahvistettavaa yhteenvetoa ei vielä ole.\n\n${next.text}` };
    }
    if (customer.permissions?.placeOrders !== true) return { status: 'error', text: 'Sinulla ei ole tilausoikeutta tälle asiakkuudelle. Luonnos säilyy, tilausta ei tehty.' };
    if (Date.parse(draft.quote.expiresAt) <= now()) {
      draft.quote = null;
      const next = await advance(draft, customer);
      return { ...next, text: `Tarjous ehti vanhentua, joten tarkistin hinnat uudelleen. Tilausta ei vielä tehty.\n\n${next.text}` };
    }
    const quoteId = draft.quote.quoteId;
    const r = await tools.submit({ customer, draft, quoteId, approval: { draftId: draft.id, revision: draft.revision, quoteId }, idempotencyKey: `wa-${draft.id}-r${draft.revision}` });
    if (r.status === 'confirmed' || r.status === 'pending_approval') {
      // Rakenteinen tilaustunnus ja tila talteen: maksupolku ei poimi tunnusta tekstistä, ja uusinta säilyttää hyväksyntätilan.
      draft.state = 'ordered'; draft.orderId = r.orderId; draft.orderStatus = r.status;
      const total = r.totals ? `, yhteensä ${eur(r.totals.net)} (alv 0 %)` : '';
      return { status: r.status, orderId: r.orderId, text: r.status === 'confirmed'
        ? `Tilaus ${r.orderId} on tallennettu. Toimitus ${dateLabel(r.deliveryDate || draft.deliveryDate)}${total}.\nTämä on demoympäristö: oikeaa Valio-tilausta ei lähetetty.`
        : `Tilaus ${r.orderId} odottaa yrityksesi hyväksyjän kuittausta${total}. Tilaus ei ole vielä vahvistettu.\nTämä on demoympäristö: oikeaa Valio-tilausta ei lähetetty.` };
    }
    draft.quote = null;
    return { status: 'rejected', text: `Tilausta ei tehty:\n${(r.reasons || []).map((x) => `- ${x.message}`).join('\n') || '- Tilaus hylättiin.'}\nLuonnos säilyy. Kirjoita "näytä", niin tarkistan tilanteen uudelleen.` };
  }

  return async function handleTurn({ messageId, conversationId, customer, text, receivedAt, context }) {
    const done = store.result(messageId);
    if (done) return done; // sama viesti uudelleen: sama vastaus, ei uusia muutoksia
    if (!customer?.customerId || customer.permissions?.readProducts !== true) return { status: 'error', text: 'Asiakkuuttasi ei voitu vahvistaa, joten en voi näyttää tuotteita tai tehdä tilausta.' };
    const t = String(text || '').trim().slice(0, 4000);
    const today = helsinki(now());
    let draft = store.active(conversationId);
    // Luonnos kuuluu yhdelle asiakkuudelle ja sidokselle. Vaihtunut sidos ei peri vanhaa luonnosta.
    if (draft && (draft.customerId !== customer.customerId || draft.bindingVersion !== customer.bindingVersion)) { draft.state = 'cancelled'; store.save(conversationId, draft, `${messageId}:rebind`, {}); draft = null; }
    draft ||= newDraft(customer);
    draft.diet ||= { known: false, claims: [], excludeAllergens: [] };
    let result;
    try {
      if (CANCEL.test(t)) {
        draft.state = 'cancelled';
        result = { status: 'collecting', text: 'Luonnos tyhjennetty. Tilausta ei tehty.' };
      } else if (CONFIRM.test(t)) {
        const last = !draft.lines.length && store.lastOrdered(conversationId);
        // Tunnus vain, kun tallennetun tilauksen tila tiedetään. Vanha luonnos ilman tilaa ei tuota maksulinkkiä tekstin perusteella.
        result = last ? { status: last.orderStatus || 'confirmed', ...(last.orderStatus && last.orderId ? { orderId: last.orderId } : {}),
          text: `Tilaus ${last.orderId} on jo tallennettu. Uutta tilausta ei tehty.` } : await confirm(draft, customer);
      } else if (THANKS.test(t)) {
        const ready = draft.quote?.revision === draft.revision && !draft.pending;
        result = ready ? { status: 'ready', text: 'Ole hyvä! Luonnos odottaa vahvistusta: vastaa *TILAA*, kun haluat tilata.' }
          : draft.lines.length ? { status: 'collecting', text: 'Ole hyvä! Luonnos on tallessa ja jatkuu siitä, mihin jäätiin.' }
            : { status: 'collecting', text: 'Ole hyvä! Kirjoita, kun tarvitset jotain.' };
      } else if (VAGUE_YES.test(t) && draft.quote?.revision === draft.revision && !draft.pending) {
        result = { status: 'ready', text: 'Vahvista tilaus vastaamalla *TILAA*. Muuten luonnos jää odottamaan.' };
      } else {
        const before = content(draft);
        // Tarkennus on numeroitu kuten vaihtoehdot: 1 = laktoositon, 2 = tavallinen käy.
        const preferenceYes = draft.pending?.kind === 'preference' && (VAGUE_YES.test(t) || /^(?:1[.)]?|laktoosit(?:tomana|tomina|onta|on))[.!\s]*$/iu.test(t));
        const preferenceNo = draft.pending?.kind === 'preference' && /^(?:2[.)]?|ei|ei väliä|ei tarvitse|ei tarvi|tavallinen|tavallista|tavalliset|ihan tavallista|ihan tavalliset|normaali|normaalia|ihan normi|kumpikin käy|kaikki käy)[.!\s]*$/iu.test(t);
        // Kiire ja kellonaikatoive kirjataan viestistä; ne eivät muuta luonnoksen sisältöä eivätkä ole lupaus.
        const wish = t.match(TIME_WISH)?.[0];
        if (wish) { draft.timeWish = wish.slice(0, 40); draft.timeWishNoted = false; }
        if (wish || RUSH.test(t)) draft.rush = true;
        // Vastaus aikaisimman päivän ehdotukseen: 1/kyllä vaihtaa koko tilauksen päivän, 2/ei pitää pyydetyn.
        const offer = draft.pending?.kind === 'date_offer' ? draft.pending : null;
        const dateAnswer = offer && DATE_YES.test(t) ? { intent: 'order', deliveryDate: offer.date, ops: [] }
          : offer && DATE_NO.test(t) ? (draft.keptDates = [...new Set([...(draft.keptDates || []), offer.from])], { intent: 'order', ops: [] }) : null;
        // Vastaus viimeksi näytettyyn vaihtoehtolistaan: numero, "halvin" tai "näytä lisää". Koodissa, ei mallikutsua.
        const choosing = draft.pending?.kind === 'choose' && draft.pending.refs?.length === 1 ? draft.pending : null;
        const shownOptions = choosing ? draft.offered[choosing.refs[0]] || [] : [];
        const picked = choosing ? Number(t.match(PICK)?.[1]) : NaN;
        // "4" tai listan seuraava numero on lisäpyyntö myös silloin, kun lisärivi jäi pois: silloin kerrotaan, ettei lisää ole.
        const nextNumber = choosing && choosing.more == null && picked > shownOptions.length && (picked === shownOptions.length + 1 || picked === 4);
        const wantsMore = Boolean(choosing && ((picked && picked === choosing.more) || nextNumber || MORE.test(t)));
        const cheapest = choosing && shownOptions.length && CHEAPEST.test(t)
          ? shownOptions.reduce((best, o, i) => (o.lineNet < shownOptions[best].lineNet ? i : best), 0) + 1 : null;
        const choice = SHOW.test(t) ? { intent: 'show', ops: [] }
          : wantsMore ? { intent: 'order', ops: [] }
          : picked ? { intent: 'order', ops: [{ op: 'select', ref: choosing.refs[0], option: picked }] }
            : cheapest ? { intent: 'order', ops: [{ op: 'select', ref: choosing.refs[0], option: cheapest }] } : null;
        const turn = dateAnswer || choice || (preferenceYes || preferenceNo ? { intent: 'order', ops: draft.pending.refs.map((ref) => preferenceYes
          ? { op: 'update', ref, addClaims: [draft.pending.claim] } : { op: 'no_preference', ref }) }
          : await interpretTurn({ text: t, draft: structuredClone(draft), today, now: now(), receivedAt, context }));
        const moreAsked = wantsMore || Boolean(choosing && (turn.ops || []).some((o) => o.op === 'more' && (!o.ref || o.ref === choosing.refs[0])));
        const notes = apply(draft, turn, customer, today);
        draft.turn += 1;
        const unchanged = content(draft) === before;
        if (!unchanged) { draft.revision += 1; draft.quote = null; }
        else if (turn.intent === 'other' && !notes.length && !draft.lines.length) {
          result = { status: 'collecting', text: `Olen Valio Aimon tilausapuri. ${HELP}` };
        }
        if (!result) {
          // Muuttumaton luonnos: sama lista uudelleen (virheellinen numero) tai seuraavat vaihtoehdot ilman uutta alkuhakua.
          const next = await advance(draft, customer, 0, choosing && unchanged ? { again: { ref: choosing.refs[0], more: choosing.more != null, exact: choosing.exact }, more: moreAsked } : {});
          result = { ...next, text: [...notes, next.text].join('\n') };
        }
      }
    } catch {
      result = { status: 'error', text: 'Käsittely ei nyt onnistunut. Luonnos säilyy ennallaan, eikä tilausta ole tehty. Yritä hetken kuluttua uudelleen.' };
      store.save(conversationId, null, messageId, { ...result, draftId: draft.id, revision: draft.revision });
      return { ...result, draftId: draft.id, revision: draft.revision };
    }
    const out = { text: result.text, status: result.status, draftId: draft.id, revision: draft.revision, ...(result.orderId ? { orderId: result.orderId } : {}) };
    store.save(conversationId, draft.lines.length || draft.state !== 'active' ? draft : null, messageId, out);
    return out;
  };
}
