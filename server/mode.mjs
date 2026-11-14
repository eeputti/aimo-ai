// TILA-ARVAUS. Ennen kuin ostaja tekee mitään, päätellään millaista tilausta hän on tekemässä, ja kysytään vain vahvistus.
// Ei kielimallia: arvaus lasketaan kellosta (Suomen aika), ostajan omasta tilaushistoriasta ja tilausaikarajasta,
// ja jokainen peruste näytetään ostajalle. Arvaus ei muuta tilausta eikä sääntöjä: se vaikuttaa vain siihen, mitä näkymässä näytetään.
import { kv, history, proposals, audit } from './db.mjs';
import { clock, parseApiTime, helsinkiLabel } from './gateway/clock.mjs';
import { activeLines } from './proposal.mjs';

// OLETUS: kynnykset on valittu demolle. Tuotannossa ne tulisivat asiakkaan omasta tilausrytmistä.
export const MODE_RULES = { rushHours: 6, advanceDays: 8, rhythmShare: 0.75, historyWeeks: 12 };

export const MODES = {
  perus: { label: 'Perustilaus', hint: 'Tavallinen viikkotilaus', effect: 'Näytän koko ehdotuksen perusteluineen.' },
  kiire: { label: 'Kiire', hint: 'Täydennys nopeasti', effect: 'Näytän vain päätökset ja tilausrivit. Pois jätetyt tuotteet ja taustatiedot on piilotettu.' },
  ennakko: { label: 'Ennakkotilaus', hint: 'Sesonki tai tapahtuma', effect: 'Saldot ovat tämän hetken tilanne. Hinnat ja saatavuus tarkistetaan uudelleen ennen lähetystä.' },
  luonnos: { label: 'Luonnos', hint: 'Valmistelen, en tilaa vielä', effect: 'Lähetysnappi on piilotettu. Luonnos säilyy, ja hinnat tarkistetaan uudelleen ennen lähetystä.' },
};

