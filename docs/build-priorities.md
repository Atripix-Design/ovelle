# Proposed Ovelle build priorities

October 19, 2026. This recommends an implementation order for all 38 confirmed
areas in the [feature list](feature-list.md). The order and initial slices are
proposals for review, not approved release commitments, estimates or implemented
capabilities. No confirmed feature is removed or made optional by being scheduled
later. Detailed behavior still follows the feature list and linked workflows.

## Recommended order

Build a complete one-off volunteer journey, then make it repeatable for groups,
then expand recognition and giving. A usable first CRM milestone spans stages 0
and 1; it is not the same as completing every behavior in those feature areas or
meeting all conditions for the full Ovelle application launch.

| Stage | Purpose | Feature areas first introduced | Completion evidence |
| --- | --- | ---: | --- |
| 0 — Foundation | Establish organization ownership, access, records and recovery. | 6 | Authorized staff can manage isolated organization records and restore a controlled backup without replaying external actions. |
| 1 — First complete volunteer journey | Recruit for one occurrence, establish readiness, run it and approve actual hours. | 15 | A coordinator and volunteer can complete the journey, including corrections and support, with a reconciled report. |
| 2 — Recurring and group operations | Run repeated activities, coordinate reserved places and reduce repeated staff work. | 12 | A recurring group visit survives a one-date absence, replacement and roster change without overbooking or changing historical service. |
| 3 — Recognition and giving | Recognize contribution and introduce the separate donor lifecycle. | 5 | Recognition uses approved service; verified payment events and donor controls reconcile without duplicate charges or records. |

The counts assign each area one starting stage. Several receive a deliberately
small first slice and further development later. Stages are dependency milestones,
not sprints or promises that every feature costs the same effort.

## Stage 0 — Foundation

Start with the [proposed identity/access design](superpowers/specs/2026-10-19-stage-0-identity-access-design.md)
and [implementation plan](superpowers/plans/2026-10-19-stage-0-identity-access.md)
for accounts, organization setup and permissions. These are review drafts; the
remaining Stage 0 features below still require their own implementation work.

Build these before using real volunteer records. Authentication, session recovery,
organization isolation, authorization and audit behavior are dependencies across
these areas, not additional counted feature areas.

| Confirmed feature area | First useful slice | Subsequent development |
| --- | --- | --- |
| Organization setup | Organization owner, program, location, time zone and responsible staff; controlled ownership recovery. | Richer branding and setup conveniences. |
| Coordinator invitations and permissions | Accepted invitations, explicit program/location permissions, private-record access, revocation and session handling. | More role presets and administration conveniences. |
| Operating policies | Explicit baseline rules for registration, capacity, readiness, attendance and hour review; record effective scope. | Configurable overrides and richer policy interfaces as dependent features arrive. |
| Volunteer record management | Create, search and update organization-scoped records; retain history and flag possible duplicates for review. | Reviewed merge, saved filters and fuller archive management. |
| Document storage and signatures | Private versioned documents, scoped access and the exact signing/consent evidence needed for the pilot roles. Resolve signer and retention rules before collecting signatures. | Additional templates and renewal conveniences; storage locks do not prove signature validity. |
| Backup and recovery | Protected related-record/document backup and a verified restore exercise; prevent restored data from resending messages or replaying transactions. | Scheduled recovery exercises and broader restore tooling as records expand. |

Resolve age eligibility, guardian contacts, consent and supervision rules before
enrolling minors; an adult registration flow is not sufficient by assumption.
Choose the initial pilot roles and their actual document requirements before
implementing the signing flow. Resolve the authentication and account-recovery
contract before building public signup or staff invitations.

**Stage gate:** two test organizations cannot access each other's private records;
a revoked coordinator loses access; a backup restore preserves relationships and
private document references. Keep shared UI in `@ovelle/ui`, domain rules separate
from persistence, and native Electron operations behind explicit interfaces.

## Stage 1 — First complete volunteer journey

