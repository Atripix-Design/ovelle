# Stage 0 Identity and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after the design, plan and execution method are reviewed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A verified staff account can create and administer an organization, invite scoped staff, revoke access and sign in from the website or Electron without exposing native credentials to the renderer.

**Architecture:** D1 holds account, session, membership, grant and audit authority. Worker routes call small authentication/domain services and guarded repositories; browser cookies and a main-process desktop handoff share those services. Shared presentation lives in `@ovelle/ui`; application routing/data and native credential handling remain in their consumers.

**Tech Stack:** Existing React 19, TypeScript, Electron 44.5.1 and Cloudflare Worker/D1 with direct Wrangler management. Proposed additions: audited password hashing, `@simplewebauthn/server` and `@simplewebauthn/browser`, and compatible pinned Vitest/Cloudflare Workers test packages. Provider and package choices are not installed by this plan.

**Spec:** [Stage 0 identity/access design](../specs/2026-10-19-stage-0-identity-access-design.md).

## Shared backend implementation update

The user approved a backend-only shared account/identity schema, sessions and
organization permissions with enterprise security and RLS-style access. See the
[scoped implementation plan](../plans/2026-10-22-shared-auth-backend.md) and
[implemented boundary](../../architecture/stage0-shared-backend.md). This covers
parts of Tasks 2, 3 and 5; it does not complete the original Stage 0 increment.
The latest confirmed provider scope is Google/Microsoft consumer and business
OIDC plus enterprise SAML, without a broker. Earlier enterprise-OIDC-only wording
below is historical and superseded. No public login routes or remote migrations.

## October 22 execution status

October 23 continuation adds internal HTTP session adapters, reload-safe CSRF
bootstrap and durable authentication/email budgets. See
[HTTP security implementation](../../architecture/stage0-http-security.md).
These cover additional parts of Tasks 2–3; no original task or Stage 0 increment
is thereby complete. Migration `0004_auth_limits.sql` is now allocated to quotas;
assign the future desktop migration the next available number when implemented.
The public Worker still does not import or enable these auth adapters.
The [OIDC continuation](../../architecture/stage0-oidc-security.md) adds maintained
Google/Microsoft verification, exact-identity linking and one-time browser
transactions with local signed-token/D1 tests. Migrations 0005 and 0006 are
allocated to those changes. The [browser/enrollment continuation](../../architecture/stage0-oidc-http-enrollment.md)
adds guarded internal start/link/callback routes, pre-login CSRF/Turnstile and
browser-bound new-account/contact verification. Migration 0007 is allocated to
pending enrollments. Public routing, real delivery/provider acceptance, SAML and
the rest of Tasks 3–11 remain incomplete. No original task is marked complete by
these internal subsets.
The [passkey continuation](../../architecture/stage0-passkey-security.md) adds
maintained WebAuthn verification, account-bound registration, discoverable login,
provider-preserving assurance step-up and internal guarded HTTP routes. Migration
0008 is allocated to credentials/challenges and derived-session revocation. Local
Workers/D1 tests and a Chromium virtual-authenticator ceremony provide evidence;
Task 4 remains incomplete without recovery and the remaining acceptance work.
The [organization-command continuation](../../architecture/stage0-organization-commands.md)
implements the internal Task 6 service contract: atomic creator-limited setup,
proposed baseline records, scoped program/location changes and guarded retry
receipts. Migration 0009 is allocated to contact/policies/receipts and audit actions.
These local services do not enable live organizations or complete Stage 0; recovery,
invitations/ownership, native/UI composition and controlled rollout remain required.

User authorized beginning implementation with authentication-runtime and KDF
validation. Task 1 local code/tests and hosted investigation are implemented.
PBKDF2 600k is rejected by the hosted iteration cap; Argon2id exceeds the free CPU
allowance. Neither is approved for password storage; live auth stays disabled.
Recovery and account/schema revisions remain open. See
[runtime evidence](../../architecture/stage0-runtime-evidence.md) and the new
[SSO exploration](../../architecture/stage0-federated-login.md).
Direct OIDC for Google, Microsoft and tenant-specific Entra ID is approved, without
a broker or paid authentication service. The isolated synthetic hosted probe is
authorized; no plan upgrade or provider provisioning is approved. Review the identity/session schema before Task 2.
The harness uses `vitest.stage0.config.mts` for ESM interoperability.

## Global Constraints

