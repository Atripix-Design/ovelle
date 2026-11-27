-- Public keys and opaque RP-scoped user handles are not private keys. Challenge
-- capabilities remain digest-only; no authenticator secret enters D1.
CREATE TABLE passkey_users (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
  user_handle TEXT NOT NULL UNIQUE CHECK(length(user_handle)=43 AND user_handle NOT GLOB '*[^A-Za-z0-9_-]*')
);
CREATE TRIGGER passkey_user_immutable BEFORE UPDATE ON passkey_users BEGIN SELECT RAISE(ABORT,'passkey_user_immutable'); END;
CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 1364 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  account_id TEXT NOT NULL REFERENCES passkey_users(account_id),
  public_key TEXT NOT NULL CHECK(length(public_key) BETWEEN 1 AND 5464 AND public_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  counter INTEGER NOT NULL CHECK(counter BETWEEN 0 AND 4294967295),
  device_type TEXT NOT NULL CHECK(device_type IN ('singleDevice','multiDevice')),
  backed_up INTEGER NOT NULL CHECK(backed_up IN (0,1) AND (device_type='multiDevice' OR backed_up=0)),
  transports TEXT NOT NULL CHECK(json_valid(transports) AND json_type(transports)='array'),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at INTEGER NOT NULL,
  disabled_at INTEGER
);
CREATE INDEX passkey_credentials_account ON passkey_credentials(account_id);
CREATE TRIGGER passkey_credential_immutable BEFORE UPDATE ON passkey_credentials
WHEN NEW.id!=OLD.id OR NEW.account_id!=OLD.account_id OR NEW.public_key!=OLD.public_key OR NEW.device_type!=OLD.device_type
 OR NEW.created_at!=OLD.created_at OR NEW.version!=OLD.version+1 OR NEW.counter<OLD.counter
 OR (OLD.disabled_at IS NOT NULL AND NEW.disabled_at IS NOT OLD.disabled_at)
BEGIN SELECT RAISE(ABORT,'passkey_credential_immutable'); END;
CREATE TABLE passkey_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  challenge_digest TEXT NOT NULL CHECK(length(challenge_digest)=64 AND challenge_digest NOT GLOB '*[^0-9a-f]*'),
  purpose TEXT NOT NULL CHECK(purpose IN ('register','login','step_up')),
  account_id TEXT REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  initial INTEGER NOT NULL CHECK(initial IN (0,1) AND (purpose='register' OR initial=0)),
  origin TEXT NOT NULL,
  rp_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300000),
  consumed_at INTEGER,
  CHECK((purpose='login' AND account_id IS NULL AND session_id IS NULL) OR (purpose!='login' AND account_id IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX passkey_challenges_expiry ON passkey_challenges(expires_at);
CREATE UNIQUE INDEX passkey_challenges_session_pending ON passkey_challenges(session_id,purpose) WHERE consumed_at IS NULL;
CREATE TRIGGER passkey_challenge_immutable BEFORE UPDATE ON passkey_challenges
WHEN NEW.id!=OLD.id OR NEW.token_digest!=OLD.token_digest OR NEW.challenge_digest!=OLD.challenge_digest OR NEW.purpose!=OLD.purpose
 OR NEW.account_id IS NOT OLD.account_id OR NEW.session_id IS NOT OLD.session_id OR NEW.initial!=OLD.initial
 OR NEW.origin!=OLD.origin OR NEW.rp_id!=OLD.rp_id OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
 OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR NEW.consumed_at<NEW.created_at
BEGIN SELECT RAISE(ABORT,'passkey_challenge_immutable'); END;

ALTER TABLE sessions ADD COLUMN passkey_credential_id TEXT REFERENCES passkey_credentials(id);
CREATE TRIGGER session_passkey_immutable BEFORE UPDATE ON sessions
WHEN NEW.passkey_credential_id IS NOT OLD.passkey_credential_id
BEGIN SELECT RAISE(ABORT,'session_passkey_immutable'); END;
CREATE TRIGGER session_passkey_account BEFORE INSERT ON sessions
WHEN NEW.passkey_credential_id IS NOT NULL AND (NEW.assurance!='passkey' OR NOT EXISTS(
 SELECT 1 FROM passkey_credentials p WHERE p.id=NEW.passkey_credential_id AND p.account_id=NEW.account_id AND p.disabled_at IS NULL))
BEGIN SELECT RAISE(ABORT,'session_passkey_account'); END;
DROP VIEW stage0_live_sessions;
CREATE VIEW stage0_live_sessions AS
SELECT s.* FROM sessions s JOIN accounts a ON a.id=s.account_id
LEFT JOIN stage0_trusted_identities i ON i.id=s.external_identity_id AND i.account_id=s.account_id AND i.connection_id=s.connection_id
LEFT JOIN passkey_credentials p ON p.id=s.passkey_credential_id AND p.account_id=s.account_id
WHERE s.revoked_at IS NULL AND a.disabled_at IS NULL AND a.security_version=s.account_security_version
 AND (s.assurance='enrollment' OR a.email_verified_at IS NOT NULL)
 AND (s.connection_id IS NULL OR (i.id IS NOT NULL AND i.version=s.external_identity_version AND i.connection_version=s.connection_version AND i.protocol=s.method))
 AND (s.passkey_credential_id IS NULL OR (s.assurance='passkey' AND p.id IS NOT NULL AND p.disabled_at IS NULL));

CREATE TABLE audit_events_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link','passkey.register','passkey.authenticate')),
  resource_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO audit_events_next SELECT * FROM audit_events;
DROP TABLE audit_events;
ALTER TABLE audit_events_next RENAME TO audit_events;
CREATE INDEX audit_events_organization ON audit_events(organization_id,created_at,id);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
