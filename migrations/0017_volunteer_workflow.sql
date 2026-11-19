-- Tenant IDs are repeated in composite keys so relationships cannot cross organizations.
CREATE TABLE volunteer_people (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 200),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, id)
);
CREATE INDEX volunteer_people_name ON volunteer_people(organization_id,display_name,id);
CREATE TABLE volunteer_occurrences (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  program_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK(ends_at > starts_at),
  capacity INTEGER NOT NULL CHECK(capacity >= 0),
  status TEXT NOT NULL CHECK(status IN ('draft','published','canceled')),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, program_id) REFERENCES programs(organization_id, id),
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id)
);
CREATE TABLE volunteer_assignments (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('confirmed','canceled')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES volunteer_occurrences(organization_id, id),
  FOREIGN KEY (organization_id, person_id) REFERENCES volunteer_people(organization_id, id),
  FOREIGN KEY (organization_id, occurrence_id, role_id) REFERENCES volunteer_role_requirements(organization_id, occurrence_id, role_id)
);
CREATE UNIQUE INDEX volunteer_one_active_assignment ON volunteer_assignments(organization_id, occurrence_id, person_id) WHERE status='confirmed';
CREATE INDEX volunteer_assignments_by_person ON volunteer_assignments(organization_id, person_id, status);
CREATE TABLE volunteer_attendance (
  organization_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  checked_in_at INTEGER NOT NULL,
  checked_out_at INTEGER CHECK(checked_out_at IS NULL OR checked_out_at >= checked_in_at),
  PRIMARY KEY (organization_id, assignment_id),
  FOREIGN KEY (organization_id, assignment_id) REFERENCES volunteer_assignments(organization_id, id)
);
-- A no-show is an explicit staff decision, not an inference from missing check-in.
CREATE TABLE volunteer_presence_events (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, assignment_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('no_show','expected')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,assignment_id) REFERENCES volunteer_assignments(organization_id,id), FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE INDEX volunteer_presence_by_assignment ON volunteer_presence_events(organization_id,assignment_id);
CREATE TABLE volunteer_presence_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, event_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key), FOREIGN KEY(organization_id,event_id) REFERENCES volunteer_presence_events(organization_id,id)
);
CREATE TRIGGER volunteer_presence_no_update BEFORE UPDATE ON volunteer_presence_events BEGIN SELECT RAISE(ABORT,'volunteer_presence_immutable'); END;
CREATE TRIGGER volunteer_presence_no_delete BEFORE DELETE ON volunteer_presence_events BEGIN SELECT RAISE(ABORT,'volunteer_presence_immutable'); END;
CREATE TRIGGER volunteer_presence_receipt_no_update BEFORE UPDATE ON volunteer_presence_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_presence_receipt_no_delete BEFORE DELETE ON volunteer_presence_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE VIEW volunteer_current_presence AS
SELECT e.organization_id,e.assignment_id,e.id,e.state FROM volunteer_presence_events e
WHERE e.rowid=(SELECT latest.rowid FROM volunteer_presence_events latest WHERE latest.organization_id=e.organization_id AND latest.assignment_id=e.assignment_id ORDER BY latest.rowid DESC LIMIT 1);
-- Decisions and evidence are separate: an attendance record is never an approval.
CREATE TABLE volunteer_role_requirements (
  organization_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  capacity INTEGER NOT NULL CHECK(capacity >= 0),
  PRIMARY KEY (organization_id, occurrence_id, role_id),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES volunteer_occurrences(organization_id, id)
);
CREATE TABLE volunteer_readiness (
  organization_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','ready','blocked')),
  reviewed_by TEXT REFERENCES accounts(id),
  reviewed_at INTEGER,
  CHECK((state='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (state IN ('ready','blocked') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  PRIMARY KEY (organization_id, occurrence_id, role_id, person_id),
  FOREIGN KEY (organization_id, occurrence_id, role_id) REFERENCES volunteer_role_requirements(organization_id, occurrence_id, role_id),
  FOREIGN KEY (organization_id, person_id) REFERENCES volunteer_people(organization_id, id)
);
-- Criteria belong to a role in a specific occurrence and are frozen on publication.
CREATE TABLE volunteer_role_criteria (
  organization_id TEXT NOT NULL, occurrence_id TEXT NOT NULL, role_id TEXT NOT NULL, id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,occurrence_id,role_id,id),
  FOREIGN KEY(organization_id,occurrence_id,role_id) REFERENCES volunteer_role_requirements(organization_id,occurrence_id,role_id),
  FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_criteria_draft_only BEFORE INSERT ON volunteer_role_criteria
WHEN NOT EXISTS(SELECT 1 FROM volunteer_occurrences o WHERE o.organization_id=NEW.organization_id AND o.id=NEW.occurrence_id AND o.status='draft')
BEGIN SELECT RAISE(ABORT,'volunteer_criteria_frozen'); END;
CREATE TRIGGER volunteer_criteria_no_update BEFORE UPDATE ON volunteer_role_criteria BEGIN SELECT RAISE(ABORT,'volunteer_criteria_immutable'); END;
CREATE TRIGGER volunteer_criteria_no_delete BEFORE DELETE ON volunteer_role_criteria BEGIN SELECT RAISE(ABORT,'volunteer_criteria_immutable'); END;
-- Evidence revisions are append-only. Revocation is a new entry, not a deletion.
CREATE TABLE volunteer_criterion_evidence (
  id TEXT NOT NULL, organization_id TEXT NOT NULL, occurrence_id TEXT NOT NULL, role_id TEXT NOT NULL, criterion_id TEXT NOT NULL, person_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('verified','revoked')), valid_from INTEGER, valid_until INTEGER,
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000), reviewer_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  CHECK((state='verified' AND valid_from IS NOT NULL AND (valid_until IS NULL OR valid_until>valid_from)) OR (state='revoked' AND valid_from IS NULL AND valid_until IS NULL)),
  PRIMARY KEY(organization_id,id),
  FOREIGN KEY(organization_id,occurrence_id,role_id,criterion_id) REFERENCES volunteer_role_criteria(organization_id,occurrence_id,role_id,id),
  FOREIGN KEY(organization_id,occurrence_id,role_id,person_id) REFERENCES volunteer_readiness(organization_id,occurrence_id,role_id,person_id),
  FOREIGN KEY(session_id,reviewer_account_id) REFERENCES sessions(id,account_id)
);
CREATE INDEX volunteer_criterion_evidence_case ON volunteer_criterion_evidence(organization_id,occurrence_id,role_id,person_id,criterion_id);
CREATE TRIGGER volunteer_evidence_no_update BEFORE UPDATE ON volunteer_criterion_evidence BEGIN SELECT RAISE(ABORT,'volunteer_evidence_immutable'); END;
CREATE TRIGGER volunteer_evidence_no_delete BEFORE DELETE ON volunteer_criterion_evidence BEGIN SELECT RAISE(ABORT,'volunteer_evidence_immutable'); END;
CREATE TABLE volunteer_criteria_receipts (
  actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('criterion','evidence')),
  idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, result_id TEXT NOT NULL,
  PRIMARY KEY(actor_account_id,organization_id,kind,idempotency_key)
);
CREATE TRIGGER volunteer_criteria_receipts_no_update BEFORE UPDATE ON volunteer_criteria_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_criteria_receipts_no_delete BEFORE DELETE ON volunteer_criteria_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
-- The latest evidence must cover the entire service interval. Operational views
-- expose only the derived status, never the review note or underlying record.
CREATE VIEW volunteer_criterion_status AS
SELECT v.organization_id,v.occurrence_id,v.role_id,v.person_id,c.id AS criterion_id,
 CASE WHEN e.id IS NULL OR e.state='revoked' OR e.valid_from>o.starts_at THEN 'missing'
 WHEN e.valid_until IS NOT NULL AND e.valid_until<o.starts_at THEN 'expired'
 WHEN e.valid_until IS NOT NULL AND e.valid_until<o.ends_at THEN 'expiring'
 ELSE 'valid' END AS status