- This is a proposed plan dated October 19, 2026, based on local source `0146c02`. Review design choices before product implementation; this document is not approval to deploy or migrate.
- Node must satisfy the repository floor `>=22.12.0`; verify new test dependencies against that floor before selecting versions.
- Keep `@ovelle/ui` shared; app-specific routing/data and Electron integrations belong in their apps. Keep domain commands callable without an assistant.
- Preserve existing public website, component preview, downloads, download email, health and CI behavior.
- Never put credentials, raw tokens, private SQL exports or new private documents in public CDN R2 storage.
- Keep direct Wrangler ownership. Apply remote D1 migrations manually with an environment/account check and a captured Time Travel bookmark; delivery does not run migrations.
- The complete source component/Figma/variant/skeleton/accessibility workflow in `AGENTS.md` applies to new or changed UI. Reuse existing public `Ovelle /` components and their React implementations.
- No account cookie or desktop capability list is role authority. Every protected command resolves and rechecks current D1 authorization.
- Direct OIDC for Google, Microsoft and Entra ID is approved; provider provisioning and live enablement remain separate gates. No broker, SMS, donor workflow, guardian-consent implementation, assistant action or full offline CRM is introduced in this increment.
- Scope-based table/field access and destructive/private-domain permissions deny until explicitly implemented.

## Review Focus

- A person is an admin in organization A but a coordinator in B: action and resource queries must use B's current membership/grants (Tasks 5–7).
- Concurrent revoke/accept or owner transfers: no duplicate membership, orphan organization, unauthorized post-revocation write or ownerless state (Tasks 2, 7–8).
- Email preview scanners and old links: GET never consumes a credential or accepts an invitation, and a reissued link invalidates the older one (Tasks 3 and 7).
- Email-only account recovery or enrollment: neither bypasses an enrolled owner/admin passkey or grants elevated organization access (Tasks 3–4 and 8).
- Desktop callback/token leakage and stale sessions: wrong state/verifier fails, renderer sees no credential, insecure OS storage stays memory-only, revocation applies after restart (Task 9).

## Deliverable map

All paths below are proposed new files unless labeled modify. Add modules with a
single responsibility; do not append a monolithic auth implementation to `worker.ts`.

| Files | Responsibility | Task |
| --- | --- | --- |
| `src/cloudflare/stage0/contracts.ts`, `config.ts`, `errors.ts` | Shared internal types, strict configuration and response errors. | 1 |
| `scripts/benchmark-stage0-password.ts`, `docs/architecture/stage0-runtime-evidence.md` | Pin KDF/runtime/test-package decisions with measured evidence. | 1 |
| `vitest.stage0.config.ts`, `tests/worker/stage0/helpers.ts`; modify `package.json`, lockfile | Isolated Workers/D1 test harness, mail/clock fixtures and commands. | 1 |
| `migrations/0002_identity.sql`, `0003_organization_access.sql`, `0004_desktop_auth.sql` | Account security, organization authority and desktop exchange tables/indexes/constraints. | 2 |
| `src/cloudflare/stage0/db.ts`, `audit.ts`, `commands.ts` | Bound SQL/repositories, audit writes, guard checks, versioning and command receipts. | 2 |
| `src/cloudflare/stage0/auth/passwords.ts`, `tokens.ts`, `accounts.ts`, `sessions.ts`, `mail.ts`, `limits.ts`, `routes.ts` | Account lifecycle, password/KDF adapter, browser sessions and auth delivery. | 3 |
| `src/cloudflare/stage0/auth/passkeys.ts`, `recovery.ts` | WebAuthn and one-use recovery/enrollment state. | 4 |
| `src/cloudflare/stage0/access/actions.ts`, `authorize.ts`, `grants.ts` | Action vocabulary, role templates, live authorization and grant containment. | 5 |
| `src/cloudflare/stage0/organizations/service.ts`, `routes.ts`, `validation.ts` | Organization/program/location setup and versioned baseline policies. | 6 |
| `src/cloudflare/stage0/staff/invitations.ts`, `routes.ts` | Invitation lifecycle and delivery independent of membership activation. | 7 |
| `src/cloudflare/stage0/staff/memberships.ts`, `ownership.ts` | Revocation, grant edits, administrator changes and owner succession. | 8 |
| `src/cloudflare/stage0/auth/desktop.ts`; `apps/desktop/src/main/auth-session.ts`, `auth-handoff.ts`, `account-ipc.ts` | Native first-party sign-in, storage and allowlisted authenticated commands. | 9 |
| `vitest.stage0-desktop.config.ts`, `playwright.stage0.config.ts`; modify `package.json`, lockfile | Node-only main-process unit tests with injected Electron adapters; local browser integration fixtures. | 9–10 |
| `apps/shared/account-client.ts`, `account-contracts.ts`, `account-workspace.tsx`; new files listed in Task 10 | Shared consumer application flow over shared UI and browser/native adapters. | 10 |
| `tests/worker/stage0/*.test.ts`, `tests/desktop/stage0/*.test.ts`, `tests/browser/stage0/*.spec.ts` | Behavioral and integration evidence owned by each task below. | 1–11 |