Use a single scheduled occurrence with explicit role capacity. Start with a fixed,
validated application and staff-assisted operations. Do not wait for a general
form builder, recurring schedules, QR entry or donor accounts to make this journey
usable. A basic support or safety workflow belongs here; advanced configuration
and automation can follow later.

| Confirmed feature area | First useful slice | Subsequent development |
| --- | --- | --- |
| Volunteer onboarding | Application, next-step checklist, required documents and staff review for the chosen roles. | More reusable templates and renewal assistance. |
| Role requirements | Role-specific requirements evaluated for the service date. | Richer configuration and renewal management. |
| Readiness tracking | Show missing, pending-review and satisfied requirements separately from assignment. | Group-level summaries when group bookings arrive in stage 2. |
| Opportunity publishing | Draft, publish, close or cancel an opportunity with one occurrence, roles and explicit assignment confirmation. | More publishing conveniences; recurring series arrive in stage 2. |
| Day-of attendance | Phone-friendly roster, staff-assisted check-in/out, actual times, controlled walk-ins and printable fallback. | More day-of conveniences; QR and offline app synchronization require separate scope decisions. |
| Attendance corrections | Preserve before/after values, reason, author and timestamp; flag effects on reviewed hours. | More bulk-review conveniences after individual correction behavior is reliable. |
| Hour submissions | Volunteer submits actual time and explanation against one participation record. | More submission conveniences without duplicate service credit. |
| Coordinator approval | Permission-scoped review, clarification and explained adjustment; approved totals change only through a recorded decision. | More review-queue conveniences. |
| Correction requests | Volunteer asks to correct attendance or reviewed hours; staff resolve against the original record. | Additional routing and review policies once the basic correction loop is validated. |
| Service history | Volunteer sees their activities, approved hours, pending submissions and review explanations. | More filtering; downloadable statements remain a separate proposal. |
| Email notifications | Assignment confirmation/change/cancellation, review and support updates; visible failures and retry protection. | Waitlist, replacement, recurring and group messages as those features arrive. |
| Volunteer support and follow-up | Volunteer/staff-assisted request, owner, next action, due date and resolution; restricted internal-note visibility. | Categories, response targets and richer follow-up management. |
| Accommodations | Optional request, staff review, agreed practical arrangement and restricted sharing to relevant day-of staff. | More review and renewal conveniences; no diagnosis requirement or assumed service entitlement. |
| Incident handling | Restricted report, designated owner, alternate recipient, immediate on-site instructions and recorded follow-up. | More triage/escalation configuration; do not postpone a usable reporting route until later stages. |
| Reporting | Filtered participation, attendance and approved-hour report/export with period, definitions and generation time. | Group/recurrence reporting in stage 2; impact collection is a separate proposal described below. |

Confirmation must already prevent duplicate or ineligible assignments and atomic
capacity overflow. Check overlapping commitments when confirming assignments;
deferring the broader waitlist feature does not defer these baseline checks.
Cancellation must release capacity and stop obsolete notices. Manual replacement
assignment may use the same checks before dedicated replacement coverage exists.

Follow the [day-of workflow](day-of-workflow.md), especially missing checkouts,
late manual entry and confidential concerns. Paper fallback is not offline app
operation. Keep readiness, assignment, calendar RSVP, attendance, submitted hours
and approved hours as distinct states throughout.

**Stage gate:** create an activity, onboard a volunteer, agree an accommodation,
confirm within capacity, record actual participation, submit and approve time,
resolve a correction and reproduce the report from source records. Also exercise
a failed email, duplicate confirmation, missing checkout, ordinary support request
and restricted concern involving the usual coordinator. Open concerns can remain
open with owners; completing an event does not close them automatically.

## Stage 2 — Recurring and group operations

Group coordination is Ovelle's central next expansion after the individual journey.
Keep reservations separate from named participants so stage 2 extends the existing
assignment and attendance model rather than introducing a second counting system.

