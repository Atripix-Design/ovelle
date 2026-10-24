# Stage 0 provider recovery and operator review

October 23, 2026. Approved recovery decision and internal backend implementation,
with a separate unresolved operator-review policy. It records Task 4/8 acceptance
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

## Approved provider recovery and internal implementation

On October 23 the user approved Google/Microsoft sign-in plus passkeys for the
initial release, and fresh linked-provider sign-in **and** a recovery code for
lost-passkey recovery. This supersedes the earlier password-plus-code draft.
Local password registration/login/reset remains deferred behind the unresolved
KDF/runtime decision; it is not a prerequisite for this approved provider flow.
Enterprise SAML support and required-connection policies remain in scope. No
SAML assertion or email contact confirmation substitutes for the approved pair.

The internal `POST /api/v1/auth/oidc/{google,microsoft}/recovery` start requires
prelogin CSRF, exact Origin, a recovery-specific Turnstile action and the existing
durable provider/IP admission limits. It records a separate `recovery` transaction
purpose, binding state, nonce and S256 PKCE to the initiating browser. The existing
callback claims that transaction once before the signed code exchange. It accepts
only an already linked, live issuer/subject and current connection/client version;
it never creates or links an identity by matching an email address.

Both providers must return signed integer `auth_time`, no earlier than the
transaction's start second, no later than the current second and strictly less
than five minutes old. Missing, future, pre-transaction or expired evidence fails
closed. Microsoft requests `prompt=login` and `max_age=0`; Google requests its
supported account-selection/consent prompts, `max_age=0` and essential `auth_time`.
Google's signed claim may depend on provider settings and does not by itself prove
that a requested prompt was honored. Real provider acceptance, including a user
with an old upstream session, remains mandatory; do not weaken freshness to make
an unsupported provider configuration pass. See the [Google reference](https://developers.google.com/identity/openid-connect/reference)
and [Microsoft OIDC protocol](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc).

The callback sets only an enrollment-assurance browser session and a database-owned
`recovery_provider_proofs` row. Its deadline is five minutes from signed provider
authentication. It cannot register a passkey, read organization data, link identities,
issue recovery codes, approve desktop sign-in or revoke other/all account sessions.
Own-account bootstrap/CSRF and self logout remain available. A normal login/session,
forged principal assurance or caller-selected account is not recovery proof.

`POST /api/v1/auth/recovery/consume` requires that browser session, exact Origin,
session CSRF and bounded JSON `{ code, confirmation: true }`, without queries or
unknown fields. The edge-owned IP and server key apply the existing five-failure
account/IP and thirty-failure IP budgets. The code digest is account-bound and
must belong to the current set. An atomic guard rechecks live source provenance,
account epoch, proof, deadline and code, then deletes that one digest, increments
the security epoch, revokes all account sessions, creates a new enrollment-only
session and `recovery_enrollments` grant, and appends `recovery.consume`. Competing
codes/proofs admit only one recovery transition from the original epoch. Old
browser/native sessions and approved desktop codes immediately fail their existing
live-source checks. Other accounts and organization memberships are unchanged.

The grant can only authorize registration of a new user-verified passkey through
the existing WebAuthn verifier. It cannot extend the provider-proof deadline, be
moved to another session/account, or be upgraded by ordinary session rotation or
passkey step-up. The final registration transaction rechecks live grant, provider,
account and challenge, increments the epoch again, revokes all intervening sessions,
disables every old active passkey, marks the grant complete, inserts the replacement
and its passkey-assurance session, and appends `recovery.complete` plus existing
registration/rotation events. The new session's twelve-hour absolute limit starts
at signed provider authentication. Losing/replayed/expired completions fail.

Old passkeys remain stored and active until verified replacement commits, so an
abandoned or failed ceremony does not delete the user's last usable credential.
The second epoch change also invalidates old-key logins made during replacement.
All success-state changes roll back if audit or another batch statement fails;
the previously claimed WebAuthn challenge remains one-use and must be restarted.
Provider provenance is preserved in the resulting session; required-SAML orgs
still reject Google/Microsoft provenance and require their own SSO sign-in. No
membership, owner, grant, external identity or required-connection policy changes.

Migration `0016_provider_recovery.sql` preserves populated transaction/session/code/
audit state, adds the purpose and two session-bound proof tables with immutable
identity/deadline constraints, and expands the closed audit-action vocabulary.
It is prepared locally, not automatically applied remotely. Internal routes remain
disconnected from the public Worker. Software-signed provider/WebAuthn fixtures
and local workerd/D1 assertions establish internal behavior, not real provider,
inbox, physical-device, hosted-concurrency or public recovery readiness.

Run `npm run test:stage0 -- tests/worker/stage0/provider-recovery.test.ts tests/worker/stage0/provider-recovery-migration.test.ts tests/worker/stage0/oidc-routes.test.ts`
for the signed provider flow, cookie/CSRF/admission, wrong-account/one-use/expiry
checks, native/session/exchange invalidation, final revocation races, replacement
rollback, required-SAML preservation and populated migration. Existing issuance,
rotation, passkey and session suites remain regression requirements.

## Before a live pilot

Approve operator identity-check evidence, authorized reviewers and
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

For live acceptance, demonstrate one-use code races, expired/wrong-account
rejection, enrollment-only access, session/exchange invalidation, provider-policy
preservation and atomic audit/rollback. Independently read back the resulting
state and protected-access denial before recording completion. A failed or unclear
outcome remains unresolved; do not retry a destructive action blindly.