## Internal and public contracts

Define these in `contracts.ts` before consumers. IDs are opaque strings; timestamps
are integer UTC milliseconds. `Scope` is either `{ kind: 'organization' }` or
`{ kind: 'program_location'; programId?: string; locationId?: string }`, with at
least one dimension present in the latter. Both supplied dimensions must match.
`Grant` is `{ action: Action; scope: Scope }`; it always belongs to one membership/org.

`RequestContext` contains D1, injected clock/ID source, validated configuration,
mailer and request ID. `Principal` contains trusted account/session IDs, transport,
assurance (`enrollment | password | passkey`) and authenticated time. It is produced
only by authentication. `CommandContext` adds the principal, idempotency key and
request digest. `AuthorizedContext` adds organization ID, membership ID/version
and action/scope; it is not a durable authorization cache.

Define explicit input/snapshot DTOs for the functions in each task. Public snapshots
contain only allowed display fields and advisory capabilities; omit credential,
challenge, recovery-code and session digests. Only initial issuance can return a
raw credential to its designated transport, never ordinary snapshots or audit.

| Route family | Contract |
| --- | --- |
| `POST /api/v1/auth/accounts`, `/verification/request`, `/password/reset/request` | Bounded account inputs; generic 202 acknowledgement, no membership or existence flag. |
| `POST /api/v1/auth/verification/consume`, `/password/reset/consume` | Token plus explicit confirmation/new password; purpose/account/expiry/single-use checks. GET links show a page only. |
| `POST /api/v1/auth/password/login`, `/logout`, `/logout-all` | Password/session lifecycle; account snapshot and CSRF/bootstrap data as appropriate, no cookie token in JSON. |
| `GET /api/v1/me`, `/api/v1/me/organizations` | Current account, safe membership list and assurance; organization switch selects context only. |
| `POST /api/v1/auth/passkeys/{registration,authentication}/{options,verify}` | SimpleWebAuthn ceremonies bound to the correct account/session/purpose; verify allowed RP/origin and required user verification. |
| `POST /api/v1/auth/recovery/{codes,consume}` | Issue/rotate recovery codes after recent passkey authentication; consume password+code into enrollment-only session. |
| `POST /api/v1/organizations`; `GET/PATCH /api/v1/organizations/:orgId` | Server-authorized create/read/update; mutation key and expected version for edits. |
| `GET/POST/PATCH /api/v1/organizations/:orgId/{programs,locations}` | PATCH uses `/:resourceId`; all references and queries include organization identity and permitted scope. |
| `GET /api/v1/organizations/:orgId/policies` | Read recorded baseline defaults; a full policy editor is outside this increment. |
| `GET/POST /api/v1/organizations/:orgId/invitations` | Authorized staff list/create with preset, proposed grants, recipient email and delivery state. |
| `POST /api/v1/invitations/accept`; `POST /api/v1/organizations/:orgId/invitations/:invitationId/{revoke,resend}` | Explicit intended-account acceptance; resend rotates only a still-pending invitation. |
| `GET /api/v1/organizations/:orgId/memberships`; `PATCH /.../memberships/:membershipId/grants`; `POST /.../memberships/:membershipId/revoke` | Current target and actor authority, bounds/version check and atomic audit. |
| `POST /api/v1/organizations/:orgId/ownership-transfer`; `POST /.../ownership-transfer/:transferId/accept` | Current owner recent passkey initiation and active admin target acceptance; 15-minute request expiry. |
| `GET /api/v1/organizations/:orgId/audit` | Authorized access-management events only; bound pagination and redaction. |
| `POST /api/v1/auth/desktop/{requests,approve,exchange}` | Typed first-party handoff; request creation is unprivileged/rate-limited, approval uses browser session+CSRF, exchange requires correct verifier and unconsumed code. |

Use the spec's status codes and no-store policy consistently. Login/bootstrap and
public credential endpoints receive their own origin/rate/Turnstile validation;
CSRF tokens are issued to enrollment and authenticated web sessions. Enrollment
sessions have an explicit allowlist and cannot call organization/staff APIs.

## Task 1: Resolve runtime choices and establish executable test contracts

**Files:** Task 1 map above; tests `tests/worker/stage0/config.test.ts` and
`tests/worker/stage0/password-runtime.test.ts`.

**Consumes:** Repository runtime/configuration and the proposed spec.
**Produces:** `Clock.now(): number`, `Ids.next(): string`, `AuthMailer.send(input: AuthEmail): Promise<DeliveryResult>`,
`loadStage0Config(env): Stage0Config`, and the shared context/DTO contracts above.
`DeliveryResult` records provider acceptance/failure only, not assumed reading or delivery.