FROM volunteer_readiness v JOIN volunteer_occurrences o ON o.organization_id=v.organization_id AND o.id=v.occurrence_id
JOIN volunteer_role_criteria c ON c.organization_id=v.organization_id AND c.occurrence_id=v.occurrence_id AND c.role_id=v.role_id
LEFT JOIN volunteer_criterion_evidence e ON e.organization_id=c.organization_id AND e.rowid=(SELECT latest.rowid FROM volunteer_criterion_evidence latest
 WHERE latest.organization_id=c.organization_id AND latest.occurrence_id=c.occurrence_id AND latest.role_id=c.role_id AND latest.criterion_id=c.id AND latest.person_id=v.person_id ORDER BY latest.rowid DESC LIMIT 1);
CREATE VIEW volunteer_effective_readiness AS
SELECT v.organization_id,v.occurrence_id,v.role_id,v.person_id,
 CASE WHEN v.state!='ready' THEN v.state
 WHEN EXISTS(SELECT 1 FROM volunteer_criterion_status c WHERE c.organization_id=v.organization_id AND c.occurrence_id=v.occurrence_id AND c.role_id=v.role_id AND c.person_id=v.person_id AND c.status='missing') THEN 'requirements_missing'
 WHEN EXISTS(SELECT 1 FROM volunteer_criterion_status c WHERE c.organization_id=v.organization_id AND c.occurrence_id=v.occurrence_id AND c.role_id=v.role_id AND c.person_id=v.person_id AND c.status='expired') THEN 'expired'
 WHEN EXISTS(SELECT 1 FROM volunteer_criterion_status c WHERE c.organization_id=v.organization_id AND c.occurrence_id=v.occurrence_id AND c.role_id=v.role_id AND c.person_id=v.person_id AND c.status='expiring') THEN 'expiring'
 ELSE 'ready' END AS state
