import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { checkWhatsAppEnvironment, formatPreflight, ROOT } from '../scripts/whatsapp-preflight.mjs';

const pem = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aimo-whatsapp-preflight-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/catalog.json'), JSON.stringify([{ id: 'fixture', name: 'Testimaito' }]));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    WHATSAPP_PHONE_NUMBER_ID: '12345', WHATSAPP_ACCESS_TOKEN: 'private-fixture-token', WHATSAPP_APP_SECRET: 'private-fixture-secret',
    WHATSAPP_VERIFY_TOKEN: 'private-fixture-verify', WHATSAPP_API_VERSION: 'v25.0', WHATSAPP_SUPPORT_CONTACT: 'Fixture support',
    WHATSAPP_ORDERING_ENABLED: 'true', WHATSAPP_PORT: '4759', WHATSAPP_DEMO_PHONE: '358401234567',
    WHATSAPP_DB: path.join(root, 'isolated/inbox.db'), WHATSAPP_DRAFT_DB: path.join(root, 'isolated/drafts.db'),
    WHATSAPP_QUOTE_DB: path.join(root, 'isolated/quotes.db'), GATEWAY_DB: path.join(root, 'isolated/gateway.db'), AIMO_DB: path.join(root, 'isolated/kitchen.db'),
    AIMO_CATALOG: path.join(root, 'data/catalog.json'), GATEWAY_PRIVATE_KEY_PEM: pem,
    ANTHROPIC_API_KEY: '', VALIO_API_KEY: '', ASSISTANT_MCP_URL: '', ASSISTANT_MCP_TOKEN: '', DEMO_NOW: '',
  };
  return { root, env, check: (changes = {}, opts = {}) => checkWhatsAppEnvironment({ ...env, ...changes }, { root, cwd: root, ...opts }) };
}

test('preflight reads local configuration without creating databases and keeps secrets out of text/JSON', (t) => {
  const { root, env, check } = fixture(t);
  const result = check();
  assert.equal(result.ok, true);
  assert.equal(result.catalogProducts, 1);
  assert.deepEqual(result.warnings.map((w) => w.code), ['RULE_INTERPRETER', 'SIMULATED_PRICES', 'NO_VOICE']);
  assert.equal(fs.existsSync(path.join(root, 'isolated')), false);
  for (const json of [false, true]) {
    const out = formatPreflight(result, json);
    for (const key of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_DEMO_PHONE', 'GATEWAY_PRIVATE_KEY_PEM']) assert.equal(out.includes(env[key]), false, key);
    assert.equal(out.includes(root), false);
  }
  const bad = check({ WHATSAPP_PHONE_NUMBER_ID: 'private-invalid-id', WHATSAPP_API_VERSION: 'private-invalid-version', GATEWAY_PRIVATE_KEY_PEM: 'private-invalid-key' });
  assert.equal(bad.ok, false);
  assert.doesNotMatch(formatPreflight(bad, true), /private-invalid/);
});

test('preflight catches missing credentials, unsupported Node, bad ports and misspelled modes', (t) => {
  const { check } = fixture(t);
  for (const changes of [{ WHATSAPP_ACCESS_TOKEN: '' }, { WHATSAPP_PORT: '0' }, { WHATSAPP_PORT: '65536' }, { WHATSAPP_PORT: '4759x' }, { WHATSAPP_PORT: ' ' }, { WHATSAPP_ORDERING_ENABLED: 'ture' }, { WHATSAPP_ORDERING_ENABLED: ' true ' }, { GATEWAY_DB: ' data/isolated.db ' }, { WHATSAPP_DEMO_PHONE: ' 358401234567 ' }, { GATEWAY_PRIVATE_KEY_PEM: ' ' }, { DEMO_NOW: 'huomenna' }]) assert.equal(check(changes).ok, false);
  assert.equal(check({}, { nodeVersion: '22.12.0' }).ok, false);
  assert.equal(check({}, { nodeVersion: '22.13.0' }).ok, true);
  assert.equal(check({ DEMO_NOW: '2026-11-14T10:00:00+0200' }).ok, true);
});

test('all five database files must be distinct, persistent and separate from storefront files, including file links', (t) => {
  const { root, env, check } = fixture(t);
  assert.equal(check({ AIMO_DB: '' }).ok, false);
  assert.equal(check({ GATEWAY_DB: ':memory:' }).ok, false);
  assert.equal(check({ WHATSAPP_QUOTE_DB: env.WHATSAPP_DRAFT_DB }).errors.some((e) => e.code === 'DB_COLLISION'), true);
  const shared = path.join(root, 'data/gateway.db'); fs.writeFileSync(shared, 'keep storefront unchanged');
  const linked = path.join(root, 'linked.db'); fs.symlinkSync(shared, linked);
  const hard = path.join(root, 'hard.db'); fs.linkSync(shared, hard);
  for (const alias of [shared, linked, hard]) assert.equal(check({ GATEWAY_DB: alias }).errors.some((e) => e.code === 'SHARED_DB'), true);
  fs.mkdirSync(path.dirname(env.WHATSAPP_DB)); fs.mkdirSync(env.WHATSAPP_DB);
  assert.equal(check().errors.some((e) => e.code === 'DB_NOT_WRITABLE'), true);
  assert.equal(fs.readFileSync(shared, 'utf8'), 'keep storefront unchanged');
});

test('ordering mode checks a usable catalog and an Ed25519 signing key; read-only mode needs neither', (t) => {
  const { root, env, check } = fixture(t);
  for (const contents of ['invalid json', '{}', '[]', '[{"name":"no id"}]']) {
    fs.writeFileSync(env.AIMO_CATALOG, contents);
    assert.equal(check().errors.some((e) => e.code === 'CATALOG'), true);
  }
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.equal(check({ GATEWAY_PRIVATE_KEY_PEM: rsa }).errors.some((e) => e.code === 'SIGNING_KEY'), true);
  fs.rmSync(env.AIMO_CATALOG);
  const result = check({ WHATSAPP_ORDERING_ENABLED: 'false', AIMO_DB: '', GATEWAY_DB: '', GATEWAY_PRIVATE_KEY_PEM: '' });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'read-only-test');
  assert.deepEqual(Object.keys(result.databasePaths), ['WHATSAPP_DB']);
  assert.equal(result.warnings.some((w) => w.code === 'READ_ONLY_AGENT_NOT_READY'), true);
  assert.equal(fs.existsSync(path.join(root, 'isolated')), false);
});