- [ ] Review sign-in, provider, recovery and role defaults with the user; record accepted choices in the spec without treating this draft as approval. Select a focused native execution method unless the user chooses delegation.
- [ ] Write failing configuration tests: production refuses missing auth origins/RP/sender/Turnstile settings, development and production origins are distinct, and unknown action/error values cannot be silently accepted. Pin the dependency versions compatible with the existing Node/Vite floor and establish isolated D1 tests using the official Workers integration.
- [ ] Run `npm run test:stage0 -- tests/worker/stage0/config.test.ts`; expect failure for missing modules/contracts. Add `test:stage0` = `vitest run --config vitest.stage0.config.ts` and local-only fixture configuration; no production secrets or external mail.
- [ ] Implement the contracts/configuration, then benchmark both candidate KDF feasibility and the selected candidate's hash/verify under the intended Workers runtime. Add `benchmark:stage0-password` = `node --experimental-strip-types scripts/benchmark-stage0-password.ts`; record library/version, parameters, runtime, CPU/headroom and result in the evidence document. A local Node timing is not hosted Worker evidence. Any remote probe needs separate scoped authorization; if unavailable, leave the KDF decision pending and block Task 3 rather than claim feasibility.
- [ ] Run both Task 1 tests; expect explicit acceptance of supported settings and rejection of unsafe fallback. Freeze one evidenced KDF in the spec before Task 3, retaining versioned hashes for upgrades. Review and commit only this deliverable.

## Task 2: Add the authority schema and atomic mutation primitives

**Files:** Task 2 map; `tests/worker/stage0/schema.test.ts`, `commands.test.ts`.

**Consumes:** IDs, clock, action/scope contracts and isolated D1 harness.
**Produces:** `runCommand<T>(ctx: CommandContext, input: CommandInput<T>): Promise<T>` and
`appendAudit(input: AuditInput): D1PreparedStatement` in the command's atomic batch.
`CommandInput` fixes organization (or null for creation), command name, expected
versions, an executable authorization/version guard and SQL/result mapping.

- [ ] Write failing schema tests for unique account email, membership uniqueness, cross-org program/location references, constrained grant scope and owner membership protection. Include the specified `ownership_transfer_requests` table with initiator/target, expected owner version, expiry and accepted/revoked state.
- [ ] Run `npm run test:stage0 -- tests/worker/stage0/schema.test.ts tests/worker/stage0/commands.test.ts`; expect missing schema/helpers. Add migrations with FK/check/index constraints and guard statements that raise a database constraint error on denied/stale mutation; do not rely on an UPDATE affecting zero rows to roll back a batch.
- [ ] Implement command receipts and audit in the same D1 batch. Same actor/org/key/body returns one safe result; key reuse with a changed body returns 409. Always reauthorize before exposing a stored result. Guard session enabled/revoked state, actor membership, current grants, target identity and versions at mutation time.
- [ ] Prove failed audit/grant inserts roll back all related writes, and two concurrent same-key create commands yield one organization/result. Race a revoke against a mutation: the result must correspond to a valid commit order and no later unauthorized commit. Run the two test files to PASS; review and commit.

## Task 3: Implement account verification, password sessions and reset

**Files:** Task 3 map; modify `src/cloudflare/worker.ts`; tests
`tests/worker/stage0/accounts.test.ts`, `sessions.test.ts`, `auth-mail.test.ts`.

**Consumes:** Accepted KDF, configuration, `AuthMailer`, account tables and command primitives.
**Produces:** `registerStaffAccount(ctx, input: RegisterStaffInput): Promise<AcceptedAck>`,
`consumeAccountToken(ctx, input: ConsumeAccountTokenInput): Promise<AccountResult>`,
`authenticateRequest(ctx, request): Promise<Principal>`, `issueSession(ctx, input: IssueSessionInput): Promise<IssuedSession>`,
`revokeAccountSessions(ctx, accountId): Promise<void>`. Only transport code sees `IssuedSession`'s raw token.

