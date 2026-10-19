# Ovelle feature list

Ovelle is a nonprofit volunteer-management CRM. This document records confirmed
feature scope, not implemented capabilities. All 35 previously confirmed feature
areas are retained, with three additions approved October 18, 2026: volunteer support
and follow-up, incident handling, and accommodations. The list now contains 38
confirmed feature areas in eight modules. Detailed behavior below remains proposed;
providers, implementation order and rubric mapping still require planning.

Organized on October 17, 2026; expanded October 18, 2026. This is the complete
confirmed list from this planning discussion, not an exhaustive inventory of every future Ovelle requirement.

Figma: [Features — module overview and detailed scope](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=350-4389).

The Figma overview and all eight module detail boards were manually synchronized
on October 19, 2026 to the 38 confirmed feature areas. The overview also links to
the full proposed [day-of workflow](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=358-4407)
and [impact-data workflow](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=358-4448).
Source documents and Figma remain separately maintained.
Day-of workflow and impact-data collection details are planning proposals, not
implemented capabilities or approval of offline synchronization or beneficiary records.

## Module map

| Module | Confirmed feature areas | Responsibility |
| --- | --- | --- |
| [01 Organization and access](#01-organization-and-access) | 5 | Establish the organization, staff responsibilities, operating rules and restricted incident handling. |
| [02 Volunteer records and readiness](#02-volunteer-records-and-readiness) | 8 | Maintain volunteer relationships, support participation and prepare people for eligible roles. |
| [03 Opportunities and scheduling](#03-opportunities-and-scheduling) | 4 | Publish activities, schedule repeated service and fill available places. |
| [04 Group coordination](#04-group-coordination) | 4 | Reserve group places and let leaders coordinate participants within scoped access. |
| [05 Attendance and service hours](#05-attendance-and-service-hours) | 6 | Record participation, review submitted time and preserve approved service. |
| [06 Communications and recognition](#06-communications-and-recognition) | 3 | Keep people informed and acknowledge their approved contributions. |
| [07 Donations and donor service](#07-donations-and-donor-service) | 4 | Receive donations and let donors manage their giving. |
| [08 Documents and data operations](#08-documents-and-data-operations) | 4 | Protect documents, bring in records, report results and recover data. |

## Shared responsibilities and overlap cleanup

Each feature has one home below. References from other modules describe how they
work together, rather than establishing a second feature or separate record.

| Shared concern | Canonical responsibility and boundary |
| --- | --- |
| Organization and access | Staff permissions own invitations and staff access. Group leader permissions reuse the same access principles within authorized groups and bookings. |
| Support, incidents and accommodations | Support owns routine help and follow-up; accommodations own participation adjustments; incidents own restricted concerns and escalation. Refer between them through authorized links without copying confidential narratives into ordinary notes or rosters. |
| Volunteer records and readiness | Records own profiles; forms collect versioned responses; onboarding guides next steps; requirements define eligibility; readiness evaluates evidence for the service date. Availability informs assignments without creating commitments. |
| Opportunities and scheduling | Publishing owns activity visibility. Scheduling checks eligibility, overlapping commitments and capacity for every occurrence; waitlist and replacement offers use these same checks before assignment. |
| Group coordination | Bookings own reserved capacity. Signup links register people inside that reservation. Changes amend bookings through approval rules. Leader permissions govern which actions and readiness summaries leaders can access. |
| Attendance and service hours | Attendance records actual participation; corrections amend that evidence. Volunteers submit hours or request changes; authorized reviewers approve totals. Service history displays the resulting records without counting them again. |
| Communications and recognition | Email owns operational delivery and communication preferences. Calendar invitations reflect assignments and updates. Recognition uses email and approved service records; an RSVP never confirms attendance or approved hours. |
| Donations and donor service | Payments own verified transactions. Donor self-service provides authorized account access; recurring controls manage future gifts; history displays financial events. Keep paid, pledged, refunded and recurring states distinct. |
| Impact collection and reporting | Proposed collection records program results with definitions, evidence and review; reporting reads accepted results without multiplying them across volunteers or shifts. Aggregate activity outputs do not establish unique beneficiaries or longer-term outcomes. |
| Documents and data operations | Documents own signed versions and signing evidence. Imports validate incoming records; reporting reads authorized records; backup and recovery restore protected data. Reports and exported files are not recovery backups. |
| Policies and access | Operating policies set scoped rules; the relevant feature applies them. Staff and leader permissions control access, including private documents and finance; forms and signup links never grant authority. |
| Cross-module changes | A changed booking or assignment updates dependent readiness and notifications. It does not silently rewrite signed evidence, past attendance, review authorship or approved service totals. |

## 01 Organization and access

Establish the organization, staff responsibilities, operating rules and restricted
incident handling.

### Organization setup

Let a nonprofit establish its organization, programs, locations and administrative
responsibilities in Ovelle.

Proposed behavior:

- Record organization identity, contact details, time zone and branding.
- Establish an initial organization owner and a controlled process for assigning
  additional administrators and transferring ownership.
- Organize activities and staff responsibilities by program and location.
- Configure applicable volunteer requirements and document templates while keeping
  organization defaults distinct from program/role-specific requirements.
- Define ownership verification and recovery during detailed planning; creating an
  organization does not by itself verify nonprofit status or payment eligibility.

### Coordinator invitations and permissions

Invite staff and grant explicit responsibilities within the organization.

Proposed behavior:

- Track pending, accepted, expired and revoked invitations; an invitation alone
  does not grant staff access before acceptance by the intended account.
- Scope coordinator access to assigned programs/locations and responsibilities
  such as scheduling, onboarding review, attendance, hour approval and group bookings.
- Grant access to private documents, finance and service connections only through
  relevant explicit permissions; coordinator status does not imply all access.
- Allow authorized admins to review, change and revoke staff access with an audit
  history. Prevent coordinators from granting themselves broader authority.
- Define role presets, invitation expiry and revocation/session behavior before
  implementation.

### Operating policies

Let admins establish consistent rules for volunteer operations, with appropriately
scoped configuration for programs and roles.

Proposed behavior:

- Configure registration review and assignment rules, requirement renewals, group
  reservation deadlines and booking-change approval responsibilities.
- Define replacement-offer behavior, service-hour review and attendance-correction
  rules, within the capabilities ultimately implemented.
- Make applicable rules visible to coordinators and affected volunteers/leaders.
- Record policy changes and define their effective scope; do not silently rewrite
  past attendance, signed document versions or prior approval decisions.
- Design defaults, permitted overrides and treatment of existing bookings before
  implementation. SMS remains excluded.

### Staff handoffs

Transfer operational responsibility when staff change roles, leave or need
temporary coverage, while keeping records owned by the organization.

Proposed behavior:

- Identify upcoming activities, pending onboarding/hour/correction reviews and
  group contacts that need a responsible replacement.
- Assign responsibility to an eligible staff member and make unresolved work
  visible to an authorized admin; define temporary coverage and end dates.
- Revoke departing staff access independently of handoff completion so unresolved
  assignments do not require retaining former staff access.
- Preserve historical authorship and review decisions rather than relabeling past
  actions as performed by the replacement.
- Define ownership succession, final-admin protections and handling of unaccepted
  replacement invitations during detailed planning.

### Incident handling

Record and route safety concerns, inappropriate behavior and other incidents to
explicitly authorized staff. Confirmed October 18, 2026.

Proposed behavior:

- Let volunteers and staff report a concern, optionally linked to an activity,
  occurrence or participant; allow concerns unrelated to a scheduled shift.
- Explain that the reporting form is not monitored emergency dispatch. Show the
  organization's immediate on-site contact and emergency instructions separately.
- Record the reported facts, occurrence time, reporting time and restricted evidence;
  distinguish allegations, staff assessment and recorded decisions.
- Assign an authorized owner, urgency and next action; propose received, triaged,
  in progress, resolved and closed states, with explained reopening and an audit trail.
- Define an alternate recipient when the concern involves the usual coordinator
  or owner. Avoid notifying the subject or sharing reporter identity automatically.
- Restrict narratives, attachments and identities independently of general staff,
  group-leader and reporting access. Send neutral email notices linking to authorized
  records rather than placing sensitive detail in notifications.
- Record immediate protective actions and follow-up. Assignment restrictions need
  explicit authorized decisions and effective scope; a report alone does not
  automatically establish misconduct or suspend every assignment.
- Define escalation deadlines, reporter status visibility, evidence access, retention,
  review/appeal responsibilities and any required external reporting with the
  organization before implementation. Anonymous reporting and external case-system
  integrations are separate decisions; do not promise absolute confidentiality.

## 02 Volunteer records and readiness

Maintain volunteer relationships, support participation and prepare people for
eligible roles.

### Volunteer record management

Maintain volunteer records throughout their relationship with the nonprofit, beyond
initial onboarding or an import.

Proposed behavior:

- Let authorized staff search/filter volunteers by relevant profile information,
  skills, interests, status and program/group relationships.
- Allow permitted contact/profile updates and maintain a history for material
  staff changes without rewriting past attendance or approval authorship.
- Identify potential duplicate records and support reviewed resolution; preserve
  linked assignments, documents and service records without double-counting hours.
- Distinguish active, inactive and archived records from account access and deletion;
  retain history according to the organization's defined retention policy.
- Keep volunteer records scoped to the organization; staff record maintenance does
  not grant access to unrelated donor records or merge login identities automatically.
- Define editable fields, merge safeguards, saved filters and archiving behavior
  during detailed planning.

### Configurable forms

Let nonprofits collect information suited to their programs through configurable
questions and fields rather than one fixed application.

Proposed behavior:

- Let authorized staff configure field labels, types, requiredness, instructions and
  validation for volunteer applications and relevant onboarding forms.
- Define who can see or edit responses, including private information; form fields
  must not confer staff permissions or override capacity and eligibility rules.
- Preserve which form version a response was submitted against when forms change.
- Reference existing document/signature workflows for agreements rather than
  treating an ordinary form response as equivalent signing evidence.
- Forms collect information; role requirements define eligibility rules, and
  readiness tracking evaluates completion/review against those rules.
- Define supported field types, conditional questions, templates and response-editing
  policies before implementation. Adding forms does not confirm surveys or a
  general-purpose workflow builder. Proposed program-impact collection is described
  under reporting; it does not reuse private application answers as outcomes.

### Volunteer onboarding

Guide new volunteers from application to readiness for the roles they want to
perform. Confirmed for the feature list on October 17, 2026.

Proposed behavior, informed by [published organization workflows](research/volunteer-operations.md):

- Collect profile, skills, interests, availability and relevant emergency contacts.
- Configure required orientation, training, documents and coordinator reviews by
  program or role rather than imposing every requirement on every volunteer.
- Show volunteers their next steps and coordinators incomplete requirements.
- Track readiness separately from account creation, signup, assignment and attendance.
- Reuse valid requirements and track renewals where a nonprofit requires them.
- Determine guardian-consent and external screening needs during detailed planning;
  adding onboarding does not select or authorize a background-check integration.

### Role requirements

Define what a volunteer needs to perform a particular role.

Proposed behavior:

- Set role-specific skills, training, documents and coordinator approvals.
- Evaluate requirements for the date of service, including applicable expirations.
- Show missing requirements and distinguish pending review from approved readiness.
- Keep requirement configuration separate from volunteer evidence and assignment.

### Readiness tracking

Show whether group participants have completed the requirements for their assigned
roles and dates of service.

Proposed behavior:

- Distinguish reserved places, named participants, completed registrations, pending
  requirements and confirmed assignments without summing overlapping counts.
- Show coordinators actionable missing requirements and review status; show group
  leaders only the participation/readiness information their permissions allow.
- Keep readiness separate from booking confirmation, calendar RSVP and attendance.
- Reflect requirement renewals and role/date changes in readiness status.

### Availability and preferences

Let volunteers state when and how they prefer to participate so coordinators can
make suitable assignments.

Proposed behavior:

- Capture recurring availability, date-specific exceptions and planned breaks with
  explicit time zones, plus preferred roles, programs and locations.
- Distinguish preferences from qualifications, availability from a commitment, and
  a planned absence from permanently ending participation.
- Surface relevant availability/preferences when suggesting or confirming assignments
  and replacement offers, alongside eligibility, capacity and conflict checks.
- Flag effects on existing commitments for review; changing availability does not
  silently cancel confirmed assignments or remove future recurring commitments.
- Keep communication preferences aligned with email notification settings rather
  than maintaining conflicting opt-out values in separate features.
- Define matching/filtering rules and edit permissions before implementation; AI
  scheduling and access to personal calendars are not included by this scope.

### Volunteer support and follow-up

Help staff respond to volunteer questions, difficulties and changes in engagement.
Confirmed October 18, 2026.

Proposed behavior:

- Let volunteers request help and authorized staff record a phone or in-person
  request on their behalf, preserving who entered it and how it was received.
- Link routine support to the volunteer and, where relevant, a program or shift;
  record a concise concern, responsible staff member, next action and due date.
- Propose open, in progress, awaiting volunteer, resolved and closed states, with
  a resolution summary, follow-up history and explained reopening.
- Surface overdue or unassigned work to authorized staff; include open follow-ups
  in staff handoffs without retaining a departing staff member's access.
- Allow an explained follow-up after a missed shift, a planned break or a volunteer's
  request. A no-show is a prompt to understand circumstances, not an automatic
  disciplinary decision or a reason to cancel future commitments.
- Let volunteers see and respond to their own request's appropriate updates; define
  which internal notes are visible. Reuse operational email rather than introducing
  a shared inbox, live chat or SMS.
- Route accommodation requests and sensitive incidents to their own restricted
  workflows without exposing their contents in ordinary support notes.
- Define categories, response targets, notification preferences and closure rules
  before implementation. Automated disengagement scoring and blanket re-engagement
  campaigns are not included.

### Accommodations

Let volunteers request practical adjustments that enable participation.
Confirmed October 18, 2026.

Proposed behavior:

- Offer an optional request during onboarding, booking preparation or later service;
  allow authorized staff-assisted entry for people who cannot use the form.
- Ask what adjustment is needed, such as step-free access, a seated task, language
  assistance or transport coordination. Do not require a diagnosis or assume the
  organization provides every requested service.
- Record the applicable program, role or dates, an authorized reviewer and the
  volunteer's sharing preferences. Separate requested, under review, agreed,
  alternative offered, declined with explanation and ended states.
- Agree the practical arrangement, responsible person and review date with the
  volunteer. Notify them when arrangements change or cannot be provided.
- Show day-of staff only the authorized practical instruction needed to deliver
  the arrangement; restrict request narratives and supporting documents separately.
  Group leaders receive no automatic access, including for group participants.
- Keep accommodation information separate from general eligibility rules and public
  profiles; a request alone does not mark a volunteer unready. Review role suitability
  and alternatives with authorized staff without silently waiving required safeguards.
- Define access, retention, renewal, sharing and handling of youth/guardian requests
  before implementation. A form preference is not a substitute for an agreed arrangement.

## 03 Opportunities and scheduling

Publish activities, schedule repeated service and fill available places.

### Opportunity publishing

Manage opportunities from preparation through publication and closure.

Proposed behavior:

- Draft, review where required, publish, close registration and cancel opportunities
  with appropriate staff permissions and change history.
- Show activity purpose, location, time zone, available roles, requirements and
  instructions; distinguish public from invitation-only opportunities.
- Keep publication status separate from staffing, registration and activity completion.
- Reconcile cancellations and material changes with existing bookings, assignments
  and notifications. Website embeds and custom-domain hosting remain separate ideas.

### Recurring shifts

Schedule repeated activities and ongoing volunteer commitments.

Proposed behavior:

- Define a series with a time zone, recurrence and role capacities.
- Keep individual occurrences addressable for assignments, attendance and changes.
- Support an absence, cancellation or time change for one occurrence without
  removing the series or rewriting past attendance.
- Clearly scope edits to one occurrence or future occurrences and handle calendar
  updates consistently. Detailed recurrence rules remain to be designed.

### Waitlists and conflict checks

Manage demand for full shifts and identify conflicting volunteer assignments.

Proposed behavior:

- Let volunteers join and leave a waitlist for a particular occurrence/role.
- Offer available places to eligible people, with explicit acceptance and an expiry;
  a waitlist entry or sent offer does not count as a confirmed assignment.
- Check overlapping confirmed assignments when offering or confirming places,
  including individual occurrences of recurring commitments.
- Prevent duplicate registrations and overfilling the final place, accounting for
  group reservations and replacements.
- Define queue order, travel buffers, pending-request conflicts and warning versus
  blocking behavior before implementation. Do not inspect private personal calendars
  or reveal assignments belonging to another organization without authorization.

### Replacement coverage

Help coordinators fill a vacancy when an assigned volunteer cannot attend.

Proposed behavior:

- Reopen the affected occurrence and role while preserving the original cancellation.
- Find eligible volunteers or waitlisted people with compatible availability.
- Offer a place and track acceptance separately from sending an invitation.
- Confirm only within capacity; prevent multiple people taking the same final slot.
- Keep unresolved vacancies visible and update affected calendar invitations.
- Decide offer expiry, selection order and manual versus automatic offers during
  detailed planning. SMS remains excluded.

## 04 Group coordination

Reserve group places and let leaders coordinate participants within scoped access.

### Group bookings

Reserve places for a school, company or community group while tracking each
participant's registration and readiness separately.

Proposed behavior:

- Record the group contact, requested/reserved places and applicable roles.
- Give leaders access limited to their group and the information needed to
  coordinate participation; do not expose private documents or screening records.
- Distinguish reserved capacity, named participants, completed registrations and
  confirmed assignments. Count a named participant against the reservation rather
  than consuming an additional place.
- Define reservation deadlines and how unused places return to availability.

### Group signup links

Let a group leader share a booking-specific link so participants register against
the group's reserved places.

Proposed behavior:

- Associate each link with the organization, group and relevant booking.
- Have participants use their own accounts and complete their own onboarding and
  signatures; joining through a link does not bypass eligibility or capacity.
- Count registrations within the existing reservation without creating extra places.
- Keep signup links separate from leader access: possession of a link grants no
  roster visibility, management authority or access to private records.
- Define link expiry, revocation and handling of full or canceled bookings during
  detailed planning.

### Booking changes

Let group leaders manage participation changes and request changes to a booking.

Proposed behavior:

- Allow leaders to invite replacements into available group places, with each
  replacement completing applicable registration and role requirements.
- Route date, capacity and role changes for coordinator confirmation under the
  organization's policy. A request does not change the confirmed booking.
- For recurring bookings, distinguish one occurrence from future occurrences.
- Preserve change history, reconcile affected assignments and calendar invitations,
  and avoid exceeding capacity or silently removing other groups' places.
- Define cancellation permissions, deadlines and release of unused places during
  detailed planning.

### Group leader permissions

Give designated leaders scoped access to manage their group's bookings and
participation without general coordinator authority.

Proposed behavior:

- Separate group membership, booking leadership and attendance; an organizer need
  not attend, and group members need not join every booking.
- Limit access to authorized groups/bookings and the information needed to manage
  participation; private documents, screening results and unrelated volunteers'
  information remain restricted.
- Do not grant service-hour approval authority merely because someone leads a
  group. Additional staff/reviewer authority requires separate authorization.
- Allow attendance discrepancy reports; check-in assistance and visibility of
  attendance or approved group totals require explicitly defined permissions.
- Define leader appointment, removal, delegation and audit behavior before
  implementation.

## 05 Attendance and service hours

Record participation, review submitted time and preserve approved service.

### Day-of attendance

Support staff in running an activity and recording actual participation.

Proposed behavior:

- Provide authorized staff a roster with roles, readiness and attendance, plus a
  printable version for use on site.
- Support staff-assisted check-in/out, late arrivals, early departures and no-shows.
- Handle walk-ins through capacity and eligibility checks before assigning places;
  record who authorized participation without bypassing required prerequisites.
- Provide a phone-friendly day-of view with occurrence time zone, on-site lead,
  arrival instructions, role vacancies and restricted practical accommodation notes.
- Keep not-yet-arrived, checked-in, checked-out, no-show and canceled states distinct;
  missing checkout is unresolved evidence, not an automatic full-shift duration.
- Record breaks and role transfers without duplicating attendance or exceeding role
  capacity; review readiness for the new role before confirming a transfer.
- Show unresolved issues and responsibility at closeout; route support and incidents
  to their own records rather than placing confidential details on the roster.
- Keep check-in evidence and actual time separate from approved service hours.
- Follow the [proposed day-of workflow](day-of-workflow.md) for preparation, arrivals,
  assisted entry, changes, connectivity interruptions and reconciliation.
- Define specific check-in interfaces, QR support and disconnected operation before
  implementation; QR and automatic time tracking are not selected by this scope.

### Attendance corrections

Allow authorized coordinators to correct attendance and actual service time.

Proposed behavior:

- Distinguish scheduled, attended, absent and canceled records; retain actual time
  separately from planned shift duration.
- Record the previous value, new value, reason, editor and time for corrections.
- Recalculate affected totals and preserve the distinction between submitted and
  approved service hours.
- Define review/reopening behavior for already approved records and issued service
  statements before implementation.

### Hour submissions

Let volunteers review and submit their actual service time for coordinator review.

Proposed behavior:

- Associate submissions with the relevant activity, shift occurrence and volunteer.
- Show recorded time for review and accept an explanation for missing or incorrect
  time; do not convert scheduled duration into approved hours automatically.
- Distinguish draft, submitted and reviewed records and prevent duplicate counting
  when a volunteer revises or resubmits a record.
- Keep submitted hours separate from approved totals.

### Coordinator approval

Allow authorized coordinators to review service-hour submissions and approve the
time that counts toward a volunteer's approved service record.

Proposed behavior:

- Provide a review queue with the submission and relevant attendance information.
- Approve time, request clarification or record an explained adjustment.
- Record who reviewed the submission, when and the decision; make the outcome and
  any adjustment explanation visible to the volunteer.
- Define reviewer permissions, rejection/withdrawal states and reopening rules
  during detailed planning. Revised hours require a recorded review decision
  before changing approved totals.

### Correction requests

Let volunteers request corrections to attendance or service time, including records
that have already been reviewed.

Proposed behavior:

- Link a request to the existing record, with the requested change and explanation.
- Show whether the request awaits review, needs clarification or has been resolved.
- Allow authorized coordinators to accept or decline with an explanation; preserve
  the request and resulting attendance correction or approval decision.
- Do not let a pending request silently replace approved hours or create a second
  counted service record.

### Service history

Give volunteers a personal history of activities, participation and service hours.

Proposed behavior:

- Show activities and dates with the recorded, submitted and approved time clearly
  distinguished; show approved totals separately from pending submissions.
- Provide access to review explanations, correction requests and amended records.
- Keep upcoming commitments distinct from completed service and restrict access
  to the relevant volunteer and authorized organization staff.
- Downloadable service verification statements remain a separate proposal.

## 06 Communications and recognition

Keep people informed and acknowledge their approved contributions.

### Email notifications

Deliver operational information and actions by email alongside calendar invitations.

Proposed behavior:

- Send confirmations, reminders, cancellations, waitlist/replacement offers and
  clarification or review updates to the appropriate recipients.
- Distinguish queued, provider-accepted, delivered where reported, bounced and failed
  messages; surface delivery problems without treating an email as read or acted on.
- Prevent duplicate sends when actions retry and avoid sending obsolete reminders
  for canceled or changed assignments.
- Manage applicable preferences and opt-outs while distinguishing operational
  messages from optional marketing; define delivery schedules and templates.
- Select provider and sender verification separately. Custom-domain DNS automation,
  shared inboxes and SMS are not included by adding email notifications.

### Calendar invitations

Help volunteers receive event and shift invitations in their phone's native
calendar through their calendar account.

Proposed behavior:

- Send calendar invitations for confirmed shifts with time zone, location,
  instructions and an opportunity link.
- Update or cancel the same calendar event without creating duplicates.
- Keep calendar RSVP, Ovelle signup and verified attendance as separate records.
- Offer a private subscription to a volunteer's shifts and a downloadable event
  fallback. Calendar clients control subscription refresh and invitation display.
- Avoid requiring access to the volunteer's full personal calendar for invitations.

Reference: [Google Calendar invitations](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events).

### Simple recognition tools

Help nonprofits acknowledge volunteer contributions through thank-you messages and
service milestones.

Proposed behavior:

- Let authorized staff send individual or appropriately scoped group appreciation
  messages through the existing email notification capability.
- Recognize milestones based on approved service hours or clearly defined tenure;
  do not treat pending or imported unverified hours as approved service.
- Keep appreciation preferences and any public recognition consent explicit; avoid
  exposing private participation details in group messages.
- Track recognition sent and prevent duplicate milestone messages on retries;
  define handling of later hour corrections and repeat milestones.
- Decide milestone thresholds, templates and manual versus automatic recognition
  during detailed planning. Public leaderboards, competitive rankings, rewards
  programs and downloadable verification statements remain outside this addition.

## 07 Donations and donor service

Receive donations and let donors manage their giving.

### Donations and payments

Let nonprofits receive donations and other payments and associate them with their
programs and supporters.

Proposed behavior:

- Connect each nonprofit's own payment account; evaluate Stripe Connect and
  provider onboarding before selecting the integration.
- Support one-time and recurring donations and program/campaign designation.
- Keep donations distinct from other payments, pledges, fees, refunds and net
  proceeds. A pledge is not received money.
- Track pending, successful, failed, refunded and disputed transactions using
  verified provider events with duplicate-event protection.
- Use provider payment collection; retain transaction references rather than raw
  card details in Ovelle.
- Provide payment confirmations. Any charitable acknowledgment wording and
  eligibility must be separately established before issuing tax-related documents.

References: [Stripe Connect direct charges](https://docs.stripe.com/connect/direct-charges),
[Checkout](https://docs.stripe.com/payments/checkout),
[webhooks](https://docs.stripe.com/webhooks).

### Donor self-service

Let donors securely access and manage their giving without requiring a volunteer
profile or coordinator assistance for routine supported actions.

Proposed behavior:

- Authenticate access to the donor's own records through verified sign-in or a
  secure management link; payment confirmation alone does not grant account access.
- Show active recurring commitments, next scheduled payments and payment issues.
- Provide secure payment-method management through the selected provider and a
  way to contact the nonprofit about mistakes or refund requests.
- Keep donor identity separate from volunteer participation, while permitting a
  person to hold both relationships without exposing unrelated records.
- Define account linking, recovery and initial donation without a password during
  detailed planning. Access remains scoped to the appropriate nonprofit and donor.

### Recurring donation controls

Let donors manage future donations with clear terms and effective dates.

Proposed behavior:

- Show amount, currency, frequency, current status and next scheduled charge.
- Support cancellation of future giving and evaluate amount changes, payment-method
  updates and pause/resume controls against the chosen provider's capabilities.
- Explain when changes take effect, which commitments they affect and any scheduled
  retry. Cancellation does not automatically refund past payments.
- Confirm provider-applied changes and reconcile verified events rather than
  displaying a requested change as completed before confirmation.
- Avoid duplicate commitments when a donor updates a failed payment method or
  retries an action. Define cancellation/retry timing and pause behavior before
  implementation.

### Donation history

Give donors a private history of their donations and payment outcomes.

Proposed behavior:

- Show individual transactions with date, amount, currency, nonprofit and applicable
  campaign/program; distinguish pending, successful, failed, refunded and disputed
  transactions.
- Keep recurring commitments separate from their individual payments; do not count
  future scheduled charges or pledges as received donations.
- Reflect partial/full refunds and corrections without counting duplicate provider
  events as additional donations.
- Provide access to available payment confirmations. Downloadable documents and
  charitable acknowledgments require separate scope, wording and eligibility
  decisions; do not describe every payment confirmation as a tax receipt.

## 08 Documents and data operations

Protect documents, bring in records, report results and recover data.

### Document storage and signatures

Store nonprofit documents and collect signed authorizations, waivers and consent
forms linked to the relevant volunteer or program.

Proposed behavior:

- Keep documents private with organization and role-based access controls.
- Preserve the exact document version, signed copy, signer identity,
  authentication method, consent and signing time.
- Preserve a document fingerprint and audit history to help detect changes.
- Create new versions for corrections; preserve signed originals and record
  replacement or revocation separately.
- Evaluate private R2 storage with retention locks. Locks protect against overwrite
  and deletion while configured; privileged administrators can remove R2 lock
  rules. Do not describe that as an absolute immutability guarantee.
- Decide retention periods, deletion handling, signer verification and any
  guardian-signing requirements before implementation. Protected storage alone
  does not establish signature validity.

Reference: [Cloudflare R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

### Imports

Help organizations bring existing volunteer and service records into Ovelle.

Proposed behavior:

- Preview spreadsheet imports, map columns and validate rows before applying them.
- Identify possible duplicate people for staff review; do not merge identities
  solely because names match or grant staff permissions through imported fields.
- Preserve source and review status for historical hours; do not automatically
  label imported hours as verified or send invitations without a deliberate action.
- Record import batches, errors and outcomes; make retries avoid duplicate records.
- Define supported formats, record types, conflict resolution and reversal behavior
  before implementation. Imports are not a substitute for complete backup restores.

### Reporting

Let authorized users review and export operational records with clear definitions.

Proposed behavior:

- Filter participation, attendance and approved service hours by date, program,
  location and group, within the user's access scope.
- Keep scheduled time, submitted hours and approved hours separate; define unique
  volunteer counts and no-show denominators explicitly.
- Keep received donations, pledges, fees, refunds and program outcome units distinct.
- Provide usable exports and show the filters, reporting period and generation time.
- Reflect attendance/hour corrections consistently and restrict private information
  in exports. Define report customization and metrics before implementation.
- Develop program-impact collection using the [proposed impact-data workflow](impact-data-workflow.md):
  define measures, capture activity results, review evidence and aggregate accepted
  records with explicit units, coverage and correction history.
- Treat this collection design as proposed detail supporting reporting, not a fourth
  newly confirmed feature area. Dedicated surveys, beneficiary case management and
  service verification statements remain separate scope decisions.

### Backup and recovery

Protect organization records and support recovery from data loss or mistakes.

Proposed behavior:

- Provide authorized organization backups/exports covering related records and
  required private documents with format/version and integrity information.
- Define protected storage, retention, access and a recovery process; keep secrets
  out of portable backups and private exports out of public storage.
- Preview restore scope and conflicts, preserve a recovery point before replacement,
  and verify restored relationships and document references in recovery exercises.
- Do not replay old emails, payments or invitations as side effects of a restore;
  reconcile external provider state rather than treating a backup as authoritative
  for subsequent payments or canceled recurring donations.
- Define backup frequency, offline backup availability, recovery targets and handling
  of retained/deleted records before implementation. Backup scope does not establish
  offline app operation or bidirectional synchronization.

## Additional service ideas — not approved

| Service | Potential nonprofit workflow |
| --- | --- |
| Website and signup embeds | Embed opportunities and application forms on the nonprofit's existing website; offer a branded portal. Opportunity publishing is confirmed above; embedding and custom-domain hosting remain proposals. |
| Additional check-in and service records | Evaluate QR check-in and downloadable service verification statements. Staff-assisted day-of attendance and attendance corrections are confirmed above. |
| Equipment and room scheduling | Reserve equipment, supplies and spaces alongside shifts; record checkout and return. |
| Shared inbox | Assign volunteer inquiries to coordinators and attach conversations to relevant records. |
| Accounting connection | Export or synchronize appropriately mapped payments, refunds and fees with the nonprofit's accounting system. |
| Surveys and outcome collection | Program-impact collection now has a detailed proposal linked from reporting. Dedicated surveys, longitudinal outcome studies and beneficiary case management remain separately proposed; configurable onboarding forms do not establish these capabilities. |
| File-storage connections | Export authorized copies to the nonprofit's existing storage without treating editable copies as protected signed originals. |

These ideas need separate scope decisions. No provider connection, implementation
or deployment is authorized or completed by listing them here.

See the [coordinator workflow](coordinator-workflow.md),
[volunteer workflow](volunteer-workflow.md),
[group leader workflow](group-leader-workflow.md),
[nonprofit admin workflow](nonprofit-admin-workflow.md) and
[donor workflow](donor-workflow.md) for how confirmed features could work together.
Their additional interface and automation details remain proposals. See also the
[day-of workflow](day-of-workflow.md) and [impact-data workflow](impact-data-workflow.md)
for the October 18 planning expansion.

## Excluded services

- SMS messaging is excluded from the current plan because of the production
  restrictions and onboarding burden identified by the user on October 17, 2026.
  Prefer email and calendar notifications; revisit SMS only if explicitly reopened.
