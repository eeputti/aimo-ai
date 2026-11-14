import test from 'node:test';
import assert from 'node:assert/strict';
import { withDeliveryDate } from '../public/delivery-date.js';
import { understand } from '../server/aimo/understand.mjs';
import { routeRequest } from '../public/aimo-request-intent.js';

const date = '2026-11-20';
test('picker dates replace the previous request date instead of appending conflicting dates', () => {
  for (const old of ['maanantaiksi', 'ensi viikon tiistaina', 'huomenna', 'tänään', 'ylihuomiseksi', '16.11.', '16.11.2026', '2026-11-16', 'by Monday', 'next Friday', 'day after tomorrow', 'ma']) {
    const text = withDeliveryDate(`20 l laktoositonta maitoa ${old}`, date);
    assert.equal(text, `20 l laktoositonta maitoa ${date}`, old);
    const parsed = understand(text, { now: new Date('2026-11-14T10:00:00Z') });
    assert.equal(parsed.deliveryDate, date);
    assert.equal(parsed.items[0].quantity.value, 20);
    assert.ok(parsed.items[0].claims.includes('FREE_FROM_LACTOSE'));
  }
});
test('date changes preserve mixed product/recipe requests and portions', () => {
  const text = withDeliveryDate('100 kananmunaa maanantaiksi ja resepti lohikeittoon 50 annosta perjantaiksi', date);
  const routed = routeRequest(text);
  assert.equal(routed.productText, '100 kananmunaa');
  assert.deepEqual(routed.recipe, { query: 'lohikeitto', portions: 50, deliveryText: date });
  assert.equal(withDeliveryDate(text, date), text);
});
