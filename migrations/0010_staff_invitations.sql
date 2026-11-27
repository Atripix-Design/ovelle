-- Original issuer proof stays durable for the invite lifetime. Acceptance reads
-- current account security, membership, grants and federation, not cached roles.
CREATE UNIQUE INDEX sessions_id_account ON sessions(id,account_id);
CREATE TABLE staff_invitations (
 id TEXT PRIMARY KEY NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 email TEXT NOT NULL CHECK(email=lower(trim(email)) AND length(email) BETWEEN 3 AND 254 AND instr(email,'@')>1),
 preset TEXT NOT NULL CHECK(preset IN ('admin','coordinator')),
 inviter_account_id TEXT NOT NULL REFERENCES accounts(id),
 issued_session_id TEXT NOT NULL,
 token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
 offer_sealed INTEGER NOT NULL DEFAULT 0 CHECK(offer_sealed IN (0,1)),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','revoked','expired')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 accepted_account_id TEXT REFERENCES accounts(id),
 accepted_at INTEGER,
 revoked_at INTEGER,
 delivery TEXT NOT NULL DEFAULT 'pending' CHECK(delivery IN ('pending','accepted','failed')),
 delivery_version INTEGER NOT NULL DEFAULT 1 CHECK(delivery_version>=1 AND delivery_version<=version),
 delivery_finished_at INTEGER,
 FOREIGN KEY(issued_session_id,inviter_account_id) REFERENCES sessions(id,account_id),
 UNIQUE(organization_id,id),
 CHECK((state='accepted' AND accepted_account_id IS NOT NULL AND accepted_at IS NOT NULL) OR (state!='accepted' AND accepted_account_id IS NULL AND accepted_at IS NULL)),
 CHECK((state='revoked' AND revoked_at IS NOT NULL) OR (state!='revoked' AND revoked_at IS NULL)),
 CHECK(state!='expired' OR updated_at>=expires_at)
);
CREATE UNIQUE INDEX staff_invitation_pending_email ON staff_invitations(organization_id,email) WHERE state='pending';
CREATE INDEX staff_invitations_organization ON staff_invitations(organization_id,created_at,id);
CREATE TRIGGER staff_invitation_immutable BEFORE UPDATE ON staff_invitations
WHEN NEW.id!=OLD.id OR NEW.organization_id!=OLD.organization_id OR NEW.email!=OLD.email OR NEW.preset!=OLD.preset OR NEW.created_at!=OLD.created_at
 OR NEW.offer_sealed<OLD.offer_sealed
 OR NEW.version<OLD.version OR NEW.version>OLD.version+1 OR NEW.updated_at<OLD.updated_at OR NEW.delivery_version<OLD.delivery_version
 OR ((NEW.state!=OLD.state OR NEW.token_digest!=OLD.token_digest OR NEW.inviter_account_id!=OLD.inviter_account_id OR NEW.issued_session_id!=OLD.issued_session_id OR NEW.expires_at!=OLD.expires_at)
   AND (OLD.state!='pending' OR NEW.version!=OLD.version+1))
 OR (NEW.state!=OLD.state AND (NEW.token_digest!=OLD.token_digest OR NEW.inviter_account_id!=OLD.inviter_account_id OR NEW.issued_session_id!=OLD.issued_session_id OR NEW.expires_at!=OLD.expires_at OR NEW.delivery_version!=OLD.delivery_version))
 OR (NEW.state='pending' AND NEW.version=OLD.version+1 AND (NEW.token_digest=OLD.token_digest OR NEW.expires_at!=NEW.updated_at+259200000 OR NEW.delivery_version!=NEW.version OR NEW.delivery!='pending' OR NEW.delivery_finished_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'staff_invitation_immutable'); END;
CREATE TABLE invitation_grants (
 id TEXT PRIMARY KEY NOT NULL,
 invitation_id TEXT NOT NULL,
 organization_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('organization.read','organization.update','program.read','program.manage','location.read','location.manage','staff.read','staff.manage_coordinators','audit.read')),
 scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','program_location')),
 program_id TEXT,
 location_id TEXT,
 FOREIGN KEY(organization_id,invitation_id) REFERENCES staff_invitations(organization_id,id),
 FOREIGN KEY(organization_id,program_id) REFERENCES programs(organization_id,id),
 FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id),
 CHECK((scope_kind='organization' AND program_id IS NULL AND location_id IS NULL) OR (scope_kind='program_location' AND (program_id IS NOT NULL OR location_id IS NOT NULL)))
);
CREATE UNIQUE INDEX invitation_grants_scope ON invitation_grants(invitation_id,action,scope_kind,coalesce(program_id,''),coalesce(location_id,''));
CREATE TRIGGER invitation_grant_no_append BEFORE INSERT ON invitation_grants
WHEN EXISTS(SELECT 1 FROM staff_invitations i WHERE i.id=NEW.invitation_id AND i.offer_sealed=1)
BEGIN SELECT RAISE(ABORT,'invitation_grant_immutable'); END;
CREATE TRIGGER invitation_grant_preset BEFORE INSERT ON invitation_grants
WHEN EXISTS(SELECT 1 FROM staff_invitations i WHERE i.id=NEW.invitation_id AND i.preset='coordinator') AND NEW.action NOT IN ('program.read','program.manage','location.read','location.manage')
BEGIN SELECT RAISE(ABORT,'invitation_grant_preset'); END;
CREATE TRIGGER invitation_grant_no_update BEFORE UPDATE ON invitation_grants BEGIN SELECT RAISE(ABORT,'invitation_grant_immutable'); END;
CREATE TRIGGER invitation_grant_no_delete BEFORE DELETE ON invitation_grants BEGIN SELECT RAISE(ABORT,'invitation_grant_immutable'); END;
CREATE TABLE command_receipts_next (
  id TEXT PRIMARY KEY NOT NULL,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scope_key TEXT NOT NULL CHECK(scope_key='' OR scope_key=organization_id),
  command TEXT NOT NULL CHECK(command IN ('organization.create','organization.update','program.save','location.save','invitation.create','invitation.resend','invitation.revoke','invitation.accept')),
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
  action TEXT NOT NULL CHECK(action IN ('account.create','session.issue','session.rotate','session.revoke','session.revoke_all','program.update','identity.link','passkey.register','passkey.authenticate','organization.create','organization.update','program.create','program.archive','location.create','location.update','location.archive','invitation.create','invitation.resend','invitation.revoke','invitation.accept','invitation.expire')),
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
