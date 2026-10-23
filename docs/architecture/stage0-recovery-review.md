# Stage 0 operator recovery review

October 23, 2026. Review contract only; this does not authorize a reset or provide
an executable recovery path. It records the unresolved Task 4/8 acceptance work
from the [identity/access design](../superpowers/specs/2026-10-19-stage-0-identity-access-design.md).
Public authentication and staff invitation routing remain disabled.

## Implemented issuance and rotation

The internal account service `auth/recovery.ts` and browser adapter
`auth/recovery-routes.ts` implement the planned code issuance/rotation boundary.
Migration `0013_recovery_codes.sql` retains one current set per account with at
most eight positions and an account-bound, domain-separated SHA-256 digest for
each 32-byte random code. Plaintext codes appear only in the successful rotation
response; they are never stored in D1, audit, command receipts or mail.

`GET /api/v1/auth/recovery/codes` returns only `{ version, remaining, rotatedAt }`
for the current verified, non-enrollment account. It cannot recover plaintext.
`POST` requires the same account's browser cookie, exact origin, session CSRF,
JSON `{ expectedVersion, confirmation: true }`, and database-owned assurance from
an existing passkey verified strictly within the last five minutes. A caller's
principal fields cannot elevate that proof. The adapter accepts no account ID,
query parameters, bearer mixing or unknown body fields; responses are no-store
and expose no CORS permission. Both routes remain disconnected from the public
Worker, as do other internal identity adapters.

Initial issuance uses version 0. Rotation requires the current version and
atomically removes the entire old set, increments the generation, inserts eight
new digests and appends `recovery.rotate` without secret details. The final SQL
batch rechecks the live source session, account security epoch, bound active
passkey and federated provider evidence plus recency. A losing concurrent request
or stale version fails without returning secrets. An audit failure rolls back
all set changes. Existing sessions, keys, organizations, grants and SSO policies
remain active: issuing codes is not account recovery or global revocation.

There is no idempotent plaintext replay. If the response is lost, read status,
then explicitly rotate using its current version; the earlier codes stop being
current. This is an account-level operation and does not derive privilege from
an organization role. It does not add a local password to a federated account.

## Implemented and missing

Session/global revocation, security epochs and live organization authorization are
implemented and tested internally. Staff revocation and two-party ownership
succession now have guarded services. Neither is lost-factor account recovery.

The proposed recovery contract requires eight high-entropy one-use codes shown
once, digest-only storage, recent existing-passkey authorization for issuance,
and password plus a consumed code to enter replacement enrollment only. Password
recovery must revoke sessions and pending desktop exchanges without removing
passkeys or granting staff assurance. Email-only removal of an existing passkey is
forbidden. Code issuance/rotation is implemented as described above; code consumption, reset,
replacement enrollment and their recovery demonstration remain unimplemented.
The password runtime decision remains pending; do not weaken the KDF to clear it.
The desktop exchange backend is now implemented and requires its exact source
session, account security epoch, provider and passkey to remain live until atomic
consumption. Recovery-specific invalidation still needs a real recovery service
and demonstration; do not rebuild the handoff because of older planning text.

The earlier password-plus-code recovery draft must be reconciled with the later
confirmed direct-provider direction and optional local credentials. Password
runtime approval is still missing. A fresh linked-provider sign-in plus a code
would change that contract and requires an explicit decision; it is not silently
substituted here. No code-consumption endpoint, email-only recovery or operator
bypass is introduced by issuance. Codes are not currently accepted for sign-in.

Local Workers/D1 tests cover independent returned-code/digest correspondence,
concurrent issuance/rotation, stale versions, proof expiry, forged principal
assurance, unbound/enrollment sessions, final-batch session/account/key/security-
epoch revocation, safe own-account status, SAML provenance/provider revocation,
audit rollback, bounded immutable schema and a populated migration. HTTP tests
cover explicit confirmation, cookie/origin/CSRF, unknown fields, body limits,
closed errors and absence of consumption/reset routes. These are local backend
evidence; they do not establish real recovery, provider acceptance or rollout.

## Before a live pilot

Approve the recovery decision, identity-check evidence, authorized reviewers and
escalation authority before enabling a pilot. All-factor loss must stop at review;
there is no support bypass, alternate admin endpoint or authorized raw SQL reset.
An email address, domain, nonprofit name or existing organization creation alone
is insufficient to establish recovery authority.

A review record should contain the request identifier, affected account and
organization identifiers, claimed issue, evidence references, reviewer decision
and reason, conflicts of interest and approved next steps. Keep evidence private
and collect only what the approved policy requires; never include passwords,
raw recovery codes, tokens or authentication URLs. Retention/access rules and
reviewer independence remain policy decisions requiring approval.

Before authorizing any future recovery action, verify the proposed effect on every
organization, sessions, pending exchanges and passkeys. Record what remains active,
including an old owner's administrator membership after ordinary ownership
transfer. Require explicit acceptance where the approved workflow requires it.
A review record alone must not alter account or organization authority.

After implementation, demonstrate one-use code races, expired/wrong-account
rejection, enrollment-only access, session/exchange invalidation, provider-policy
preservation and atomic audit/rollback. Independently read back the resulting
state and protected-access denial before recording completion. A failed or unclear
outcome remains unresolved; do not retry a destructive action blindly.
