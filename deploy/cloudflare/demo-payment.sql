-- Optional, isolated simulation. This table never records a real payment.
CREATE TABLE IF NOT EXISTS demo_payments (
  order_id TEXT PRIMARY KEY REFERENCES order_events(order_id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
  amount_net_cents INTEGER NOT NULL CHECK (amount_net_cents >= 0),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);
