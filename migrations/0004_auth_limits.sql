-- Durable budgets contain keyed digests, never submitted email/IP identifiers.
-- Reserve capacity before running a verifier so concurrent requests cannot all
-- pass a read-before-write check. Successful verification refunds that lease.
CREATE TABLE auth_limits (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=64 AND id NOT GLOB '*[^0-9a-f]*'),
  kind TEXT NOT NULL CHECK(kind IN ('challenge_pair','challenge_ip','email_address','email_ip')),
  used INTEGER NOT NULL CHECK(used>=0),
  expires_at INTEGER NOT NULL,
  CONSTRAINT auth_limit_exceeded CHECK(used <= CASE kind WHEN 'challenge_ip' THEN 30 ELSE 5 END)
);
CREATE INDEX auth_limits_expiry ON auth_limits(expires_at);
CREATE TABLE auth_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  pair_id TEXT NOT NULL,
  pair_expires_at INTEGER NOT NULL,
  ip_id TEXT NOT NULL,
  ip_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_expiry ON auth_attempts(expires_at);
