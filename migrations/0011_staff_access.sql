-- Owner succession is an explicit two-party transition, never a bearer link.
CREATE TABLE ownership_transfer_requests (
 id TEXT PRIMARY KEY NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 initiator_account_id TEXT NOT NULL REFERENCES accounts(id),
 source_session_id TEXT NOT NULL,
 source_transport TEXT NOT NULL CHECK(source_transport IN ('browser','desktop')),
 target_membership_id TEXT NOT NULL,
 target_account_id TEXT NOT NULL REFERENCES accounts(id),
 target_membership_version INTEGER NOT NULL CHECK(target_membership_version>=1),
 organization_version INTEGER NOT NULL CHECK(organization_version>=1),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','revoked')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at=created_at+900000),
 finished_at INTEGER,
 FOREIGN KEY(source_session_id,initiator_account_id) REFERENCES sessions(id,account_id),
 FOREIGN KEY(target_membership_id,organization_id) REFERENCES organization_memberships(id,organization_id),
 CHECK((state='pending' AND finished_at IS NULL) OR (state!='pending' AND finished_at IS NOT NULL AND finished_at>=created_at AND finished_at<expires_at))
);
CREATE INDEX ownership_transfer_organization ON ownership_transfer_requests(organization_id,created_at,id);
CREATE UNIQUE INDEX ownership_transfer_one_accept ON ownership_transfer_requests(organization_id,organization_version) WHERE state='accepted';
CREATE TRIGGER ownership_transfer_immutable BEFORE UPDATE ON ownership_transfer_requests
WHEN OLD.state!='pending' OR NEW.state NOT IN ('accepted','revoked') OR NEW.version!=OLD.version+1
 OR NEW.id!=OLD.id OR NEW.organization_id!=OLD.organization_id OR NEW.initiator_account_id!=OLD.initiator_account_id
 OR NEW.source_session_id!=OLD.source_session_id OR NEW.source_transport!=OLD.source_transport
 OR NEW.target_membership_id!=OLD.target_membership_id OR NEW.target_account_id!=OLD.target_account_id
 OR NEW.target_membership_version!=OLD.target_membership_version OR NEW.organization_version!=OLD.organization_version
 OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
BEGIN SELECT RAISE(ABORT,'ownership_transfer_immutable'); END;
CREATE TRIGGER ownership_transfer_no_delete BEFORE DELETE ON ownership_transfer_requests
BEGIN SELECT RAISE(ABORT,'ownership_transfer_retention_required'); END;
CREATE TABLE command_receipts_next (
  id TEXT PRIMARY KEY NOT NULL,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scope_key TEXT NOT NULL CHECK(scope_key='' OR scope_key=organization_id),
  command TEXT NOT NULL CHECK(command IN ('organization.create','organization.update','program.save','location.save','invitation.create','invitation.resend','invitation.revoke','invitation.accept','membership.grants','membership.revoke','ownership.request','ownership.accept','ownership.revoke')),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128 AND idempotency_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  result TEXT NOT NULL CHECK(length(result)<=4096 AND json_valid(result) AND json_type(result)='object'),
  created_at INTEGER NOT NULL,
  CHECK((command='organization.create' AND scope_key='') OR (command!='organization.create' AND scope_key=organization_id)),
  UNIQUE(actor_account_id,scope_key,command,idempotency_key)
);
INSERT INTO command_receipts_next SELECT * FROM command_receipts;
DROP TABLE command_receipts;
ALTER TABLE command_receipts_next RENAME TO command_receipts;
CREATE TRIGGER command_receipt_no_update BEFORE UPDATE ON command_receipts BEGIN SELECT RAISE(ABORT,'command_receipt_immutable'); END;
CREATE TRIGGER command_receipt_no_delete BEFORE DELETE ON command_receipts BEGIN SELECT RAISE(ABORT,'command_receipt_immutable'); END;

CREATE TABLE audit_events_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link','passkey.register','passkey.authenticate','organization.create','organization.update','program.create','program.archive','location.create','location.update','location.archive','invitation.create','invitation.resend','invitation.revoke','invitation.accept','invitation.expire','membership.grants','membership.revoke','ownership.request','ownership.accept','ownership.revoke')),
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
