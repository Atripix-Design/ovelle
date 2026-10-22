CREATE TABLE organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  time_zone TEXT NOT NULL DEFAULT 'UTC' CHECK(length(time_zone) BETWEEN 1 AND 120),
  owner_account_id TEXT NOT NULL REFERENCES accounts(id),
  created_by_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  required_connection_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(id,required_connection_id) REFERENCES identity_connections(organization_id,id)
);
CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  preset TEXT NOT NULL CHECK(preset IN ('admin','coordinator')),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  UNIQUE(organization_id,account_id),
  UNIQUE(id,organization_id)
);
-- Bootstrapping ownership in a trigger avoids a circular deferred FK at commit.
-- Creation always leaves an active owner membership, even for privileged SQL callers.
CREATE TRIGGER organization_owner_bootstrap AFTER INSERT ON organizations
BEGIN
  INSERT INTO organization_memberships(id,organization_id,account_id,preset,state)
  VALUES('owner:' || NEW.id,NEW.id,NEW.owner_account_id,'admin','active');
END;
CREATE INDEX organization_memberships_account ON organization_memberships(account_id,state);
CREATE TRIGGER owner_membership_insert BEFORE INSERT ON organization_memberships
WHEN EXISTS(SELECT 1 FROM organizations o WHERE o.id=NEW.organization_id AND o.owner_account_id=NEW.account_id)
  AND (NEW.state!='active' OR NEW.preset!='admin')
BEGIN SELECT RAISE(ABORT,'owner_membership_required'); END;
CREATE TRIGGER owner_membership_update BEFORE UPDATE ON organization_memberships
WHEN EXISTS(SELECT 1 FROM organizations o WHERE o.id=OLD.organization_id AND o.owner_account_id=OLD.account_id)
  AND (NEW.state!='active' OR NEW.preset!='admin' OR NEW.organization_id!=OLD.organization_id OR NEW.account_id!=OLD.account_id)
BEGIN SELECT RAISE(ABORT,'owner_membership_required'); END;
CREATE TRIGGER owner_membership_delete BEFORE DELETE ON organization_memberships
WHEN EXISTS(SELECT 1 FROM organizations o WHERE o.id=OLD.organization_id AND o.owner_account_id=OLD.account_id)
BEGIN SELECT RAISE(ABORT,'owner_membership_required'); END;
CREATE TRIGGER organization_owner_change BEFORE UPDATE OF owner_account_id ON organizations
WHEN NOT EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=OLD.id AND m.account_id=NEW.owner_account_id AND m.state='active' AND m.preset='admin')
BEGIN SELECT RAISE(ABORT,'owner_membership_required'); END;
CREATE TRIGGER organization_creator_immutable BEFORE UPDATE OF created_by_account_id ON organizations
WHEN NEW.created_by_account_id!=OLD.created_by_account_id
BEGIN SELECT RAISE(ABORT,'organization_creator_immutable'); END;
CREATE TABLE programs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  archived_at INTEGER,
  UNIQUE(organization_id,id)
);
CREATE TABLE locations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  archived_at INTEGER,
  UNIQUE(organization_id,id)
);
CREATE TABLE membership_grants (
  id TEXT PRIMARY KEY NOT NULL,
  membership_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('organization.read','organization.update','program.read','program.manage','location.read','location.manage','staff.read','staff.manage_coordinators','staff.manage_admins','audit.read','ownership.transfer')),
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','program_location')),
  program_id TEXT,
  location_id TEXT,
  FOREIGN KEY(membership_id,organization_id) REFERENCES organization_memberships(id,organization_id),
  FOREIGN KEY(organization_id,program_id) REFERENCES programs(organization_id,id),
  FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id),
  CHECK((scope_kind='organization' AND program_id IS NULL AND location_id IS NULL)
     OR (scope_kind='program_location' AND (program_id IS NOT NULL OR location_id IS NOT NULL)))
);
CREATE INDEX membership_grants_lookup ON membership_grants(membership_id,organization_id,action);
CREATE UNIQUE INDEX membership_grants_unique_scope ON membership_grants(membership_id,action,scope_kind,coalesce(program_id,''),coalesce(location_id,''));
