# Stage 0 accounts, organizations and permissions — proposed design

October 19, 2026. Draft for review, grounded in the [build priorities](../../build-priorities.md),
[confirmed feature scope](../../feature-list.md) and [desktop assistant RFC](../../architecture/desktop-assistant-design.md).
This specifies the first Stage 0 increment. It does not approve its engineering
defaults, provision providers or establish that Stage 0 is complete.

## Shared backend implementation update

The user approved a backend-only shared account/identity schema, sessions and
organization permissions with enterprise security and RLS-style access. See the
[scoped implementation plan](../plans/2026-10-22-shared-auth-backend.md) and
[implemented boundary](../../architecture/stage0-shared-backend.md). This covers
parts of Tasks 2, 3 and 5; it does not complete the original Stage 0 increment.
The latest confirmed provider scope is Google/Microsoft consumer and business
OIDC plus enterprise SAML, without a broker. Earlier enterprise-OIDC-only wording
below is historical and superseded. No public login routes or remote migrations.

## October 22 execution update

Task 1 local runtime/configuration code and tests are implemented. See [runtime evidence](../../architecture/stage0-runtime-evidence.md)
for exact versions and hosted measurements. PBKDF2 600k is rejected by the hosted
iteration cap; measured Argon2id CPU exceeds the free allowance. No production KDF
has been frozen and live authentication remains disabled. Under the free-first
constraint, continue with direct OIDC and optional local credentials; password
routes remain gated.

The user approved direct OIDC for Google, Microsoft and tenant-specific Microsoft
Entra ID, without a broker or new paid authentication service. A synthetic isolated
hosted KDF probe is authorized, without a plan upgrade.
See the [federated-login exploration](../../architecture/stage0-federated-login.md).
The password-first recommendation and provider exclusion below are the original
proposal, superseded by this direct OIDC direction. Revise the identity/session
schema before Task 2; do not implement the draft's
password-only assumptions unchanged.

## October 23 approved sign-in and recovery decision

The user confirmed Google/Microsoft sign-in plus passkeys for the initial release,
with lost-passkey recovery requiring fresh linked-provider sign-in **and** a
one-use recovery code. Local passwords/reset are deferred pending runtime/KDF
approval. The historical password-first/password-plus-code language below is
superseded for this release; enterprise SAML and organization-required SSO remain
in scope. Recovery never creates or links an account by email and grants only
replacement enrollment until a new user-verified passkey commits. Sessions and
pending desktop exchanges are invalidated, old keys are disabled on successful
replacement, and organization authority is preserved. The [recovery contract](../../architecture/stage0-recovery-review.md)
records exact internal transitions, tests and separate live rollout requirements.
This decision does not enable public authentication or authorize remote migrations.

## Outcome and boundary

A staff member can establish a verified Ovelle account, sign in, create an
organization, configure programs/locations, invite another staff member with
bounded responsibilities, and revoke that access. The same person can belong to
two organizations with different permissions. Browser and Electron use the same
server authorization and records.

Include account verification, login, recovery, sessions, organization ownership,
staff invitations, program/location scopes, audit and explicit operating defaults.
Volunteer/donor login experiences, volunteer record management, signed documents,
full policy editors and backup/restore tooling are subsequent increments. Their
permissions must default to denial until separately implemented. Under-18 volunteer
support remains in product scope; this increment's staff account flow does not
resolve guardian consent or authorize enrolling minors.

## Current source baseline

Reviewed at `0146c02`, October 19, 2026:

| Source | Observed behavior | Implication |
| --- | --- | --- |
| `src/cloudflare/worker.ts` | Download email/catalog/files and a D1 health query; other API routes return 404. | No existing CRM authentication or tenant middleware to extend. Keep downloads working. |
| `migrations/0001_download_email_limits.sql` | Download email quota table. | Add new migrations; do not replace or repurpose this table. |
| `wrangler.jsonc` | Per-environment D1/R2; development Worker-first API paths; development download-email binding. | Match application API routing in both environments; no auth email/provider configuration is established. |
| `apps/web/src/App.tsx` | Home and component preview selection. | Add app/auth routing without displacing the public site. |
| `apps/desktop/src/main/index.ts`, `preload/index.ts` | Sandboxed renderer and narrow download IPC. | Add a main-process account lifecycle; never expose credentials through preload. |
| `infra/README.md` | Wrangler ownership; manual D1 migrations and recovery references. | Preserve this workflow; do not add Terraform or automatic remote migrations. |

