// Persistent API cache used by product lookup. AIMO_DB keeps its existing configuration name.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { ROOT } from './catalog.mjs';

const db = new DatabaseSync(process.env.AIMO_DB || path.join(ROOT, 'data', 'aimo.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, json TEXT NOT NULL);
`);
const get = db.prepare('SELECT value FROM kv WHERE key = ?');
const set = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
export const kv = {
  get(key, fallback = null) { const row = get.get(key); return row ? JSON.parse(row.value) : fallback; },
  set(key, value) { set.run(key, JSON.stringify(value)); },
};
const cacheGet = db.prepare('SELECT fetched_at, json FROM api_cache WHERE key = ?');
const cacheSet = db.prepare('INSERT INTO api_cache (key, fetched_at, json) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json');
export const apiCache = {
  get(key) { const row = cacheGet.get(key); return row ? { fetchedAt: row.fetched_at, value: JSON.parse(row.json) } : null; },
  set(key, value) { cacheSet.run(key, Date.now(), JSON.stringify(value)); },
};
export function wipeApiCache() { db.exec('DELETE FROM api_cache;'); }
