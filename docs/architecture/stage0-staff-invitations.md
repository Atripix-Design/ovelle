# Internal staff invitation lifecycle

October 23, 2026. This implements the invitation services from Task 7 of the
[identity/access plan](../superpowers/plans/2026-10-19-stage-0-identity-access.md)
and the pending/accepted/expired/revoked behavior proposed under
[coordinator invitations and permissions](../feature-list.md#coordinator-invitations-and-permissions).
It does not expose public staff routes or enable live invitation delivery. Recovery,
HTTP composition, native/UI integration and controlled rollout remain unfinished.
The roadmap's recovery gate still applies before public signup or invitations.

## Authority and state

Creating an invitation commits a pending offer, immutable grants, minimal audit and
an idempotency receipt in one guarded D1 batch. It creates no membership. Invitations
expire after 72 hours. Resend is an explicit versioned command that rotates the token
and expiry only for a still-pending, unexpired invitation. Revoked/expired invitations
require a new reviewed offer. Preview reads never consume the invitation.

An admin can offer a coordinator only actions/scopes covered by complete current
grants. Independent program/location grants cannot be combined into broader access.
Administrator invitations and offers to former administrators require the owner
with passkey evidence less than five minutes old. Coordinator presets admit only
program/location read/manage actions in this increment; private-document, finance,
scheduling and other domain actions require future explicit contracts.

Acceptance requires the intended verified account; administrators require passkey
assurance. A final transactional guard rechecks current recipient authentication,
federation policy, issuer security epoch, membership, ownership and complete offered
grant coverage. Disabled credentials, archived scopes and invalid federation evidence
invalidate authority. Ordinary issuer logout or 12-hour session expiry does not
shorten a 72-hour invitation: its recorded issuer session is durable provenance,
not a reusable request credential. Security invalidation and staff revocation still
invalidate the offer. Explicit resend records the current reviewing issuer.

Acceptance atomically consumes the token, activates one membership, replaces old
grants on an explicitly revoked membership and records audit/receipt. Active members
cannot acquire extra grants through invitations. Acceptance/revoke/resend races have
one valid ordering. A repeated same-key command returns its past result only after
current authorization; it does not repeat delivery or membership writes.

## Delivery, reads and admission

Only token digests enter D1. Raw secrets exist transiently in mail URLs using a
fragment. Mail is sent after commit, with shared email/IP budgets consumed before
sending. Acceptance uses the shared attempt reservation/settlement budgets. Callers
must supply the trusted edge IP and server budget key, never request JSON values.
Public HTTP origin/CSRF/method/admission composition remains future work.

Mail failure never activates membership. Delivery is tracked separately from the
invitation lifecycle, with a version/digest guard preventing an old callback from
overwriting a newer resend. Receipts record the committed pending delivery snapshot;
a staff-authorized detail/list read reports the latest outcome. A lost send requires
deliberate resend rather than automatic replay. Provider acceptance is not proof of
inbox delivery. Lists are bounded to the latest 100 invitations; pagination remains
an API design decision. Tokens and issuer session identifiers are never returned.

Migration `0010_staff_invitations.sql` adds sealed invitation offers and extends
append-only audit/receipt action sets while retaining existing records. Shared
receipt infrastructure moved from organization commands to `stage0/commands.ts`;
existing organization behavior is covered by the full backend regression suite.

## Verification boundaries

Local Workers/D1 tests cover intended-account and passkey acceptance, delegation,
current authority changes inside final batches, expiry, reactivation, failed and
late delivery, shared send quotas, immutable offers and lifecycle races. A populated
migration test verifies sessions, receipts, audit, existing commands and foreign keys.
Fixtures issue synthetic sessions and use fixture mail; they do not demonstrate a
real provider login or real email. Preview service tests are not HTTP GET evidence.
