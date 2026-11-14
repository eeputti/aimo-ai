// Keittiön tarvelaskenta ilman tietokanta-, verkko- tai kielimallikutsuja.
import { roundToStep, unitLabel } from './catalog.mjs';

const TAG_WEIGHT = { protein: 1, veg: 1, dairy: 1, cream: 1, dessert: 1, bakery: 1, frozen: 1, dry: 0.5, nonfood: 0.5 };
const UNITS = { kg: ['kg', 1], g: ['kg', 0.001], l: ['l', 1], dl: ['l', 0.1], cl: ['l', 0.01], ml: ['l', 0.001], sales: ['sales', 1] };
const positive = (n) => Number.isFinite(n) && n > 0;
const nonnegative = (n) => Number.isFinite(n) && n >= 0;
const fmt = (n) => String(+n.toFixed(2)).replace('.', ',');
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

/** Määrä myyntiyksikköinä. Kiloja ja litroja ei koskaan rinnasteta. */
export function toPlanningUnits(product, amount, unit) {
  const spec = Object.hasOwn(UNITS, unit) ? UNITS[unit] : null;
  if (!product || !spec || !nonnegative(amount)) return null;
  const [kind, factor] = spec;
  const size = kind === 'sales' ? 1 : kind === 'kg' ? (product.salesUnit === 'KG' ? 1 : product.kg) : product.litres;
  return positive(size) ? amount * factor / size : null;
}

/** API ja laskenta käyttävät samaa validointia; puutteellinen resepti ei saa kadota hiljaa. */
export function validatePlanning({ menuEvents = [], inventory = null, incoming = [] } = {}, cat) {
  const errors = [];
  const checkItems = (items, label, recipe = false) => {
    if (!Array.isArray(items)) { errors.push(`${label}: rivien pitää olla lista`); return; }
    const ids = new Set();
    for (const [i, r] of items.entries()) {
      const at = `${label}, rivi ${i + 1}`;
      if (!r || typeof r !== 'object') { errors.push(`${at}: virheellinen rivi`); continue; }
      if (!cat.get(r.productId)) errors.push(`${at}: tuntematon tuote ${r.productId}`);
      if (!nonnegative(r.amount) || !Object.hasOwn(UNITS, r.unit)) errors.push(`${at}: määrä tai yksikkö puuttuu tai on virheellinen`);
      if (recipe && r.yield != null && (!positive(r.yield) || r.yield > 1)) errors.push(`${at}: saantokertoimen pitää olla yli 0 ja enintään 1`);
      if (!recipe) {
        if (typeof r.id !== 'string' || !r.id.trim() || ids.has(r.id)) errors.push(`${at}: erän/toimituksen yksilöllinen id puuttuu tai toistuu`);
        ids.add(r.id);
        if (r.expiresOn != null && !validDate(r.expiresOn)) errors.push(`${at}: virheellinen viimeinen käyttöpäivä`);
      }
    }
  };
  if (!Array.isArray(menuEvents)) errors.push('Ryhmämenut: tietojen pitää olla lista');
  else {
    const ids = new Set();
    for (const ev of menuEvents) {
      if (!ev || typeof ev !== 'object') { errors.push('Virheellinen ryhmämenu'); continue; }
      const at = `Ryhmämenu ${ev.name || ev.id || '?'}`;
      if (typeof ev.id !== 'string' || !ev.id.trim() || ids.has(ev.id)) errors.push(`${at}: yksilöllinen id puuttuu tai toistuu`);
      ids.add(ev.id);
      if (!Array.isArray(ev.groups) || !ev.groups.length) errors.push(`${at}: päiväkohtaiset ryhmät puuttuvat`);
      else for (const g of ev.groups) {
        if (!g || !validDate(g.date) || !Number.isInteger(g.pax) || g.pax < 0) errors.push(`${at}: virheellinen ryhmän päivämäärä tai annosmäärä`);
        if (g?.includedInBookings != null && typeof g.includedInBookings !== 'boolean') errors.push(`${at}: includedInBookings pitää olla totuusarvo`);
      }
      if (ev.includedInBookings != null && typeof ev.includedInBookings !== 'boolean') errors.push(`${at}: includedInBookings pitää olla totuusarvo`);
      checkItems(ev.recipe, at, true);
    }
  }
  if (inventory != null) {
    if (typeof inventory !== 'object' || !validDate(inventory.asOf)) errors.push('Inventaarion päivämäärä puuttuu tai on virheellinen');
    checkItems(inventory.items, 'Inventaario');
  }
  checkItems(incoming, 'Saapuvat toimitukset');
  if (Array.isArray(incoming)) for (const r of incoming) {
    if (!r || !validDate(r.deliveryDate) || !['confirmed', 'cancelled', 'received'].includes(r.status)) errors.push('Saapuva toimitus: virheellinen toimituspäivä tai tila');
  }
  return errors;
}

