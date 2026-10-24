-- Add a separately bound recovery purpose without changing existing transactions.
CREATE TABLE oidc_transactions_next (
  state_digest TEXT PRIMARY KEY NOT NULL CHECK(length(state_digest)=64 AND state_digest NOT GLOB '*[^0-9a-f]*'),
  binding_digest TEXT NOT NULL CHECK(length(binding_digest)=64 AND binding_digest NOT GLOB '*[^0-9a-f]*'),
  provider TEXT NOT NULL CHECK(provider IN ('google','microsoft')),
  connection_id TEXT NOT NULL REFERENCES identity_connections(id),
  connection_version INTEGER NOT NULL CHECK(connection_version>=1),
  purpose TEXT NOT NULL CHECK(purpose IN ('login','link','recovery')),
  account_id TEXT REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300000),
  consumed_at INTEGER,
  CHECK((purpose IN ('login','recovery') AND account_id IS NULL AND session_id IS NULL) OR (purpose='link' AND account_id IS NOT NULL AND session_id IS NOT NULL))
);
INSERT INTO oidc_transactions_next SELECT * FROM oidc_transactions;
DROP TABLE oidc_transactions;
ALTER TABLE oidc_transactions_next RENAME TO oidc_transactions;
CREATE INDEX oidc_transactions_expiry ON oidc_transactions(expires_at);
CREATE TRIGGER oidc_transaction_immutable BEFORE UPDATE ON oidc_transactions
WHEN NEW.state_digest!=OLD.state_digest OR NEW.binding_digest!=OLD.binding_digest OR NEW.provider!=OLD.provider
 OR NEW.connection_id!=OLD.connection_id OR NEW.connection_version!=OLD.connection_version OR NEW.purpose!=OLD.purpose
 OR NEW.account_id IS NOT OLD.account_id OR NEW.session_id IS NOT OLD.session_id OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
 OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR NEW.consumed_at<NEW.created_at OR NEW.consumed_at>=NEW.expires_at
BEGIN SELECT RAISE(ABORT,'oidc_transaction_immutable'); END;

-- Neither stage grants ordinary account/staff authority. Sessions remain browser
-- enrollment-only; exact provider provenance and account epoch live in sessions.
CREATE TABLE recovery_provider_proofs (
 session_id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL,
 authenticated_at INTEGER NOT NULL,
 FOREIGN KEY(session_id,account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER recovery_proof_source BEFORE INSERT ON recovery_provider_proofs
WHEN NOT EXISTS(SELECT 1 FROM sessions s WHERE s.id=NEW.session_id AND s.account_id=NEW.account_id
 AND s.transport='browser' AND s.method='oidc' AND s.assurance='enrollment'
 AND NEW.authenticated_at=s.authenticated_at AND s.expires_at<=NEW.authenticated_at+300000)
BEGIN SELECT RAISE(ABORT,'recovery_proof_source'); END;
CREATE TRIGGER recovery_proof_immutable BEFORE UPDATE ON recovery_provider_proofs
BEGIN SELECT RAISE(ABORT,'recovery_proof_immutable'); END;
CREATE TABLE recovery_enrollments (
 session_id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+300000),
 completed_at INTEGER CHECK(completed_at IS NULL OR (completed_at>=created_at AND completed_at<expires_at)),
 FOREIGN KEY(session_id,account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER recovery_enrollment_source BEFORE INSERT ON recovery_enrollments
WHEN NEW.completed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM sessions s WHERE s.id=NEW.session_id AND s.account_id=NEW.account_id
 AND s.transport='browser' AND s.method='oidc' AND s.assurance='enrollment' AND s.created_at=NEW.created_at AND s.expires_at=NEW.expires_at)
BEGIN SELECT RAISE(ABORT,'recovery_enrollment_source'); END;
CREATE TRIGGER recovery_enrollment_immutable BEFORE UPDATE ON recovery_enrollments
WHEN NEW.session_id!=OLD.session_id OR NEW.account_id!=OLD.account_id OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
 OR OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL
BEGIN SELECT RAISE(ABORT,'recovery_enrollment_immutable'); END;

CREATE TABLE audit_events_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link','passkey.register','passkey.authenticate','organization.create','organization.update','program.create','program.archive','location.create','location.update','location.archive','invitation.create','invitation.resend','invitation.revoke','invitation.accept','invitation.expire','membership.grants','membership.revoke','ownership.request','ownership.accept','ownership.revoke','recovery.rotate','recovery.consume','recovery.complete')),
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