- [ ] Write failing tests for duplicate/disabled account acknowledgments, no organization membership on signup, no overwrite of an existing password, unverified login denial, GET prefetch non-consumption, wrong-purpose/expired/replayed token denial and durable quotas. Test two concurrent consumes: exactly one succeeds.
- [ ] Run the Task 3 test files with `npm run test:stage0 -- tests/worker/stage0/accounts.test.ts tests/worker/stage0/sessions.test.ts tests/worker/stage0/auth-mail.test.ts`; expect missing service/routes. Implement the frozen KDF adapter, purpose-bound random tokens, verification and explicit POST confirmation. Validate passwords without truncating or logging them.
- [ ] Implement opaque browser cookies, enrollment-only assurance, exact-Origin+CSRF checks, Turnstile adapter and D1 quotas. Test missing/null/cross-origin browser mutations, token-free JSON/logs, expiry, logout-all and disabled-account denial. Authentication must not derive a staff role from an email domain or request body.
- [ ] Send authentication mail after token persistence, record provider failure separately, and make a resend rotate the old token. Password reset changes only the password credential, revokes all sessions/exchanges and retains enrolled passkeys. A mock proves behavior, not real delivery. Run all Task 3 files to PASS; review and commit.

## Task 4: Add staff passkeys, assurance and recovery

**Files:** Task 4 map; extend auth routes; tests `tests/worker/stage0/passkeys.test.ts`, `recovery.test.ts`.

**Consumes:** `Principal`, enrollment sessions, account/challenge tables and SimpleWebAuthn adapters.
**Produces:** `beginPasskeyRegistration(ctx, principal): Promise<RegistrationOptions>`,
`verifyPasskeyRegistration(ctx, principal, response): Promise<PasskeySummary>`,
`verifyPasskeyAuthentication(ctx, input): Promise<IssuedSession>`,
`requireRecentPasskey(principal, now): void`, `consumeRecoveryCode(ctx, input): Promise<IssuedSession>`.

- [ ] Write failing tests for wrong RP/origin/account/session/purpose, required user verification, expired/replayed challenges and counter/credential handling using the audited verifier. Test enrollment sessions cannot create organizations or accept administrator privileges. A password-only session for an already-enrolled account cannot register a replacement/additional passkey or rotate recovery codes; require an existing recent passkey or a consumed recovery code for the permitted replacement flow.
- [ ] Run `npm run test:stage0 -- tests/worker/stage0/passkeys.test.ts tests/worker/stage0/recovery.test.ts`; expect missing adapters. Implement registration/authentication with the spec's five-minute challenge and recent-auth limits, rotating session identity after assurance changes.
- [ ] Implement eight single-use hashed recovery codes and recent-passkey-protected issuance/rotation. Test concurrent recovery-code consumption, rotation invalidating prior codes, email-only recovery failing to remove a passkey, and recovered sessions remaining enrollment-only until a new passkey is verified. Do not implement an operator bypass.
- [ ] Run Task 4 files and session regression tests to PASS, and verify an actual browser ceremony on a suitable HTTPS/localhost origin. An HTTP Tailnet-IP preview is not evidence that WebAuthn works. Review and commit.

## Task 5: Implement scoped authorization as the shared service boundary

**Files:** Task 5 map; `tests/worker/stage0/authorization.test.ts`.

**Consumes:** Trusted live `Principal`, memberships/grants, current resource organization/scope.
**Produces:** `authorizeOrganization(ctx, principal, organizationId, action, scope): Promise<AuthorizedContext>`,
`assertGrantSubset(actor: AuthorizedContext, requested: Grant[]): void`,
`getAdvisoryCapabilities(ctx, principal, organizationId): Promise<CapabilitySnapshot>`.

- [ ] Write a matrix test from the spec for owner/admin/coordinator, membership revocation, unknown actions and future private-domain actions. Include the same account admin in A/coordinator in B, user-supplied owner flags and a client-selected foreign organization.
- [ ] Run `npm run test:stage0 -- tests/worker/stage0/authorization.test.ts`; expect missing policy functions. Implement explicit stage-0 action matching and role-derived administrative restrictions. Query by both organization and resource ID; deny without exposing foreign records.
- [ ] Test grant intersections: `(program A, location X)` plus `(program B, location Y)` must not grant `(A,Y)`. Reject scope IDs from another organization, wildcard widening, self-escalation and an admin editing an owner/admin target through the coordinator endpoint.
- [ ] Make mutation builders carry SQL authorization guards from the same action/scope policy; capabilities remain presentation-only. Run the complete Task 5 matrix and command concurrency tests to PASS; review and commit.

## Task 6: Build organization creation and scoped structure

**Files:** Task 6 map; `tests/worker/stage0/organizations.test.ts`, `structure.test.ts`.

**Consumes:** Passkey-ready principal, action grants, command receipts and validation.
**Produces:** `createOrganization(ctx: CommandContext, input: CreateOrganizationInput): Promise<OrganizationSnapshot>`,
`updateOrganization(ctx, input: UpdateOrganizationInput): Promise<OrganizationSnapshot>`,
`saveProgram(ctx, input: SaveProgramInput): Promise<ProgramSnapshot>`,
`saveLocation(ctx, input: SaveLocationInput): Promise<LocationSnapshot>`.

