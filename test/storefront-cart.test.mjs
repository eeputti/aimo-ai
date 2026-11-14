import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/storefront-cart-store.js', import.meta.url), 'utf8');
const seed = JSON.parse(fs.readFileSync(new URL('../public/storefront-cart-data.json', import.meta.url), 'utf8'));
async function fixture(storage = new Map(), { reference = true } = {}) {
  const sourceSeed = reference ? { ...seed, cart: seed.referenceCart || seed.cart } : seed;
  const requests = []; const events = [];
  const window = { dispatchEvent: (e) => events.push(e.type), addEventListener() {} };
  vm.runInNewContext(source, { window, document: { querySelector: () => null }, Event,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    fetch: async (url) => { requests.push(url); return { ok: true, json: async () => structuredClone(sourceSeed) }; },
  });
  await window.aimoCart.ready;
  return { cart: window.aimoCart, requests, events, storage };
}

test('product card clicks add to the selected basket, merge and persist; unavailable items stay out', async () => {
  const f = await fixture(new Map(), { reference: false });
  f.cart.select('2026-11-20');
  let click;
  const context = vm.createContext({ window: { aimoCart: f.cart }, document: {
    querySelector: () => null,
    addEventListener: (name, handler) => { if (name === 'click') click = handler; },
    createElement: () => ({ dataset: {}, setAttribute() {} }),
  } });
  const moduleSource = fs.readFileSync(new URL('../public/storefront.js', import.meta.url), 'utf8')
    .replace('export { product, rail };', '').replace(/^export\s+(?=(?:async\s+)?function\b)/gm, '');
  vm.runInContext(moduleSource, context);
  const html = vm.runInContext('product({ id: "card-test", name: "Testituote", price: 2.5, unit: "kpl" })', context);
  assert.match(html, /data-cart-product="card-test"/);
  let feedback;
  const card = { dataset: { cartProduct: 'card-test' }, querySelector: () => feedback, append: (node) => { feedback = node; } };
  const button = { closest: () => card };
  const event = { target: { closest: (selector) => selector.includes('.cart-button') ? button : null } };
  await click(event); await click(event);
  assert.equal(f.cart.lines()[0].qty, 2);
  assert.equal(f.cart.get().selectedDate, '2026-11-20');
  assert.equal(feedback.textContent, 'Lisätty ostoskoriin.');
  assert.equal(button.disabled, false);
  const reloaded = await fixture(f.storage, { reference: false });
  assert.equal(reloaded.cart.lines()[0].qty, 2);
  vm.runInContext('product({ id: "unavailable", name: "Loppunut", price: 1, unavailable: true })', context);
  card.dataset.cartProduct = 'unavailable';
  await click(event);
  assert.equal(f.cart.lines().length, 1);
  assert.match(feedback.textContent, /ei ole saatavilla/);
});

test('reference basket reproduces the real cart totals and never fetches agent orders', async () => {
  const f = await fixture(); const t = f.cart.totals();
  assert.equal(t.count, 10); assert.equal(t.net, 1534.73);
  assert.equal(t.vat['13.5'], 204.84); assert.equal(t.vat['25.5'], 4.43);
  assert.equal(t.reservation, 174.40); assert.equal(t.total, 1918.40);
  assert.deepEqual(f.requests, ['/storefront-cart-data.json']);
});

test('search additions merge by product and date, survive reload, and do not mutate reference data', async () => {
  const f = await fixture();
  await f.cart.add({ id: 'test-product', name: 'Testituote', price: 2.5, vat: 13.5, unit: 'kpl' }, 2, '2026-11-20');
  await f.cart.add({ id: 'test-product', name: 'Testituote', price: 2.5, vat: 13.5, unit: 'kpl' }, 3, '2026-11-20');
  assert.equal(f.cart.lines().length, 1); assert.equal(f.cart.lines()[0].qty, 5);
  assert.equal(f.cart.lines('2026-11-16').length, 10);
  const next = await fixture(f.storage);
  assert.equal(next.cart.get().selectedDate, '2026-11-20'); assert.equal(next.cart.totals().net, 12.5);
  assert.equal((seed.referenceCart || seed.cart).carts['2026-11-16'][0].qty, 3);
});