| Confirmed feature area | First useful slice | Dependency / reason for this stage |
| --- | --- | --- |
| Recurring shifts | Series, addressable occurrences and one-occurrence versus future edits. | Requires stable one-occurrence assignments, attendance and changes. |
| Group bookings | Scoped leader/contact, reserved role capacity and unused-place release policy. | Reuses capacity, role eligibility and organization permissions. |
| Group leader permissions | Explicit appointment and booking-scoped roster/readiness access; no automatic private-record or hour-approval access. | Build with bookings before exposing leader management actions. |
| Group signup links | Revocable booking link with individual onboarding inside reserved capacity. | Requires bookings, leader boundaries and the stage 1 volunteer journey. |
| Booking changes | Coordinator-confirmed date/role/capacity changes with history and affected notifications. | Requires booking and occurrence identity. |
| Waitlists and conflict checks | Occurrence/role queue, expiring offers and acceptance through shared eligibility/capacity/conflict checks. | Extends the baseline confirmation checks that already exist in stage 1. |
| Replacement coverage | Coordinator-led selection, explicit acceptance and expiry; unfilled critical roles stay visible. | Reuses waitlist/offer behavior and occurrence-specific cancellation. |
| Availability and preferences | Recurring availability, exceptions, planned breaks and preferences for assignment decisions. | Valuable when coordinating repeated commitments and replacement offers. |
| Calendar invitations | Stable assignment event identity, updates/cancellations and private subscription/fallback. | Build once assignment changes and recurrence are stable; RSVP does not alter attendance or readiness. |
| Staff handoffs | Transfer open work and upcoming activity ownership, temporary coverage and permission-aware reassignment. | Builds on stage 1 work queues; access revocation and owner recovery already exist in stage 0. |
| Configurable forms | Supported field types, validation, versioned answers and explicit response access. | Generalizes the pilot application after real collection needs are known. |
| Imports | Preview/map/validate supported files, reviewed identity matching, source/review status and repeat-safe batches. | Requires stable record contracts and duplicate handling; move a bounded volunteer import earlier if pilot adoption requires it. |

Build recurrence and group permissions before the dependent signup/change screens;
implement the shared offer lifecycle before separate waitlist and replacement
interfaces. Extend operational email and readiness views alongside those features.
Include secure appointment/removal of leaders and record staff handoff authorship.

**Stage gate:** reserve six of 12 places for a group, register four people within
that reservation, release unused places under policy and handle one date's driver
absence without deleting the recurring commitment. Replacement acceptance must
not overfill the final place. A leader sees only authorized group information,
and roster changes must not rewrite historical hours.

### Proposed impact collection after basic reporting

Recommend evaluating a small program-result collection slice in stage 2, once
attendance, review and reporting identities are stable. It remains a proposal
under reporting, not a 39th confirmed feature or automatically approved stage 2
scope. If evaluation shows it is essential to the pilot or supplied rubric, bring
that slice into stage 1 after agreeing its definition and review rules.

Use the [impact-data workflow](impact-data-workflow.md): choose a program measure,
unit and recording scope; name a collector/reviewer; record observed/estimated or
missing data and evidence; accept results; aggregate compatible non-overlapping
values once; correct by superseding rather than adding another count. Start with
aggregate activity outputs, not beneficiary identities or longitudinal studies.

**Validation:** one event's 180 distributions remain 180 when joined to 15 volunteer
records. A missing tally remains missing, and an accepted correction to 172 replaces
the prior contribution. These outputs do not prove a longer-term outcome.

## Stage 3 — Recognition and giving

These are retained confirmed areas, with lower dependency value for getting a
volunteer program running. Recognition can move earlier as a small manual slice
once approved service history exists. Fundraising remains a separate lifecycle;
volunteering never requires donating.

