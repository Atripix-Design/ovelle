CREATE TABLE IF NOT EXISTS download_email_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS download_email_limits_expiry ON download_email_limits(expires_at);
