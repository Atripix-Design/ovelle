-- Consumed signed login proof may authorize one browser-bound contact enrollment,
-- never existing-account linking or organization membership. Retain the IdP clock.
CREATE TABLE saml_enrollments (
 id TEXT PRIMARY KEY NOT NULL,
 token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
 organization_id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 connection_version INTEGER NOT NULL CHECK(typeof(connection_version)='integer' AND connection_version>=1),
 settings_digest TEXT NOT NULL CHECK(length(settings_digest)=64 AND settings_digest NOT GLOB '*[^0-9a-f]*'),
 issuer TEXT NOT NULL CHECK(length(issuer) BETWEEN 1 AND 2048),
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 512),
 name_id_format TEXT NOT NULL CHECK(name_id_format IN ('urn:oasis:names:tc:SAML:2.0:nameid-format:persistent','urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified')),
 authenticated_at INTEGER NOT NULL CHECK(typeof(authenticated_at)='integer' AND authenticated_at>=0),
 session_expires_at INTEGER CHECK(session_expires_at IS NULL OR (typeof(session_expires_at)='integer' AND session_expires_at>created_at)),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>=authenticated_at),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at=MIN(created_at+900000,authenticated_at+43200000,COALESCE(session_expires_at,created_at+900000))),
 contact_email TEXT,
 contact_name TEXT,
 contact_digest TEXT CHECK(contact_digest IS NULL OR (length(contact_digest)=64 AND contact_digest NOT GLOB '*[^0-9a-f]*')),
 contact_expires_at INTEGER,
 contact_version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(contact_version)='integer' AND contact_version>=0),
 delivery TEXT NOT NULL DEFAULT 'none' CHECK(delivery IN ('none','pending','accepted','failed','suppressed')),
 consumed_at INTEGER CHECK(consumed_at IS NULL OR (consumed_at>=created_at AND consumed_at<expires_at)),
 FOREIGN KEY(organization_id,connection_id) REFERENCES identity_connections(organization_id,id),
 CHECK(contact_digest IS NULL OR (contact_email IS NOT NULL AND contact_name IS NOT NULL AND contact_expires_at IS NOT NULL AND contact_expires_at>created_at AND contact_expires_at<=expires_at))
);
CREATE INDEX saml_enrollments_expiry ON saml_enrollments(expires_at);
CREATE TRIGGER saml_enrollment_connection BEFORE INSERT ON saml_enrollments
WHEN NEW.consumed_at IS NOT NULL OR NEW.contact_version!=0 OR NEW.contact_email IS NOT NULL OR NEW.contact_name IS NOT NULL
 OR NEW.contact_digest IS NOT NULL OR NEW.contact_expires_at IS NOT NULL OR NEW.delivery!='none'
 OR NOT EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=NEW.connection_id AND c.organization_id=NEW.organization_id
 AND c.protocol='saml' AND c.provider='enterprise_saml' AND c.issuer=NEW.issuer AND c.version=NEW.connection_version AND c.enabled=1)
BEGIN SELECT RAISE(ABORT,'saml_enrollment_connection'); END;
CREATE TRIGGER saml_enrollment_immutable BEFORE UPDATE ON saml_enrollments
WHEN NEW.id!=OLD.id OR NEW.token_digest!=OLD.token_digest OR NEW.organization_id!=OLD.organization_id
 OR NEW.connection_id!=OLD.connection_id OR NEW.connection_version!=OLD.connection_version OR NEW.settings_digest!=OLD.settings_digest
 OR NEW.issuer!=OLD.issuer OR NEW.subject!=OLD.subject OR NEW.name_id_format!=OLD.name_id_format
 OR NEW.authenticated_at!=OLD.authenticated_at OR NEW.session_expires_at IS NOT OLD.session_expires_at
 OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at OR OLD.consumed_at IS NOT NULL
 OR NEW.contact_version<OLD.contact_version OR NEW.contact_version>OLD.contact_version+1
 OR ((NEW.contact_email IS NOT OLD.contact_email OR NEW.contact_name IS NOT OLD.contact_name OR NEW.contact_digest IS NOT OLD.contact_digest
 OR NEW.contact_expires_at IS NOT OLD.contact_expires_at) AND NEW.contact_version!=OLD.contact_version+1)
 OR (NEW.consumed_at IS NOT NULL AND (OLD.contact_digest IS NULL OR NEW.consumed_at>=OLD.contact_expires_at OR NEW.contact_version!=OLD.contact_version))
BEGIN SELECT RAISE(ABORT,'saml_enrollment_immutable'); END;
