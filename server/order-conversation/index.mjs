// Tilauskeskustelu (TYONJAKO.md, v1-sopimus, henkilö 2).
// Luonnos säilyy palvelimella viestien välillä. Kielimalli tai säännöt tulkitsevat viestin muutoksiksi (interpret.mjs),
// mutta jokainen muutos tarkistetaan ja toteutetaan täällä, ja kaikki vastaustekstit hintoineen kootaan koodissa
// työkalujen palauttamista tiedoista. Tilaus lähtee vain, kun ostaja vastaa TILAA juuri näytettyyn yhteenvetoon.
import crypto from 'node:crypto';
import { CLAIMS } from './interpret.mjs';

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
    diet: { known: false, claims: [], excludeAllergens: [] }, lines: [], offered: {}, quote: null, pending: null, lastRef: null, lastRefTurn: -1, turn: 0, seq: 0 };
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
    else draft.deliveryDate = turn.deliveryDate;
  }
  for (const o of (turn.ops || []).slice(0, 30)) {
    const line = o.ref ? find(o.ref) : null;
    // Viestissä mainittu ruokavaatimus tarkoittaa, että asia on käsitelty: sitä ei kysytä enää erikseen.
    if (['add', 'update'].includes(o.op) && (claims([...(o.claims || []), ...(o.addClaims || [])]).length || allergens(o.excludeAllergens).length)) draft.diet.known = true;
    if (o.op === 'diet') {
      // Koko tilauksen ruokavalio. Tyhjä vastaus ("ei") kirjaa vain, että asia on kysytty.
      const before = JSON.stringify(draft.diet);
      draft.diet = { known: true, claims: claims([...draft.diet.claims, ...(o.addClaims || [])]), excludeAllergens: allergens([...draft.diet.excludeAllergens, ...(o.excludeAllergens || [])]) };
      if (before !== JSON.stringify(draft.diet) && (draft.diet.claims.length || draft.diet.excludeAllergens.length)) { for (const l of draft.lines) { l.selectedProductId = null; l.selectedName = null; l.selectedWarning = null; } draft.offered = {}; }
      continue;
    }
    if (o.op === 'add' && typeof o.productTerm === 'string' && o.productTerm.trim()) {
      if (draft.lines.length >= 20) { notes.push('Luonnoksessa voi olla enintään 20 riviä.'); continue; }
      const ref = `L${++draft.seq}`;
      draft.lines.push({ ref, productTerm: o.productTerm.trim().slice(0, 80), quantity: validQuantity(o.quantity) ? cleanQuantity(o.quantity) : null, claims: claims(o.claims), excludeAllergens: allergens(o.excludeAllergens), selectedProductId: null, selectedName: null, selectedWarning: null });
      touch(ref);
    } else if (o.op === 'update' && line) {
      const before = JSON.stringify([line.productTerm, line.claims, line.excludeAllergens]);
      if (o.quantity) { if (validQuantity(o.quantity)) line.quantity = cleanQuantity(o.quantity); else notes.push(`Tarkista määrä: ${line.productTerm}.`); }
      if (typeof o.productTerm === 'string' && o.productTerm.trim()) {
        if (line.productTerm !== o.productTerm.trim()) line.answeredClaims = [];
        line.productTerm = o.productTerm.trim().slice(0, 80);
      }
      line.claims = claims([...line.claims, ...(o.addClaims || [])]).filter((c) => !(o.removeClaims || []).includes(c));
      line.excludeAllergens = allergens([...line.excludeAllergens, ...(o.excludeAllergens || [])]);
      // Tuotteen tai ruokavaatimuksen muutos vaatii uuden tuotevalinnan. Määrän muutos säilyttää valinnan ja tarkistetaan tarjouksessa.
      if (before !== JSON.stringify([line.productTerm, line.claims, line.excludeAllergens])) { line.selectedProductId = null; line.selectedName = null; delete draft.offered[line.ref]; }
      touch(line.ref);
    } else if (o.op === 'remove' && line) {
      draft.lines = draft.lines.filter((l) => l !== line); delete draft.offered[line.ref];
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

function summary(draft, q, customer) {
  const site = customer.deliverySites?.find((s) => s.id === draft.deliverySiteId);
  const warn = (ref) => { const w = draft.lines.find((l) => l.ref === ref)?.selectedWarning; return w ? `\n   Huom: ${w}` : ''; };
  const rows = q.lines.map((l, i) => `${i + 1}. ${l.name}: ${num(l.salesUnits)} ${l.salesUnitLabel}${l.covers && !(l.covers.unit === 'PCS' && l.covers.value === l.salesUnits) ? ` (${qty(l.covers)})` : ''}, ${eur(l.lineNet)}${warn(l.ref)}`);
  const diet = dietLabel(draft.diet);
  const cutoff = q.lines.map((l) => l.cutoffLabel).filter(Boolean)[0];
  return [`*Tilausluonnos*, toimitus ${dateLabel(draft.deliveryDate)}${site ? `, ${site.label}` : ''}`, ...(diet ? [`Huomioitu: ${diet}`] : []), ...rows, `Yhteensä ${eur(q.totals.net)} (alv 0 %)`,
    ...(cutoff ? [`Tilattava viimeistään ${cutoff}.`] : []), '', `Vahvista vastaamalla *TILAA*. ${changeHint(draft)}`].join('\n');
}

/**
 * @param {object} o
 * @param {ReturnType<import('./store.mjs').openDraftStore>} o.store
 * @param {{suggest: Function, quote: Function, submit: Function}} o.tools henkilön 3 työkalut (server/order-tools)
 * @param {(input: {text: string, draft: object, today: string, now: number}) => Promise<{intent: string, deliveryDate?: string, ops: object[]}>} o.interpretTurn
 * @param {() => number} [o.now]
 */
export function createOrderingConversation({ store, tools, interpretTurn, now = Date.now }) {
  // Kysyy puuttuvat tiedot, näyttää vaihtoehdot tai yhteenvedon. Ei koskaan valitse tuotetta, päivää tai ruokavaatimusta itse.
  async function advance(draft, customer, depth = 0) {
    draft.pending = null;
    if (!draft.lines.length) return { status: 'collecting', text: `Luonnos on tyhjä. ${HELP}` };
    const list = draft.lines.map((l) => `- ${lineLabel(l)}${l.selectedName ? `: ${l.selectedName}` : ''}`).join('\n');
    // Required logistics and amounts first. Dietary preferences are asked only when actual
    // orderable candidates differ in a relevant property; declared constraints always apply.
    const noQty = draft.lines.filter((l) => !l.quantity);
    const questions = []; const asks = [];
    if (!draft.deliveryDate) { questions.push('Mille päivälle toimitus?'); asks.push('date'); }
    if (noQty.length) { questions.push(`Kuinka paljon: ${noQty.map((l) => l.productTerm).join(', ')}?`); asks.push('quantity'); }
    if (asks.length) draft.pending = { kind: 'checklist', asks, refs: noQty.map((l) => l.ref) };
    if (!draft.deliverySiteId && customer.deliverySites?.length > 1 && !questions.length) {
      questions.push(`Mihin toimitetaan? ${customer.deliverySites.map((s, i) => `${i + 1}) ${s.label}`).join(' ')}`);
      if (!draft.pending) draft.pending = { kind: 'site', refs: [] };
    }
    if (questions.length) return { status: 'collecting', text: `Luonnoksessa nyt:\n${list}\n\n${questions.join('\n')}` };

    const open = draft.lines.filter((l) => !l.selectedProductId);
    if (open.length) {
      const s = await tools.suggest({ customer, draft: { ...draft, lines: open } });
      const problems = s.issues.map((i) => i.message);
      const shown = s.lines.slice(0, 4);
      for (const x of shown) draft.offered[x.ref] = x.options;
      if (!shown.length) return { status: 'collecting', text: `${problems.join('\n')}\nKokeile toista päivää tai tarkenna tuotetta. Tilausta ei ole tehty.` };
      const preference = !draft.diet.known && shown.flatMap((x) => (x.clarify || []).map((claim) => ({ ref: x.ref, claim })))
        .find(({ ref, claim }) => !draft.lines.find((l) => l.ref === ref)?.answeredClaims?.includes(claim)
          && !draft.lines.find((l) => l.ref === ref)?.claims.includes(claim) && !draft.diet.claims.includes(claim));
      if (preference) {
        const relevant = shown.filter((x) => x.clarify?.includes(preference.claim)
          && !draft.lines.find((l) => l.ref === x.ref)?.answeredClaims?.includes(preference.claim));
        const names = relevant.map((x) => draft.lines.find((l) => l.ref === x.ref).productTerm);
        const label = names.length > 1 ? `${names.slice(0, -1).join(', ')} ja ${names.at(-1)}` : names[0];
        draft.pending = { kind: 'preference', refs: relevant.map((x) => x.ref), claim: preference.claim };
        return { status: 'collecting', text: `Luonnoksessa nyt:\n${list}\n\n${cap(label)}: haluatko laktoositonta vai käykö tavallinen?` };
      }
      draft.pending = { kind: 'choose', refs: shown.map((x) => x.ref) };
      const blocks = shown.map((x) => {
        const l = open.find((line) => line.ref === x.ref);
        const covered = x.options.filter((o) => o.covers?.unit === l.quantity.unit).map((o) => o.covers.value);
        const smallest = covered.length ? Math.min(...covered) : null;
        const packNote = smallest > l.quantity.value ? `\nTarve on ${qty(l.quantity)}; pienin näistä myyntieristä kattaa ${qty({ value: smallest, unit: l.quantity.unit })}.` : '';
        const organicNote = !l.claims.includes('EU_ORGANIC_FARMING') && x.options.every((o) => o.labels?.includes('EU_ORGANIC_FARMING')) ? '\nNäytetyt vaihtoehdot ovat luomua.' : '';
        return `*${cap(lineLabel(l))}*\n${x.options.map((o, i) => `${i + 1}. ${o.name}: ${num(o.salesUnits)} ${o.salesUnitLabel}${o.covers ? ` (${qty(o.covers)})` : ''}, ${eur(o.lineNet)}${o.warning ? ` (${o.warning})` : ''}`).join('\n')}${packNote}${organicNote}`;
      });
      const how = shown.length > 1 ? `Vastaa numeroilla samassa järjestyksessä, esim. "${shown.map(() => 1).join(' ')}".` : 'Vastaa numerolla.';
      const diet = dietLabel(draft.diet);
      return { status: 'choosing', text: [`Toimitus ${dateLabel(draft.deliveryDate)}, hinnat alv 0 %.${diet ? ` Huomioitu: ${diet}.` : ''}`, ...blocks, ...problems, how, ...(s.lines.length > shown.length ? ['Loput tuotteet näytän seuraavaksi.'] : [])].join('\n\n') };
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
      draft.state = 'ordered'; draft.orderId = r.orderId;
      const total = r.totals ? `, yhteensä ${eur(r.totals.net)} (alv 0 %)` : '';
      return { status: r.status, text: r.status === 'confirmed'
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
        result = last ? { status: 'confirmed', text: `Tilaus ${last.orderId} on jo tallennettu. Uutta tilausta ei tehty.` } : await confirm(draft, customer);
      } else if (THANKS.test(t)) {
        const ready = draft.quote?.revision === draft.revision && !draft.pending;
        result = ready ? { status: 'ready', text: 'Ole hyvä! Luonnos odottaa vahvistusta: vastaa *TILAA*, kun haluat tilata.' }
          : draft.lines.length ? { status: 'collecting', text: 'Ole hyvä! Luonnos on tallessa ja jatkuu siitä, mihin jäätiin.' }
            : { status: 'collecting', text: 'Ole hyvä! Kirjoita, kun tarvitset jotain.' };
      } else if (VAGUE_YES.test(t) && draft.quote?.revision === draft.revision && !draft.pending) {
        result = { status: 'ready', text: 'Vahvista tilaus vastaamalla *TILAA*. Muuten luonnos jää odottamaan.' };
      } else {
        const before = content(draft);
        const preferenceYes = draft.pending?.kind === 'preference' && (VAGUE_YES.test(t) || /^laktoosit(?:tomana|tomina|onta|on)[.!\s]*$/iu.test(t));
        const preferenceNo = draft.pending?.kind === 'preference' && /^(?:ei|ei väliä|ei tarvitse|ei tarvi|tavallinen|tavallista|tavalliset|ihan tavallista|ihan tavalliset|normaali|normaalia|ihan normi|kumpikin käy|kaikki käy)[.!\s]*$/iu.test(t);
        const turn = preferenceYes || preferenceNo ? { intent: 'order', ops: draft.pending.refs.map((ref) => preferenceYes
          ? { op: 'update', ref, addClaims: [draft.pending.claim] } : { op: 'no_preference', ref }) }
          : await interpretTurn({ text: t, draft: structuredClone(draft), today, now: now(), receivedAt, context });
        const notes = apply(draft, turn, customer, today);
        draft.turn += 1;
        if (content(draft) !== before) { draft.revision += 1; draft.quote = null; }
        else if (turn.intent === 'other' && !notes.length && !draft.lines.length) {
          result = { status: 'collecting', text: `Olen Valio Aimon tilausapuri. ${HELP}` };
        }
        if (!result) {
          const next = await advance(draft, customer);
          result = { ...next, text: [...notes, next.text].join('\n') };
        }
      }
    } catch {
      result = { status: 'error', text: 'Käsittely ei nyt onnistunut. Luonnos säilyy ennallaan, eikä tilausta ole tehty. Yritä hetken kuluttua uudelleen.' };
      store.save(conversationId, null, messageId, { ...result, draftId: draft.id, revision: draft.revision });
      return { ...result, draftId: draft.id, revision: draft.revision };
    }
    const out = { text: result.text, status: result.status, draftId: draft.id, revision: draft.revision };
    store.save(conversationId, draft.lines.length || draft.state !== 'active' ? draft : null, messageId, out);
    return out;
  };
}
