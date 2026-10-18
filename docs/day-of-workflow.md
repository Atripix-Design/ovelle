# Proposed day-of volunteer workflow

October 18, 2026. This expands the confirmed day-of attendance feature in the
[feature list](feature-list.md) and the [coordinator workflow](coordinator-workflow.md).
It is a planning proposal, not an implemented interface. Specific layouts, timing
policies, QR entry and offline application operation are not selected here.

## Example and responsibilities

A Saturday food distribution needs 12 packers, two drivers and one team leader.
A company holds six of the packer places. One volunteer has an agreed seated-task
arrangement. A driver cancels, a walk-in arrives and one person forgets checkout.

The authorized on-site lead coordinates the occurrence. Attendance staff record
participation; readiness reviewers resolve missing requirements; designated staff
handle accommodations and incidents. One person may hold multiple permissions,
but attendance access alone does not grant access to every private record or
approval authority for service hours or program results.

## 1. Prepare the occurrence

Before the event, confirm the lead, location, time zone, arrival instructions and
contact. Review role-specific gaps, expiring requirements and group reservation
release deadlines. A total of 15 people cannot hide a missing qualified driver.

Use a phone-friendly day-of roster showing assignment, role, arrival status and
an actionable readiness summary. Show only approved practical accommodation
instructions to staff responsible for them; keep diagnoses, request narratives,
incident reports and screening documents out of the general roster.

Prepare a printable roster with generation time and minimum necessary information.
Keep sensitive instructions separately controlled. Decide print handling and disposal
with the organization; a printed roster is a snapshot, not live capacity authority.

## 2. Brief the team

Confirm who handles check-in, qualification questions, access needs and emergencies.
Check that agreed arrangements can actually be delivered. If an arrangement fails,
contact the volunteer and authorized reviewer to agree an alternative rather than
quietly switching the person to an unsuitable role.

Review cancellations, replacement offers and unfilled critical roles. A sent offer
is not confirmed coverage. Record a decision to reduce, delay or cancel an activity
when required staffing is unavailable, then update affected assignments and notices.

## 3. Record arrivals

Staff find the existing assignment and confirm the correct person without making
contact details visible to the queue. Group arrivals still resolve to individual
participants; a leader's headcount does not check everyone in automatically.

Check readiness for the occurrence and assigned role. If requirements are missing,
refer to an authorized reviewer and keep participation pending until resolved.
Capture actual arrival time separately from entry time when recording it later.
Mark late arrivals with their actual times rather than changing the planned shift.

Repeated check-in actions must not create another attendance record or consume an
additional place. Staff-assisted entry is the baseline; personal phones, QR scanning
and automatic location tracking are not prerequisites for participation.

## 4. Handle walk-ins, replacements and role changes

For a walk-in, search for an existing volunteer before creating a record. Explain
applicable registration and document steps, then check eligibility, current capacity
and group reservations. Record who authorized an assignment. If requirements cannot
be completed or no suitable place exists, explain the next option without recording
participation that did not occur.

Confirm replacements through the same assignment checks. For a role transfer,
check the destination role's requirements and capacity, release the previous slot
as appropriate and retain the transfer history. Track time segments where needed;
transfers or overlapping roles must not multiply one person's service time.

## 5. Manage participation and concerns

Show authorized staff who is expected, present, checked out or unresolved. Define
when a missing arrival becomes a no-show; do not label someone absent simply
because the check-in desk has not processed them. Preserve cancellations separately.

Record early departures and applicable breaks. Break rules and rounding require
organization policy; the proposed default is to retain actual timestamps and apply
an explicit calculation rather than silently rounding each action.

For routine problems, open a support follow-up with an owner and next action. For
a safety concern, follow immediate on-site instructions and route a restricted
incident report to designated staff. A saved report or sent email does not prove
an urgent concern has been seen. The roster may show an authorized operational
instruction without exposing the underlying allegation or reporter.

## 6. Handle a connection interruption

Proposed initial fallback: use an authorized printed roster and securely record
actual arrivals/departures for later staff entry. This does not establish offline
app functionality, background synchronization or a reliable local copy of all data.

When live capacity or readiness cannot be checked, pause new walk-in assignments
and role changes requiring those checks, or use an explicitly defined on-site
fallback authority and capacity allocation. Do not independently consume the same
last place on multiple disconnected devices.

After reconnection, review the fallback records before entry, match each person to
the correct occurrence and reconcile duplicate entries and conflicting timestamps.
Preserve event time, entry time, author and source. Do not silently overwrite a
newer record. Secure or dispose of temporary copies under the agreed policy.

## 7. Close the occurrence

Record departures and identify missing checkouts, unresolved arrivals and attendance
disputes. Missing checkout remains incomplete evidence; do not assume the scheduled
end time or invent zero service. Request clarification or a documented staff correction.

Assign remaining support, accommodation and incident actions to authorized owners.
Ending the activity does not close those records automatically. Review actual
staffing and attendance, then capture program results through the separate
[impact-data workflow](impact-data-workflow.md).

Attendance reconciliation, hour approval and impact-result acceptance are separate
closeout steps. Closing an occurrence must not silently approve time or results.

## 8. Review service and prepare the next occurrence

Volunteers review and submit actual service time. Authorized reviewers record
approvals or explained adjustments. Later attendance corrections trigger the
appropriate review before approved totals change.

For this example, preserve the replacement driver's assignment, the walk-in's
reviewed registration and the missing-checkout clarification. Carry forward the
weekly series without copying attendance or results into the next Saturday.

## Proposed validation scenarios

| Scenario | Expected planning outcome |
| --- | --- |
| Group has six reserved places and four named arrivals | Count four actual attendees within the reservation; apply the separate unused-place policy. |
| Qualified driver is absent despite enough people overall | Keep the driver vacancy visible; replacement or operating decision remains required. |
| Staff tap check-in twice | Retain one attendance record and one assignment. |
| Walk-in lacks a required waiver | Do not confirm participation until the applicable requirement is satisfied. |
| Volunteer requests a seated task | Show only the agreed practical instruction to the staff providing it. |
| Report concerns the usual coordinator | Route to the configured alternate authorized recipient. |
| Network fails before the last place is assigned | Avoid competing confirmations; reconcile fallback records on return. |
| Volunteer forgets checkout | Flag incomplete time for clarification rather than granting planned hours. |

## Decisions before implementation

Choose the day-of staff permissions, no-show threshold, break/rounding rules,
manual-entry safeguards and critical-role cancellation authority. Decide whether
printed fallback is sufficient or a separately designed offline application is
needed. Define sensitive print handling, escalation recipients and response coverage.
