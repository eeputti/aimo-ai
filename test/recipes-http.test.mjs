import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('reseptituonti ja tuotehaku toimivat HTTP:n yli erillisillä kannoilla', { timeout: 15000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-recipes-http-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0', AIMO_DB: path.join(dir, 'kitchen.db'), GATEWAY_DB: path.join(dir, 'gateway.db'), VALIO_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_NOW: '2026-11-14T12:00:00+02:00' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode == null && child.signalCode == null) { child.kill(); await once(child, 'exit'); } fs.rmSync(dir, { recursive: true, force: true }); });
  let log = '';
  child.stderr.on('data', (data) => { log += data; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(log || 'Palvelin ei käynnistynyt.')), 8000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', () => { clearTimeout(timer); reject(new Error(log)); });
    child.stdout.on('data', (data) => { log += data; const m = log.match(/→ http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(`http://localhost:${m[1]}`); } });
  });
  const request = async (url, body) => { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  assert.equal((await fetch(base + '/recipes.html')).status, 200);
  assert.equal((await request('/api/recipes/analyze', {})).status, 400);
  assert.equal((await request('/api/recipes/analyze', { text: 'oma menu' })).status, 503);
  // Rajan ylitystä ei katkaista tai tulkita menuksi.
  assert.equal((await request('/api/recipes/analyze', { text: 'a'.repeat(8e6) })).status, 413);
  const r = await request('/api/recipes/analyze', { recipeId: 'riisipuuro' });
  assert.equal(r.status, 200); assert.equal(r.body.recipes[0].portions, null);
  const recipes = r.body.recipes;
  assert.equal((await request('/api/recipes/products', { recipes, deliveryDate: '2026-11-16' })).status, 400);
  recipes[0].portions = 20;
  const products = await request('/api/recipes/products', { recipes, deliveryDate: '2026-11-16' });
  assert.equal(products.status, 200); assert.equal(products.body.mode, 'sim');
  assert.equal(products.body.needs.find((n) => n.name === 'puuroriisi').amount, 1.2);
  for (const card of products.body.cards) for (const p of card.list) assert.equal(p.availability.deliveryDate, '2026-11-16');
});
