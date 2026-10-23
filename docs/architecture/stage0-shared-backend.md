# Shared account, session and organization-access backend

October 22, 2026. Implemented as internal services with local Workers/D1 tests.
No login routes, frontend, provider registrations or remote migrations are enabled.
The runtime password gate remains closed. Existing public Worker behavior is unchanged.

October 23 continuation: [HTTP session adapters and durable auth budgets](stage0-http-security.md)
are implemented internally, including reload-safe CSRF bootstrap. They remain
disconnected from the public Worker. The historical scope/evidence below describes
the October 22 foundation; the continuation documents the subsequent work.
[OIDC verification, linking and browser transactions](stage0-oidc-security.md)
now add another internal layer, with [guarded browser routes and contact enrollment](stage0-oidc-http-enrollment.md) composing those services internally. The [passkey continuation](stage0-passkey-security.md) adds verified registration/login and provider-preserving step-up. Public routing, real provider/mail acceptance and hosted migrations remain gated.
The [organization-command continuation](stage0-organization-commands.md) adds
atomic organization setup, recorded proposed defaults, scoped structure changes
and live-authorized retry receipts. The historical foundation notes below do not
describe these later commands. The [staff-invitation continuation](stage0-staff-invitations.md) adds internal pending offers, explicit acceptance and independent delivery. Internal invitation HTTP composition is implemented with public routing disconnected. The [staff-access continuation](stage0-staff-access.md) adds internal grant/role changes, revocation and two-party ownership transfer. [Recovery](stage0-recovery-review.md), public routing, native integration and controlled rollout remain open.

## Confirmed authentication direction

One Ovelle account can eventually use optional email/password credentials, Google
personal/Workspace and Microsoft personal/work/school OIDC identities, and
organization-specific SAML SSO. No broker. This change stores the shared authority;
it does not verify OIDC tokens, SAML XML or WebAuthn assertions. A linked external
identity is unique by connection, exact issuer and exact subject, never by email.
The uniqueness scope preserves provider/client or enterprise connection context.
Pairwise-subject/client migration and account linking still need explicit flows.

## Storage and service boundaries

| Area | Implemented authority |
| --- | --- |
| Accounts | Normalized unique email, display name, verification/disabled state and security epoch. No password required and no global staff role. Creation creates no membership or session. |
| External identities | Exact connection/issuer/subject binding and versioned disabling. No email matching, automatic linking or account reassignment. |
| Connections | Global Google/Microsoft OIDC configuration records and organization-bound SAML records. Changes require a new version; no secrets or fetched metadata are stored by this foundation. |
| Sessions | Random 32-byte bearer and browser CSRF secrets, SHA-256 digests only, browser/desktop binding, 12-hour absolute expiry, provenance and separate assurance evidence. |
| Organizations | One active owner/admin membership created atomically by a database trigger. Creator identity is immutable. The original plan's one-organization-per-creator constraint is retained; creation API and policy review are still pending. |
| Memberships/grants | Per-organization admin/coordinator membership, revocation, closed action vocabulary and composite FKs for program/location scope. |
| Audit | Append-only minimal actor/session/org/action/resource/request/time records. No tokens, passwords, assertions or email URLs. |

Migrations `0002_identity.sql` and `0003_organization_access.sql` are prepared and
exercised locally. They do not implement all remaining Stage 0 tables (invitations,
passkeys, recovery, command receipts or desktop exchanges). The owner-bootstrap
trigger avoids a circular deferred foreign key that produced a local workerd
commit error during negative testing; immediate constraints and triggers now
protect the ownership invariant without that runtime failure.

`createAccount` is an internal primitive. A future public registration route must
add generic acknowledgments, abuse limits and email delivery without disclosing
whether an account exists. No external-identity linking method is exposed yet.

`issueSession` is a trusted internal issuer **after** an adapter has verified the
credential/assertion; it is not an authentication endpoint or a proof verifier.
Never pass HTTP JSON directly to it. Public session/cookie/origin/CSRF middleware,
provider callbacks and an actual local WebAuthn verifier are not implemented here.
The tests issue synthetic sessions directly; that is not working social or SAML login.

## RLS-style access on D1

