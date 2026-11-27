-- Only digests and selectors persist. The HttpOnly browser binding derives
-- nonce/PKCE with HMAC; neither their raw values nor provider tokens enter D1.
CREATE TABLE oidc_transactions (
  state_digest TEXT PRIMARY KEY NOT NULL CHECK(length(state_digest)=64 AND state_digest NOT GLOB '*[^0-9a-f]*'),
  binding_digest TEXT NOT NULL CHECK(length(binding_digest)=64 AND binding_digest NOT GLOB '*[^0-9a-f]*'),
  provider TEXT NOT NULL CHECK(provider IN ('google','microsoft')),
  connection_id TEXT NOT NULL REFERENCES identity_connections(id),
  connection_version INTEGER NOT NULL CHECK(connection_version>=1),
  purpose TEXT NOT NULL CHECK(purpose IN ('login','link')),
  account_id TEXT REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300000),
  consumed_at INTEGER,
  CHECK((purpose='login' AND account_id IS NULL AND session_id IS NULL) OR (purpose='link' AND account_id IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX oidc_transactions_expiry ON oidc_transactions(expires_at);
CREATE TRIGGER oidc_transaction_immutable BEFORE UPDATE ON oidc_transactions
WHEN NEW.state_digest!=OLD.state_digest OR NEW.binding_digest!=OLD.binding_digest OR NEW.provider!=OLD.provider
 OR NEW.connection_id!=OLD.connection_id OR NEW.connection_version!=OLD.connection_version OR NEW.purpose!=OLD.purpose
 OR NEW.account_id IS NOT OLD.account_id OR NEW.session_id IS NOT OLD.session_id OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
 OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR NEW.consumed_at<NEW.created_at OR NEW.consumed_at>=NEW.expires_at
BEGIN SELECT RAISE(ABORT,'oidc_transaction_immutable'); END;