function bookingSignal(rows, menus, date, issues, warnings) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const groupCovers = new Map();
  for (const ev of menus) for (const g of ev.groups) {
    // Vanhassa demodatassa ryhmät sisältyvät varauksiin. Uusi data voi ilmoittaa ne erillisiksi.
    if (g.includedInBookings ?? ev.includedInBookings ?? true) groupCovers.set(g.date, (groupCovers.get(g.date) || 0) + g.pax);
  }
  const weekSum = (start) => {
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, d); const row = byDate.get(key);
      if (!row || !nonnegative(row.covers)) return null; // puuttuva päivä ei ole nolla asiakasta
      const groups = groupCovers.get(key) || 0;
      if (groups > row.covers) { issues.push(`Päivän ${key} ryhmäasiakkaita (${groups}) on enemmän kuin varauksia (${row.covers}). Tarkista sisältyvätkö ryhmät varauslukuun.`); return null; }
      sum += row.covers - groups;
    }
    return sum;
  };
  const next = weekSum(date);
  if (next == null) { warnings.push('Viikon varausluvut ovat puutteelliset: tavallisen myynnin ennuste perustuu ostohistoriaan.'); return null; }
  const past = [];
  for (let w = 1; w <= 8; w++) { const n = weekSum(addDays(date, -7 * w)); if (n > 0) past.push(n); }
  if (!past.length) { warnings.push('Vertailukelpoista varaushistoriaa ei ole: tavallisen myynnin ennuste perustuu ostohistoriaan.'); return null; }
  const avg = past.reduce((s, n) => s + n, 0) / past.length;
  const excluded = Array.from({ length: 7 }, (_, d) => groupCovers.get(addDays(date, d)) || 0).reduce((s, n) => s + n, 0);
  return { id: 'bookings', label: 'Tavallisen myynnin varaukset', uplift: next / avg - 1, next, avg: Math.round(avg), excluded,
    detail: `${next.toLocaleString('fi-FI')} asiakasta, tavallisesti ${Math.round(avg).toLocaleString('fi-FI')}${excluded ? `; ${excluded} reseptistä laskettavaa ryhmäasiakasta erotettu` : ''}`,
    peaks: [], source: 'Varausluvut; ryhmämenut erotettu päiväkohtaisesti' };
}

