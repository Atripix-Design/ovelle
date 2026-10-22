-- Credentials and protocol assertions are deliberately separate from accounts.
-- No password format or provider secrets are established by this migration.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE CHECK(email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254 AND instr(email, '@') > 1),
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 120),
  email_verified_at INTEGER,
  disabled_at INTEGER,
  security_version INTEGER NOT NULL DEFAULT 1 CHECK(security_version >= 1),
  created_at INTEGER NOT NULL
);
CREATE TRIGGER account_identity_immutable BEFORE UPDATE ON accounts
WHEN NEW.id!=OLD.id OR NEW.email!=OLD.email OR NEW.security_version<OLD.security_version
BEGIN SELECT RAISE(ABORT,'account_identity_immutable'); END;
CREATE TRIGGER account_disable_revokes AFTER UPDATE OF disabled_at ON accounts
WHEN OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL
BEGIN UPDATE accounts SET security_version=security_version+1 WHERE id=NEW.id; END;
CREATE TABLE identity_connections (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  protocol TEXT NOT NULL CHECK(protocol IN ('oidc','saml')),
  provider TEXT NOT NULL CHECK(provider IN ('google','microsoft','enterprise_saml')),
  issuer TEXT NOT NULL CHECK(length(issuer) BETWEEN 1 AND 2048),
  client_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at INTEGER NOT NULL,
  UNIQUE(organization_id,id),
  CHECK((protocol='oidc' AND provider IN ('google','microsoft') AND organization_id IS NULL AND client_id IS NOT NULL AND length(client_id)>0)
     OR (protocol='saml' AND provider='enterprise_saml' AND organization_id IS NOT NULL AND client_id IS NULL))
);
CREATE TRIGGER identity_connection_version BEFORE UPDATE ON identity_connections
WHEN NEW.version != OLD.version+1 OR NEW.id != OLD.id OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.protocol != OLD.protocol OR NEW.provider != OLD.provider
BEGIN SELECT RAISE(ABORT,'identity_connection_version'); END;
CREATE TABLE external_identities (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  connection_id TEXT NOT NULL REFERENCES identity_connections(id),
  issuer TEXT NOT NULL CHECK(length(issuer) BETWEEN 1 AND 2048),
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 512),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  disabled_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(connection_id,issuer,subject),
  UNIQUE(id,account_id,connection_id)
);
CREATE TRIGGER external_identity_issuer BEFORE INSERT ON external_identities
WHEN NOT EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=NEW.connection_id AND c.issuer=NEW.issuer AND c.enabled=1)
BEGIN SELECT RAISE(ABORT,'external_identity_issuer'); END;
CREATE TRIGGER external_identity_immutable BEFORE UPDATE ON external_identities
WHEN NEW.id != OLD.id OR NEW.account_id != OLD.account_id OR NEW.connection_id != OLD.connection_id OR NEW.issuer != OLD.issuer OR NEW.subject != OLD.subject
  OR NEW.version<OLD.version OR (NEW.disabled_at IS NOT OLD.disabled_at AND NEW.version!=OLD.version+1)
