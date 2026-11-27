-- Internal first-party handoff only. State and one-time code are digest-only;
-- S256 challenge is public proof metadata. The verifier never enters storage.
CREATE TABLE desktop_auth_requests (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 256),
  origin TEXT NOT NULL,
  state_digest TEXT NOT NULL CHECK(length(state_digest)=64 AND state_digest NOT GLOB '*[^0-9a-f]*'),
  challenge TEXT NOT NULL CHECK(length(challenge)=43 AND challenge NOT GLOB '*[^A-Za-z0-9_-]*'),
  callback_uri TEXT NOT NULL CHECK(length(callback_uri) BETWEEN 1 AND 256),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300000),
  account_id TEXT REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  approved_at INTEGER,
  code_digest TEXT UNIQUE CHECK(code_digest IS NULL OR (length(code_digest)=64 AND code_digest NOT GLOB '*[^0-9a-f]*')),
  code_expires_at INTEGER,
  consumed_at INTEGER,
  CHECK((approved_at IS NULL AND account_id IS NULL AND session_id IS NULL AND code_digest IS NULL AND code_expires_at IS NULL AND consumed_at IS NULL)
    OR (approved_at IS NOT NULL AND account_id IS NOT NULL AND session_id IS NOT NULL AND code_digest IS NOT NULL AND code_expires_at IS NOT NULL
      AND approved_at>=created_at AND approved_at<expires_at AND code_expires_at>approved_at AND code_expires_at<=approved_at+60000 AND code_expires_at<=expires_at
      AND (consumed_at IS NULL OR (consumed_at>=approved_at AND consumed_at<code_expires_at))))
);
CREATE INDEX desktop_auth_requests_expiry ON desktop_auth_requests(expires_at);
CREATE TRIGGER desktop_auth_request_pending BEFORE INSERT ON desktop_auth_requests
WHEN NEW.approved_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'desktop_auth_request_pending'); END;
-- Approval and consumption are the only transitions. An approval cannot be
-- replaced by another browser/account, renewed, or resurrected after exchange.
CREATE TRIGGER desktop_auth_request_immutable BEFORE UPDATE ON desktop_auth_requests
WHEN NEW.id!=OLD.id OR NEW.origin!=OLD.origin OR NEW.state_digest!=OLD.state_digest OR NEW.challenge!=OLD.challenge
 OR NEW.callback_uri!=OLD.callback_uri OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at OR OLD.consumed_at IS NOT NULL
 OR NOT ((OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL AND NEW.consumed_at IS NULL)
   OR (OLD.approved_at IS NOT NULL AND NEW.approved_at=OLD.approved_at AND NEW.account_id IS OLD.account_id AND NEW.session_id IS OLD.session_id
     AND NEW.code_digest IS OLD.code_digest AND NEW.code_expires_at IS OLD.code_expires_at AND NEW.consumed_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'desktop_auth_request_immutable'); END;
CREATE TRIGGER desktop_auth_request_source BEFORE UPDATE ON desktop_auth_requests
WHEN OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM sessions s WHERE s.id=NEW.session_id AND s.account_id=NEW.account_id AND s.transport='browser' AND s.assurance!='enrollment'
   AND s.expires_at>=NEW.code_expires_at)
BEGIN SELECT RAISE(ABORT,'desktop_auth_request_source'); END;