FROM volunteer_readiness v;
-- Waiting and replacement are one queue. Offers hold one place until their
-- deadline; staff acceptance consumes the hold and assignment atomically.
CREATE TABLE volunteer_waitlist (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, occurrence_id TEXT NOT NULL, role_id TEXT NOT NULL, person_id TEXT NOT NULL,
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('waiting','withdrawn')),
 PRIMARY KEY(organization_id,id), UNIQUE(organization_id,id,occurrence_id,role_id,person_id),
 FOREIGN KEY(organization_id,occurrence_id,role_id) REFERENCES volunteer_role_requirements(organization_id,occurrence_id,role_id),
 FOREIGN KEY(organization_id,person_id) REFERENCES volunteer_people(organization_id,id), FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE UNIQUE INDEX volunteer_one_waitlist_entry ON volunteer_waitlist(organization_id,occurrence_id,role_id,person_id) WHERE state='waiting';
CREATE TABLE volunteer_offers (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, waitlist_id TEXT NOT NULL, occurrence_id TEXT NOT NULL, role_id TEXT NOT NULL, person_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('offered','accepted','expired','withdrawn')), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL CHECK(expires_at>created_at),
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,waitlist_id,occurrence_id,role_id,person_id) REFERENCES volunteer_waitlist(organization_id,id,occurrence_id,role_id,person_id),
 FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE UNIQUE INDEX volunteer_one_open_offer ON volunteer_offers(organization_id,occurrence_id,person_id) WHERE state='offered';
CREATE INDEX volunteer_offers_capacity ON volunteer_offers(organization_id,occurrence_id,role_id,state);
CREATE TABLE volunteer_waitlist_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('queue','offer','accept','withdraw','leave')),
 idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, result_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,kind,idempotency_key)
);
CREATE TABLE volunteer_waitlist_events (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, waitlist_id TEXT NOT NULL, offer_id TEXT, action TEXT NOT NULL CHECK(action IN ('queue','offer','accept','withdraw','leave')), note TEXT,
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,waitlist_id) REFERENCES volunteer_waitlist(organization_id,id),
 FOREIGN KEY(organization_id,offer_id) REFERENCES volunteer_offers(organization_id,id), FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_waitlist_no_update BEFORE UPDATE ON volunteer_waitlist