| Confirmed feature area | First useful slice | Dependency / reason for this stage |
| --- | --- | --- |
| Simple recognition tools | Staff-sent thank-you and defined milestones using approved service and preferences. | Needs dependable approved history; automation and public recognition are not prerequisites for participation. |
| Donations and payments | Nonprofit-owned account connection, one-time gifts and verified provider events, fees/refunds/disputes kept distinct. | Requires separate provider/onboarding and financial-access decisions; one-time flow precedes recurring controls. |
| Donation history | Private verified transaction history with failed, refunded and disputed states. | Build alongside payment reconciliation before exposing donor self-service. |
| Donor self-service | Verified access to the donor's own records and supported provider-managed payment details. | Requires financial identity/access boundaries; volunteer identity alone grants no donor access. |
| Recurring donation controls | Explicit frequency, amount, next charge, cancellation and provider-confirmed changes. | Follows reliable payment events and donor authorization; cancellation does not refund past gifts. |

Extend reporting and recovery to financial records before the giving release.
Restores must reconcile provider state without recreating charges or resurrecting
canceled commitments. Payment confirmations do not establish tax-acknowledgment
eligibility. Choose provider and operating responsibilities before implementation.

**Stage gate:** retries do not duplicate a gift; verified events reconcile history;
a donor can cancel future giving with confirmed effect; a refund remains distinct
from cancellation; donor access does not expose unrelated volunteer records.

## Parallel application and release work

The [desktop assistant RFC](architecture/desktop-assistant-design.md) records
separate confirmed first-release requirements. This CRM roadmap does not remove
or demote them to optional later work or include them in the 38-area count.

Develop the assistant against the shared account/organization/authorization
contracts after stage 0; permission-scoped lookup depends on real stage 1 records.
Respect the RFC's initial boundary: help, authorized lookup and a reviewed change
to an internal non-authoritative draft note only after its domain service exists.
Its local speech, managed reasoning, allowance accounting and read-only MCP
requirements need their own implementation sequence and release evidence. Do not
make core CRM actions depend on assistant availability or implement assistant writes
before the underlying validated domain commands.

Across every stage, keep responsibilities decoupled, apply the shared component
and Figma workflow, verify keyboard/accessibility and loaded/loading behavior,
validate data and permissions, and maintain useful documentation. These are
continuous quality work, not a final polish stage.

The supplied competition brief/rubric is not present in this checkout. Map these
milestones to that document before finalizing the competition build; do not infer
point values or claim rubric compliance from this roadmap. Resolve standalone
operation, network dependencies and offline backup expectations explicitly against
the actual brief. Backup, paper fallback, offline CRM operation and offline assistant
reasoning are different capabilities. Do not silently promise all of them.

## Assumptions and choices that may change the order

- Initial pilot: one nonprofit can validate a one-off activity before full recurring
  group operation. If its first useful activity requires group reservations, move
  the minimal booking/leader/link slice into stage 1 without weakening the safeguards.
- No deadline or capacity estimate has been supplied; there are no invented sprint
  lengths or delivery dates. Estimate only after the first slices are designed.
- Confirm pilot roles, registration policy, consent/guardian handling, signing needs,
  staff responsibilities and recovery expectations before stage 0/1 implementation.
- Keep SMS excluded. Embeds, QR check-in, equipment scheduling, shared inboxes,
  accounting/file-storage connections, dedicated surveys and beneficiary case
  management still require their existing separate scope decisions.
- The [Figma build-order section](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=360-4389)
  was manually synchronized October 19, 2026 with all four stages, 38 feature
  assignments and links to full feature scope. The sequence remains proposed;
  source documents and Figma are maintained separately.

## Basis for this recommendation

The ordering is a product/dependency judgment based on the existing
[operations research](research/volunteer-operations.md) and role/day-of workflows,
not a claim that every nonprofit follows the same process. NCVO's
[induction guidance](https://www.ncvo.org.uk/help-and-guidance/involving-volunteers/recruiting-and-welcoming-volunteers/running-a-volunteer-induction/),
checked October 19, 2026, emphasizes adjustments and continued support during and
after induction. That supports introducing practical accommodations and follow-up
with the first usable volunteer journey; it does not prescribe this software roadmap
or establish U.S. legal requirements.
