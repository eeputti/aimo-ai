-- Additive migration for an existing D1 database (same statement as in schema.sql).
CREATE TABLE IF NOT EXISTS web_chat_usage (
  day TEXT NOT NULL,
  session TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, session)
);