WHEN NEW.id!=OLD.id OR NEW.organization_id!=OLD.organization_id OR NEW.occurrence_id!=OLD.occurrence_id OR NEW.role_id!=OLD.role_id OR NEW.person_id!=OLD.person_id OR NEW.actor_account_id!=OLD.actor_account_id OR NEW.session_id!=OLD.session_id OR NEW.request_id!=OLD.request_id OR NEW.created_at!=OLD.created_at OR OLD.state!='waiting' OR NEW.state!='withdrawn'
BEGIN SELECT RAISE(ABORT,'volunteer_waitlist_immutable'); END;
CREATE TRIGGER volunteer_waitlist_no_delete BEFORE DELETE ON volunteer_waitlist BEGIN SELECT RAISE(ABORT,'volunteer_waitlist_immutable'); END;
CREATE TRIGGER volunteer_offer_transition BEFORE UPDATE ON volunteer_offers
WHEN NEW.id!=OLD.id OR NEW.organization_id!=OLD.organization_id OR NEW.waitlist_id!=OLD.waitlist_id OR NEW.occurrence_id!=OLD.occurrence_id OR NEW.role_id!=OLD.role_id OR NEW.person_id!=OLD.person_id OR NEW.expires_at!=OLD.expires_at OR NEW.created_at!=OLD.created_at OR NEW.actor_account_id!=OLD.actor_account_id OR NEW.session_id!=OLD.session_id OR NEW.request_id!=OLD.request_id OR OLD.state!='offered' OR NEW.state NOT IN ('accepted','expired','withdrawn')
BEGIN SELECT RAISE(ABORT,'volunteer_offer_immutable'); END;
CREATE TRIGGER volunteer_offer_no_delete BEFORE DELETE ON volunteer_offers BEGIN SELECT RAISE(ABORT,'volunteer_offer_immutable'); END;
CREATE TRIGGER volunteer_waitlist_event_no_update BEFORE UPDATE ON volunteer_waitlist_events BEGIN SELECT RAISE(ABORT,'volunteer_waitlist_immutable'); END;
CREATE TRIGGER volunteer_waitlist_event_no_delete BEFORE DELETE ON volunteer_waitlist_events BEGIN SELECT RAISE(ABORT,'volunteer_waitlist_immutable'); END;
CREATE TRIGGER volunteer_waitlist_receipt_no_update BEFORE UPDATE ON volunteer_waitlist_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_waitlist_receipt_no_delete BEFORE DELETE ON volunteer_waitlist_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_offer_capacity BEFORE INSERT ON volunteer_offers
WHEN NEW.state='offered' AND NOT EXISTS(
 SELECT 1 FROM volunteer_occurrences o JOIN volunteer_role_requirements r ON r.organization_id=o.organization_id AND r.occurrence_id=o.id AND r.role_id=NEW.role_id
 JOIN volunteer_waitlist w ON w.organization_id=NEW.organization_id AND w.id=NEW.waitlist_id AND w.state='waiting'
 JOIN volunteer_effective_readiness v ON v.organization_id=o.organization_id AND v.occurrence_id=o.id AND v.role_id=r.role_id AND v.person_id=NEW.person_id AND v.state='ready'
 WHERE o.organization_id=NEW.organization_id AND o.id=NEW.occurrence_id AND o.status='published'
 AND (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=o.organization_id AND a.occurrence_id=o.id AND a.status='confirmed')+(SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=o.organization_id AND x.occurrence_id=o.id AND x.state='offered')<o.capacity
 AND (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=o.organization_id AND a.occurrence_id=o.id AND a.role_id=r.role_id AND a.status='confirmed')+(SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=o.organization_id AND x.occurrence_id=o.id AND x.role_id=r.role_id AND x.state='offered')<r.capacity
 AND NOT EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences other ON other.organization_id=a.organization_id AND other.id=a.occurrence_id WHERE a.organization_id=o.organization_id AND a.person_id=NEW.person_id AND a.status='confirmed' AND other.status='published' AND other.starts_at<o.ends_at AND o.starts_at<other.ends_at)
)
BEGIN SELECT RAISE(ABORT,'volunteer_offer_unavailable'); END;
CREATE TABLE volunteer_hours_submissions (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL CHECK(end_at > start_at),
  break_minutes INTEGER NOT NULL CHECK(break_minutes >= 0 AND break_minutes * 60000 < end_at - start_at),
  state TEXT NOT NULL CHECK(state IN ('pending','clarification','approved','rejected')),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, assignment_id),
  FOREIGN KEY (organization_id, assignment_id) REFERENCES volunteer_assignments(organization_id, id)
);
-- These constraints protect capacity even when competing requests read the same
-- snapshot. Session and grant authorization remains the command's responsibility.
CREATE TRIGGER volunteer_assignment_guard BEFORE INSERT ON volunteer_assignments
WHEN NEW.status='confirmed' AND NOT EXISTS (
  SELECT 1 FROM volunteer_occurrences o
  JOIN volunteer_role_requirements r ON r.organization_id=o.organization_id AND r.occurrence_id=o.id AND r.role_id=NEW.role_id
  JOIN volunteer_effective_readiness v ON v.organization_id=o.organization_id AND v.occurrence_id=o.id AND v.role_id=r.role_id AND v.person_id=NEW.person_id AND v.state='ready'
  WHERE o.organization_id=NEW.organization_id AND o.id=NEW.occurrence_id AND o.status='published'
    AND (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=o.organization_id AND a.occurrence_id=o.id AND a.status='confirmed') + (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=o.organization_id AND x.occurrence_id=o.id AND x.state='offered') < o.capacity
    AND (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=o.organization_id AND a.occurrence_id=o.id AND a.role_id=r.role_id AND a.status='confirmed') + (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=o.organization_id AND x.occurrence_id=o.id AND x.role_id=r.role_id AND x.state='offered') < r.capacity
    AND NOT EXISTS (SELECT 1 FROM volunteer_assignments a JOIN volunteer_occurrences other ON other.organization_id=a.organization_id AND other.id=a.occurrence_id
      WHERE a.organization_id=o.organization_id AND a.person_id=NEW.person_id AND a.status='confirmed' AND other.status='published'
      AND other.starts_at < o.ends_at AND o.starts_at < other.ends_at)
)
BEGIN SELECT RAISE(ABORT, 'volunteer_assignment_unavailable'); END;
-- Cancellation retains the assignment identity and cannot reactivate it.
CREATE TRIGGER volunteer_assignment_no_update BEFORE UPDATE ON volunteer_assignments
WHEN NEW.organization_id!=OLD.organization_id OR NEW.id!=OLD.id OR NEW.occurrence_id!=OLD.occurrence_id
  OR NEW.person_id!=OLD.person_id OR NEW.role_id!=OLD.role_id OR NEW.created_at!=OLD.created_at
  OR OLD.status!='confirmed' OR NEW.status!='canceled'
