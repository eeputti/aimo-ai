// Portin ainoa kello. Kaikki aikavertailut (tilausaikaraja, tarjouksen voimassaolo, päiväkatto) kulkevat tämän kautta.
// DEMO_NOW=2026-11-14T10:00:00+02:00 kiinnittää kellon alkamaan annetusta hetkestä, ja jokainen vastaus kertoo ajan olevan simuloitu.
// Syy: mock-rajapinnan Stock-tuotteiden tilausaika umpeutuu su 15.11. klo 17.00, minkä jälkeen mikään ei olisi tilattavissa oikealla kellolla.
const bootReal = Date.now();
const demoRaw = (process.env.DEMO_NOW || '').trim();
const demoStart = demoRaw ? parseApiTime(demoRaw)?.getTime() : null;
if (demoRaw && !demoStart) console.warn(`[clock] DEMO_NOW="${demoRaw}" ei ole kelvollinen aika, käytetään oikeaa kelloa`);

function helsinkiOffset(date) {
  // Europe/Helsinki-offset (+02:00 talvella, +03:00 kesällä) ilman kirjastoja.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Rajapinnan aikaleimat ovat muotoa 2026-11-15T17:00:00+0200. Ilman offsetia aika tulkitaan Helsingin ajaksi. */
export function parseApiTime(value) {
  if (!value) return null;
  let s = String(value).trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const guess = new Date(`${s}Z`);
    if (Number.isNaN(guess.getTime())) return null;
    return new Date(guess.getTime() - helsinkiOffset(guess) * 60000);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const clock = {
  simulated: demoStart != null,
  now() { return new Date(demoStart != null ? demoStart + (Date.now() - bootReal) : Date.now()); },
  /** Päivämäärä Helsingin ajassa muodossa YYYY-MM-DD. */
  today() { return helsinkiDate(this.now()); },
  info() { return { now: this.now().toISOString(), simulated: this.simulated, timezone: 'Europe/Helsinki', note: this.simulated ? 'DEMO_NOW on asetettu: portin kello on simuloitu' : undefined }; },
};

export function helsinkiDate(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function helsinkiLabel(value) {
  const d = value instanceof Date ? value : parseApiTime(value);
  if (!d) return null;
  return new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}
/** Onko tilausaikaraja jo mennyt portin kellon mukaan? null = rajaa ei tiedetä. */
export function cutoffPassed(closingTime) {
  const t = parseApiTime(closingTime);
  return t ? t.getTime() <= clock.now().getTime() : null;
}
