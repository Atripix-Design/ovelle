-- Recovery secrets are shown once by the service. Only the current bounded set
-- is retained; no code is accepted for authentication by this migration.
CREATE TABLE recovery_code_sets (
 account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
 version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
 rotated_at INTEGER NOT NULL
);
CREATE TRIGGER recovery_set_immutable BEFORE UPDATE ON recovery_code_sets
WHEN NEW.account_id!=OLD.account_id OR NEW.version!=OLD.version+1 OR NEW.rotated_at<OLD.rotated_at
BEGIN SELECT RAISE(ABORT,'recovery_set_immutable'); END;
CREATE TRIGGER recovery_set_no_delete BEFORE DELETE ON recovery_code_sets
BEGIN SELECT RAISE(ABORT,'recovery_set_retention'); END;
CREATE TABLE recovery_codes (
 account_id TEXT NOT NULL REFERENCES recovery_code_sets(account_id),
 position INTEGER NOT NULL CHECK(typeof(position)='integer' AND position BETWEEN 1 AND 8),
 code_digest TEXT NOT NULL UNIQUE CHECK(length(code_digest)=64 AND code_digest NOT GLOB '*[^0-9a-f]*'),
 PRIMARY KEY(account_id,position)
);
CREATE TRIGGER recovery_code_immutable BEFORE UPDATE ON recovery_codes
BEGIN SELECT RAISE(ABORT,'recovery_code_immutable'); END;

CREATE TABLE audit_events_next (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT REFERENCES sessions(id),
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link','passkey.register','passkey.authenticate','organization.create','organization.update','program.create','program.archive','location.create','location.update','location.archive','invitation.create','invitation.resend','invitation.revoke','invitation.accept','invitation.expire','membership.grants','membership.revoke','ownership.request','ownership.accept','ownership.revoke','recovery.rotate')),
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
