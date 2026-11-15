import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAlertStore, readWaitingSignups, renderSignupAlert } from '../scripts/whatsapp-signup-alerts.mjs';

const recipient = 'owner@example.com';
const signup = { phone: '+358401234567', name: 'Kokeilija', company: 'Demokeittiö', createdAt: 1000 };

test('only one email is prepared per number while waiting, including repeat forms and both statuses', () => {
  const store = openAlertStore();
  try {
    const scan = store.scan([signup, { ...signup, createdAt: 2000 }], recipient);
    assert.equal(scan.notifications.length, 1);
    assert.equal(scan.reconcile.length, 0);
    const alert = scan.notifications[0];
    assert.equal(alert.to, recipient);
    assert.match(alert.text, /\+358401234567/);
    assert.equal(store.scan([{ ...signup, createdAt: 3000 }], recipient).notifications[0].key, alert.key);
    store.reserve(alert.key);
    assert.throws(() => store.reserve(alert.key), /jo varattu/);
    assert.equal(store.scan([signup], recipient).notifications.length, 0);
    assert.equal(store.scan([signup], recipient).reconcile[0].key, alert.key);
    store.ack(alert.key, 'gmail-123');
    assert.deepEqual(store.scan([{ ...signup, createdAt: 4000 }], recipient), { notifications: [], reconcile: [] });
    assert.throws(() => store.ack(alert.key, 'gmail-123'), /ei odota/);
  } finally { store.close(); }
});

test('a fresh waiting cycle alerts again; a temporary empty snapshot cannot resend the same request', () => {
  const store = openAlertStore();
  try {
    const { key } = store.scan([signup], recipient).notifications[0];
    store.reserve(key); store.ack(key, 'gmail-1');
    store.scan([], recipient);
    assert.equal(store.scan([signup], recipient).notifications.length, 0);
    store.scan([], recipient);
    const again = store.scan([{ ...signup, createdAt: 5000 }], recipient).notifications[0];
    assert.notEqual(again.key, key);
  } finally { store.close(); }
});

test('the private ledger survives restarts and a reservation needs Gmail reconciliation rather than blind retry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aimo-alerts-'));
  const path = join(dir, 'alerts.db');
  try {
    let store = openAlertStore(path);
    const { key } = store.scan([signup], recipient).notifications[0];
    store.reserve(key); store.close();
    store = openAlertStore(path);
    assert.equal(store.scan([signup], recipient).reconcile.length, 1);
    store.ack(key, 'gmail-after-restart'); store.close();
    store = openAlertStore(path);
    assert.deepEqual(store.scan([signup], recipient), { notifications: [], reconcile: [] });
    store.close();
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the mail escapes user text, uses a fixed Meta link and does not include a submitted code', () => {
  const store = openAlertStore();
  try {
    const alert = store.scan([{ ...signup, name: '<script>bad</script>', company: 'A & B', code: '987654' }], recipient).notifications[0];
    assert.match(alert.html, /&lt;script&gt;bad&lt;\/script&gt;/);
    assert.match(alert.html, /A &amp; B/);
    assert.doesNotMatch(JSON.stringify(alert), /987654/);
    assert.doesNotMatch(alert.html, /<script>/);
    assert.match(alert.html, /https:\/\/developers\.facebook\.com\/apps\/1829102204844975/);
    assert.throws(() => renderSignupAlert(signup, 'key', 'bad\r\nBcc: evil@example.com'), /vastaanottaja/);
    assert.throws(() => store.scan([{ ...signup, phone: 'bad' }], recipient), /Virheellinen/);
    assert.throws(() => store.ack(alert.key, 'not-sent'), /ei odota/);
  } finally { store.close(); }
});

test('the scan uses read-only requests for both waiting states and a failed request yields no partial snapshot', async () => {
  const env = { CLOUDFLARE_DEMO_URL: 'https://demo.example', CLOUDFLARE_DEMO_SYNC_TOKEN: 'x'.repeat(40) };
  const calls = [];
  const rows = await readWaitingSignups(env, async (url, init) => {
    calls.push([String(url), init]);
    return Response.json({ signups: [{ ...signup, code: '987654' }] });
  });
  assert.equal(rows.length, 2);
  assert.ok(calls.every(([, init]) => !init.method && !init.body));
  assert.deepEqual(calls.map(([url]) => new URL(url).searchParams.get('status')).sort(), ['linked', 'pending']);
  assert.ok(rows.every(row => row.code === undefined));
  await assert.rejects(readWaitingSignups(env, async url => new URL(url).searchParams.get('status') === 'pending' ? Response.json({ signups: [signup] }) : new Response('', { status: 503 })), /503/);
  await assert.rejects(readWaitingSignups({ ...env, CLOUDFLARE_DEMO_URL: 'http://demo.example' }), /HTTPS/);
});