test('moving a line removes only that line; moving a basket merges quantities on the destination day', async () => {
  const { cart } = await fixture();
  cart.move('2026-11-18', '8076442');
  assert.equal(cart.get().selectedDate, '2026-11-16');
  assert.equal(cart.lines().length, 9); assert.equal(cart.lines('2026-11-18')[0].qty, 1);
  await cart.add({ id: '8076442', name: 'Vöner', price: 36.95, vat: 13.5 }, 2, '2026-11-16');
  cart.move('2026-11-18');
  assert.equal(cart.lines('2026-11-16').length, 0);
  assert.equal(cart.lines().find((p) => p.id === '8076442').qty, 3);
});

test('invalid quantities and calendar dates do not change the cart; clear affects only the chosen day', async () => {
  const { cart } = await fixture();
  for (const qty of [-1, 0, NaN, Infinity, 1000000]) assert.throws(() => cart.setQuantity('8097348', qty));
  for (const date of ['2026-99-99', '2026-02-30', '', 'tomorrow']) assert.throws(() => cart.select(date));
  assert.equal(cart.lines()[0].qty, 3);
  cart.setQuantity('9901719', '1,8'); assert.equal(cart.lines().find((p) => p.id === '9901719').qty, 1.8);
  cart.select('2026-11-18'); cart.clear(); assert.equal(cart.lines('2026-11-16').length, 10);
});

test('unknown price and tax remain explicit instead of inventing a payable total', async () => {
  const { cart } = await fixture();
  await cart.add({ id: 'unknown', name: 'Tuntematon verokanta', price: 10, taxUnknown: true, vat: null }, 1, '2026-11-20');
  assert.equal(cart.totals().taxUnknown, true); assert.equal(cart.totals().net, 10);
  assert.equal(Object.keys(cart.totals().vat).length, 0);
  await cart.add({ id: 'unpriced', name: 'Tuntematon hinta', price: null, vat: 13.5 }, 1);
  assert.equal(cart.totals().unpriced, true);
});

test('kilogram quantities retain gram precision while currency rounds to cents', async () => {
  const { cart } = await fixture();
  await cart.add({ id: 'weighed', name: 'Punnittava tuote', unit: 'kg', step: .001, price: 10, vat: 13.5 }, .001, '2026-11-20');
  assert.equal(cart.lines()[0].qty, .001); assert.equal(cart.totals().net, .01);
  cart.setQuantity('weighed', '.123'); assert.equal(cart.lines()[0].qty, .123);
});

test('saved baskets use lightweight reference photos while preserving quantities and custom image URLs', async () => {
  const saved = structuredClone(seed.referenceCart || seed.cart);
  const rows = saved.carts[saved.selectedDate];
  rows[0].qty = 7; rows[0].image = `/storefront-assets/${rows[0].id}.jpg`;
  rows[1].image = 'https://example.com/custom.webp';
  const { cart } = await fixture(new Map([['aimo.storefront.cart.v1', JSON.stringify(saved)]]));
  assert.equal(cart.lines()[0].qty, 7);
  assert.match(cart.lines()[0].image, /\/optimized\/.*\.webp$/);
  assert.equal(cart.lines()[1].image, 'https://example.com/custom.webp');
});


test('the working demo starts empty rather than importing reference or agent products', async () => {
  const { cart } = await fixture(new Map(), { reference: false });
  assert.equal(cart.lines().length, 0); assert.equal(cart.totals().net, 0);
});

test('only an untouched old reference basket is retired; user changes remain', async () => {
  const saved = structuredClone(seed.referenceCart);
  const key = 'aimo.storefront.cart.v1';
  const pristine = await fixture(new Map([[key, JSON.stringify(saved)]]), { reference: false });
  assert.equal(pristine.cart.lines().length, 0);
  saved.carts[saved.selectedDate][0].qty = 4;
  const edited = await fixture(new Map([[key, JSON.stringify(saved)]]), { reference: false });
  assert.equal(edited.cart.lines().length, 10); assert.equal(edited.cart.lines()[0].qty, 4);
});

