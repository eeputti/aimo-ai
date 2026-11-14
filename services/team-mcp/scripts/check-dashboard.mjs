// Optional browser check; point AIMO_PLAYWRIGHT_MODULE at an installed Playwright module.
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { openStore } from '../src/store.mjs';
import { createCoordinator, coordinatorConfig } from '../src/coordinator.mjs';
import { createCoordinatorDashboard } from '../src/coordinator-web.mjs';

const { chromium } = await import(process.env.AIMO_PLAYWRIGHT_MODULE || 'playwright');
const store = openStore(':memory:');
const key = store.addMember('daniel-chatgpt', 'Daniel / ChatGPT', ['aimo-ai']);
store.addMember('eelis-claude', 'Eelis / Claude <img src=x onerror="window.injected=true">', ['aimo-ai']);
const settings = coordinatorConfig({});
const coordinator = createCoordinator(store, settings, { log() {} });
await coordinator.tick();
const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
const port = server.address().port; server.on('request', createCoordinatorDashboard(store, port));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.AIMO_CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  assert.equal(await page.locator('#content').isVisible(), false);
  await page.locator('#key').fill(key); await page.getByRole('button', { name: 'Yhdistä', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#agents').textContent.includes('Eelis / Claude'));
  assert.equal(await page.locator('#key').inputValue(), '');
  const task = store.claim('eelis-claude', { project: 'aimo-ai', title: 'Kirjautumissivu', resources: ['public/login.js'] });
  store.progress('eelis-claude', { project: 'aimo-ai', taskId: task.id, expectedRevision: task.revision, note: 'Rakennan kirjautumisen rajapintaa.' });
  store.coordination.touch('eelis-claude', 'aimo-ai', 'report_progress'); await coordinator.tick();
  await page.waitForFunction(() => document.querySelector('#agents').textContent.includes('Rakennan kirjautumisen rajapintaa.'));
  store.sendMessage('daniel-chatgpt', { project: 'aimo-ai', recipient: settings.actor, subject: 'Review', body: 'Arvioi työn seuraava askel.', requestKey: 'dashboard-browser-test' });
  const worker = createCoordinator(store, { ...settings, mode: 'openai' }, { log() {}, agent: async () => ({ summary: 'Rajapinnan testi on seuraava askel.', reply: 'Pyydä Eelistä testaamaan rajapinta.' }) });
  await worker.tick();
  await page.waitForFunction(() => document.querySelector('#jobs').textContent.includes('Pyydä Eelistä testaamaan rajapinta.'));
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  if (process.env.AIMO_DASHBOARD_SCREENSHOT) await page.screenshot({ path: process.env.AIMO_DASHBOARD_SCREENSHOT, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: 'Katkaise yhteys' }).click();
  assert.equal(await page.locator('#content').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('OK: browser login, live task update, API result, text escaping, mobile width and logout; no browser errors. No real model calls.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); store.close();
}