BEGIN SELECT RAISE(ABORT, 'volunteer_assignment_immutable'); END;
CREATE TRIGGER volunteer_assignment_no_delete BEFORE DELETE ON volunteer_assignments
BEGIN SELECT RAISE(ABORT, 'volunteer_assignment_immutable'); END;
-- Attendance must be corrected through its own history, not erased by a cancellation.
CREATE TRIGGER volunteer_assignment_no_cancel_after_arrival BEFORE UPDATE OF status ON volunteer_assignments
WHEN NEW.status='canceled' AND EXISTS(SELECT 1 FROM volunteer_attendance t WHERE t.organization_id=OLD.organization_id AND t.assignment_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'volunteer_assignment_has_attendance'); END;
CREATE TABLE volunteer_assignment_cancellations (
  organization_id TEXT NOT NULL, assignment_id TEXT NOT NULL, actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT NOT NULL, request_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), created_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id, assignment_id),
  FOREIGN KEY(organization_id, assignment_id) REFERENCES volunteer_assignments(organization_id, id)
);
CREATE TABLE volunteer_cancellation_receipts (
  actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL, assignment_id TEXT NOT NULL,
  PRIMARY KEY(actor_account_id, organization_id, idempotency_key),
  FOREIGN KEY(organization_id, assignment_id) REFERENCES volunteer_assignment_cancellations(organization_id, assignment_id)
);
CREATE TRIGGER volunteer_cancellation_no_update BEFORE UPDATE ON volunteer_assignment_cancellations
BEGIN SELECT RAISE(ABORT, 'volunteer_cancellation_immutable'); END;
CREATE TRIGGER volunteer_cancellation_no_delete BEFORE DELETE ON volunteer_assignment_cancellations
BEGIN SELECT RAISE(ABORT, 'volunteer_cancellation_immutable'); END;
CREATE TRIGGER volunteer_cancellation_receipt_no_update BEFORE UPDATE ON volunteer_cancellation_receipts
BEGIN SELECT RAISE(ABORT, 'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_cancellation_receipt_no_delete BEFORE DELETE ON volunteer_cancellation_receipts
BEGIN SELECT RAISE(ABORT, 'volunteer_receipt_immutable'); END;
-- Rescheduling or lowering capacity must not silently invalidate assignments.
CREATE TRIGGER volunteer_occurrence_change_guard BEFORE UPDATE OF starts_at, ends_at, capacity, status ON volunteer_occurrences
WHEN (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=OLD.organization_id AND a.occurrence_id=OLD.id AND a.status='confirmed') + (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=OLD.organization_id AND x.occurrence_id=OLD.id AND x.state='offered') > NEW.capacity
 OR ((NEW.starts_at!=OLD.starts_at OR NEW.ends_at!=OLD.ends_at OR NEW.status!='published') AND EXISTS(SELECT 1 FROM volunteer_offers x WHERE x.organization_id=OLD.organization_id AND x.occurrence_id=OLD.id AND x.state='offered'))
 OR (NEW.status != 'published' AND EXISTS(SELECT 1 FROM volunteer_assignments a WHERE a.organization_id=OLD.organization_id AND a.occurrence_id=OLD.id AND a.status='confirmed'))
 OR EXISTS(SELECT 1 FROM volunteer_assignments a JOIN volunteer_assignments b ON b.organization_id=a.organization_id AND b.person_id=a.person_id AND b.status='confirmed' AND b.occurrence_id!=a.occurrence_id
   JOIN volunteer_occurrences other ON other.organization_id=b.organization_id AND other.id=b.occurrence_id AND other.status='published'
   WHERE a.organization_id=OLD.organization_id AND a.occurrence_id=OLD.id AND a.status='confirmed'
   AND other.starts_at < NEW.ends_at AND NEW.starts_at < other.ends_at)
BEGIN SELECT RAISE(ABORT, 'volunteer_occurrence_in_use'); END;
CREATE TRIGGER volunteer_role_capacity_guard BEFORE UPDATE OF capacity ON volunteer_role_requirements
WHEN NEW.capacity < (SELECT count(*) FROM volunteer_assignments a WHERE a.organization_id=OLD.organization_id AND a.occurrence_id=OLD.occurrence_id AND a.role_id=OLD.role_id AND a.status='confirmed') + (SELECT count(*) FROM volunteer_offers x WHERE x.organization_id=OLD.organization_id AND x.occurrence_id=OLD.occurrence_id AND x.role_id=OLD.role_id AND x.state='offered')
BEGIN SELECT RAISE(ABORT, 'volunteer_role_in_use'); END;
-- Review history is append-only. Approved minutes are explicit and never
-- inferred from attendance; correction decisions retain earlier decisions.
CREATE TABLE volunteer_hours_decisions (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  reviewer_account_id TEXT NOT NULL REFERENCES accounts(id),
  decision TEXT NOT NULL CHECK(decision IN ('approve','adjust','clarify','reject')),
  approved_minutes INTEGER,
  reason TEXT,
  created_at INTEGER NOT NULL,
  CHECK((decision IN ('approve','adjust') AND approved_minutes IS NOT NULL AND approved_minutes > 0)
     OR (decision IN ('clarify','reject') AND approved_minutes IS NULL)),
  CHECK(decision='approve' OR (reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 2000)),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,submission_id) REFERENCES volunteer_hours_submissions(organization_id,id)
);
CREATE INDEX volunteer_hours_decision_history ON volunteer_hours_decisions(organization_id,submission_id,created_at,id);
CREATE TRIGGER volunteer_hours_decision_no_update BEFORE UPDATE ON volunteer_hours_decisions
BEGIN SELECT RAISE(ABORT, 'volunteer_hours_decision_immutable'); END;
CREATE TRIGGER volunteer_hours_decision_no_delete BEFORE DELETE ON volunteer_hours_decisions
BEGIN SELECT RAISE(ABORT, 'volunteer_hours_decision_immutable'); END;
-- This is a staff-recorded response, not proof that a message was delivered or
-- that the volunteer used a self-service account.
CREATE TABLE volunteer_hours_clarification_responses (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, submission_id TEXT NOT NULL, decision_id TEXT NOT NULL,
 response TEXT NOT NULL CHECK(length(trim(response)) BETWEEN 1 AND 2000), source TEXT NOT NULL CHECK(source='staff_recorded'),
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), UNIQUE(organization_id,decision_id),
 FOREIGN KEY(organization_id,submission_id) REFERENCES volunteer_hours_submissions(organization_id,id),
 FOREIGN KEY(organization_id,decision_id) REFERENCES volunteer_hours_decisions(organization_id,id), FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_clarification_matches BEFORE INSERT ON volunteer_hours_clarification_responses