const WD_GEN = ['sunnuntain', 'maanantain', 'tiistain', 'keskiviikon', 'torstain', 'perjantain', 'lauantain'];
const WD_ALL = ['sunnuntaille', 'maanantaille', 'tiistaille', 'keskiviikolle', 'torstaille', 'perjantaille', 'lauantaille'];
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** Arvaus ja sen perusteet. Puhdas funktio: sama syöte antaa saman tuloksen. */
export function guessMode(proposal, { now = clock.now(), today = clock.today(), rows = history.all() } = {}) {
  const wd = weekdayOf(proposal.deliveryDate);
  const evidence = [];

  // 1. Rytmi: kuinka monella viime viikoista on tilattu samalle viikonpäivälle.
  const past = rows.filter((r) => r.date < proposal.deliveryDate);
  const weeks = [...new Set(past.map((r) => r.week))].sort().slice(-MODE_RULES.historyWeeks);
  const hits = weeks.filter((w) => past.some((r) => r.week === w && weekdayOf(r.date) === wd)).length;
  const rhythm = weeks.length ? hits / weeks.length : 0;
  if (weeks.length) evidence.push({ id: 'rhythm', text: `Olet tilannut ${WD_ALL[wd]} ${hits} kertaa viimeisten ${weeks.length} viikon aikana.` });
  else evidence.push({ id: 'rhythm', text: 'Aiempia tilauksia ei ole, joten rytmiä ei voi päätellä.' });

  // 2. Tilausaikaraja: aikaisin raja niistä riveistä, jotka ovat vielä tilattavissa.
  const closings = activeLines(proposal).map((l) => parseApiTime(l.availability?.closingTime)).filter(Boolean);
  const open = closings.filter((t) => t.getTime() > now.getTime()).sort((a, b) => a - b);
  const hoursLeft = open.length ? (open[0].getTime() - now.getTime()) / 36e5 : null;
  if (hoursLeft != null) evidence.push({ id: 'cutoff', text: `Tilausaikaa on jäljellä ${hoursLeft < 1 ? 'alle tunti' : `${Math.floor(hoursLeft)} h`}: raja on ${helsinkiLabel(open[0])}.` });
  else if (closings.length) evidence.push({ id: 'cutoff', text: 'Tilausaika on jo umpeutunut kaikilta riveiltä.' });

  // 3. Toimitukseen jäljellä oleva aika.
  const daysAhead = daysBetween(today, proposal.deliveryDate);
  evidence.push({ id: 'delivery', text: `Toimitus on ${daysAhead <= 0 ? 'tänään' : daysAhead === 1 ? 'huomenna' : `${daysAhead} päivän päästä`}.` });

  // 4. Koko suhteessa tavalliseen viikkoon, ja mistä ero tulee.
  const t = proposal.totals || {};
  const sizePct = t.baselineNet ? Math.round((t.expected / t.baselineNet - 1) * 100) : null;
  const signals = (proposal.signals || []).map((s) => s.label);
  if (sizePct != null && Math.abs(sizePct) >= 10) evidence.push({ id: 'size', text: `Summa on ${Math.abs(sizePct)} % tavallista viikkoa ${sizePct > 0 ? 'suurempi' : 'pienempi'}${signals.length ? `: ${signals.join(', ')}` : ''}.` });

  let guess; let confidence = 'high'; let sentence;
  if (hoursLeft != null && hoursLeft <= MODE_RULES.rushHours) {
    guess = 'kiire';
    sentence = `Näyttää kiireeltä: tilausaika umpeutuu ${hoursLeft < 1 ? 'alle tunnin' : `${Math.floor(hoursLeft)} tunnin`} päästä.`;
  } else if (daysAhead >= MODE_RULES.advanceDays) {
    guess = 'ennakko';
    sentence = `Näyttää ennakkotilaukselta: toimitus on vasta ${daysAhead} päivän päästä.`;
  } else if (rhythm >= MODE_RULES.rhythmShare) {
    guess = 'perus';
    const menu = (proposal.signals || []).find((s) => String(s.id).startsWith('menu:'));
    sentence = `Näyttää tavalliselta ${WD_GEN[wd]} viikkotilaukselta${menu ? `, jossa on mukana ${menu.label.toLowerCase()}` : ''}.`;
  } else {
    guess = 'perus'; confidence = 'low';
    sentence = 'En tunnista tästä tuttua tilausrytmiä.';
  }
  return { guess, confidence, sentence, evidence };
}

/** Näkymän tila nykyiselle ehdotukselle: arvaus + ostajan mahdollinen oma valinta. null, kun ehdotusta ei ole tai se on jo tilattu. */
export function orderMode() {
  const p = proposals.current();
  if (!p || p.status === 'ordered') return null;
  const g = guessMode(p);
  const saved = kv.get('orderMode');
  const mine = saved?.proposalId === p.id ? saved : null;
  const mode = mine?.mode || g.guess;
  return {
    proposalId: p.id, ...g, mode, confirmed: !!mine,
    label: MODES[mode].label, effect: MODES[mode].effect,
    question: g.confidence === 'high' ? 'Olenko oikeassa?' : 'Millainen tilaus tämä on?',
    modes: Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, hint: m.hint })),
    basis: 'Sääntöpohjainen arvaus kellosta, tilaushistoriasta ja tilausaikarajasta. Ei kielimallia.',
    clock: { label: helsinkiLabel(clock.now()), simulated: clock.simulated },
  };
}

/** Ostaja vahvistaa arvauksen tai valitsee toisen tilan. Jää lokiin. */
export function setOrderMode({ mode, reset } = {}) {
  const p = proposals.current();
  if (!p || p.status === 'ordered') return null;
  if (reset) { kv.set('orderMode', null); return orderMode(); }
  const g = guessMode(p);
  const chosen = mode || g.guess;
  if (!MODES[chosen]) return null;
  kv.set('orderMode', { proposalId: p.id, mode: chosen, guess: g.guess, at: clock.now().toISOString() });
  audit('käyttäjä', chosen === g.guess ? `Vahvisti tila-arvauksen: ${MODES[chosen].label}` : `Korjasi tila-arvauksen: ${MODES[g.guess].label} → ${MODES[chosen].label}`, { arvaus: g.guess, perusteet: g.evidence.map((e) => e.text) }, null, p.id);
  return orderMode();
}