test('selecting a delivery day never moves another day and reading dates creates no tabs', async () => {
  const f = await fixture(); const before = JSON.stringify(f.cart.get().carts);
  f.cart.lines('2026-11-30'); f.cart.totals('2026-11-30');
  assert.equal(JSON.stringify(f.cart.get().carts), before);
  f.cart.select('2026-11-20');
  assert.equal(f.cart.lines().length, 0);
  assert.equal(f.cart.lines('2026-11-16').length, 10);
  const events = f.events.length;
  f.cart.select('2026-11-20');
  assert.equal(f.events.length, events, 'no recursive change event for the same date');
  const reloaded = await fixture(f.storage);
  assert.equal(reloaded.cart.get().selectedDate, '2026-11-20');
});

test('moving a complete delivery removes its tab and preserves both references on a merge', async () => {
  const f = await fixture(); const { cart } = f;
  cart.reference('Keittiö');
  cart.select('2026-11-20'); cart.reference('Kahvila');
  await cart.add({ id: '8097348', name: 'Sama tuote', price: 1 }, 2);
  cart.select('2026-11-16'); cart.move('2026-11-20');
  assert.equal(Object.hasOwn(cart.get().carts, '2026-11-16'), false);
  assert.equal(Object.hasOwn(cart.get().references, '2026-11-16'), false);
  assert.equal(cart.lines().find((p) => p.id === '8097348').qty, 5);
  assert.equal(cart.get().references['2026-11-20'], 'Kahvila / Keittiö');
  const reloaded = await fixture(f.storage);
  assert.equal(Object.hasOwn(reloaded.cart.get().carts, '2026-11-16'), false);
  assert.equal(reloaded.cart.get().selectedDate, '2026-11-20');
});

test('removing a delivery deletes only its products and reference and picks the next then previous day', async () => {
  const f = await fixture(); const { cart } = f;
  cart.select('2026-11-20'); cart.reference('Poistettava viite');
  await cart.add({ id: 'remove-me', name: 'Poistettava tuote', price: 1 }, 2);
  cart.select('2026-11-25'); cart.select('2026-11-20');
  cart.removeDate();
  assert.equal(cart.get().selectedDate, '2026-11-25');
  assert.equal(Object.hasOwn(cart.get().carts, '2026-11-20'), false);
  assert.equal(Object.hasOwn(cart.get().references, '2026-11-20'), false);
  cart.removeDate(); assert.equal(cart.get().selectedDate, '2026-11-18');
  cart.removeDate(); assert.equal(cart.get().selectedDate, '2026-11-16');
  assert.equal(cart.lines().length, 10);
  assert.throws(() => cart.removeDate(), /Säilytä yksi/);
  const reloaded = await fixture(f.storage);
  assert.equal(reloaded.cart.lines().length, 10);
  assert.equal(Object.keys(reloaded.cart.get().carts).length, 1);
});

test('removing an unselected empty day preserves the selected day and invalid removal changes nothing', async () => {
  const { cart } = await fixture();
  cart.removeDate('2026-11-18');
  assert.equal(cart.get().selectedDate, '2026-11-16');
  const before = JSON.stringify(cart.get());
  assert.throws(() => cart.removeDate('2026-11-30'), /ei löydy/);
  assert.equal(JSON.stringify(cart.get()), before);
});

test('a failed quantity merge leaves both delivery baskets intact', async () => {
  const { cart } = await fixture(new Map(), { reference: false });
  await cart.add({ id: 'bulk', name: 'Tuote', price: 1 }, 999999);
  await cart.add({ id: 'bulk', name: 'Tuote', price: 1 }, 1, '2026-11-20');
  const before = JSON.stringify(cart.get());
  assert.throws(() => cart.move('2026-11-16'), /enimmäismäärän/);
  await assert.rejects(cart.add({ id: 'bulk', name: 'Tuote', price: 1 }, 999999), /enimmäismäärän/);
  assert.equal(JSON.stringify(cart.get()), before);
});