BEGIN SELECT RAISE(ABORT,'external_identity_immutable'); END;
CREATE INDEX external_identities_account ON external_identities(account_id);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  csrf_digest TEXT CHECK(csrf_digest IS NULL OR (length(csrf_digest)=64 AND csrf_digest NOT GLOB '*[^0-9a-f]*')),
  transport TEXT NOT NULL CHECK(transport IN ('browser','desktop')),
  method TEXT NOT NULL CHECK(method IN ('password','passkey','oidc','saml')),
  assurance TEXT NOT NULL CHECK(assurance IN ('enrollment','authenticated','passkey')),
  account_security_version INTEGER NOT NULL,
  external_identity_id TEXT,
  external_identity_version INTEGER,
  connection_id TEXT REFERENCES identity_connections(id),
  connection_version INTEGER,
  created_at INTEGER NOT NULL,
  authenticated_at INTEGER NOT NULL,
  passkey_verified_at INTEGER CHECK(passkey_verified_at IS NULL OR (passkey_verified_at >= authenticated_at AND passkey_verified_at <= created_at)),
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at AND expires_at <= created_at+43200000 AND authenticated_at <= created_at),
  revoked_at INTEGER,
  FOREIGN KEY(external_identity_id,account_id,connection_id) REFERENCES external_identities(id,account_id,connection_id),
  CHECK((transport='browser' AND csrf_digest IS NOT NULL) OR (transport='desktop' AND csrf_digest IS NULL)),
  CHECK((method IN ('oidc','saml') AND external_identity_id IS NOT NULL AND external_identity_version IS NOT NULL AND connection_id IS NOT NULL AND connection_version IS NOT NULL)
     OR (method IN ('password','passkey') AND external_identity_id IS NULL AND external_identity_version IS NULL AND connection_id IS NULL AND connection_version IS NULL)),
  CHECK((assurance='passkey' AND passkey_verified_at IS NOT NULL) OR (assurance!='passkey' AND passkey_verified_at IS NULL)),
  CHECK(method!='passkey' OR assurance='passkey')
);
-- Tokens and authentication evidence are immutable. Step-up must mint a new
-- session and retire the previous one after a verified ceremony, never edit it.
CREATE TRIGGER session_security_immutable BEFORE UPDATE ON sessions
WHEN NEW.id!=OLD.id OR NEW.account_id!=OLD.account_id OR NEW.token_digest!=OLD.token_digest
  OR NEW.csrf_digest IS NOT OLD.csrf_digest OR NEW.transport!=OLD.transport OR NEW.method!=OLD.method
  OR NEW.assurance!=OLD.assurance OR NEW.account_security_version!=OLD.account_security_version
  OR NEW.external_identity_id IS NOT OLD.external_identity_id OR NEW.external_identity_version IS NOT OLD.external_identity_version OR NEW.connection_id IS NOT OLD.connection_id
  OR NEW.connection_version IS NOT OLD.connection_version OR NEW.created_at!=OLD.created_at
  OR NEW.authenticated_at!=OLD.authenticated_at OR NEW.passkey_verified_at IS NOT OLD.passkey_verified_at
  OR NEW.expires_at!=OLD.expires_at OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN SELECT RAISE(ABORT,'session_security_immutable'); END;
CREATE TRIGGER session_connection_protocol BEFORE INSERT ON sessions
WHEN NEW.connection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=NEW.connection_id AND c.protocol=NEW.method)
BEGIN SELECT RAISE(ABORT,'session_connection_protocol'); END;
CREATE INDEX sessions_account ON sessions(account_id,revoked_at,expires_at);
CREATE INDEX sessions_expiry ON sessions(expires_at);
-- Time is supplied by the trusted request clock in every caller's predicate.
CREATE VIEW stage0_live_sessions AS
SELECT s.* FROM sessions s JOIN accounts a ON a.id=s.account_id
LEFT JOIN external_identities i ON i.id=s.external_identity_id AND i.account_id=s.account_id AND i.connection_id=s.connection_id
LEFT JOIN identity_connections c ON c.id=s.connection_id
WHERE s.revoked_at IS NULL AND a.disabled_at IS NULL AND a.security_version=s.account_security_version
  AND (s.assurance='enrollment' OR a.email_verified_at IS NOT NULL)
  AND (s.connection_id IS NULL OR (i.id IS NOT NULL AND i.disabled_at IS NULL AND i.version=s.external_identity_version AND c.enabled=1 AND c.version=s.connection_version AND c.issuer=i.issuer AND c.protocol=s.method));
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update')),
  resource_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_events_organization ON audit_events(organization_id,created_at,id);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
-- A failing guard must abort the entire D1 batch, rather than merely update 0 rows.
CREATE TABLE stage0_guards (id TEXT PRIMARY KEY NOT NULL, allowed INTEGER NOT NULL CONSTRAINT stage0_guard_denied CHECK(allowed=1));