test('launcher fails before opening a listener or creating stores when configuration is incomplete', (t) => {
  const { root, env } = fixture(t);
  const child = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'deploy/whatsapp/start.mjs'], {
    cwd: ROOT, env: { ...process.env, ...env, WHATSAPP_ACCESS_TOKEN: '' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stdout, /WHATSAPP_ACCESS_TOKEN puuttuu/);
  assert.equal(fs.existsSync(path.join(root, 'isolated')), false);
});

test('real standalone service restarts with the same membership, reply, draft and demo order in isolated stores', { timeout: 20_000 }, async (t) => {
  const { root, env } = fixture(t);
  const reservation = net.createServer(); await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  env.WHATSAPP_PORT = String(reservation.address().port);
  await new Promise((resolve) => reservation.close(resolve));
  const active = new Set();
  t.after(async () => { for (const child of active) { child.kill('SIGKILL'); await child.finished; } });
  async function start() {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'deploy/whatsapp/start.mjs'], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', (s) => { output += s; }); child.stderr.on('data', (s) => { output += s; });
    child.finished = new Promise((resolve) => child.once('exit', (code, signal) => { active.delete(child); resolve({ code, signal }); }));
    active.add(child);
    for (let i = 0; i < 80; i++) {
      if (child.exitCode != null) throw new Error(output);
      try {
        const r = await fetch(`http://127.0.0.1:${env.WHATSAPP_PORT}/healthz`, { signal: AbortSignal.timeout(200) });
        if (r.ok) {
          assert.deepEqual(await r.json(), { ok: true, channel: 'whatsapp', mode: 'ordering-demo' });
          const page = await fetch(`http://127.0.0.1:${env.WHATSAPP_PORT}/demo`);
          assert.equal(page.status, 200);
          assert.match(page.headers.get('content-type'), /text\/html/);
          assert.match(await page.text(), /<html/);
          return child;
        }
      } catch { /* wait for the isolated listener */ }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Isolated service did not start: ${output}`);
  }
  async function stop(child) {
    child.kill('SIGTERM');
    assert.deepEqual(await child.finished, { code: 0, signal: null });
  }
  await stop(await start());
  const seed = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `
    import { openWhatsAppStore } from './server/whatsapp/store.mjs';
    import { openDraftStore } from './server/order-conversation/store.mjs';
    import { orders } from './server/gateway/store.mjs';
    import { kv } from './server/db.mjs';
    import { DatabaseSync } from 'node:sqlite';
    const w = openWhatsAppStore(process.env.WHATSAPP_DB);
    w.enqueue({ id: 'deploy-incoming', phone: process.env.WHATSAPP_DEMO_PHONE, text: 'tuki', sentAt: Date.now() });
    w.db.prepare("UPDATE inbox SET reply='saved support reply',state='done',reply_id='fixture-reply' WHERE id='deploy-incoming'").run();
    w.close();
    const d = openDraftStore(process.env.WHATSAPP_DRAFT_DB);
    d.save('deploy-conversation', { id: 'deploy-draft', revision: 2, state: 'active', lines: [{ ref: 'milk', quantity: { value: 30, unit: 'L' } }] }, 'deploy-turn', { text: 'saved draft reply' }); d.close();
    orders.save({ orderId: 'deploy-order', buyerId: 'fixture-buyer', idempotencyKey: 'deploy-order', status: 'confirmed', createdAt: new Date().toISOString(), lines: [{ productId: 'fixture', qty: 2 }] });
    kv.set('deployment-fixture', { preserved: true });
    const q = new DatabaseSync(process.env.WHATSAPP_QUOTE_DB); q.exec('CREATE TABLE deployment_fixture (value TEXT)'); q.prepare('INSERT INTO deployment_fixture VALUES (?)').run('saved quote'); q.close();
  `], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 5000 });
  assert.equal(seed.status, 0, seed.stderr);
  const before = new DatabaseSync(env.WHATSAPP_DB, { readOnly: true });
  const binding = before.prepare('SELECT binding FROM members').get().binding; before.close();
  await stop(await start());
  const rows = [
    [env.WHATSAPP_DB, 'SELECT binding FROM members', 'binding', binding],
    [env.WHATSAPP_DB, "SELECT reply FROM inbox WHERE id='deploy-incoming'", 'reply', 'saved support reply'],
    [env.WHATSAPP_DRAFT_DB, "SELECT json FROM drafts WHERE id='deploy-draft'", 'json', '"revision":2'],
    [env.GATEWAY_DB, "SELECT json FROM orders WHERE id='deploy-order'", 'json', '"qty":2'],
    [env.AIMO_DB, "SELECT value FROM kv WHERE key='deployment-fixture'", 'value', '"preserved":true'],
    [env.WHATSAPP_QUOTE_DB, 'SELECT value FROM deployment_fixture', 'value', 'saved quote'],
  ];
  for (const [filename, sql, field, expected] of rows) {
    const db = new DatabaseSync(filename, { readOnly: true });
    try { assert.ok(db.prepare(sql).get()[field].includes(expected), `${path.basename(filename)} survives restart`); }
    finally { db.close(); }
  }
  assert.equal(fs.existsSync(path.join(root, 'data/gateway.db')), false);
  assert.equal(fs.existsSync(path.join(root, 'data/aimo.db')), false);
});

test('preflight tarkistaa ääniviestien litterointiasetuksen ennen käynnistystä tulostamatta avainta', (t) => {
  const { check } = fixture(t);
  const groqNoKey = check({ WHATSAPP_TRANSCRIBE: 'groq' });
  assert.equal(groqNoKey.ok, false);
  assert.match(groqNoKey.errors.find((e) => e.code === 'TRANSCRIBE').message, /GROQ_API_KEY/);
  const groq = check({ WHATSAPP_TRANSCRIBE: 'groq', GROQ_API_KEY: 'gsk-private-fixture' });
  assert.equal(groq.ok, true);
  assert.equal(groq.warnings.some((w) => w.code === 'NO_VOICE'), false);
  for (const json of [false, true]) assert.equal(formatPreflight(groq, json).includes('gsk-private-fixture'), false);
  assert.equal(check({ WHATSAPP_TRANSCRIBE: 'whisperx' }).errors.some((e) => e.code === 'TRANSCRIBE'), true);
  assert.equal(check({ WHATSAPP_MEDIA: 'false', WHATSAPP_TRANSCRIBE: 'groq' }).ok, true, 'media pois: litterointia ei käytetä');
  assert.equal(check({ WHATSAPP_MEDIA: 'yes' }).errors.some((e) => e.code === 'MEDIA_FLAG'), true);
});


test('Ollama preflight requires a model and ordering mode without demanding a paid key', (t) => {
  const { check } = fixture(t);
  const settings = { AIMO_MODEL_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://ollama:11434', OLLAMA_MODEL: 'qwen3:8b', ANTHROPIC_API_KEY: '' };
  const result = check(settings);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((w) => w.code === 'RULE_INTERPRETER'), false);
  assert.equal(check({ ...settings, OLLAMA_MODEL: '' }).errors.some((e) => e.code === 'MODEL_SETTINGS'), true);
  assert.equal(check({ ...settings, WHATSAPP_ORDERING_ENABLED: 'false' }).errors.some((e) => e.code === 'OLLAMA_ORDERING_REQUIRED'), true);
});
