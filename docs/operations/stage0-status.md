# Stage 0 backend status against the original plan

The internal identity/access backend has local and CI evidence. It is not a
public login service or a complete Stage 0 release. This audit follows the
[original eleven-task plan](../superpowers/plans/2026-10-19-stage-0-identity-access.md),
[identity design](../superpowers/specs/2026-10-19-stage-0-identity-access-design.md),
[feature list](../feature-list.md) and [Stage 0 priorities](../build-priorities.md).
Backend-only implementation does not remove native, presentation, provider or
rollout requirements from the full plan.

The measured baseline is `acf76e5e06cc127025ec1ae4a78836a24588fd00`, with
[CI run 40037580398](https://github.com/Atripix-Design/ovelle/actions/runs/40037580398):
613 backend tests across 48 files, types, lint, builds, privacy and public mail
checks passed. The hosted Node 22.12.0 browser job passed six SAML/OIDC journeys
across Chromium, Firefox and WebKit, plus the existing Chromium virtual-passkey
ceremony. Development bundle readback matched that full SHA, health reported a
healthy development database, and public authentication routes remained closed.
This is a dated evidence record, not a claim that every future checkout passed.

## Requirement reconciliation

IDs identify the acceptance bullets in their original order within each task.
“Internal” describes implemented server behavior with local/CI evidence; it does
not certify live providers, remote identity migrations, physical devices or a
complete task. Original red-test instructions describe implementation history:
do not delete working modules or recreate tests merely to reproduce a missing-file
failure. Existing tests with different filenames may cover the intended contract.

| ID | Current implementation and evidence | Remaining requirement or limit |
| --- | --- | --- |
| 1.1 | The plan records direct Google/Microsoft OIDC and enterprise SAML without a broker. | Optional passwords and recovery still need the unresolved contract decisions; do not treat the original draft as approval. |
| 1.2 | `config.ts`, `contracts.ts`, `config.test.ts` validate environment/origin boundaries and the closed action vocabulary. Workers/D1 tests are pinned and isolated. | Live secrets and provider settings have not been established by these tests. |
| 1.3 | `test:stage0` runs `vitest.stage0.config.mts`; fixture mail and D1 remain isolated. | No replacement test configuration is needed because the original proposed filename differed. |
| 1.4 | The [runtime evidence](../architecture/stage0-runtime-evidence.md) retains local and hosted candidate measurements. | Hosted full-work-factor PBKDF2 was rejected; Argon2 CPU/audit suitability is unresolved. No KDF is approved. Do not repeat unchanged probes or lower work factors. |
| 1.5 | Parameter rejection and independent password-candidate fixtures run in `password-runtime.test.ts`. | The evidenced KDF selection and freeze required before password storage are missing. |
| 2.1 | Identity, membership, scope, owner and transfer constraints exist in prepared migrations; schema and staff tests exercise their invariants. | Prepared and locally applied schemas do not prove remote applied state. |
| 2.2 | `db.ts`, `commands.ts` and domain commands use transactional constraint guards rather than treating zero updated rows as rollback. | Original `commands.test.ts` is not required as a duplicate of existing command/authorization/domain tests. |
| 2.3 | Guarded commands store receipts and audit atomically, bind request content and reauthorize replay; organization/staff tests cover stale or changed requests. | No public generic command or SQL endpoint is implied. |
| 2.4 | Organization, structure, membership, ownership and authorization tests exercise competing commands, revocation order and rollback. | Local workerd/D1 race results do not establish hosted concurrency or edge CPU headroom. |
| 3.1 | Accounts, sessions and direct-provider enrollment tests cover identity/contact binding, no automatic membership, expiry and replay. | Original password registration, overwrite protection, password login and reset remain unimplemented; provider enrollment is not their substitute. |
| 3.2 | OIDC/SAML maintain their own verified assertion, enrollment and explicit contact-confirmation services. | No selected password KDF, password registration/token service or password verification/reset contract is implemented. |
| 3.3 | Browser/desktop credential separation, cookie/Origin/CSRF checks, Turnstile adapters, durable quotas, expiry, logout and disabled-account denial are implemented internally. See [HTTP security](../architecture/stage0-http-security.md). | Real Turnstile/provider configuration and public composition remain separate. |
| 3.4 | Contact/invitation credentials persist before sending; delivery status and resend rotation use the [concrete auth mail adapter](../architecture/stage0-auth-mail.md). | Password reset, its global invalidation behavior and real delivery remain missing. Contact mail is not password-reset mail. |
| 4.1 | Maintained WebAuthn verification and purpose/account/session/challenge/UV checks exist in passkey protocol/service/route tests. Primary-only replacement is denied. | Recovery-authorized replacement enrollment is not implemented. |
| 4.2 | Passkey challenges and assurance-changing session rotation are implemented internally; the original session deadline is retained. | Do not claim the planned recovery adapter exists because passkeys work. |
| 4.3 | Eight digest-only codes and recent-passkey-protected issuance/rotation are implemented and tested. | Consumption, replacement-only recovery sessions and recovery-specific global invalidation await the unresolved contract; no email-only or operator bypass. |
| 4.4 | The [existing browser ceremony](../architecture/stage0-passkey-security.md) uses actual `navigator.credentials.create/get` with a virtual resident-key/UV authenticator in hosted Chromium. | Physical Apple/Windows/security-key acceptance and recovery are not proved. |
| 5.1 | `authorization.test.ts` covers per-organization owner/admin/coordinator authority, live revocation and forged/cached authority denial. | Future private domains remain denied until separately implemented. |
| 5.2 | `access/policy.ts` is reused by organization-qualified reads and final mutation guards. | D1 does not provide native row-level security; future repositories must use the same policy. |
| 5.3 | Complete grant intersections, foreign scope IDs, widening, self-escalation and administrative target restrictions are tested across authorization/invitation/membership suites. | No additional permissive helper is needed to match an older proposed interface name. |
| 5.4 | Final SQL guards reuse live policy; [capabilities](../architecture/stage0-capabilities.md) are bounded advisory snapshots. | A capability response or hidden control never becomes enforcement authority. |
| 6.1 | Organization tests cover creator allowance, enrollment/primary-only denial, owner bootstrap, idempotency and rollback. | A local organization is not a verified nonprofit or payment recipient. |
| 6.2 | Creation atomically writes owner membership/grants, initial structure, recorded policy, audit and receipt. | Remote identity schema application remains a separate operation. |
| 6.3 | Bounded settings, IANA time zone, versions, tenant-qualified scope reads/updates and reference-preserving archives are implemented. | Recorded staff-reviewed defaults are not a full operating-policy editor or downstream eligibility/hour enforcement. |
| 6.4 | Selected organization changes context without granting authority; organization and authorization suites cover it. | Public organization UI remains unfinished. |
| 7.1 | Invitation suites cover owner/admin bounds, intended verified account, explicit acceptance, stale inviter/grants and passkey-ready administrator acceptance. | Real inbox delivery and product acceptance pages remain unverified. |
| 7.2 | Pending/accepted/revoked/expired offers, 72-hour expiry, separate delivery state and explicit resend rotation are implemented internally. | A send acknowledgement does not create membership or prove delivery. |
| 7.3 | Acceptance rechecks current inviter authority and reviewed scopes in the atomic batch; it does not silently add access to existing members. | Public routing remains disconnected. |
| 7.4 | Competing accept/revoke/resend transitions and duplicate prevention have existing Worker/D1 tests. | Do not rebuild this lifecycle because an older planning snapshot says it is pending. |
| 8.1 | Existing browser/native server sessions lose revoked organization access on their next request while retaining unrelated access; target/self-escalation denials are covered. | This tests native bearer authority, not Electron storage or IPC. |
| 8.2 | Versioned membership changes/revocation commit with grants, receipts and audit; rollback and final-authority checks are tested. | Remote rollout remains separate. |
| 8.3 | Owner request/accept/cancel, recent authentication, intended passkey-ready admin, 15-minute expiry and competing transitions are implemented. Prior owner remains admin. | Ownership succession is not lost-factor recovery. |
| 8.4 | Command races and the [operator review contract](../architecture/stage0-recovery-review.md) exist. | A real recovery service, invalidation demonstration and approved identity-review policy remain missing. |
| 9.1 | Server request/approval/exchange tests cover exact callback/state/S256 proof, expiry, replay, revoked/disabled identity and browser CSRF. | Electron listener behavior is not measured by these server tests. |
| 9.2 | Internal [desktop handoff](../architecture/stage0-desktop-handoff.md) is implemented. | Main-process listener/state/verifier/timeout logic and `test:stage0-desktop` are unfinished and outside backend-only implementation. |
| 9.3 | Explicit browser approval and 60-second one-use code exchange issue separately validated native bearer sessions internally. | Public approval presentation and native client integration remain unfinished. |
| 9.4 | Server expiry and remote revocation are tested. | Safe storage/fallback, IPC sender/frame validation, restart and packaged sign-in on supported OS architectures remain unfinished. |
| 10.1 | Existing shared component/design infrastructure is not evidence of the specified account flows. | Required Figma account/organization states and exact source/variant evidence are outside this backend-only continuation. |
| 10.2 | Backend fixture pages measure protocol transport only. | Product browser fixtures/configuration and `test:stage0-browser` remain missing; do not alias protocol scripts to claim completion. |
| 10.3 | Safe server DTOs and advisory capabilities exist. | Shared account clients, account workspace, public application routes and native adapters remain unfinished. |
| 10.4 | Existing unrelated shared-UI checks do not establish account-flow parity. | Account-flow loading/focus/theme/material/responsive/Figma and dual-consumer acceptance remain unfinished. |
| 11.1 | The [connected acceptance journey](stage0-identity-access.md) creates two organizations, invites/accepts, denies scope widening, revokes existing credentials, transfers ownership and reconciles audit. Separate suites cover callback expiry/provider rejection. | Identity establishment and mail transport are fixtures; no real provider or hosted-concurrency claim. |
| 11.2 | Full backend checks and seven browser journeys are mandatory in non-secret CI and bound to source. | Native and product-browser suites/UI acceptance from Tasks 9–10 remain missing; passing backend suites does not complete the requested command list. |
| 11.3 | Internal adapters enforce explicit origins; config keeps `enabled: false` and password decision pending. The runbook names configuration and migration order. | Public API composition, real settings, native dependency/storage verification and auth enablement remain unfulfilled. No automatic identity migrations. |
| 11.4 | Existing development delivery proves the ordinary application artifact can be published and read back. | Separate authority and evidence are needed for target identity DB inspection, Time Travel bookmark/private backup, manual migrations, real provider/mail/passkey/native acceptance and recovery/restore. Ordinary delivery does not perform these steps. |
| 11.5 | Verification/runbook, limitations and this reconciliation are published as task files through development. | Volunteer records, private documents/signatures, fuller policies, backup/restore and pilot/guardian rules remain required for Stage 0. |

## What prevents completion

The next credential implementation requires the recovery contract to be resolved
against direct-provider login and optional local passwords. The earlier
password-plus-code draft is not permission to substitute provider-plus-code
recovery. Codes currently cannot sign anyone in. Password storage also requires
an approved, evidenced KDF/runtime choice. Keep both explicit gaps visible.

Real provider registrations, SAML customer/certificate lifecycle, auth sender and
mail-client behavior need correct account access and separately authorized setup
and verification. No fixture or successful development deployment grants that
authority. Native/UI work remains part of the original objective but outside the
current backend-only implementation boundary.

Stage 0 also retains volunteer records, versioned private documents/signatures,
operating policies and verified related-data/document restore. Their detailed
pilot fields, signer, retention, age/guardian and consent rules require planning;
the identity design explicitly places those implementations in subsequent
increments. Do not invent those contracts or treat an adult staff flow as minor
enrollment approval.

Before adding code, compare the particular missing outcome with its existing
service, test and acceptance record. Prefer an actual unfinished requirement over
another generic harness, duplicate edge matrix or renamed test file. Keep the
full goal open until every required outcome has evidence at its own scope.
