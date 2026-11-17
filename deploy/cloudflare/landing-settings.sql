-- Site settings set by hand on the live database, never in Git (the repository is public):
-- bot_backend_url (browser chat, see docs/web-chat.md) and example_trace_order (the public example trace).
-- The landing page sign-up API and its form were removed on 17.11.2026; an existing database may still
-- hold the old signups table, which nothing reads any more.
CREATE TABLE IF NOT EXISTS landing_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
