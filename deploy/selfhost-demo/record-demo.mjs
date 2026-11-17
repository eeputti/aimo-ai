// Manual browser test against the isolated demo, with actual model responses and a recording.
// Install Playwright separately or set AIMO_PLAYWRIGHT_MODULE to its index.mjs path.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const target = new URL(process.env.DEMO_RECORD_URL || 'http://127.0.0.1:4765');
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.protocol !== 'http:') throw new Error('Käytä erillisen demon paikallista osoitetta.');
const out = path.resolve(process.env.DEMO_RECORD_OUT || 'deploy/selfhost-demo/.state/recording');
fs.mkdirSync(out, { recursive: true });
const modulePath = process.env.AIMO_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.DEMO_CHROMIUM ? { executablePath: process.env.DEMO_CHROMIUM } : {}), args: ['--no-sandbox','--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: path.join(out, 'video'), size: { width: 1440, height: 1080 } } });
const page = await context.newPage(); const video = page.video();
const start = performance.now(); const at = () => Number(((performance.now() - start) / 1000).toFixed(3));
const marks = {}; const steps = []; const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = { sourceCommit: process.env.DEMO_SOURCE_COMMIT || null, model: null, passed: false, steps, marks,
  realModel: true, syntheticProducts: true, sendsOrders: false };
function view(data) { return { text: data.text, status: data.status, ms: data.ms, cart: data.cart ? {
  deliveryDate: data.cart.deliveryDate, status: data.cart.status, diet: data.cart.diet,
  lines: data.cart.lines.map(({ productTerm, quantity, claims, selectedName }) => ({ productTerm, quantity, claims, selectedName })),
} : null }; }
async function send(text, key) {
  await page.locator('#text').fill(''); await page.locator('#text').pressSequentially(text, { delay: 40 });
  const response = page.waitForResponse((r) => r.url() === `${target.origin}/api/chat` && r.request().method() === 'POST', { timeout: 330000 });
  marks[key + 'Sent'] = at(); await page.getByRole('button', { name: 'Lähetä', exact: true }).click();
  const res = await response; assert.equal(res.status(), 200);
  const data = await res.json(); marks[key + 'Reply'] = at();
  steps.push({ input: text, ...view(data) });
  await page.locator('#send').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('send').disabled === false);
  assert.notEqual(data.status, 'error', data.text);
  return data;
}
function checkMilk(data, amount) {
  assert.equal(data.cart?.lines.length, 1);
  const l = data.cart.lines[0]; assert.equal(l.quantity.value, amount); assert.equal(l.quantity.unit, 'L');
  assert.ok([...l.claims, ...data.cart.diet.claims].includes('FREE_FROM_LACTOSE'));
}
try {
  await page.goto(target.origin);
  const status = await (await context.request.get(`${target.origin}/api/status`)).json();
  assert.equal(status.isolated, true); assert.equal(status.sendsOrders, false); assert.equal(status.ready, true, status.message);
  report.model = status.model;
  const initial = await (await context.request.get(`${target.origin}/api/cart`)).json(); assert.equal(initial.cart, null);
  await page.waitForTimeout(1700);
  const first = await send('20 litraa laktoositonta maitoa perjantaiksi. Ei muita ruokavaliorajoituksia.', 'first');
  checkMilk(first, 20); assert.ok(first.cart.deliveryDate);
  await page.waitForTimeout(2200);
  const selected = first.cart.status === 'needs_product_selection' ? await send('1', 'select') : first;
  assert.equal(selected.cart.status, 'review');
  await page.waitForTimeout(2300);
  const updated = await send('Muuta maidon määrä 30 litraan.', 'update');
  checkMilk(updated, 30); assert.equal(updated.cart.deliveryDate, first.cart.deliveryDate);
  const final = updated.cart.status === 'needs_product_selection' ? await send('1', 'reselect') : updated;
  checkMilk(final, 30); assert.equal(final.cart.status, 'review');
  assert.match(final.text, /5 pakettia/); assert.equal(errors.length, 0, errors.join('\n'));
  await page.locator('#cart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'ostoslista-30l.png'), fullPage: true });
  marks.finalReady = at(); await page.waitForTimeout(8000); marks.end = at();
  report.passed = true;
  console.log(JSON.stringify({ passed: true, model: report.model, times: steps.map((s) => ({ input: s.input, ms: s.ms })), out }));
} catch (err) {
  report.error = String(err.message || err); marks.end = at();
  await page.screenshot({ path: path.join(out, 'failed.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1; console.error(report.error);
} finally {
  await context.close(); await browser.close();
  if (video) fs.renameSync(await video.path(), path.join(out, 'raw.webm'));
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
