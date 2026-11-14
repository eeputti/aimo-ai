CREATE TABLE IF NOT EXISTS demo_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
