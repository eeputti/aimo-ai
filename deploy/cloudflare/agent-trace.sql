-- Additive migration for an existing D1 database (same statement as in schema.sql).
CREATE TABLE IF NOT EXISTS agent_traces (
  order_id TEXT PRIMARY KEY,
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
