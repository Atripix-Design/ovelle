-- Pending provider proof is private authority for one new account only. Random
-- browser/email capabilities are stored as digests; email delivery is separate
-- from token consumption and never supplies existing-account linking authority.
CREATE TABLE oidc_enrollments (
  id TEXT PRIMARY KEY NOT NULL,
  token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  provider TEXT NOT NULL CHECK(provider IN ('google','microsoft')),
  connection_id TEXT NOT NULL REFERENCES identity_connections(id),
  connection_version INTEGER NOT NULL CHECK(connection_version>=1),
  client_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 512),
  tenant_id TEXT CHECK(tenant_id IS NULL OR (
    length(tenant_id)=36 AND substr(tenant_id,9,1)='-' AND substr(tenant_id,14,1)='-'
    AND substr(tenant_id,19,1)='-' AND substr(tenant_id,24,1)='-'
    AND length(replace(tenant_id,'-',''))=32 AND replace(tenant_id,'-','') NOT GLOB '*[^0-9a-fA-F]*'
  )),
  email_hint TEXT,
  contact_proved INTEGER NOT NULL CHECK(contact_proved IN (0,1)),
  display_name_hint TEXT,
  contact_email TEXT,
  contact_name TEXT,
  contact_digest TEXT CHECK(contact_digest IS NULL OR (length(contact_digest)=64 AND contact_digest NOT GLOB '*[^0-9a-f]*')),
  contact_expires_at INTEGER,
  contact_version INTEGER NOT NULL DEFAULT 0 CHECK(contact_version>=0),
  delivery TEXT NOT NULL DEFAULT 'none' CHECK(delivery IN ('none','pending','accepted','failed','suppressed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at=created_at+900000),
  consumed_at INTEGER,
  CHECK(contact_proved=0 OR (provider='google' AND email_hint IS NOT NULL)),
  CHECK(contact_digest IS NULL OR (contact_email IS NOT NULL AND contact_name IS NOT NULL AND contact_expires_at>created_at AND contact_expires_at<=expires_at))
);
CREATE INDEX oidc_enrollments_expiry ON oidc_enrollments(expires_at);
CREATE TRIGGER oidc_enrollment_issuer BEFORE INSERT ON oidc_enrollments
WHEN NOT EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=NEW.connection_id AND c.protocol='oidc'
 AND c.provider=NEW.provider AND c.version=NEW.connection_version AND c.client_id=NEW.client_id AND c.enabled=1 AND (
 (NEW.provider='google' AND NEW.tenant_id IS NULL AND NEW.issuer=c.issuer)
 OR (NEW.provider='microsoft' AND length(NEW.tenant_id)=36 AND NEW.issuer='https://login.microsoftonline.com/'||NEW.tenant_id||'/v2.0'
   AND (c.issuer=NEW.issuer OR c.issuer='https://login.microsoftonline.com/{tenantid}/v2.0'))
)) BEGIN SELECT RAISE(ABORT,'oidc_enrollment_issuer'); END;
CREATE TRIGGER oidc_enrollment_immutable BEFORE UPDATE ON oidc_enrollments
WHEN NEW.id!=OLD.id OR NEW.token_digest!=OLD.token_digest OR NEW.provider!=OLD.provider OR NEW.connection_id!=OLD.connection_id
 OR NEW.connection_version!=OLD.connection_version OR NEW.client_id!=OLD.client_id OR NEW.issuer!=OLD.issuer OR NEW.subject!=OLD.subject
 OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.email_hint IS NOT OLD.email_hint OR NEW.contact_proved!=OLD.contact_proved
 OR NEW.display_name_hint IS NOT OLD.display_name_hint OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
 OR NEW.contact_version<OLD.contact_version OR OLD.consumed_at IS NOT NULL
 OR ((NEW.contact_email IS NOT OLD.contact_email OR NEW.contact_name IS NOT OLD.contact_name OR NEW.contact_digest IS NOT OLD.contact_digest OR NEW.contact_expires_at IS NOT OLD.contact_expires_at) AND NEW.contact_version!=OLD.contact_version+1)
 OR (NEW.consumed_at IS NOT NULL AND (NEW.consumed_at<NEW.created_at OR NEW.consumed_at>=NEW.expires_at))
BEGIN SELECT RAISE(ABORT,'oidc_enrollment_immutable'); END;
