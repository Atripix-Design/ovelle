-- Existing SAML rows have unknown format; do not guess or backfill identity
-- semantics. Protocol login/link services require an exact recorded format.
ALTER TABLE external_identities ADD COLUMN saml_name_id_format TEXT CHECK(saml_name_id_format IS NULL OR saml_name_id_format IN (
 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent','urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'));
CREATE TRIGGER saml_identity_format_immutable BEFORE UPDATE OF saml_name_id_format ON external_identities
WHEN NEW.saml_name_id_format IS NOT OLD.saml_name_id_format
BEGIN SELECT RAISE(ABORT,'saml_identity_format_immutable'); END;
CREATE TRIGGER saml_identity_format_protocol BEFORE INSERT ON external_identities
WHEN NEW.saml_name_id_format IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity_connections WHERE id=NEW.connection_id AND protocol='saml')
BEGIN SELECT RAISE(ABORT,'saml_identity_format_protocol'); END;

-- The AuthnRequest ID is a public protocol selector. RelayState/browser binding
-- and reviewed profile configuration persist only as digests, never raw XML or keys.
CREATE TABLE saml_transactions (
 request_id TEXT PRIMARY KEY NOT NULL CHECK(length(request_id)=44 AND substr(request_id,1,1)='_' AND substr(request_id,2) NOT GLOB '*[^A-Za-z0-9_-]*'),
 relay_digest TEXT NOT NULL UNIQUE CHECK(length(relay_digest)=64 AND relay_digest NOT GLOB '*[^0-9a-f]*'),
 binding_digest TEXT NOT NULL CHECK(length(binding_digest)=64 AND binding_digest NOT GLOB '*[^0-9a-f]*'),
 settings_digest TEXT NOT NULL CHECK(length(settings_digest)=64 AND settings_digest NOT GLOB '*[^0-9a-f]*'),
 organization_id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 connection_version INTEGER NOT NULL CHECK(typeof(connection_version)='integer' AND connection_version>=1),
 purpose TEXT NOT NULL CHECK(purpose IN ('login','link')),
 account_id TEXT REFERENCES accounts(id),
 session_id TEXT REFERENCES sessions(id),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>=0),
 expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300000),
 consumed_at INTEGER,
 FOREIGN KEY(organization_id,connection_id) REFERENCES identity_connections(organization_id,id),
 CHECK((purpose='login' AND account_id IS NULL AND session_id IS NULL) OR (purpose='link' AND account_id IS NOT NULL AND session_id IS NOT NULL)),
 CHECK(consumed_at IS NULL OR (consumed_at>=created_at AND consumed_at<expires_at))
);
CREATE INDEX saml_transactions_expiry ON saml_transactions(expires_at);
CREATE TRIGGER saml_transaction_connection BEFORE INSERT ON saml_transactions
WHEN NEW.consumed_at IS NOT NULL
 OR (NEW.purpose='link' AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.id=NEW.session_id AND s.account_id=NEW.account_id AND s.transport='browser'))
 OR NOT EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=NEW.connection_id AND c.organization_id=NEW.organization_id
 AND c.protocol='saml' AND c.provider='enterprise_saml' AND c.enabled=1 AND c.version=NEW.connection_version)
BEGIN SELECT RAISE(ABORT,'saml_transaction_connection'); END;
CREATE TRIGGER saml_transaction_immutable BEFORE UPDATE ON saml_transactions
WHEN NEW.request_id!=OLD.request_id OR NEW.relay_digest!=OLD.relay_digest OR NEW.binding_digest!=OLD.binding_digest
 OR NEW.settings_digest!=OLD.settings_digest OR NEW.organization_id!=OLD.organization_id OR NEW.connection_id!=OLD.connection_id
 OR NEW.connection_version!=OLD.connection_version OR NEW.purpose!=OLD.purpose OR NEW.account_id IS NOT OLD.account_id
 OR NEW.session_id IS NOT OLD.session_id OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
 OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
BEGIN SELECT RAISE(ABORT,'saml_transaction_immutable'); END;
-- Digests include exact issuer + message kind + ID, so replay is denied across
-- connections and versions sharing that issuer. Keep at least the full five-minute
-- verification window; deleting a pending request cannot erase replay evidence.
CREATE TABLE saml_replays (
 digest TEXT PRIMARY KEY NOT NULL CHECK(length(digest)=64 AND digest NOT GLOB '*[^0-9a-f]*'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>=0),
 expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300000)
);
CREATE INDEX saml_replays_expiry ON saml_replays(expires_at);
CREATE TRIGGER saml_replay_immutable BEFORE UPDATE ON saml_replays
BEGIN SELECT RAISE(ABORT,'saml_replay_immutable'); END;