- [x] Write failing creation tests for unverified/enrollment-only accounts, retry idempotency, concurrent one-organization-per-creator limit, missing owner membership and rollback if any initial row fails. Test that the creation limit is enforced in the same guarded operation, not a pre-count in JavaScript. Keep an immutable creating-account reference; ownership transfer does not replenish the creation allowance.
- [x] Run `npm run test:stage0 -- tests/worker/stage0/organizations.test.ts tests/worker/stage0/structure.test.ts`; expect missing services. Atomically create organization, owner admin membership/grants, initial program/location, baseline policy, audit and receipt. Return a safe snapshot without claims of nonprofit/payment verification.
- [x] Validate bounded names/contact email, IANA time zone and versions. Record staff-reviewed assignment/no eligibility bypass/no automatic-hour-approval defaults. Test org-qualified program/location listing, scope-limited updates, archives preserving references and stale version returning 409 without audit claiming a successful update.
- [x] Prove changing selected organization changes returned context but never grants a role. Run Task 6 and authorization tests to PASS; review and commit.

## Task 7: Invite staff and accept explicitly as the intended account

**Internal service and HTTP continuation (October 23):** create/accept/revoke/resend,
sealed offers, current-authority transactional acceptance and staff-only read services
are implemented with local Workers/D1 tests; see [invitation evidence](../../architecture/stage0-staff-invitations.md).
Guarded internal HTTP composition and authenticated read-only GET preview are
implemented and exercised locally. This completes Task 7's internal contract; public
Worker enabling remains controlled rollout work and recovery remains unfinished.

**Files:** Task 7 map; `tests/worker/stage0/invitations.test.ts`.

**Consumes:** Current actor authorization, grant-subset checks, verified accounts and `AuthMailer`.
**Produces:** `createStaffInvitation(ctx, input: CreateInvitationInput): Promise<InvitationSnapshot>`,
`acceptStaffInvitation(ctx, input: AcceptInvitationInput): Promise<MembershipSnapshot>`,
`revokeStaffInvitation(ctx, input: InvitationCommandInput): Promise<InvitationSnapshot>`,
`resendStaffInvitation(ctx, input: InvitationCommandInput): Promise<InvitationSnapshot>`.

- [x] Write failing tests for admin inviting a coordinator within authority, owner-only admin invitations, no activation from send/GET preview, wrong verified email, expired token, revoked inviter, changed grants and administrator acceptance without passkey assurance.
- [x] Run `npm run test:stage0 -- tests/worker/stage0/invitations.test.ts`; expect missing lifecycle methods. Implement pending/accepted/revoked/expired state with separate delivery status, 72-hour expiry and token rotation on resend. Email failure leaves no active membership.
- [x] Acceptance must re-evaluate inviter authority and current offered scopes and atomically consume the invitation, activate one membership/grant set and append audit. Existing active members are not silently granted extra access; revoked members require explicit reactivation with only the newly reviewed grants.
- [x] Race two accepts, accept versus revoke, and resend versus stale-link acceptance. Verify only the current valid transition succeeds; resending revoked invitations fails and duplicate calls do not duplicate memberships. Run Task 7 and delegation tests to PASS; review and commit.

## Task 8: Revoke access and preserve ownership/recovery invariants

October 23 internal service subset: versioned grant/role changes, revocation and
owner request/accept/cancel are implemented with local Workers/D1 tests. See
[staff-access evidence](../../architecture/stage0-staff-access.md) and the
[operator review contract](../../architecture/stage0-recovery-review.md).
Guarded internal HTTP composition now exposes membership reads/changes and owner
request/detail/accept/cancel; the public Worker remains disconnected.
Task 8 remains incomplete: recovery codes and the required recovery/session
revocation demonstration are missing. Native/UI and
hosted rollout remain separate unfinished work; the checkboxes below retain the
original whole-task acceptance contract.

**Files:** Task 8 map; `tests/worker/stage0/memberships.test.ts`, `ownership.test.ts`.

**Consumes:** Current action/grant bounds, recent passkey check, atomic command guards and audit.
**Produces:** `changeMembershipGrants(ctx, input: ChangeGrantsInput): Promise<MembershipSnapshot>`,
`revokeMembership(ctx, input: RevokeMembershipInput): Promise<MembershipSnapshot>`,
`requestOwnershipTransfer(ctx, input: TransferInput): Promise<TransferSnapshot>`,
`acceptOwnershipTransfer(ctx, input: AcceptTransferInput): Promise<OrganizationSnapshot>`.