This is local source evidence, not a deployed/provider-state verification.

## Proposed account and sign-in decisions

Recommend app-owned D1 identity, verified email and password for initial staff
accounts, followed by required passkey enrollment for owners/admins. A verified
password-only session may enroll its first passkey only while the account has no
enrolled passkey. Once a passkey exists, adding/removing credentials or issuing
recovery codes requires a recent existing-passkey confirmation; password plus a
consumed recovery code permits replacement enrollment only. A password-only session
cannot create an organization or accept an owner/admin role until passkey enrollment
and verification complete. An invited coordinator needs a verified account and may use a passkey;
owner/admin operations require passkey authentication. Public account creation
never grants an organization role. Later volunteer magic-link access must not
satisfy staff authentication or create membership.

Use audited password/WebAuthn implementations, not handwritten verification.
Proposed password policy: 15–128 Unicode code points, no silent truncation or
composition rules, unique random salts and versioned stored hashes. The first
implementation task must select and benchmark an audited Worker-compatible KDF.
Evaluate Argon2id at OWASP's published minimum or PBKDF2-HMAC-SHA256 at 600,000
iterations, with at least a 16-byte salt and 32-byte derived value for PBKDF2.
Do not copy the older authentication blueprint's lower iteration default or assume
a Workers runtime can execute the chosen settings. Compatibility, cost and CPU
headroom must be evidenced before locking the choice; do not silently weaken it.
[OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Verification/password-reset links expire after 15 minutes and are single-use.
Opening a GET link shows a confirmation screen; only an explicit POST consumes it,
so email prefetching cannot verify or reset an account. Store SHA-256 digests of
high-entropy bearer secrets, not raw tokens. Hashing random tokens is distinct
from password hashing. Do not log tokens, passwords, codes or complete email URLs.
Propose Resend for authentication mail behind `AuthMailer`; provider/sender
selection and verified delivery remain implementation decisions. Existing download
email is a separate service and must not become evidence of auth-email readiness.

Owner/admin enrollment produces eight one-use recovery codes (32 random bytes each,
hashed in D1), shown once for offline storage. Password recovery revokes all sessions
and pending desktop exchanges; it never removes passkeys or grants staff assurance.
Lost-passkey recovery requires password plus a recovery code and yields only an
enrollment session until a new passkey is verified. There is no email-only removal
of an administrator's passkey and no hidden support bypass. If all factors are lost,
stop at a documented operator review process whose identity checks must be approved
before a live pilot; the implementation must not invent a reset authority.

Proposed server defaults: 12-hour absolute sessions without refresh tokens; 5-minute
WebAuthn challenges; 5-minute recent passkey authentication for ownership transfer
and administrator privilege changes; 72-hour staff invitations. Resend invalidates
an earlier token. Persist auth throttles; start with five failed password/challenge
attempts per account/IP pair per 15 minutes, plus an IP-wide ceiling of 30 failures
per 15 minutes and five verification/reset sends per email and IP per hour.
Return generic account-start/recovery acknowledgments and never an account-existence
flag. Configure Turnstile before hosted live auth is enabled; local test bypasses
are explicit fixtures, not deployable fallback credentials.

## Identity, membership and grants

An `Account` is a login identity, not a volunteer record, donor or global admin.
An `OrganizationMembership` is a staff relationship inside one organization.
Membership rows are unique on `(organization_id, account_id)` and are active or
revoked. Reinviting a revoked person is a new reviewed transition, not automatic
restoration of old grants. Email identity is trimmed/lowercased consistently for
lookup without stripping plus tags or provider-specific dots; never merge people
by display name. Email-address changes/account deletion need later explicit flows.

Each organization has exactly one `owner_account_id`, referencing an account with
an active membership. Ownership is derived from that field, not a second editable
owner role flag. Ordinary memberships have an `admin` or `coordinator` preset;
materialized action grants carry scope. Presets are templates, not client authority.
Creation writes organization, owner membership, baseline policy and audit together.
A retry with the same actor/key/body returns the same organization; reuse with a
different body is a conflict.

| Stage 0 action | Owner | Organization admin | Coordinator |
| --- | --- | --- | --- |
| Read organization | Yes | Yes | Active membership only |
| Edit organization / manage programs and locations | Yes | Yes | Explicit program/location grants only; no organization edits |
| Read staff directory | Yes | Yes | Own membership only initially |
| Invite/change/revoke coordinators | Yes | Yes, within current delegated actions/scopes | No |
| Invite/change/revoke administrators | Recent passkey required | No | No |
| Transfer ownership | Recent passkey required, target accepts | No | No |
| Read access-management audit | Yes | Explicit organization-level grant | No |
| Private volunteer documents, incidents or finance | Separate future permissions | Separate future permissions | Separate future permissions |

Initial action vocabulary: `organization.read`, `organization.update`,
`program.read`, `program.manage`, `location.read`, `location.manage`, `staff.read`,
`staff.manage_coordinators`, `staff.manage_admins`, `audit.read`, `ownership.transfer`.
Only ownership-derived authority permits `staff.manage_admins` and
`ownership.transfer`; `audit.read` can be delegated as shown. Unknown
actions deny. Do not issue grants for not-yet-implemented private domains.

A scoped grant is one action and one organization plus an optional program/location
intersection. Within a grant all supplied scope dimensions must match; across grants
any matching complete grant may allow. Do not independently union program IDs and
location IDs into unintended combinations. Organization-level scope is explicit,
not an empty/missing client field. Cross-organization scope references are invalid.
Admins cannot delegate an action or scope beyond their current authority, edit
themselves into greater authority, or alter an owner/admin target indirectly.

Every request resolves live account, session, membership and grants in D1. A selected
organization, hidden button, IPC message or cached capability list is not authority.
Recheck authorization, expected version and target scope inside the mutation's
atomic database operation. A standalone JavaScript read followed by an unguarded
write is insufficient under concurrent revocation. Use D1 batches with guarded SQL
and database constraints; zero affected rows alone do not abort a batch. Tests must
prove rollback of partial membership/grant/audit writes.
[Cloudflare D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Proposed storage contracts

Use server-generated random text IDs, integer UTC epoch milliseconds and integer
`version` columns for editable domain rows. Domain foreign keys include organization
identity, using composite uniqueness/FKs to reject cross-tenant references.

| Table | Responsibility / key invariants |
| --- | --- |
| `accounts` | Unique normalized email, display name, verified time, enabled state; no global staff role. |
| `password_credentials` | One versioned salted password hash per staff account. |
| `account_tokens` | Digest, account, purpose, expiry, consumed time; verification/reset purposes cannot substitute for each other. |
| `sessions` | Digest, account, web/native transport, assurance, authenticated time, expiry and revocation. Enrollment-only sessions are explicit. |
| `passkeys`, `auth_challenges`, `recovery_codes` | Verified credentials, short-lived purpose/account/session-bound challenges and hashed one-use recovery codes. |
| `auth_limits` | Durable hashed account/IP quota keys and expiry, separate from download quotas. |
| `organizations`, `programs`, `locations` | Owner, immutable creating account, identity, IANA time zone and scoped operational structure; archive rather than silently delete references. |
| `organization_memberships`, `membership_grants` | Unique account/org membership; action and explicit organization/program/location scope; versioned revocation. |
| `staff_invitations`, `invitation_grants` | Recipient email, proposed preset/scopes, inviter, token digest/version, expiry, pending/accepted/revoked/expired state and delivery status. |
| `organization_policies` | Versioned baseline assignment/review rules; effective scope preserved for future domain features. |
| `audit_events` | Actor, organization, action, target, request/command ID, time and redacted change summary; no credentials or confidential future narratives. |
| `ownership_transfer_requests` | Initiating owner, target admin, expected owner version, expiry and accepted/revoked state; at most one successful transition from an owner version. |
| `command_receipts` | Actor/org/command/idempotency key, request digest and safe result; same key/different body conflicts. |
| `desktop_auth_requests` | Digest-bound state and S256 challenge, exact callback, approving account, one-use code digest and expiries. |

The physical schema belongs to the implementation tasks below, not a migration
executed by this planning change. Keep audit records organization-scoped without
forcing an organization ID onto pre-membership account-security events.

## Browser and Electron sessions

Browser: `__Host-ovelle_session` on hosted HTTPS, opaque 32-byte random token,
`HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`. Separate local-development
cookie naming is allowed only in local/test configuration. Require exact trusted
Origin plus a session-bound CSRF token on cookie-authenticated mutations; reject
missing/null/untrusted browser origins rather than accepting an absent header.
Sensitive responses use `Cache-Control: no-store`; never place tokens in storage
accessible to page JavaScript or in third-party analytics.

Native: launch an allowlisted Ovelle HTTPS sign-in page in the system browser.
Use a first-party handoff bound to random state, S256 verifier/challenge and an
exact `http://127.0.0.1:<ephemeral-port>/ovelle-auth/callback` path. The main process
owns the loopback listener and verifier; reject arbitrary callback hosts/paths.
A signed-in user explicitly confirms the desktop request with CSRF protection.
Request expiry is five minutes; the returned one-time code expires after 60 seconds.
Only the main process exchanges it with the verifier for a native opaque session.
This borrows native-app guidance without claiming a third-party OAuth provider or
complete OAuth-server conformance. [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252).

The main process attaches the native token to allowlisted Ovelle API commands.
Preload exposes typed account/org operations, never raw tokens, passwords, arbitrary
fetch URLs, files or SQL. Browser-cookie requests and native bearer requests have
distinct validation paths; a missing Origin is allowed only for a valid native
session, not as a browser-auth bypass. Do not add wildcard CORS for `file:` origins.

Persist a native token only through a supported OS-protected `safeStorage` backend;
otherwise use memory-only sign-in and explain that restart requires authentication.
Never enable plaintext fallback. Test the API available in the pinned Electron
version and the Windows/macOS packages; Linux `basic_text` is not protected storage.
[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Organization, invitation and ownership transitions

An owner completes organization name, contact email, IANA time zone, first program
and first location. Creation establishes draft operating defaults: staff-reviewed
assignment, no eligibility bypass, no automatic service-hour approval. Defaults
remain proposed product choices until reviewed. Creating an organization does not
verify nonprofit identity or payment eligibility. Recovery and transfer must be
available before adding live organizations.

Invitation creation checks actor, target preset and grant bounds, stores a digest
and sends after commit. Track send failure independently of invitation acceptance;
a retry/reissue rotates the token and never activates a membership. Resend must
not revive a revoked invitation. The link preview does not accept anything.
Acceptance requires the intended verified account, valid current token, explicit
POST, and a fresh check of inviter authority and offered grants. Concurrent accept
or accept/revoke attempts have one valid outcome with no duplicate membership.

Revocation changes membership/grants atomically and blocks subsequent org requests
on existing web/native sessions. It does not disable the account in other organizations
or wait for staff handoff. A global credential reset revokes all account sessions.
Deleting/disabling the final owner membership is rejected; normal self-service
account deletion is outside this increment.

Ownership transfer requires an existing active passkey-ready admin target, a
recent owner passkey confirmation and target acceptance with their own recent
passkey confirmation within 15 minutes. Record
the transfer, require current versions and reject old transfer requests if ownership
changes. The old owner becomes an ordinary admin; the explicit review screen states
that they retain admin access until separately revoked. No operator override endpoint
or email-domain-based claim-to-organization flow is introduced.

## API contracts and review decisions

The [implementation plan](../plans/2026-10-19-stage-0-identity-access.md) owns the
exact file/interface/task map. All `/api/v1` routes validate bounded JSON inputs,
return a request ID, and use consistent errors: 401 unauthenticated, 403 forbidden
inside a known authorized organization, 404 inaccessible/missing tenant resources,
409 version/idempotency conflict, 422 invalid input, 429 throttled, 503 dependency
unavailable. Invalid/consumed credential links share one generic response. Domain
mutations require an idempotency key and expected version where a row already exists.

Before executing the plan, review: staff password/passkey enrollment policy; KDF
benchmark result; mail provider/sender; recovery escalation authority; role presets,
scoped delegation and ownership-transfer behavior; baseline operating defaults;
permission to create organizations; and real pilot age/consent requirements.
Recommended initial creation policy is verified, passkey-ready accounts may create
one organization each, enforced against the immutable creating account server-side,
until owner-creation limits are reviewed. Transferring ownership does not reset that
creation allowance.
Neither this limit nor email domain establishes nonprofit verification.

Documents, volunteer records, complete policies and backup/restore remain required
later Stage 0 work. Do not use this increment as evidence that their release gate
has passed. Bind live evidence to the final tested SHA, keep production changes
separate, and retain the existing direct Wrangler infrastructure ownership.