WHEN NOT EXISTS(SELECT 1 FROM volunteer_hours_decisions d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.decision_id AND d.submission_id=NEW.submission_id AND d.decision='clarify')
BEGIN SELECT RAISE(ABORT,'volunteer_clarification_wrong_decision'); END;
CREATE TABLE volunteer_clarification_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, response_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key), FOREIGN KEY(organization_id,response_id) REFERENCES volunteer_hours_clarification_responses(organization_id,id)
);
CREATE TRIGGER volunteer_clarification_no_update BEFORE UPDATE ON volunteer_hours_clarification_responses BEGIN SELECT RAISE(ABORT,'volunteer_clarification_immutable'); END;
CREATE TRIGGER volunteer_clarification_no_delete BEFORE DELETE ON volunteer_hours_clarification_responses BEGIN SELECT RAISE(ABORT,'volunteer_clarification_immutable'); END;
CREATE TRIGGER volunteer_clarification_receipt_no_update BEFORE UPDATE ON volunteer_clarification_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_clarification_receipt_no_delete BEFORE DELETE ON volunteer_clarification_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
-- Attendance corrections preserve the source timestamps and append a linked
-- hours decision; the original evidence and earlier approval remain available.
CREATE TABLE volunteer_correction_requests (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, assignment_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,assignment_id) REFERENCES volunteer_assignments(organization_id,id),
 FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TABLE volunteer_correction_resolutions (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, correction_id TEXT NOT NULL, decision_id TEXT,
 checked_in_at INTEGER NOT NULL, checked_out_at INTEGER NOT NULL CHECK(checked_out_at>=checked_in_at),
 reviewer_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), UNIQUE(organization_id,correction_id),
 FOREIGN KEY(organization_id,correction_id) REFERENCES volunteer_correction_requests(organization_id,id),
 FOREIGN KEY(organization_id,decision_id) REFERENCES volunteer_hours_decisions(organization_id,id),
 FOREIGN KEY(session_id,reviewer_account_id) REFERENCES sessions(id,account_id)
);
CREATE INDEX volunteer_corrections_by_assignment ON volunteer_correction_requests(organization_id,assignment_id);
CREATE TABLE volunteer_correction_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('request','resolve')),
 idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, result_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,kind,idempotency_key)
);
CREATE TRIGGER volunteer_correction_decision_matches BEFORE INSERT ON volunteer_correction_resolutions
WHEN NEW.decision_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM volunteer_correction_requests c JOIN volunteer_hours_submissions h ON h.organization_id=c.organization_id AND h.assignment_id=c.assignment_id
 JOIN volunteer_hours_decisions d ON d.organization_id=h.organization_id AND d.submission_id=h.id
 WHERE c.organization_id=NEW.organization_id AND c.id=NEW.correction_id AND d.id=NEW.decision_id AND d.decision='adjust'
)
BEGIN SELECT RAISE(ABORT,'volunteer_correction_wrong_decision'); END;
CREATE TRIGGER volunteer_correction_request_no_update BEFORE UPDATE ON volunteer_correction_requests BEGIN SELECT RAISE(ABORT,'volunteer_correction_immutable'); END;
CREATE TRIGGER volunteer_correction_request_no_delete BEFORE DELETE ON volunteer_correction_requests BEGIN SELECT RAISE(ABORT,'volunteer_correction_immutable'); END;
CREATE TRIGGER volunteer_correction_resolution_no_update BEFORE UPDATE ON volunteer_correction_resolutions BEGIN SELECT RAISE(ABORT,'volunteer_correction_immutable'); END;
CREATE TRIGGER volunteer_correction_resolution_no_delete BEFORE DELETE ON volunteer_correction_resolutions BEGIN SELECT RAISE(ABORT,'volunteer_correction_immutable'); END;
CREATE TRIGGER volunteer_correction_receipt_no_update BEFORE UPDATE ON volunteer_correction_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_correction_receipt_no_delete BEFORE DELETE ON volunteer_correction_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE VIEW volunteer_effective_attendance AS
SELECT t.organization_id,t.assignment_id,coalesce(r.checked_in_at,t.checked_in_at) AS checked_in_at,
 coalesce(r.checked_out_at,t.checked_out_at) AS checked_out_at
