-- WhatsApp demo sign-ups from the landing page. Additive: safe to run on the existing database.
-- The phone number is private. Only the publisher token (the WhatsApp server machine) can list it;
-- a browser can read only the status of its own sign-up with the token it received.
CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'linked', 'ready', 'failed')),
  chat_url TEXT,
  -- Meta's test-recipient code typed on the page, shown only to the presenter's machine; cleared on approval.
  meta_code TEXT,
  code_at INTEGER,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS signups_status ON signups(status, created_at);
CREATE INDEX IF NOT EXISTS signups_phone ON signups(phone);
CREATE INDEX IF NOT EXISTS signups_ip ON signups(ip_hash, created_at);
