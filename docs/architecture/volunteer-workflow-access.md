# Volunteer workflow access (local implementation)

Workflow permissions are separate from general program access. The organization
owner, using a recent passkey session, can replace another active member's
workflow grants for explicit program/location pairs. Each pair must already be
covered by that member's `program.read` grant. A workflow grant never broadens
that underlying scope, and each request rechecks the live session and membership.
Only the owner or the member themselves can read the member's workflow grants.
`people.read` permits the scoped minimal directory; `people.create` is a separate
permission and does not itself grant directory access. Directory search submits
the search text in a request body, not the URL; results remain scoped and paged.
The current SQLite case-insensitive matching covers ASCII letters; full Unicode
case folding is not yet provided.

Grant replacement uses the membership version for conflict detection, records an
immutable audit event, and rechecks authority in the same transaction as the
change. **Any membership version change clears all workflow grants.** This
includes changing ordinary grants, revocation, role changes, and reinvitation;
workflow access must then be deliberately granted again. This conservative rule
prevents previously revoked responsibilities from silently returning.

The grant endpoint and its tests are local implementation evidence. The staff
management interface, hosted rollout, provider sign-in and installed desktop
behavior have not been verified by these checks.

On November 19, a read-only check of the owning Cloudflare account confirmed the
development D1 database has migrations 0001–0016, no `volunteer_%` tables and
no accounts. Development Worker settings list the expected identity and
Turnstile binding names, and its database has enabled Google and Microsoft
connection records; this does not verify their values or provider login. Live
requests to the native identity and desktop handoff routes still returned 404.
The local volunteer migration 0017 has not been applied. No production state,
remote schema, bindings or data were changed by this check.

A known volunteer can be registered and checked in as a walk-in in one
transaction. Both assignment and attendance permissions are required, and the
existing readiness, capacity, overlapping-shift and held-seat checks apply.
This does not create a person or bypass a missing readiness decision; staff must
resolve those steps first. The operation is available to the local desktop bridge
but is not yet exposed by a designed page or deployed service.

Hours reviewers may record a response received outside Ovelle after requesting
clarification. The record identifies it as `staff_recorded`; it does not assert
that Ovelle sent a message or that the volunteer used self-service. Recording it
returns the submission to pending review, and a later review must name the
current clarification decision so a stale review cannot silently approve it.
A scoped reviewer can inspect the decision and response history. Volunteer
self-service, message delivery and notifying the volunteer of the final decision
remain unimplemented.
