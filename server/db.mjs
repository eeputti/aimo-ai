// SQLite (Noden sisäänrakennettu node:sqlite). Tänne syvä agentti tallentaa tuloksensa ja täältä nopea polku lukee ne.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { ROOT } from './catalog.mjs';

const db = new DatabaseSync(process.env.AIMO_DB || path.join(ROOT, 'data', 'aimo.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS history (week TEXT NOT NULL, date TEXT NOT NULL, product_id TEXT NOT NULL, qty REAL NOT NULL, PRIMARY KEY (week, product_id));
  CREATE TABLE IF NOT EXISTS bookings (date TEXT PRIMARY KEY, covers INTEGER NOT NULL, note TEXT);
  CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, delivery_date TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, placed_at TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, ms REAL, proposal_id TEXT);
  CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, json TEXT NOT NULL);
`);

const stmt = {
  kvGet: db.prepare('SELECT value FROM kv WHERE key = ?'),
  kvSet: db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  auditAdd: db.prepare('INSERT INTO audit (ts, actor, action, detail, ms, proposal_id) VALUES (?, ?, ?, ?, ?, ?)'),
  auditList: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?'),
  propGet: db.prepare('SELECT json FROM proposals WHERE id = ?'),
  propSave: db.prepare('INSERT INTO proposals (id, delivery_date, created_at, status, json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, json = excluded.json, delivery_date = excluded.delivery_date'),
  histAdd: db.prepare('INSERT INTO history (week, date, product_id, qty) VALUES (?, ?, ?, ?) ON CONFLICT(week, product_id) DO UPDATE SET qty = excluded.qty'),
  histAll: db.prepare('SELECT week, date, product_id, qty FROM history ORDER BY date'),
  bookAdd: db.prepare('INSERT INTO bookings (date, covers, note) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET covers = excluded.covers, note = excluded.note'),
  bookAll: db.prepare('SELECT date, covers, note FROM bookings ORDER BY date'),
  orderAdd: db.prepare('INSERT INTO orders (id, proposal_id, placed_at, json) VALUES (?, ?, ?, ?)'),
  orderByProposal: db.prepare('SELECT json FROM orders WHERE proposal_id = ?'),
  orderCount: db.prepare('SELECT COUNT(*) AS n FROM orders'),
  cacheGet: db.prepare('SELECT fetched_at, json FROM api_cache WHERE key = ?'),
  cacheSet: db.prepare('INSERT INTO api_cache (key, fetched_at, json) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json'),
};

export const kv = {
  get(key, fallback = null) {
    const row = stmt.kvGet.get(key);
    return row ? JSON.parse(row.value) : fallback;
  },
  set(key, value) { stmt.kvSet.run(key, JSON.stringify(value)); },
};

const listeners = new Set();
export const onAudit = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Jokainen agentin ja käyttäjän teko jää lokiin: kuka, mitä, miksi, kauanko kesti. */
export function audit(actor, action, detail = {}, ms = null, proposalId = null) {
  const ts = new Date().toISOString();
  const info = stmt.auditAdd.run(ts, actor, action, JSON.stringify(detail), ms, proposalId);
  const entry = { id: Number(info.lastInsertRowid), ts, actor, action, detail, ms, proposalId };
  for (const fn of listeners) fn(entry);
  return entry;
}
export const auditList = (limit = 80) => stmt.auditList.all(limit).map((r) => ({ id: r.id, ts: r.ts, actor: r.actor, action: r.action, detail: JSON.parse(r.detail || '{}'), ms: r.ms, proposalId: r.proposal_id }));

export const proposals = {
  get(id) { const row = stmt.propGet.get(id); return row ? JSON.parse(row.json) : null; },
  save(p) { stmt.propSave.run(p.id, p.deliveryDate, p.createdAt, p.status, JSON.stringify(p)); return p; },
  current() { const id = kv.get('currentProposal'); return id ? this.get(id) : null; },
  setCurrent(id) { kv.set('currentProposal', id); },
};

export const history = {
  add(week, date, productId, qty) { stmt.histAdd.run(week, date, productId, qty); },
  all() { return stmt.histAll.all(); },
};
export const bookings = {
  add(date, covers, note = null) { stmt.bookAdd.run(date, covers, note); },
  all() { return stmt.bookAll.all(); },
};
export const orders = {
  add(order) { stmt.orderAdd.run(order.id, order.proposalId, order.placedAt, JSON.stringify(order)); },
  byProposal(id) { const row = stmt.orderByProposal.get(id); return row ? JSON.parse(row.json) : null; },
  count() { return stmt.orderCount.get().n; },
};
export const apiCache = {
  get(key) { const row = stmt.cacheGet.get(key); return row ? { fetchedAt: row.fetched_at, value: JSON.parse(row.json) } : null; },
  set(key, value) { stmt.cacheSet.run(key, Date.now(), JSON.stringify(value)); },
};

export function wipe() {
  db.exec('DELETE FROM kv; DELETE FROM history; DELETE FROM bookings; DELETE FROM proposals; DELETE FROM orders; DELETE FROM audit;');
}
export function wipeApiCache() { db.exec('DELETE FROM api_cache;'); }
// Test processes keep this module-level connection open; close it before removing a temporary DB on Windows.
export function closeDatabase() { db.close(); }
