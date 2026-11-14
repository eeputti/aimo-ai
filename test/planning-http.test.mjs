import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('suunnittelutietojen HTTP-ketju erillisessä demossa', { timeout: 20000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-planning-http-'));
  const env = { ...process.env, PORT: '0', AIMO_DB: path.join(dir, 'kitchen.db'), GATEWAY_DB: path.join(dir, 'gateway.db'),
    VALIO_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_NOW: '2026-11-14T10:00:00+02:00',
    GATEWAY_PRIVATE_KEY_PEM: crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }) };
  // Oikea tallennettu luonnos vanhasta versiosta: mukana budjettipäätös ja käyttäjän määrämuutos.
  const setup = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `
    import { seedDemo } from './server/demo.mjs';
    import { runDeep } from './server/agents/deep.mjs';
    import { kv, proposals } from './server/db.mjs';
    await seedDemo();
    const p = await runDeep({ reason: 'vanhan version testiluonnos' });
    p.lines[0].qty += 1;
    p.lines[0].reason.userEdit = 'Käyttäjän määrämuutos';
    p.totals.budgetCap = 1;
    p.totals.budgetOk = false;
    p.totals.overBy = p.totals.expected - 1;
    p.approvals.push({ id: 'budget', type: 'budget', text: 'Tilaus ylittää budjetin' });
    p.canOrder = false;
    p.budgetOverride = { approvedUpTo: 1 };
    p.briefing = 'Budjetti ylittyy: tarvitsen luvan.';
    proposals.save(p);
    kv.set('rules', { ...kv.get('rules'), budgetCap: 1 });
    console.log(JSON.stringify({ id: p.id, lines: p.lines.map(l => [l.lineId, l.productId, l.qty]) }));
  `], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  if (setup.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); assert.fail(setup.stderr); }
  const legacy = JSON.parse(setup.stdout.trim());
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode == null && child.signalCode == null) { child.kill(); await once(child, 'exit'); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let log = '';
  child.stderr.on('data', (data) => { log += data; });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Palvelin ei käynnistynyt: ${log}`)), 10000);
    child.on('error', (e) => { clearTimeout(timeout); reject(e); });
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Palvelin sulkeutui (${code}): ${log}`)); });
    child.stdout.on('data', (data) => {
      log += data;
      const match = log.match(/→ http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://localhost:${match[1]}`); }
    });
  });
  const request = async (url, body) => {
    const r = await fetch(base + url, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const settled = async (afterRevision = -1) => {
    for (let i = 0; i < 200; i++) {
      const r = await request('/api/state');
      if (r.body.proposal && !r.body.deep.running && (r.body.proposal.planningRevision ?? 0) > afterRevision) return r.body.proposal;
      await delay(20);
    }
    throw new Error(`Tarvelaskenta ei valmistunut: ${log}`);
  };
  const initial = await settled();
  const deliveryDate = initial.deliveryDate;
  const initialData = (await request('/api/planning')).body;

  await t.test('vanhan luonnoksen budjettivaroitus poistuu ja omat määrämuutokset säilyvät', async () => {
    assert.equal(initial.id, legacy.id);
    assert.deepEqual(initial.lines.map((l) => [l.lineId, l.productId, l.qty]), legacy.lines);
    assert.equal(initial.lines[0].reason.userEdit, 'Käyttäjän määrämuutos');
    assert.ok(initial.approvals.every((a) => a.type !== 'budget'));
    assert.doesNotMatch(initial.briefing, /budjet/i);
    for (const key of ['budgetCap', 'budgetOk', 'overBy']) assert.equal(Object.hasOwn(initial.totals, key), false);
    assert.equal(Object.hasOwn(initial, 'budgetOverride'), false);
    assert.equal(Object.hasOwn((await request('/api/state')).body.rules, 'budgetCap'), false);
    assert.equal((await request('/api/budget', { action: 'trim' })).status, 404);
    const update = await request('/api/rules', { budgetCap: 1 });
    assert.equal(Object.hasOwn(update.body.rules, 'budgetCap'), false);
    assert.ok(update.body.proposal.approvals.every((a) => a.type !== 'budget'));
  });

  await t.test('epäselvää ryhmän jäsenyyttä ei tallenneta', async () => {
    const r = await request('/api/planning', { menuEvents: [{ id: 'new', groups: [{ date: deliveryDate, pax: 10 }], recipe: [{ productId: '460460', amount: 0.01, unit: 'kg' }] }] });
    assert.equal(r.status, 400);
    assert.match(r.body.details.join(' '), /includedInBookings/);
    assert.deepEqual((await request('/api/planning')).body, initialData);
  });

  await t.test('uusi resepti tallentuu, lasketaan ja hinnoitellaan ilman ostohistoriaa', async () => {
    const r = await request('/api/planning', { menuEvents: [{ id: 'new', name: 'Uusi jälkiruoka', includedInBookings: false,
      groups: [{ date: deliveryDate, pax: 100 }], recipe: [{ productId: '460460', amount: 0.01, unit: 'kg' }] }] });
    assert.equal(r.status, 202);
    const p = await settled(initial.planningRevision ?? 0);
    const sugar = p.lines.find((l) => l.productId === '460460');
    assert.equal(sugar.origin, 'recipe');
    assert.equal(sugar.qty, 1);
    assert.ok(sugar.price.net > 0);
    assert.deepEqual(p.planningIssues, []);
  });

  await t.test('puuttuva yksikkömuunnos näkyy ja pysäyttää myös tilauksen HTTP-tarkistuksen', async () => {
    const before = await settled();
    const r = await request('/api/planning', { menuEvents: [{ id: 'bad-size', includedInBookings: false,
      groups: [{ date: deliveryDate, pax: 10 }], recipe: [{ productId: '461915', amount: 0.1, unit: 'l' }] }] });
    assert.equal(r.status, 202);
    const p = await settled(before.planningRevision);
    assert.ok(p.approvals.some((a) => a.type === 'planning'));
    const review = await request('/api/order/review', {});
    assert.equal(review.body.ok, false);
    assert.ok(review.body.proposal.planningIssues.length);
  });
});
