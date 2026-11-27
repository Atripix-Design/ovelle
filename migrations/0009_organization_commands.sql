-- Existing fixture/legacy organizations have no invented contact or policy.
-- New creation commands write contact, proposed policy and initial structure atomically.
ALTER TABLE organizations ADD COLUMN contact_email TEXT CHECK(contact_email IS NULL OR
 (contact_email=lower(trim(contact_email)) AND length(contact_email) BETWEEN 3 AND 254 AND instr(contact_email,'@')>1));
CREATE TRIGGER organization_identity_immutable BEFORE UPDATE ON organizations
WHEN NEW.id!=OLD.id OR NEW.created_at!=OLD.created_at
BEGIN SELECT RAISE(ABORT,'organization_identity_immutable'); END;
-- Archiving/deletion needs a separate future workflow. Deleting an organization
-- must never replenish the immutable creating account's lifetime allowance.
CREATE TRIGGER organization_no_delete BEFORE DELETE ON organizations
BEGIN SELECT RAISE(ABORT,'organization_retention_required'); END;
CREATE TABLE organization_policies (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL CHECK(status='proposed'),
  assignment_review TEXT NOT NULL CHECK(assignment_review='staff_reviewed'),
  eligibility_bypass INTEGER NOT NULL CHECK(eligibility_bypass=0),
  automatic_hour_approval INTEGER NOT NULL CHECK(automatic_hour_approval=0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at INTEGER NOT NULL
);
CREATE TABLE command_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scope_key TEXT NOT NULL CHECK(scope_key='' OR scope_key=organization_id),
  command TEXT NOT NULL CHECK(command IN ('organization.create','organization.update','program.save','location.save')),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128 AND idempotency_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  result TEXT NOT NULL CHECK(length(result)<=4096 AND json_valid(result) AND json_type(result)='object'),
  created_at INTEGER NOT NULL,
  CHECK((command='organization.create' AND scope_key='') OR (command!='organization.create' AND scope_key=organization_id)),
  UNIQUE(actor_account_id,scope_key,command,idempotency_key)
);
CREATE TRIGGER command_receipt_no_update BEFORE UPDATE ON command_receipts BEGIN SELECT RAISE(ABORT,'command_receipt_immutable'); END;
CREATE TRIGGER command_receipt_no_delete BEFORE DELETE ON command_receipts BEGIN SELECT RAISE(ABORT,'command_receipt_immutable'); END;
CREATE INDEX programs_organization_active ON programs(organization_id,archived_at,id);
CREATE INDEX locations_organization_active ON locations(organization_id,archived_at,id);

CREATE TABLE audit_events_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link','passkey.register','passkey.authenticate','organization.create','organization.update','program.create','program.archive','location.create','location.update','location.archive')),
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