[PostgreSQL RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
runs policies inside the database. D1 does not supply that mechanism. This backend
uses one closed SQL policy builder in fixed, server-owned repositories:

1. Resolve opaque credentials server-side; never deserialize a client principal.
2. Re-read live account/session, current organization membership and grants in the
   protected SELECT or transactional write guard. Client-selected organizations,
   principal assurance fields and cached capabilities cannot supply authority.
3. Filter rows **in SQL**, rather than loading an unrestricted set and filtering
   in JavaScript. Organization and row IDs are bound together. Program/location
   dimensions match within each complete grant; separate grants never form a
   Cartesian product of permissions.
4. Apply the same predicate inside a [D1 atomic batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
   before mutation, with expected resource version and audit. A failing constraint
   guard aborts the batch. A zero-row UPDATE alone is not a rollback mechanism.
5. Return explicit snapshots, not database/session rows. Lists are bounded to 100
   programs and ordered by ID; pagination is a future API contract.

The D1 binding is privileged. Raw SQL, scripts and future repositories can bypass
application predicates. Do not expose the binding, generic SQL or generic CRUD to
browser/Electron clients, and do not call this native RLS. Every future domain
repository must adopt the policy and earn cross-tenant/permission tests. Database
constraints add integrity protection but cannot infer the authenticated caller.

## Permission and assurance policy

- Active organization membership permits the minimal organization snapshot.
  Owners derive authority from the organization owner field. Admin/coordinator
  operations otherwise require explicit materialized action grants; a preset is
  not permission supplied by the browser.
- Coordinators can receive program/location read/manage grants, not administrative,
  staff-directory or audit authority through an inserted administrative grant.
- Administrative writes require local passkey assurance. Administrator changes and
  ownership transfer additionally require the current owner's passkey evidence
  within five minutes. This is a permission decision only; those mutation APIs and
  the passkey ceremony remain unimplemented.
- Authentication method and assurance are distinct. OIDC/SAML login alone never
  produces local passkey assurance. The schema can retain the original SSO
  connection alongside subsequent local passkey verification in a new session;
  the test fixture demonstrating that combination is not a verifier.
- A required SAML connection is checked on every organization access, including
  existing social/password sessions. Enterprise SAML sessions are organization-bound.
  Connection disablement/version changes and identity disabling/version changes
  invalidate old sessions. Re-enabling does not revive those sessions.
- A location-constrained manager cannot edit a global program definition by
  supplying a location ID. Program-wide edits need a program-wide or organization
  grant. Read filters may narrow to an authorized location context.

## Session lifecycle

Rotation retires the previous token and CSRF secret, keeps authentication/passkey
verification time and the original absolute deadline, and allows one concurrent
winner. Revocation, global logout and issuance include audit atomically. Global
logout advances the account security epoch across transports; disabling an account
also advances it so re-enabling cannot resurrect old sessions. Session security
fields are immutable and retired sessions cannot be unrevoked. Step-up will need a
verified ceremony and a new session, preserving enterprise connection provenance.

## Evidence and rollout limits

The Workers test suite exercises real local D1 migrations and SQL, including:
normalized duplicate accounts, optional credentials, cross-org FKs, identity
conflicts, owner protection, token digests, session/CSRF binding, fixed expiry,
concurrent rotation, revocation/re-enabling, role isolation, intersecting grants,
SAML enforcement, stale versions, concurrent revoke/write and audit rollback.
Tests use a reset helper confined to the test binding because the installed plugin
shares D1 state within a test file. No test cleanup method is part of production.

Local races show repository behavior on local workerd; they are not hosted D1
concurrency or real-provider evidence. No migrations run in delivery. A future
remote rollout needs the existing account/environment check and recovery bookmark,
real adapter validation, HTTP security/abuse controls and controlled enablement.

Validation: all 40 Stage 0 tests, 13 shared UI tests, 6 CI contract tests and 3
hosted-probe harness tests pass locally. Workspace/Worker/Stage 0 type checks,
lint, full workspace build and download-email checks pass. A fresh read-only
review found no actionable issue in this scoped foundation. These checks do not
validate a live provider, hosted database rollout or working login endpoint.
