CREATE TABLE IF NOT EXISTS demo_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  json TEXT NOT NULL
);

-- One row per confirmed order pushed by the gateway machine. The order id is the idempotency key.
-- email_to is private: no public route reads this table.
CREATE TABLE IF NOT EXISTS order_events (
  order_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  json TEXT NOT NULL,
  email_to TEXT,
  email_status TEXT NOT NULL,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_updated_at INTEGER NOT NULL,
  email_message_id TEXT
);

-- Demo-only payment state. No real payment or card information is stored.
CREATE TABLE IF NOT EXISTS demo_payments (
  order_id TEXT PRIMARY KEY REFERENCES order_events(order_id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
  amount_net_cents INTEGER NOT NULL CHECK (amount_net_cents >= 0),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);

-- "Katso, mitä agentti näki": the published conversation and gateway checks behind one order.
-- Read only with that order's demo payment link; phone numbers and cart links are masked before publishing.
CREATE TABLE IF NOT EXISTS agent_traces (
  order_id TEXT PRIMARY KEY,
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
