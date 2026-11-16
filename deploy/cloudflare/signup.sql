-- WhatsApp demo sign-ups from the landing page. For a new database only; an existing database gets the
-- link code columns from signup-verify.sql (run once).
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
  -- One-time link code shown to this browser only. The number becomes a customer when a WhatsApp message
  -- "YHDISTA <code>" arrives from the same number. The WhatsApp machine gets only link_hash.
  link_code TEXT,
  link_hash TEXT,
  link_expires INTEGER,
  invited_at INTEGER,
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS signups_status ON signups(status, created_at);
CREATE INDEX IF NOT EXISTS signups_phone ON signups(phone);
CREATE INDEX IF NOT EXISTS signups_ip ON signups(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS signups_invites ON signups(invited_at, created_at);
-- Landing page settings set by hand on the live database, never in Git (the repository is public).
-- presenter_phone: international digits of the presenter, shown after a sign-up for the verification call.
CREATE TABLE IF NOT EXISTS landing_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
