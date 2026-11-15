// Portin tallennus: tarjouspyynnöt, tilaukset ja hash-ketjutettu tapahtumaloki (audit trail).
// Loki on append-only: jokainen rivi sisältää edellisen rivin hashin, joten yhdenkin rivin muuttaminen jälkikäteen rikkoo ketjun.
import { openSqlite } from '../sqlite.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { ROOT } from '../catalog.mjs';
import { clock } from './clock.mjs';

// GATEWAY_DB: testiajo (npm run eval) käyttää omaa kantaansa, jotta demon tilaukset ja loki säilyvät.
const db = openSqlite(process.env.GATEWAY_DB || path.join(ROOT, 'data', 'gateway.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS buyers (id TEXT PRIMARY KEY, api_key TEXT UNIQUE NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL, idem_key TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL, UNIQUE (buyer_id, idem_key));
  CREATE TABLE IF NOT EXISTS ledger (seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL, buyer_id TEXT, order_id TEXT, quote_id TEXT, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS ledger_order ON ledger (order_id);
`);

const q = {
  buyerByKey: db.prepare('SELECT json FROM buyers WHERE api_key = ?'),
  buyerById: db.prepare('SELECT json FROM buyers WHERE id = ?'),
  buyerAll: db.prepare('SELECT json FROM buyers ORDER BY id'),
  buyerSave: db.prepare('INSERT INTO buyers (id, api_key, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key, json = excluded.json'),
  quoteSave: db.prepare('INSERT INTO quotes (id, buyer_id, created_at, json) VALUES (?, ?, ?, ?)'),
  quoteGet: db.prepare('SELECT json FROM quotes WHERE id = ?'),
  orderSave: db.prepare('INSERT INTO orders (id, buyer_id, idem_key, status, created_at, json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, json = excluded.json'),
  orderGet: db.prepare('SELECT json FROM orders WHERE id = ?'),
  orderByIdem: db.prepare('SELECT json FROM orders WHERE buyer_id = ? AND idem_key = ?'),
  orderList: db.prepare('SELECT json FROM orders ORDER BY created_at DESC LIMIT ?'),
  orderListBuyer: db.prepare('SELECT json FROM orders WHERE buyer_id = ? ORDER BY created_at DESC LIMIT ?'),
  orderCount: db.prepare('SELECT COUNT(*) AS n FROM orders'),
  ledgerLast: db.prepare('SELECT seq, hash FROM ledger ORDER BY seq DESC LIMIT 1'),
  ledgerAdd: db.prepare('INSERT INTO ledger (ts, actor, type, buyer_id, order_id, quote_id, payload, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  ledgerAll: db.prepare('SELECT * FROM ledger ORDER BY seq'),
  ledgerRecent: db.prepare('SELECT * FROM ledger ORDER BY seq DESC LIMIT ?'),
};
const parse = (row) => (row ? JSON.parse(row.json) : null);

export const buyers = {
  byKey: (key) => parse(q.buyerByKey.get(key)),
  byId: (id) => parse(q.buyerById.get(id)),
  all: () => q.buyerAll.all().map(parse),
  save(b) { q.buyerSave.run(b.id, b.apiKey, JSON.stringify(b)); return b; },
};
export const quotes = {
  save(quote) { q.quoteSave.run(quote.quoteId, quote.buyerId, quote.createdAt, JSON.stringify(quote)); return quote; },
  get: (id) => parse(q.quoteGet.get(id)),
};
export const orders = {
  save(o) { q.orderSave.run(o.orderId, o.buyerId, o.idempotencyKey, o.status, o.createdAt, JSON.stringify(o)); return o; },
  get: (id) => parse(q.orderGet.get(id)),
  byIdempotency: (buyerId, key) => parse(q.orderByIdem.get(buyerId, key)),
  list: (buyerId, limit = 50) => (buyerId ? q.orderListBuyer.all(buyerId, limit) : q.orderList.all(limit)).map(parse),
  nextNumber: () => q.orderCount.get().n + 1,
};

const GENESIS = '0'.repeat(64);
const digest = (prev, e) => crypto.createHash('sha256').update(`${prev}|${e.ts}|${e.actor}|${e.type}|${e.buyerId || ''}|${e.orderId || ''}|${e.quoteId || ''}|${e.payload}`).digest('hex');
const rowToEntry = (r) => ({ seq: r.seq, ts: r.ts, actor: r.actor, type: r.type, buyerId: r.buyer_id, orderId: r.order_id, quoteId: r.quote_id, payload: JSON.parse(r.payload), prevHash: r.prev_hash, hash: r.hash });
const listeners = new Set();
export const onLedger = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const ledger = {
  /** actor: 'gateway' | 'policy' | 'agent:<buyerId>' | 'human:<nimi>' */
  append(actor, type, payload = {}, refs = {}) {
    const last = q.ledgerLast.get();
    const e = { ts: clock.now().toISOString(), actor, type, buyerId: refs.buyerId || null, orderId: refs.orderId || null, quoteId: refs.quoteId || null, payload: JSON.stringify(payload) };
    const prev = last?.hash || GENESIS;
    const hash = digest(prev, e);
    const info = q.ledgerAdd.run(e.ts, e.actor, e.type, e.buyerId, e.orderId, e.quoteId, e.payload, prev, hash);
    const entry = { seq: Number(info.lastInsertRowid), ...e, payload, prevHash: prev, hash };
    for (const fn of listeners) fn(entry);
    return entry;
  },
  /** Laskee koko ketjun uudelleen. brokenAt = ensimmäinen rivi, jonka hash ei täsmää. */
  verify() {
    let prev = GENESIS;
    const rows = q.ledgerAll.all();
    for (const r of rows) {
      const expect = digest(prev, { ts: r.ts, actor: r.actor, type: r.type, buyerId: r.buyer_id, orderId: r.order_id, quoteId: r.quote_id, payload: r.payload });
      if (r.prev_hash !== prev || r.hash !== expect) return { valid: false, entries: rows.length, brokenAt: r.seq };
      prev = r.hash;
    }
    return { valid: true, entries: rows.length, head: prev };
  },
  forOrder(orderId, quoteIds = []) { return q.ledgerAll.all().filter((r) => r.order_id === orderId || (r.quote_id && quoteIds.includes(r.quote_id))).map(rowToEntry); },
  recent: (limit = 60) => q.ledgerRecent.all(limit).map(rowToEntry),
};

export function wipeGateway() { db.exec('DELETE FROM quotes; DELETE FROM orders; DELETE FROM ledger; DELETE FROM buyers;'); }