FROM volunteer_attendance t LEFT JOIN volunteer_correction_resolutions r ON r.organization_id=t.organization_id AND r.rowid=(
 SELECT latest.rowid FROM volunteer_correction_resolutions latest JOIN volunteer_correction_requests c ON c.organization_id=latest.organization_id AND c.id=latest.correction_id
 WHERE c.organization_id=t.organization_id AND c.assignment_id=t.assignment_id ORDER BY latest.rowid DESC LIMIT 1);
-- Separate authority for handling volunteers. A program read grant alone does
-- not confer permission to assign people or approve their hours.
CREATE TABLE volunteer_grants (
  membership_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('people.read','people.create','schedule.manage','assignment.manage','readiness.review','attendance.manage','hours.review')),
  program_id TEXT,
  location_id TEXT,
  FOREIGN KEY (membership_id, organization_id) REFERENCES organization_memberships(id, organization_id),
  FOREIGN KEY (organization_id, program_id) REFERENCES programs(organization_id, id),
  FOREIGN KEY (organization_id, location_id) REFERENCES locations(organization_id, id)
);
CREATE UNIQUE INDEX volunteer_grants_scope ON volunteer_grants(membership_id, action, coalesce(program_id,''), coalesce(location_id,''));
-- Any membership version change invalidates its workflow grants. In particular,
-- revocation followed by reinvitation must not resurrect prior responsibilities.
CREATE TRIGGER volunteer_grants_on_membership_change AFTER UPDATE OF version ON organization_memberships
WHEN NEW.version!=OLD.version
BEGIN DELETE FROM volunteer_grants WHERE membership_id=OLD.id AND organization_id=OLD.organization_id; END;
CREATE TABLE volunteer_grant_events (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, membership_id TEXT NOT NULL, membership_version INTEGER NOT NULL,
 grants_json TEXT NOT NULL, actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(membership_id,organization_id) REFERENCES organization_memberships(id,organization_id),
 FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TABLE volunteer_grant_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL,
 membership_id TEXT NOT NULL, result_version INTEGER NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key), FOREIGN KEY(membership_id,organization_id) REFERENCES organization_memberships(id,organization_id)
);
CREATE TRIGGER volunteer_grant_events_no_update BEFORE UPDATE ON volunteer_grant_events BEGIN SELECT RAISE(ABORT,'volunteer_grant_event_immutable'); END;
CREATE TRIGGER volunteer_grant_events_no_delete BEFORE DELETE ON volunteer_grant_events BEGIN SELECT RAISE(ABORT,'volunteer_grant_event_immutable'); END;
CREATE TRIGGER volunteer_grant_receipt_no_update BEFORE UPDATE ON volunteer_grant_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_grant_receipt_no_delete BEFORE DELETE ON volunteer_grant_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TABLE volunteer_audit_events (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('assignment.create','assignment.cancel','attendance.check_in','attendance.check_out','hours.submit')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,assignment_id) REFERENCES volunteer_assignments(organization_id,id),
  FOREIGN KEY (session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_audit_no_update BEFORE UPDATE ON volunteer_audit_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TRIGGER volunteer_audit_no_delete BEFORE DELETE ON volunteer_audit_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TABLE volunteer_assignment_receipts (
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128),
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  assignment_id TEXT NOT NULL,
  PRIMARY KEY(actor_account_id, organization_id, idempotency_key),
  FOREIGN KEY(organization_id, assignment_id) REFERENCES volunteer_assignments(organization_id, id)
);
CREATE TRIGGER volunteer_receipt_no_update BEFORE UPDATE ON volunteer_assignment_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_receipt_no_delete BEFORE DELETE ON volunteer_assignment_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TABLE volunteer_hours_receipts (
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128),
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  decision_id TEXT NOT NULL,
  PRIMARY KEY(actor_account_id,organization_id,idempotency_key),
  FOREIGN KEY(organization_id,decision_id) REFERENCES volunteer_hours_decisions(organization_id,id)
);
CREATE TRIGGER volunteer_hours_receipt_no_update BEFORE UPDATE ON volunteer_hours_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_hours_receipt_no_delete BEFORE DELETE ON volunteer_hours_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
-- A review records its reason and reviewer separately from operational status.
CREATE TABLE volunteer_readiness_decisions (
 id TEXT NOT NULL,
 organization_id TEXT NOT NULL,
 occurrence_id TEXT NOT NULL,
 role_id TEXT NOT NULL,
 person_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('ready','blocked')),
 evidence_note TEXT NOT NULL CHECK(length(trim(evidence_note)) BETWEEN 1 AND 2000),
 reviewer_account_id TEXT NOT NULL REFERENCES accounts(id),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,occurrence_id,role_id,person_id) REFERENCES volunteer_readiness(organization_id,occurrence_id,role_id,person_id)
);
CREATE TRIGGER volunteer_readiness_decision_no_update BEFORE UPDATE ON volunteer_readiness_decisions BEGIN SELECT RAISE(ABORT,'readiness_decision_immutable'); END;
CREATE TRIGGER volunteer_readiness_decision_no_delete BEFORE DELETE ON volunteer_readiness_decisions BEGIN SELECT RAISE(ABORT,'readiness_decision_immutable'); END;
CREATE TABLE volunteer_readiness_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128), request_digest TEXT NOT NULL CHECK(length(request_digest)=64), decision_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key),
 FOREIGN KEY(organization_id,decision_id) REFERENCES volunteer_readiness_decisions(organization_id,id)
);
CREATE TRIGGER volunteer_readiness_receipt_no_update BEFORE UPDATE ON volunteer_readiness_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_readiness_receipt_no_delete BEFORE DELETE ON volunteer_readiness_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TABLE volunteer_occurrence_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128), request_digest TEXT NOT NULL CHECK(length(request_digest)=64), occurrence_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key),
 FOREIGN KEY(organization_id,occurrence_id) REFERENCES volunteer_occurrences(organization_id,id)
);
CREATE TRIGGER volunteer_occurrence_receipt_no_update BEFORE UPDATE ON volunteer_occurrence_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_occurrence_receipt_no_delete BEFORE DELETE ON volunteer_occurrence_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TABLE volunteer_occurrence_events (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, occurrence_id TEXT NOT NULL,
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('occurrence.create','role.create','occurrence.publish')), created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,occurrence_id) REFERENCES volunteer_occurrences(organization_id,id),
 FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_occurrence_event_no_update BEFORE UPDATE ON volunteer_occurrence_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TRIGGER volunteer_occurrence_event_no_delete BEFORE DELETE ON volunteer_occurrence_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TABLE volunteer_role_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 request_digest TEXT NOT NULL, occurrence_id TEXT NOT NULL, role_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key),
 FOREIGN KEY(organization_id,occurrence_id,role_id) REFERENCES volunteer_role_requirements(organization_id,occurrence_id,role_id)
);
CREATE TRIGGER volunteer_role_receipt_no_update BEFORE UPDATE ON volunteer_role_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_role_receipt_no_delete BEFORE DELETE ON volunteer_role_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TABLE volunteer_readiness_open_events (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, occurrence_id TEXT NOT NULL, role_id TEXT NOT NULL, person_id TEXT NOT NULL,
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,occurrence_id,role_id,person_id) REFERENCES volunteer_readiness(organization_id,occurrence_id,role_id,person_id),
 FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_readiness_open_no_update BEFORE UPDATE ON volunteer_readiness_open_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TRIGGER volunteer_readiness_open_no_delete BEFORE DELETE ON volunteer_readiness_open_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TABLE volunteer_people_receipts (
 actor_account_id TEXT NOT NULL REFERENCES accounts(id), organization_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 request_digest TEXT NOT NULL, person_id TEXT NOT NULL,
 PRIMARY KEY(actor_account_id,organization_id,idempotency_key),
 FOREIGN KEY(organization_id,person_id) REFERENCES volunteer_people(organization_id,id)
);
CREATE TABLE volunteer_people_events (
 id TEXT NOT NULL, organization_id TEXT NOT NULL, person_id TEXT NOT NULL, actor_account_id TEXT NOT NULL REFERENCES accounts(id),
 session_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,id), FOREIGN KEY(organization_id,person_id) REFERENCES volunteer_people(organization_id,id),
 FOREIGN KEY(session_id,actor_account_id) REFERENCES sessions(id,account_id)
);
CREATE TRIGGER volunteer_people_receipt_no_update BEFORE UPDATE ON volunteer_people_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_people_receipt_no_delete BEFORE DELETE ON volunteer_people_receipts BEGIN SELECT RAISE(ABORT,'volunteer_receipt_immutable'); END;
CREATE TRIGGER volunteer_people_event_no_update BEFORE UPDATE ON volunteer_people_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
CREATE TRIGGER volunteer_people_event_no_delete BEFORE DELETE ON volunteer_people_events BEGIN SELECT RAISE(ABORT,'volunteer_audit_immutable'); END;
-- A minimal person is visible only in the scope in which staff registered them.
CREATE TABLE volunteer_people_scopes (
 organization_id TEXT NOT NULL, person_id TEXT NOT NULL, program_id TEXT NOT NULL, location_id TEXT NOT NULL,
 PRIMARY KEY(organization_id,person_id,program_id,location_id),
 FOREIGN KEY(organization_id,person_id) REFERENCES volunteer_people(organization_id,id),
 FOREIGN KEY(organization_id,program_id) REFERENCES programs(organization_id,id),
 FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id)
);
