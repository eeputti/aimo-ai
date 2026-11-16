-- Audit #14 (16.11.2026): a sign-up proves the number with a one-time WhatsApp link code.
-- Additive, for the existing live database that was created from the earlier signup.sql. Run once:
--   cd deploy/cloudflare && npm exec -- cf d1 execute aimo-order-demo --remote --file signup-verify.sql
-- Existing rows keep working: they have no link code, and the WhatsApp machine keeps their members as they are.
-- A second run stops at "duplicate column name", which leaves the table unchanged.
ALTER TABLE signups ADD COLUMN link_code TEXT;
ALTER TABLE signups ADD COLUMN link_hash TEXT;
ALTER TABLE signups ADD COLUMN link_expires INTEGER;
ALTER TABLE signups ADD COLUMN invited_at INTEGER;
ALTER TABLE signups ADD COLUMN verified_at INTEGER;
CREATE INDEX IF NOT EXISTS signups_invites ON signups(invited_at, created_at);