/** planned = historiasta ennustetut rivit. Reseptit voivat tuoda kokonaan uusia tuotteita. */
export function buildDemandPlan({ cat, planned, bookingRows = [], menuEvents = [], inventory = null, incoming = [], deliveryDate, weekLabels = [] }) {
  const issues = validatePlanning({ menuEvents, inventory, incoming }, cat);
  const warnings = [], signals = [], skipped = [], lines = [];
  if (!validDate(deliveryDate)) issues.push('Virheellinen toimituspäivä');
  if (issues.length) return { lines, issues, warnings, signals, skipped, booking: null };
  const end = addDays(deliveryDate, 6);
  const inWeek = (g) => g.date >= deliveryDate && g.date <= end;
  const booking = bookingSignal(bookingRows, menuEvents, deliveryDate, issues, warnings);
  if (booking && (Math.abs(booking.uplift) >= 0.03 || booking.excluded)) signals.push(booking);
  const menus = new Map();
  for (const ev of menuEvents) {
    const portions = ev.groups.filter(inWeek).reduce((s, g) => s + g.pax, 0);
    if (!portions) continue;
    signals.push({ id: `menu:${ev.id}`, label: ev.name || ev.id, detail: `${portions} annosta tällä viikolla`, source: 'Päiväkohtaiset ryhmät + reseptiikka' });
    for (const r of ev.recipe) {
      const p = cat.get(r.productId);
      const need = r.amount * portions / (r.yield ?? 1);
      if (!need) continue;
      const units = toPlanningUnits(p, need, r.unit);
      if (units == null) { issues.push(`${ev.name || ev.id}: tuotteen ${p.name} määrää ${fmt(need)} ${r.unit} ei voida muuntaa myyntiyksiköiksi. Täydennä pakkauskoko oikeassa yksikössä.`); continue; }
      const list = menus.get(p.id) || [];
      list.push({ event: ev.name || ev.id, portions, label: r.label || `${fmt(r.amount)} ${r.unit} / annos`, need, unit: r.unit, units, yield: r.yield ?? 1 });
      menus.set(p.id, list);
    }
  }

  const supply = new Map();
  const credit = (r, source) => {
    if (!r.amount) return;
    // Ilman päiväkohtaista kulutussuunnitelmaa vähennetään vain koko viikon säilyvät erät.
    if (!r.expiresOn || r.expiresOn < end) { warnings.push(`${source}: erää ${r.id} ei vähennetty, koska säilyvyys viikon loppuun ei ole varmistettu.`); return; }
    const n = toPlanningUnits(cat.get(r.productId), r.amount, r.unit);
    if (n == null) { issues.push(`${source}: erän ${r.id} yksikköä ei voida muuntaa myyntiyksiköiksi.`); return; }
    const s = supply.get(r.productId) || { inventory: 0, incoming: 0 };
    s[source === 'Inventaario' ? 'inventory' : 'incoming'] += n;
    supply.set(r.productId, s);
  };
  if (!inventory) warnings.push('Keittiön varastosaldoa ei ole annettu: varastoa ei vähennetty ostotarpeesta.');
  else if (inventory.asOf !== deliveryDate) warnings.push(`Inventaario on päivältä ${inventory.asOf}: täydennä saldo päivälle ${deliveryDate}, jotta se voidaan vähentää.`);
  else inventory.items.forEach((r) => credit(r, 'Inventaario'));
  for (const r of incoming) {
    if (r.status !== 'confirmed') continue;
    if (r.deliveryDate !== deliveryDate) { warnings.push(`Toimitusta ${r.id} (${r.deliveryDate}) ei vähennetty: sen pitää olla vahvistettu suunnitteluviikon alkupäivälle.`); continue; }
    credit(r, 'Saapuva toimitus');
  }

  const all = new Map(planned.map((pl) => [pl.p.id, pl]));
  for (const id of menus.keys()) if (!all.has(id)) all.set(id, { p: cat.get(id), base: 0, factors: [{ kind: 'base', label: 'Perustaso', detail: 'Ei aktiivista historiaennustetta; tarve reseptistä' }], tags: [], series: [], group: null });
  for (const pl of all.values()) {
    const { p } = pl; const ul = unitLabel(p.salesUnit);
    const factors = pl.factors.map((f) => ({ ...f }));
    factors[0].value = `${fmt(pl.base)} ${ul}`;
    const sources = pl.base > 0 ? [`Tilaushistoria ${weekLabels[0] || ''}–${weekLabels.at(-1) || ''}`] : [];
    let target = pl.base;
    if (booking && Math.abs(booking.uplift) >= 0.03) {
      const weight = Math.max(0, ...pl.tags.map((tg) => TAG_WEIGHT[tg] ?? 1), pl.tags.length ? 0 : 1);
      const u = booking.uplift * weight;
      target *= 1 + u;
      factors.push({ label: booking.label, detail: booking.detail, value: `${u > 0 ? '+' : ''}${Math.round(u * 100)} %`, kind: 'signal' });
      sources.push('Varaukset');
    }
    const recipes = menus.get(p.id) || [];
    const extraUnits = recipes.reduce((s, r) => s + r.units, 0);
    for (const r of recipes) factors.push({ label: r.event, detail: `${r.portions} annosta × ${r.label}${r.yield < 1 ? ` / saanto ${fmt(r.yield * 100)} %` : ''} = ${fmt(r.need)} ${r.unit}`, value: `+${fmt(r.units)} ${ul}`, kind: 'menu' });
    if (recipes.length) sources.push('Reseptiikka');
    const stock = supply.get(p.id) || { inventory: 0, incoming: 0 };
    for (const [kind, amount] of Object.entries(stock)) if (amount > 0) {
      const label = kind === 'inventory' ? 'Käyttökelpoinen varasto' : 'Vahvistetut saapuvat toimitukset';
      factors.push({ label, detail: 'Käytettävissä viikon alusta ja säilyy viikon loppuun', value: `−${fmt(amount)} ${ul}`, kind: 'stock' });
      sources.push(label);
    }
    const available = stock.inventory + stock.incoming;
    const exact = Math.max(0, target + extraUnits - available);
    const qty = roundToStep(exact, p, 'up'); // myös 0,1 pakkausta tarvetta tarvitsee kokonaisen pakkauksen
    if (qty <= 0) { skipped.push({ productId: p.id, name: p.name, reason: available ? 'Käyttökelpoinen varasto ja saapuvat toimitukset kattavat tarpeen' : 'Ei ostotarvetta tämän viikon asiakasmäärällä' }); continue; }
    const baselineQty = roundToStep(pl.base, p, 'up');
    const trimFloorQty = roundToStep(Math.max(0, Math.min(target, pl.base) + extraUnits - available), p, 'up');
    const minimumQty = roundToStep(Math.max(0, extraUnits - available), p, 'up');
    if (qty > exact + 1e-8) factors.push({ label: 'Myyntierä', detail: `Tarve ${fmt(exact)} ${ul}, pyöristys tilattavaan erään`, value: `→ ${fmt(qty)} ${ul}`, kind: 'lot' });
    const deltaPct = baselineQty ? Math.round((qty / baselineQty - 1) * 100) : null;
    const detail = factors.filter((f) => f.kind !== 'base').map((f) => `${f.label.toLowerCase()} ${f.value}`).join(', ');
    const text = baselineQty ? `${deltaPct === 0 ? 'Sama kuin tavallisesti' : `${deltaPct > 0 ? '+' : ''}${deltaPct} %`}${detail ? `: ${detail}` : ''}` : `Uusi reseptitarve: ${detail}`;
    lines.push({ productId: p.id, qty, extra: { baselineQty, expectedQty: qty, minimumQty, trimFloorQty, lastWeekQty: pl.lastWeekQty ?? null, history: pl.series, weekLabels, group: pl.group, tags: pl.tags,
      origin: pl.base ? 'history' : 'recipe', menuExtra: extraUnits, recipeRequired: extraUnits > 0, supply: stock, deltaPct, reason: { text, factors, sources: [...new Set(sources)] } } });
  }
  return { lines, issues: [...new Set(issues)], warnings: [...new Set(warnings)], signals, skipped, booking };
}