- [ ] Write failing tests showing old browser/native sessions lose access to a revoked organization on their next request while access to another organization remains; revocation is independent of staff handoff. Test self-escalation, owner-membership revocation and admin-target modification through coordinator grants all fail.
- [ ] Run `npm run test:stage0 -- tests/worker/stage0/memberships.test.ts tests/worker/stage0/ownership.test.ts`; expect missing commands. Implement versioned grant replacement/revocation with SQL guards and audit in the same batch.
- [ ] Implement owner transfer to an active passkey-ready admin, explicit target acceptance with recent target passkey authentication, recent owner authentication, a 15-minute expiry and expected-owner version. State in the review that the previous owner remains an admin. Test wrong target, target revoked before acceptance, stale/expired transfer and two competing transfers: exactly one valid ownership transition.
- [ ] Re-run command race tests and demonstrate recovery codes plus session revocation. Write the operator review runbook without executable bypass instructions; require approval of identity checks before the pilot. Run Task 8 to PASS; review and commit.

## Task 9: Connect Electron through the system browser and main-process session

**Files:** Task 9 map; modify `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`;
tests `tests/worker/stage0/desktop-auth.test.ts`, `tests/desktop/stage0/auth-handoff.test.ts`, `account-ipc.test.ts`.

**Consumes:** Browser login/assurance, native session issuance and allowlisted domain commands.
**Produces:** `startDesktopSignIn(): Promise<AccountSnapshot>`, `getDesktopAccount(): Promise<AccountSnapshot | null>`,
`signOutDesktop(): Promise<void>` in main; preload `ovelleAccount.signIn/getSnapshot/signOut/execute(command)`.
`command` is a finite discriminated DTO union of supported stage-0 operations,
not a URL/method/body proxy. `GET /me` results remain token-free.

- [ ] Write failing exchange tests for wrong state, callback host/path, expired request, reused/expired code, wrong verifier, disabled/revoked account and missing browser CSRF on approval. Native session issuance must inherit validated assurance/authenticated time and not extend the 12-hour maximum implicitly.
- [ ] Run the Task 9 Worker tests with `test:stage0`; add `test:stage0-desktop` = `vitest run --config vitest.stage0-desktop.config.ts` using a Node environment with injected Electron adapters, and run to expected missing-module failures. Implement main-owned random state/verifier, exclusive ephemeral `127.0.0.1` callback listener, strict Ovelle HTTPS browser URL and five-minute timeout/cancellation cleanup. Test that inbound browser queries cannot choose a file, external URL or arbitrary API endpoint.
- [ ] Implement explicit browser approval and 60-second one-time-code exchange into an opaque native session. Validate native bearer sessions separately from browser cookies; forged/missing Origin never converts a browser cookie into a native credential. No wildcard CORS, renderer token, localStorage credential, clipboard token or token query string.
- [ ] Use the supported pinned-Electron OS storage API only if protection is available; memory-only fallback otherwise, including Linux `basic_text`. Check IPC sender and top-level frame for every method. Test restart within/after expiry, logout/remote revocation, malformed IPC and token-free renderer payloads/logs on Windows and both Mac architectures. Run Worker/main tests to PASS; review and commit.

## Task 10: Compose the shared account and organization flows

**Files:** Modify `apps/web/src/App.tsx`, `apps/desktop/src/renderer/src/main.tsx`, `packages/ui/README.md`,
`packages/ui/figma-manifest.json`; create `apps/shared/account-workspace.tsx`, `account-client.ts`,
`account-contracts.ts`, `accounts/sign-in.tsx`, `accounts/security.tsx`,
`organizations/setup.tsx`, `organizations/settings.tsx`, `organizations/staff.tsx`.
Create `packages/ui/src/account-access.tsx` and export from `packages/ui/src/index.tsx`
only if a reusable custom composition is actually needed; use existing UI implementations otherwise.
Tests: `tests/browser/stage0/accounts.spec.ts`, `organization-access.spec.ts`; add
`playwright.stage0.config.ts` and `test:stage0-browser` = `playwright test --config playwright.stage0.config.ts`.
Pin a compatible `@playwright/test` dependency; keep these fixtures isolated from live providers.

**Consumes:** Safe account/org DTOs, advisory capabilities, Worker routes and native command union.
**Produces:** `createBrowserAccountClient(): AccountClient`, `createDesktopAccountClient(bridge): AccountClient`,
`AccountWorkspace({ client }: { client: AccountClient })`, with typed methods matching the route DTOs.
`AccountClient` is defined in `apps/shared/account-contracts.ts` and exposes no credential storage API.

