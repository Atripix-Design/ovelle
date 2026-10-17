# Ovelle feature list

Ovelle is a nonprofit volunteer-management CRM. This document records feature
planning, not implemented capabilities. Features below were confirmed for the
list on October 17, 2026; detailed behavior, providers, implementation order and
rubric mapping still require planning. This is an incremental list, not a complete
inventory of Ovelle requirements.

## Confirmed additions

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

### Role requirements

Define what a volunteer needs to perform a particular role.

Proposed behavior:

- Set role-specific skills, training, documents and coordinator approvals.
- Evaluate requirements for the date of service, including applicable expirations.
- Show missing requirements and distinguish pending review from approved readiness.
- Keep requirement configuration separate from volunteer evidence and assignment.

### Recurring shifts

Schedule repeated activities and ongoing volunteer commitments.

Proposed behavior:

- Define a series with a time zone, recurrence and role capacities.
- Keep individual occurrences addressable for assignments, attendance and changes.
- Support an absence, cancellation or time change for one occurrence without
  removing the series or rewriting past attendance.
- Clearly scope edits to one occurrence or future occurrences and handle calendar
  updates consistently. Detailed recurrence rules remain to be designed.

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

## Additional service ideas — not approved

| Service | Potential nonprofit workflow |
| --- | --- |
| Website and signup embeds | Publish opportunities and application forms on the nonprofit's existing website; offer a branded volunteer portal. |
| Email communications | Send reminders, cancellation alerts and waitlist offers; retain communication preferences and opt-outs. Complement these with calendar invitations and updates. |
| Check-in and service records | Support QR or staff-assisted check-in and coordinator-approved service-hour statements. Attendance corrections are confirmed above; specific check-in methods and statements remain proposals. |
| Equipment and room scheduling | Reserve equipment, supplies and spaces alongside shifts; record checkout and return. |
| Shared inbox | Assign volunteer inquiries to coordinators and attach conversations to relevant records. |
| Accounting connection | Export or synchronize appropriately mapped payments, refunds and fees with the nonprofit's accounting system. |
| Surveys and impact reporting | Collect post-event feedback and program-specific outcomes for board and funder reports. |
| File-storage connections | Export authorized copies to the nonprofit's existing storage without treating editable copies as protected signed originals. |

These ideas need separate scope decisions. No provider connection, implementation
or deployment is authorized or completed by listing them here.

See the [proposed coordinator workflow](coordinator-workflow.md) for how confirmed
features could work together and the [volunteer workflow](volunteer-workflow.md)
for the path from signup to approved hours. Their additional interface and automation details are
proposals rather than newly approved scope.

## Excluded services

- SMS messaging is excluded from the current plan because of the production
  restrictions and onboarding burden identified by the user on October 17, 2026.
  Prefer email and calendar notifications; revisit SMS only if explicitly reopened.