test('a batch is atomic and refreshes current product prices on a merged line', async () => {
  const { cart } = await fixture(new Map(), { reference: false });
  await assert.rejects(cart.addMany([{ product: { id: 'one', name: 'One' }, qty: 1 }, { product: { id: 'bad' }, qty: -1 }]));
  assert.equal(cart.lines().length, 0);
  await cart.add({ id: 'one', name: 'One', price: 2 }, 1);
  await cart.addMany([{ product: { id: 'one', name: 'One', price: 3 }, qty: 2 }]);
  assert.equal(cart.lines()[0].qty, 3); assert.equal(cart.lines()[0].price, 3);
});

test('an asynchronous batch refuses a basket changed after its availability check', async () => {
  const { cart } = await fixture(new Map(), { reference: false });
  const old = JSON.stringify(cart.lines());
  await cart.add({ id: 'one', name: 'One', price: 2 }, 1);
  await assert.rejects(cart.addMany([{ product: { id: 'one', name: 'One', price: 2 }, qty: 2 }], cart.get().selectedDate, { lines: old }), /muuttui/);
  assert.equal(cart.lines()[0].qty, 1);
});

test('accepting a replacement merges once, refreshes its price and persists one complete change', async () => {
  const f = await fixture(new Map(), { reference: false });
  const { cart } = f;
  await cart.add({ id: 'old', name: 'Vanha tuote', price: 1 }, 3);
  await cart.add({ id: 'replacement', name: 'Korvaaja', price: 2 }, 4);
  await cart.add({ id: 'other', name: 'Muu tuote' }, 1, '2026-11-20');
  cart.select('2026-11-16');
  const events = f.events.length;
  await cart.replace('old', { id: 'replacement', name: 'Korvaaja', price: 3, substitutionAccepted: true }, 2);
  assert.equal(f.events.length, events + 1);
  assert.equal(cart.lines().length, 1);
  assert.equal(cart.lines()[0].qty, 6);
  assert.equal(cart.lines()[0].price, 3);
  assert.equal(cart.lines()[0].substitutionAccepted, true);
  const reloaded = await fixture(f.storage, { reference: false });
  assert.equal(JSON.stringify(reloaded.cart.get()), JSON.stringify(cart.get()));
  assert.equal(cart.lines('2026-11-20')[0].qty, 1);
  await cart.replace('replacement', { ...cart.lines()[0], price: 4 }, 5);
  assert.equal(cart.lines()[0].qty, 5, 'updating the same product replaces its quantity');
});

test('a failed replacement never removes the original or an existing replacement', async () => {
  const f = await fixture(new Map(), { reference: false });
  const { cart } = f;
  await cart.add({ id: 'old', name: 'Vanha tuote' }, 3);
  await cart.add({ id: 'replacement', name: 'Korvaaja' }, 999999);
  const before = JSON.stringify(cart.get()); const events = f.events.length;
  await assert.rejects(cart.replace('old', { id: 'replacement', name: 'Korvaaja' }, 1), /enimmäismäärän/);
  await assert.rejects(cart.replace('old', { id: 'replacement' }, 1), /Tarkista/);
  await assert.rejects(cart.replace('old', { id: 'replacement', name: 'Korvaaja' }, -1), /Tarkista/);
  await assert.rejects(cart.replace('missing', { id: 'replacement', name: 'Korvaaja' }, 1), /ei löydy/);
  assert.equal(JSON.stringify(cart.get()), before);
  assert.equal(f.events.length, events);
  assert.equal(JSON.stringify((await fixture(f.storage, { reference: false })).cart.get()), before);
});

test('a replacement refuses a quantity or delivery-day edit during its asynchronous update', async () => {
  for (const edit of [cart => cart.setQuantity('old', 7), cart => cart.select('2026-11-20')]) {
    const { cart } = await fixture(new Map(), { reference: false });
    await cart.add({ id: 'old', name: 'Vanha tuote' }, 3);
    const date = cart.get().selectedDate;
    const pending = cart.replace('old', { id: 'replacement', name: 'Korvaaja' }, 2, date, { lines: JSON.stringify(cart.lines(date)) });
    edit(cart);
    const before = JSON.stringify(cart.get());
    await assert.rejects(pending, /muuttui/);
    assert.equal(JSON.stringify(cart.get()), before);
    assert.equal(cart.lines(date)[0].id, 'old');
    assert.equal(cart.lines('2026-11-20').length, 0);
  }
});