- [ ] Retrieve exact Figma context/screenshots and existing component APIs before creating/changing custom UI. Design the account verification/enrollment/recovery, organization setup/switcher, staff invitation/grant review, revocation and ownership-transfer states with linked source components. Preserve original slots/assets and record required source/variant evidence; do not invent source geometry.
- [ ] Write browser tests for required steps, expired link/recovery states, cross-org switch, scoped directory, stale edit conflict, failed email, revoked session and visible ownership-transfer consequences. Run `npm run test:stage0-browser` to expected missing-flow failure against a local Worker/D1 and web app launched by the Playwright configuration, with a local fake mail adapter; user data never goes to live providers in fixtures.
- [ ] Implement application routes and adapters using shared `@ovelle/ui` parts. Use real data-region `LoadingBoundary`, preserve mounted drafts and distinguish permission denied from loading. Never persist secrets in browser clients or treat a hidden action as enforcement. Desktop launches system-browser login and renders only the resulting safe account state.
- [ ] Verify keyboard/focus semantics, loading controls, Light/Dark, Solid/Liquid Glass, continuous frost, reduced transparency/motion and responsive rendering in website and desktop. Inspect captures beside Figma. Run `npm run check:figma`, `npm run check:loading`, `npm run check:components`, applicable existing shared UI checks and `npm run test:stage0-browser` to PASS. On Ubuntu, follow the environment-specific preview URL and verification instructions from `AGENTS.md`; keep private preview addresses out of tracked files and use secure/localhost origin evidence separately for WebAuthn. Review and commit.

## Task 11: Verify the increment and prepare a controlled development rollout

**Files:** Create `docs/operations/stage0-identity-access.md`,
`tests/worker/stage0/acceptance.test.ts`; modify `wrangler.jsonc`,
`.github/workflows/ci.yml`, `infra/README.md`, and root test scripts as required.

**Consumes:** All prior tasks; accepted recovery/provider decisions and scoped rollout authority.
**Produces:** A reproducible local/test report and a separate development acceptance record bound to a commit SHA.

- [ ] Run a two-organization end-to-end test: create A, invite/accept scoped coordinator B, deny foreign ID/grant widening, revoke and retry existing sessions, transfer ownership and reconcile audit. Test callback/session expiry and failed provider responses. Confirm the public download/email/catalog/health routes still pass existing checks.
- [ ] Run `npm run test:stage0`, `npm run test:stage0-desktop`, `npm run test:stage0-browser`, `npm run check`, `npm run lint`, `npm run build`, `npm run check:privacy`, `npm run check:ci`, `npm run check:download-email` and the UI checks from Task 10. Add the new automated backend/native suites to existing non-secret CI lanes. Bind results to the final SHA; do not call mock tests real delivery or local SQLite/D1 tests hosted concurrency evidence.
- [ ] Update both environments' Worker-first API routing and explicit allowed origins without broadening production host routing. Document auth secret names and manual migration order; confirm native dependencies/unsigned Mac keychain behavior in packaged builds. Keep the server disabled for live auth until sender, Turnstile, KDF and recovery prerequisites have evidence. Do not run remote migrations from CI or this plan.
- [ ] With separate rollout authority, inspect the development account/database, capture a Time Travel bookmark and private pre-migration backup, apply reviewed development migrations manually and deploy the exact tested artifact. Verify actual verification/reset/invitation email, browser passkeys, packaged native sign-in, tenant denials and revocation. Restore/recovery exercises use designated fixtures; keep production separate.
- [ ] Publish the validation/runbook with remaining limitations. Stage 0 still needs volunteer records, required private document/signature workflows, fuller policies and verified backup/recovery from the roadmap. This increment cannot be labeled complete Stage 0 or full application launch. Review and commit only task files under the authorized development publishing workflow.

## Execution and review boundary

Review the proposed design first, then this plan and the selected execution method.
No application implementation, dependency installation, provider setup, migration
or runtime benchmark occurred in this planning change. Suggested next execution
unit is Task 1, followed by Tasks 2–4 for usable, recovery-capable staff accounts;
then Tasks 5–8 for organization authority. Tasks 9–11 complete the dual-consumer
experience and release evidence. Implementation can revise the draft in response
to a measured constraint rather than silently substituting architecture.

Native execution in this session is the default recommendation because these tasks
share security-critical contracts and ownership invariants. No delegation is assumed.
This recommendation is an execution proposal, not a request to start work now.

## Technical references checked October 19, 2026

- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/): use the runtime-aware pool for backend behavior; pin compatible packages at Task 1.
- [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/): validate atomic batch behavior, including guard failure and rollback.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage/): verify storage protection on supported packages; `basic_text` must not be treated as secure persistence.
- [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252): system browser/loopback and verifier-binding guidance informs the first-party desktop handoff; this plan does not introduce external OAuth.
