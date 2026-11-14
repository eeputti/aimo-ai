import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemandPlan, toPlanningUnits, validatePlanning } from '../server/planning.mjs';

const date = '2026-11-16';
const day = (n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const p = { id: 'cream', name: 'Kerma', salesUnit: 'ST', kg: 1.03, litres: 1, lot: 0.01 };
const fresh = { id: 'fish', name: 'Kala', salesUnit: 'KG', kg: 1, lot: 0.01 };
const cat = { get: (id) => [p, fresh].find((x) => x.id === id) };
const baseline = (product = p, base = 10) => ({ p: product, base, factors: [{ kind: 'base', label: 'Perustaso' }], tags: ['cream'], series: [base], group: 'Maito & munat' });
function bookings(covers = 10) {
  return Array.from({ length: 63 }, (_, i) => ({ date: day(i - 56), covers: i < 56 ? 10 : covers }));
}
const menu = (productId = 'cream', pax = 10, amount = 0.1, unit = 'l', patch = {}) => ({ id: 'menu', name: 'Ryhmämenu', includedInBookings: false,
  groups: [{ date: day(4), pax }], recipe: [{ productId, amount, unit }], ...patch });
const plan = (patch = {}) => buildDemandPlan({ cat, deliveryDate: date, planned: [baseline()], bookingRows: bookings(), menuEvents: [], inventory: { asOf: date, items: [] }, ...patch });
const qty = (result, id = 'cream') => result.lines.find((l) => l.productId === id)?.qty || 0;
const batch = (id, amount, patch = {}) => ({ id, productId: 'cream', amount, unit: 'l', expiresOn: day(6), ...patch });

test('uuden reseptin raaka-aine päätyy ostoslistaan ilman historiaa', () => {
  const r = plan({ menuEvents: [menu('fish', 20, 0.12, 'kg')] });
  assert.equal(qty(r, 'fish'), 2.5);
  assert.equal(r.lines.find((l) => l.productId === 'fish').extra.origin, 'recipe');
  assert.deepEqual(r.issues, []);
});

test('varauksissa jo oleva ryhmä kasvattaa määrää vain reseptinsä verran', () => {
  const rows = bookings(); rows.find((r) => r.date === day(4)).covers += 10;
  const r = plan({ bookingRows: rows, menuEvents: [menu('cream', 10, 0.1, 'l', { includedInBookings: true })] });
  assert.equal(qty(r), 11);
  assert.equal(r.booking.uplift, 0);
  assert.equal(r.booking.excluded, 10);
});

test('erikseen ilmoitettu ryhmä ei vähennä tavallisten asiakkaiden määrää', () => {
  assert.equal(qty(plan({ menuEvents: [menu()] })), 11);
});

test('hiljaisempi viikko vähentää ostomäärää ja nollaviikko jättää rivin pois', () => {
  assert.equal(qty(plan({ bookingRows: bookings(8) })), 8);
  assert.equal(qty(plan({ bookingRows: bookings(0) })), 0);
});

test('puuttuvaa varauspäivää ei tulkita nollaksi asiakkaaksi', () => {
  const r = plan({ bookingRows: bookings(0).filter((r) => r.date !== day(2)) });
  assert.equal(qty(r), 10);
  assert.match(r.warnings.join(' '), /puutteelliset/);
});

test('ryhmien suurempi määrä kuin kokonaisvaraukset ilmoitetaan esteenä', () => {
  const r = plan({ menuEvents: [menu('cream', 11, 0.1, 'l', { includedInBookings: true })] });
  assert.match(r.issues.join(' '), /enemmän kuin varauksia/);
});

test('vain tämän viikon ryhmät lasketaan myös viikkorajan ylittävästä menusta', () => {
  const r = plan({ planned: [], menuEvents: [menu('cream', 10, 0.1, 'l', { portions: 100,
    groups: [{ date: day(4), pax: 10 }, { date: day(8), pax: 90 }] })] });
  assert.equal(qty(r), 1);
  assert.match(r.signals.find((s) => s.id === 'menu:menu').detail, /^10 annosta/);
});

test('reseptitarpeet summataan ennen pakkauspyöristystä', () => {
  const r = plan({ planned: [], menuEvents: [menu('cream', 4), menu('cream', 4, 0.1, 'l', { id: 'other' })] });
  assert.equal(qty(r), 1);
  assert.equal(r.lines[0].extra.menuExtra, 0.8);
});

test('saantokerroin muuntaa annospainon ostettavaksi raakapainoksi', () => {
  const r = plan({ planned: [], menuEvents: [menu('fish', 20, 0.12, 'kg', { recipe: [{ productId: 'fish', amount: 0.12, unit: 'kg', yield: 0.8 }] })] });
  assert.equal(qty(r, 'fish'), 3);
});

test('yksiköt muunnetaan oikean suureen mukaan eikä kiloa käytetä litrana', () => {
  assert.equal(toPlanningUnits(p, 500, 'ml'), 0.5);
  assert.equal(toPlanningUnits(fresh, 500, 'g'), 0.5);
  assert.equal(toPlanningUnits(fresh, 1, 'l'), null);
  assert.equal(toPlanningUnits(p, 1, '__proto__'), null);
  const r = plan({ menuEvents: [menu('fish', 10, 0.1, 'l')] });
  assert.match(r.issues.join(' '), /ei voida muuntaa/);
});

test('pakkauspyöristys ei alita edes pientä lisätarvetta', () => {
  assert.equal(qty(plan({ planned: [baseline(p, 10.01)] })), 11);
});

test('käyttökelpoinen inventaario ja vahvistettu saapuva toimitus vähennetään yhdessä', () => {
  const r = plan({ menuEvents: [menu('cream', 20)], inventory: { asOf: date, items: [batch('stock-1', 3)] },
    incoming: [batch('delivery-1', 2, { deliveryDate: date, status: 'confirmed' })] });
  assert.equal(qty(r), 7);
  assert.deepEqual(r.lines[0].extra.supply, { inventory: 3, incoming: 2 });
});

test('varasto voi kattaa koko tarpeen ilman negatiivista tilausriviä', () => {
  const r = plan({ inventory: { asOf: date, items: [batch('stock-1', 20)] } });
  assert.equal(r.lines.length, 0);
  assert.match(r.skipped[0].reason, /kattavat tarpeen/);
});

test('vanhaa inventaariota tai viikon aikana vanhenevaa erää ei vähennetä', () => {
  assert.equal(qty(plan({ inventory: { asOf: day(-1), items: [batch('old', 10)] } })), 10);
  const r = plan({ inventory: { asOf: date, items: [batch('short', 10, { expiresOn: day(3) })] } });
  assert.equal(qty(r), 10);
  assert.match(r.warnings.join(' '), /säilyvyys/);
});

test('myöhäistä, peruttua tai jo vastaanotettua toimitusta ei vähennetä', () => {
  for (const patch of [{ deliveryDate: day(1), status: 'confirmed' }, { deliveryDate: date, status: 'cancelled' }, { deliveryDate: date, status: 'received' }]) {
    assert.equal(qty(plan({ incoming: [batch('delivery', 10, patch)] })), 10);
  }
});

test('epäselvä toimitus tai toistuva erätunnus ei voi pienentää ostotarvetta', () => {
  const r = plan({ incoming: [batch('same', 2, { deliveryDate: date, status: 'confirmed' }), batch('same', 2, { deliveryDate: date, status: 'confirmed' })] });
  assert.match(r.issues.join(' '), /toistuu/);
  assert.equal(r.lines.length, 0);
});

test('ostotarve yhdistää varauskasvun, reseptit ja käytettävissä olevan varaston', () => {
  const r = plan({ bookingRows: bookings(12), menuEvents: [menu('cream', 20)], inventory: { asOf: date, items: [batch('stock', 1)] } });
  assert.equal(qty(r), 13);
  assert.equal(r.lines[0].extra.menuExtra, 2);
  assert.deepEqual(r.lines[0].extra.supply, { inventory: 1, incoming: 0 });
});

test('virheellinen saanto, päivämäärä tai tuntematon tuote torjutaan', () => {
  for (const recipe of [[{ productId: 'fish', amount: 1, unit: 'kg', yield: 0 }], [{ productId: 'missing', amount: 1, unit: 'kg' }]]) {
    assert.ok(validatePlanning({ menuEvents: [menu('fish', 10, 0.1, 'kg', { recipe })] }, cat).length);
  }
  assert.ok(validatePlanning({ inventory: { asOf: '2026-02-30', items: [] } }, cat).length);
  assert.ok(plan({ menuEvents: [{ ...menu(), recipe: null }] }).issues.length);
});
