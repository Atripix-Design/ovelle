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
| Check-in and service records | Support QR or staff-assisted check-in, attendance corrections and coordinator-approved service-hour statements. |
| Equipment and room scheduling | Reserve equipment, supplies and spaces alongside shifts; record checkout and return. |
| Shared inbox | Assign volunteer inquiries to coordinators and attach conversations to relevant records. |
| Accounting connection | Export or synchronize appropriately mapped payments, refunds and fees with the nonprofit's accounting system. |
| Surveys and impact reporting | Collect post-event feedback and program-specific outcomes for board and funder reports. |
| File-storage connections | Export authorized copies to the nonprofit's existing storage without treating editable copies as protected signed originals. |

These ideas need separate scope decisions. No provider connection, implementation
or deployment is authorized or completed by listing them here.

## Excluded services

- SMS messaging is excluded from the current plan because of the production
  restrictions and onboarding burden identified by the user on October 17, 2026.
  Prefer email and calendar notifications; revisit SMS only if explicitly reopened.
