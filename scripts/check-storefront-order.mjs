// Optional browser regression: set AIMO_PLAYWRIGHT_MODULE to an installed playwright module.
// Runs against its own simulated server and databases, never the user's running demo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
const { chromium } = await import(pathToFileURL(process.env.AIMO_PLAYWRIGHT_MODULE).href);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-order-browser-'));
const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: '0', AIMO_DB: path.join(dir, 'kitchen.db'), GATEWAY_DB: path.join(dir, 'gateway.db'), VALIO_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_NOW: '2026-11-14T10:00:00+02:00', GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser; let page; let log = '';
child.stderr.on('data', (data) => { log += data; });
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(log || 'Server startup timed out')), 15000);
    child.on('error', reject);
    child.stdout.on('data', (data) => { log += data; const match = log.match(/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('.product-card .cart-button:not(.notify)').first().click();
  await page.getByText('Lisätty ostoskoriin.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.aimoCart.lines().length), 1);
  // A catalogue product, instead of a reference product absent from the challenge data.
  await page.evaluate(async () => { await window.aimoCart.ready; window.aimoCart.clear(); window.aimoCart.select('2026-11-16'); await window.aimoCart.add({ id: '464306', name: 'Maito', price: null, unit: 'kpl' }, 2); });
  await page.goto(`${base}/cart.html`);
  await page.getByRole('button', { name: 'TARKISTA JA TILAA', exact: true }).click();
  const dialog = page.locator('.sf-agent'); await dialog.waitFor({ state: 'visible' });
  await dialog.locator('[data-sf-buyer]').selectOption('kahvila-aalto');
  await dialog.getByRole('button', { name: 'Tarkista hinnat ja saatavuus', exact: true }).click();
  await dialog.getByText('Tarjouksen summa (alv 0 %):', { exact: false }).waitFor();
  await dialog.getByRole('button', { name: 'Lähetä tilaus', exact: true }).click();
  await dialog.getByRole('button', { name: 'Hyväksy tilaus', exact: true }).waitFor();
  assert.equal((await (await page.request.get(`${base}/console/state`)).json()).orders.length, 1);
  await dialog.getByRole('button', { name: 'Hyväksy tilaus', exact: true }).click();
  await dialog.getByRole('heading', { name: /Vahvistettu/ }).waitFor();
  await dialog.getByRole('button', { name: 'Näytä päätösketju', exact: true }).click();
  await dialog.getByText('Päätösketju: ehjä', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Valtuudet', exact: true }).click();
  await dialog.locator('[data-cap="order"]').fill('25');
  await dialog.getByRole('button', { name: 'Tallenna valtuudet', exact: true }).click();
  await dialog.getByText('Valtuudet tallennettu.', { exact: true }).waitFor();
  const state = await (await page.request.get(`${base}/console/state`)).json();
  assert.equal(state.buyers.find((b) => b.id === 'kahvila-aalto').mandate.maxOrderNet, 25);
  assert.equal(state.orders[0].status, 'confirmed');
  assert.deepEqual(errors, []);
  await dialog.getByRole('button', { name: 'Sulje tilaukset', exact: true }).click();
  await page.goto(base);
  await page.getByRole('button', { name: 'Tilaukset', exact: true }).click();
  await page.locator('.sf-agent').getByRole('heading', { name: /Vahvistettu/ }).waitFor();
  // Check that the existing header still displays the actual basket after module loading.
  assert.match(await page.locator('.header-actions').innerText(), /Ostoskori/);
  console.log('PASS: storefront card → basket → signed quote → pending approval → confirmed → audit → mandate → homepage orders; no browser errors.');
} catch (error) {
  console.error(await page?.locator('body').innerText().catch(() => 'No page available'));
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode == null) { child.kill(); await once(child, 'exit'); }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
