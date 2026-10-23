-- Microsoft common discovers a tenant template, but each verified identity has
-- an exact issuer and GUID tenant. Do not generalize this to arbitrary issuers.
ALTER TABLE external_identities ADD COLUMN tenant_id TEXT CHECK(tenant_id IS NULL OR (
  length(tenant_id)=36 AND substr(tenant_id,9,1)='-' AND substr(tenant_id,14,1)='-'
  AND substr(tenant_id,19,1)='-' AND substr(tenant_id,24,1)='-'
  AND length(replace(tenant_id,'-',''))=32 AND replace(tenant_id,'-','') NOT GLOB '*[^0-9a-fA-F]*'
));
UPDATE external_identities SET tenant_id=substr(issuer,35,36)
WHERE connection_id IN (SELECT id FROM identity_connections WHERE provider='microsoft' AND protocol='oidc')
  AND length(issuer)=75 AND substr(issuer,1,34)='https://login.microsoftonline.com/' AND substr(issuer,71)='/v2.0'
  AND substr(issuer,43,1)='-' AND substr(issuer,48,1)='-' AND substr(issuer,53,1)='-' AND substr(issuer,58,1)='-'
  AND length(replace(substr(issuer,35,36),'-',''))=32
  AND replace(substr(issuer,35,36),'-','') NOT GLOB '*[^0-9a-fA-F]*';

DROP TRIGGER external_identity_issuer;
CREATE TRIGGER external_identity_issuer BEFORE INSERT ON external_identities
WHEN NOT EXISTS(SELECT 1 FROM identity_connections c WHERE c.id=NEW.connection_id AND c.enabled=1 AND (
  (c.provider!='microsoft' AND NEW.tenant_id IS NULL AND c.issuer=NEW.issuer)
  OR (c.provider='microsoft' AND c.protocol='oidc' AND NEW.tenant_id IS NOT NULL
      AND NEW.issuer='https://login.microsoftonline.com/'||NEW.tenant_id||'/v2.0'
      AND (c.issuer=NEW.issuer OR c.issuer='https://login.microsoftonline.com/{tenantid}/v2.0'))
)) BEGIN SELECT RAISE(ABORT,'external_identity_issuer'); END;
DROP TRIGGER external_identity_immutable;
CREATE TRIGGER external_identity_immutable BEFORE UPDATE ON external_identities
WHEN NEW.id!=OLD.id OR NEW.account_id!=OLD.account_id OR NEW.connection_id!=OLD.connection_id
  OR NEW.issuer!=OLD.issuer OR NEW.subject!=OLD.subject OR NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.version<OLD.version OR (NEW.disabled_at IS NOT OLD.disabled_at AND NEW.version!=OLD.version+1)
BEGIN SELECT RAISE(ABORT,'external_identity_immutable'); END;

-- One authority for issuance, request resolution and guarded mutations. Exact
-- Google/SAML issuer checks remain; only Microsoft common expands its template.
CREATE VIEW stage0_trusted_identities AS
SELECT i.*,c.protocol,c.provider,c.client_id,c.version AS connection_version
FROM external_identities i JOIN identity_connections c ON c.id=i.connection_id
WHERE i.disabled_at IS NULL AND c.enabled=1 AND (
  (c.provider!='microsoft' AND i.tenant_id IS NULL AND c.issuer=i.issuer)
  OR (c.provider='microsoft' AND c.protocol='oidc' AND i.tenant_id IS NOT NULL
      AND i.issuer='https://login.microsoftonline.com/'||i.tenant_id||'/v2.0'
      AND (c.issuer=i.issuer OR c.issuer='https://login.microsoftonline.com/{tenantid}/v2.0'))
);
DROP VIEW stage0_live_sessions;
CREATE VIEW stage0_live_sessions AS
SELECT s.* FROM sessions s JOIN accounts a ON a.id=s.account_id
LEFT JOIN stage0_trusted_identities i ON i.id=s.external_identity_id AND i.account_id=s.account_id AND i.connection_id=s.connection_id
WHERE s.revoked_at IS NULL AND a.disabled_at IS NULL AND a.security_version=s.account_security_version
  AND (s.assurance='enrollment' OR a.email_verified_at IS NOT NULL)
  AND (s.connection_id IS NULL OR (i.id IS NOT NULL AND i.version=s.external_identity_version AND i.connection_version=s.connection_version AND i.protocol=s.method));

-- Rebuild the audit action CHECK without changing any existing event or its
-- references. Ordinary application code still cannot update/delete audit rows.
CREATE TABLE audit_events_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link')),
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
