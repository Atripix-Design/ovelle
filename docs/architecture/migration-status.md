# Whole-codebase structure migration

Status: active; full compliance is not established. The objective includes all
current maintained code, not only new-code enforcement.

## Initial inventory and completed changes

- Inspected a clean development worktree at c8a0b56.
- Initial source inventory: 178 JS/TS files across shared UI, web, desktop,
  shared app compositions, Cloudflare, tests, scripts and design tooling.
- Added a repository coding contract, ownership map, syntax-based dependency gate,
  negative checker tests and a repository-local coding skill.
- Added the gate to `npm run check` and its tests to existing self-hosted CI.
- Removed duplicate account contact/name normalization from account creation;
  `auth/contact.ts` now owns that behavior for account and federated contact flows.

The initial ownership map listed seven important concepts; subsequent tranches
expand it, but it is not yet a complete business-concept inventory. Its zones cover source locations, not proof of responsibility separation.
The first-tranche scan included the three checker files as well (181 files).
The domain tranche expands the current scan to 184 files.

## UI composition

Five cycle back edges remain explicitly recorded in `architecture/exceptions.json`.
Read all primitive and composite callers, load required Figma skills, retrieve source
context/captures, separate primitive implementation from the public barrel, and use
direct internal imports. Preserve public exports, geometry and behavior. Verify both
consumers and mandated fidelity/loading checks. Remove exact cycle exceptions as
resolved; do not claim visual parity from type checking.

## Backend

Review every Stage 0 feature: account/contact, sessions, secrets, password/recovery,
OIDC, SAML, passkeys, desktop handoff, organizations, access policy, staff invitation,
ownership and command receipts. Identify policy owners and split domain, transport,
data and composition where it hides a real decision. Retain transactional SQL
rechecks and live authority. Existing migration SQL is historical deployment data,
not something to rewrite merely to remove textual duplication.

Review staff invitation contact validation separately: its Unicode control rejection
is broader than account contact validation. Do not collapse these as identical until
the intended policy is established and differences have regression coverage.
Download email validation and auth rate-limit selectors also have distinct contracts.

## Application and native boundaries

Audit shared Home/data hooks, web routing, renderer wiring, main/preload IPC contracts,
release catalog and download transport. Identify data-shape ownership and repeated
endpoint/native channel decisions. Preserve sender-frame validation and native
isolation. Move business decisions out of shared UI where found, following Figma
requirements for changed components.

## Tooling

The original three dynamic-provider imports have been consolidated into the
validated installed-tool capability documented in `browser-tooling.md`. One exact
dynamic-import exception remains deliberate; its tests run in self-hosted CI. Audit all
verification, packaging, deployment and browser scripts for shared policy, error
semantics and misleading evidence. Preserve self-hosted isolation and provider
permissions. Extend checks to new aliases/import patterns with negative fixtures.

## Completion evidence still required

- Complete concept ownership and explicit public interfaces at meaningful boundaries.
- File/function/abstraction review across all source areas, with evidence and fixes.
- Resolve or deliberately justify outstanding architectural exceptions; migration
  exceptions alone do not fulfill the end state.
- Review CSS, configuration, SQL and generated artifacts outside the JS/TS graph.
- Applicable type/lint/build, backend behavior/integration, shared UI and consumer
  fidelity/loading checks on the final state.
- Inspect self-hosted CI on the exact published development SHA; do not substitute
  local results for remote checks or production evidence.

## Local validation of the first tranche

`npm run check` passed across UI, desktop, web, Worker and Stage 0. Seven architecture
checker tests, thirteen CI-policy/tooling tests, and four account integration tests
passed. Workspace lint and skill validation passed. The architecture gate passes
with eight disclosed migration exceptions. These results do not verify Figma
parity, remote CI, deployment or the outstanding whole-codebase review.

The full local Stage 0 suite also passed: 52 files, 670 tests. This covers existing
backend behavior after contact normalization consolidation; it does not prove the
remaining architectural migration is complete.

## Domain tranche: action policy and contact delivery

- `domain/access.ts` owns action names, write classifications, grant eligibility
  and scope validation. SQL access predicates, grant validation and initial
  organization grants consume it. The existing `contracts.ts` export surface
  re-exports the vocabulary without independently defining it.
- SQL guards still recheck live session, tenant, membership, scope and assurance.
  No preflight permission result replaces transactional enforcement.
- Contact normalization remains in `auth/contact.ts`; verification email
  construction and delivery outcomes now live in `auth/contact-delivery.ts`.
- `backend-domain` ownership excludes the corresponding paths from the backend
  zone and forbids back-imports and external dependencies. A negative test proves
  this boundary fails when a domain module imports storage or an external client.
- Action tests independently specify all eleven actions, exercise both staff
  grant presets, reject inherited/unknown names and malformed scopes, and verify
  the policy table cannot be mutated at runtime.

## Figma source-context dependency

Fresh source retrieval was attempted on 2026-11-06 before UI edits. Figma returned
its Starter-plan MCP tool-call limit for WorkflowPreview, PinnedWorkflow,
HeroWorkflowScene, HeroStageSheet, MobileWorkflow, EmailDownloadLink and
ProgramOverview. DatePicker returned sparse metadata requiring child contexts and
a screenshot. Other retrieved component-set responses do not satisfy those missing
requirements. No UI code was edited in this tranche. Resume required source
retrieval when tool capacity is available; do not bypass it by assuming historical
captures prove current Figma state. Raw temporary responses are in
`/tmp/ovelle-figma-context` in this working environment and may not persist.

The earlier exact-head CI run for `7f4fe6e` was still queued on isolated self-hosted
capacity when checked during this tranche. No hosted fallback was introduced.

Domain-tranche local validation passed: all workspace/Worker/Stage 0 type checks,
workspace lint, eight architecture tests, thirteen CI-policy tests and the full
Stage 0 suite (53 files, 683 tests). The architecture check reports eight unchanged
UI/tooling migration exceptions. This is local evidence only.

## HTTP, secret representation and tooling tranche

- `http/response.ts` now owns private response headers for both adapters and the
  composition boundary. Policy is applied in place, preserving separate flow and
  session cookies. The direct internal session handler now emits the same CSP as
  other adapters and composed responses; this is an intentional consistency fix.
- `http/body.ts` owns bounded UTF-8 JSON stream decoding. Provider verification no
  longer imports the browser transport helper just to decode JSON.
- Current route adapters/browser helpers and backend composition have separate
  architecture zones. Backend services cannot import them. HTTP foundations cannot
  import backend services. A negative fixture exercises the actual repository map.
- `domain/base64url.ts` owns byte encoding; `auth/secrets.ts` owns random secret
  generation, format and stored hex digest. Sessions, OIDC transactions, desktop
  PKCE, passkey encoding and admission-key canonicalization reuse these owners.
  Domain-separated HMAC inputs remain protocol-owned: notably the existing raw
  session-CSRF string is unchanged, and is checked against an independent vector.
- Browser verification and recording use `scripts/browser-tooling.mjs`. Overrides
  must resolve to installed `file:` modules and expose the requested interface.
  Remote/inline/native module specifiers are rejected. Missing or malformed
  providers fail explicitly. Default installed Playwright was launched and used
  for a real local button interaction; the installed recording driver also loaded.
- Local verification passed: all type checks; nine architecture tests; three
  tooling-provider tests; workspace lint; thirteen CI tests; and 689 backend tests
  across 55 files. The gate scans 191 code files and reports five UI cycle findings
  plus one deliberate tooling capability exception. No UI implementation changed.

Still outstanding: Figma-dependent UI cycles and variant/consumer evidence; full
application/native and feature/persistence ownership review; non-JS/TS artifacts;
final build/browser checks; and successful CI on the final published source.

## Native download boundary tranche

- Moved download IPC authorization and HTTP handling out of application lifecycle
  into `apps/desktop/src/main/downloads.ts`. Sender-frame and document checks
  remain inside every IPC invocation. The trusted renderer URL is fixed at startup.
- Main and preload now import one closed channel vocabulary from the native-free
  `desktop-contracts` zone. Negative architecture fixtures reject renderer imports
  of main and native dependencies in contracts. No new exception was added.
- Added `check:electron-ipc` against the built Electron application: real preload
  and main IPC with fixture HTTP responses, invalid payload rejection without
  outbound requests, non-success/delivery-failure propagation, navigation revocation
  and expected BrowserWindow preferences. This is not proof of real email delivery
  or OS-level sandbox enforcement under Playwright automation.
- Desktop build, all repository type checks, desktop lint and ten architecture
  tests pass. Architecture scans 194 files with the six previously recorded
  exceptions. UI implementations and CI configuration were not changed.

Application data-shape ownership, shared Home/hooks, broader backend and non-code
reviews, Figma-dependent UI work and final remote CI evidence remain outstanding.

The existing Electron download check also passed against the live development
release catalog, including the restricted external download handoff. Its email
HTTP call was intercepted, so no message was sent. Local native checks used a
temporary Xvfb display with GLX disabled after this host's graphics driver crashed
with GLX; no CI service or host package installation was changed.

## Staff validation and invitation delivery tranche

- `Grant` now belongs beside `Action` and `Scope` in `domain/access.ts`; the
  existing `contracts.ts` surface re-exports it. Staff validation no longer needs
  to depend on the request/storage contract module for a pure policy type.
- `staff/validation.ts` is enforced as backend-domain code. It owns staff
  identifiers, versions, canonical grant offers and invitation email normalization.
  Invitation normalization still rejects all Unicode Cc controls; account contact
  normalization retains its existing C0/DEL rule, and mail transport retains its
  additional mailbox restrictions. Independent tests preserve these distinctions,
  length/version boundaries, semantic duplicate rejection and caller immutability.
- `staff/invitation-delivery.ts` owns post-commit mail and persisted outcomes. Both
  create and resend call it after commit; its version/token/pending guard prevents
  old delivery completion from overwriting a newer token's outcome. Provider
  diagnostics remain excluded from API errors, audit and receipts.
- Invitation manager, issuer and recipient SQL authority remains local to
  `invitations.ts`. These predicates implement different authorities and lifetimes;
  they were not combined into a generic permission abstraction. Atomic checks,
  sealing, receipt replay and admission budgets are unchanged.
- Focused validation passed: 113 tests across staff normalization, action policy,
  invitation transactions and auth mail. All repository type checks, workspace
  lint and eleven architecture tests passed. The gate scans 196 source files with
  six unchanged exceptions. No UI, migrations, provider state or CI configuration
  changed in this tranche.

This review does not complete the remaining backend features or the repository-wide
completion requirements above.

The complete local backend suite passed after this tranche: 692 tests in 56 files.
This includes staff membership/ownership, HTTP boundaries, migrations, sessions and
federation regression coverage. It is local evidence, not remote CI or deployment.

## Authentication admission and environment policy tranche

- Reviewed `auth/limits.ts`, its consumers' distinct start purposes and existing
  D1 lease/refund tests. Extracted keyed selector derivation and window lifetimes
  to `auth/budgets.ts`, enforced as backend-domain with no persistence imports.
  Exact HMAC domain/version, JSON encoding, selector normalization and counter
  lifetimes remain unchanged; independent Python-HMAC vectors cover all four IDs.
- Replaced the positional email boolean with an explicit challenge/email policy
  choice. Provider/passkey/native/SAML starts share the private non-refundable
  consumption operation. Public purpose-specific methods remain stable; they do
  not expose a general caller-controlled rate-limit key or alter refund semantics.
- `config.ts` owns immutable hosted auth origins consumed by config validation and
  mail capability construction. Local fixture gates, mail sender validation,
  binding capture and disabled public-auth rollout state remain unchanged.
- Focused validation passed: 90 tests in admission, counter derivation, config and
  mail; all repository type checks and twelve architecture tests. The gate scans
  198 source files and retains six previously disclosed exceptions.

Outstanding work remains as listed above. Mechanical boundaries and these feature
reviews do not establish the whole codebase's completion.

The full local backend suite passed after the final start-path consolidation:
695 tests across 57 files, plus Stage 0 type checking and workspace lint. No
migrations, provider settings, UI code or CI configuration changed.

## Command shape and HTTP input boundary tranche

- Reviewed authentication transport helpers and found desktop handoff and SAML
  transactions consuming `http-input.ts` for a transport-independent shape check.
- Replaced that mixed module with `domain/input.ts` (exact object fields) and
  `http/input.ts` (URL segment decoding and grant DTO shape). Updated every service
  and adapter caller and removed the old module; feature documentation now points
  to the current owners. Domain shape validation cannot import HTTP or services.
- Kept value validation at services: transport grant parsing does not validate
  action eligibility or dimensional scope. Tests demonstrate that distinction,
  exact required-own-field handling, unknown-field rejection and single URL decode.
- Cookie readers were also inspected; session/strict-flow/OIDC/SAML policies still
  need a dedicated semantic review before consolidation. Their SameSite policies
  differ intentionally and are not candidates for a single default cookie policy.
- Verification passed: all repository type checks, workspace lint, thirteen
  architecture tests and the full backend suite (698 tests in 58 files). The gate
  scans 200 source files with six unchanged exceptions. No UI, provider, migration
  or CI configuration changed. Whole-codebase completion remains unproven.

## Cookie transport ownership tranche

- Reviewed all four cookie readers and attribute policies. Shared only the
  equivalent unique-cookie selection used by session, strict-flow and SAML. Kept
  OIDC's stricter whitespace parsing, and left each protocol's attribute/expiry
  policy explicit. No secret is decoded or unquoted by the common reader.
- Moved OIDC binding-cookie parsing/serialization out of its transaction service
  into `auth/oidc/cookies.ts`. Routes and tests consume the new owner directly;
  no compatibility re-export remains. Architecture rejects service back-imports.
- Added regression coverage for absent/duplicate cookies, embedded equals,
  non-decoding, protocol-specific whitespace, local/hosted names, Strict/Lax
  attributes and clear-cookie expiry. Existing SAML/session integration tests
  exercise the actual adapters; serializers retain their prior behavior.
- Repository type checks, workspace lint and fourteen architecture tests passed.
  This remains part of the active whole-repository migration, not completion.

The complete backend suite passed: 701 tests across 59 files. Architecture scans
203 source files with six unchanged exceptions. No UI, migration, provider or CI
configuration changed; browser-wide final verification remains outstanding.

## Public Worker and release feature tranche

- Reviewed the public Worker, download email handler, command receipts and D1
  batch boundary. Extracted catalog and archive transport from `worker.ts` into
  `releases.ts`; Worker routing/health/assets remain in a separate composition
  zone, and services cannot import that entry point.
- Preserved server catalog ordering, copy, fallback version, environment CDN,
  availability HEADs and no-store URLs. Download path/method checks, metadata-only
  HEAD, missing-object handling, direct streaming without signing credentials and
  five-minute signed redirects are unchanged. No cross-request cache was added.
- Seven runtime tests pass with fixture R2 and actual local AWS URL signing. They
  cover response behavior, storage failures and Worker routing, including the
  continued 404 for Stage 0 routes. These are not live R2 or deployment evidence.
- Download email validation/quota checks, all repository type checks, workspace
  lint and fifteen architecture tests passed. The current graph has 205 files and
  six unchanged exceptions. CI and provider configuration remain unchanged.
- `commands.ts` retains receipt replay and commit coordination as one coherent
  transactional responsibility: replay rechecks live authority and request digest;
  a conflicting concurrent commit can replay only after those checks. `db.ts`
  retains guarded batch and audit-statement construction. No storage abstraction
  was introduced that would hide required SQL guard/receipt ordering.

Still pending: the broader feature review, shared application/release shape
ownership, Figma-dependent UI work, tooling/non-JS/TS review and final verification.
The public download email module has distinct input, quota and delivery concerns
that need a further responsibility review; passing its existing check is not that
review's completion.

## Public download email responsibility review

- Completed the deferred handler review. Kept one feature module and one public
  operation; introduced private named operations for HTTP recipient validation,
  quota reservation and message construction/provider acknowledgement. These are
  meaningful responsibilities without adding a generic mail or quota framework.
- Preserved method/origin/content-type/body-limit/address checks and error order,
  development-only sender gate, hash/window formats, counter semantics, cleanup,
  email content and acknowledgement requirement. Validation remains outside the
  delivery catch, preserving stream-failure behavior. No Stage 0 validator or
  admission policy was substituted for this distinct public endpoint.
- Documented conservative quota semantics: provider failure retains reservations;
  a rejected counter does not refund the other counter's successful increment.
- Expanded the SQLite-backed executable check to prove invalid/config-disabled
  requests never reserve, provider failures consume the recipient allowance,
  quota denial precedes provider invocation, safe no-store errors omit diagnostics,
  and oversized request streams are cancelled. Existing concurrent quota checks
  and sender/content assertions continue to pass. All delivery is fixture-only.
- Worker type checking, architecture checking, fifteen architecture tests and
  diff checks passed. No new public API, architecture exception, CI change,
  provider mutation, migration or UI change was introduced.

The whole-codebase migration remains active; the remaining areas and final
verification requirements above are not satisfied by this feature review.

## SQL binding ownership review

- Found `Bindings` exported from authorization policy despite having no permission
  semantics. Moved it beside `SqlValue` in `db.ts` and updated all eight consumers;
  no legacy re-export remains. Access policy imports the type from storage.
- Receipt coordination no longer imports access policy to assemble parameters.
  Existing policies, parameter values/order, guarded batch sequencing and audit
  SQL are unchanged. This moves a real shared storage concern to its owner without
  introducing repository interfaces or hiding SQL authority behind preflight checks.
- Verification passed: full backend suite, 708 tests in 60 files; all repository
  type checks; workspace lint; fifteen architecture tests; and diff checks.
  Graph coverage remains 205 files with six existing exceptions.

The remaining whole-repository reviews and final evidence requirements still
apply. No UI, migration, deployment, provider or CI configuration changed here.

## Account/session foundation source review

- Added `review-coverage.md` to record full-source review decisions and concrete
  behavior evidence, including why accounts, sessions and secret helpers retain
  their existing coherent responsibilities instead of being split arbitrarily.
- Pre-login now has one lifetime and one cookie signature definition for issuance
  and validation. The versioned MAC inputs, cookie expiry and CSRF domain remain
  unchanged; an independent HMAC vector checks existing-cookie compatibility.
- Turnstile's closed action tuple now owns compile-time and runtime vocabulary.
  Tests independently cover all six supported actions and reject an unknown action
  before a provider request. Existing provider failure/size/time checks remain.
- These reviews do not imply review completion for federation/recovery/passkey
  internals, application/UI, tooling or non-JS/TS artifacts. Those remain in scope.

Validation for this review passed: 56 focused tests in six authentication files,
all repository type checks, workspace lint, fifteen architecture tests and diff
checks. No provider requests, UI changes, migrations or CI changes were made.

## Recovery/passkey source review

- Read recovery service/routes and passkey protocol/service/routes in full and
  recorded ownership decisions in `review-coverage.md`. Retained the existing
  protocol/persistence/HTTP separation and atomic authority checks.
- Recovery-code issuance and consumption now share one private account-bound
  digest definition. Existing tests calculate persisted digests independently.
- Recovery and passkey adapters now use the domain-owned exact object parser,
  preserving their field sets, error handling, value checks and body limits.
- Identified session/passkey/SAML duration relationships for the remaining
  federation review; no timeout or authorization behavior was changed by guesswork.

Validation passed: 88 tests across eight recovery/passkey files, all repository
type checks, workspace lint and fifteen architecture tests. Tests use signed
fixtures and local D1; no live credential, provider setting or CI configuration
was changed. Whole-codebase review and final browser/CI evidence remain open.

## SAML protocol/service review and lifetime ownership

- Read SAML authorization, verification, transaction and contact-enrollment modules
  in full. Recorded why protocol policy and atomic replay/identity effects retain
  separate owners, and why contact verification cannot be a generic account link.
- `sessions.ts` now owns `absoluteSessionLifetimeMs`, used by ordinary, passkey and
  SAML issuance and SAML pending/contact enrollment caps. All existing arithmetic,
  authentication anchors and earlier provider deadlines remain unchanged.
- SAML verification names its separate maximum authentication-age policy locally;
  sharing session lifetime must not couple protocol acceptance to issuance policy.
- Existing independently written expiry tests cover original authentication time,
  provider caps, pending enrollment age and step-up preservation. No new mirror
  tests were added merely to assert a constant's numeric value.

Validation passed: 716 backend tests in 60 files, all repository type checks,
workspace lint, fifteen architecture tests and diff checks. No live provider,
credential, migration, UI or CI configuration changed. The whole migration remains
active, including final source-wide, browser and exact-head CI evidence.

## SAML HTTP review

- Read the complete SAML route adapter. Extracted its bounded strict form parser
  into `auth/saml/form.ts`, classified as transport. Retained origin/profile/cookie
  authority and callback redirects at the route boundary.
- SAML enrollment/start JSON inputs now use `exactObject` with their original
  field sets. Per-field types, CSRF and service validation remain unchanged.
- Added direct parser edge tests while retaining signed route/enrollment checks.
  Validation passed: 69 tests in three SAML files, all repository type checks,
  workspace lint and fifteen architecture tests. The graph covers 207 files with
  six unchanged exceptions. No provider, UI, migration or CI configuration changed.
- SAML source review is recorded in `review-coverage.md`; real-browser/provider
  acceptance and final exact-head CI are not inferred from local fixtures.

### OIDC settings, protocol and linking review

- Reviewed settings capture, protocol verification, identity persistence, shared
  linking policy and durable transaction orchestration. Recorded retained
  responsibilities and verification limits in `review-coverage.md`.
- Removed OIDC-specific aliases/re-exports of shared linking guards. Both identity
  persistence and transaction orchestration now import the policy owner directly.
  SQL predicates, preflight timing and final guarded writes are unchanged.
- Added these five concept owners without expanding dependency permissions or
  exceptions. OIDC's provider JSON parser has different acceptance semantics from
  the shared HTTP parser; unifying them is not a behavior-preserving substitution.
- Verification: 91 focused OIDC/recovery tests across six files, all workspace and
  backend type checks, workspace lint and 15 architecture tests passed. The graph
  remains 207 code files, six explicit exceptions and zero errors.
- OIDC enrollment/routes still need their remaining source review. Whole-repository
  completion, Figma-dependent UI cycles and final runtime verification remain open.
  No CI configuration or runner changes were made.

### OIDC enrollment and HTTP review

- Completed source responsibility review of enrollment and routes. Retained atomic
  account/identity/audit/enrollment completion, followed by independently guarded
  session issuance, and version-guarded post-commit mail outcomes.
- Enrollment owns its pending lifetime, consumed by record creation and the browser
  cookie. Contact challenge expiry remains capped by the original enrollment deadline.
- Reused the shared exact-object validator in OIDC HTTP decoding and clarified
  private enrollment helper names; request/error/transaction behavior is preserved.
- Added independent late-submission/exclusive-expiry and cookie-duration assertions.
  All 38 focused tests across four files passed, together with type checks, lint
  and 15 architecture tests. Six existing architecture exceptions remain.
- This completes the recorded OIDC source group review, not the whole migration or
  live provider/browser verification. Remaining application/UI, staff/access and
  tooling/configuration reviews and final integration evidence still apply.

### Staff membership, ownership and route review

- Replaced optional-grants mode selection in the shared membership transaction
  with an explicit revoke/replace-grants operation. Empty replacements remain
  active memberships. Receipt digests, live scope checks and atomic writes retain
  their existing semantics.
- Removed the HTTP input module's forwarding export of domain object validation;
  migrated all four remaining route consumers directly to its owner.
- Recorded source reviews for membership/ownership services and staff/access
  adapters, including promotion readiness, two-party acceptance and request-time
  versus acceptance-time recency. Added the two service concept owners.
- Verification: 80 tests across seven focused suites passed, including an explicit
  clear-grants-then-revoke scenario; all type checks, lint and 15 architecture tests
  passed. Existing six exceptions remain unchanged. No CI/runner changes made.
- Remaining whole-codebase review and final runtime/UI evidence remain open.

### Remaining staff/access service review

- Reviewed invitation lifecycle/delivery/validation, organization reads/commands,
  access policy/advisory capabilities, command receipts and database guards.
  Recorded retained responsibilities and exact authority/transaction distinctions
  in `review-coverage.md`; added missing access-service concept owners.
- Access reads now reuse canonical base64url byte encoding and exact-object shape
  validation. Cursor version, organization binding, strict decoding, canonicality
  and live page authorization remain local and unchanged.
- Full backend verification passed: 730 tests in 61 files, all type checks,
  workspace lint and 15 architecture tests. The graph remains 207 code files with
  six explicit exceptions and zero errors. CI/runner configuration was not changed.
- Staff/access source review is recorded, but remaining desktop/auth adapters,
  application/UI, tooling/configuration/SQL and final runtime evidence still prevent
  whole-goal completion.

### Desktop handoff and authentication transport review

- Reviewed desktop request/approval/exchange and common session/browser adapters.
  Recorded exact callback, PKCE, one-use transaction, source provenance/expiry,
  CSRF and server-selected transport boundaries in `review-coverage.md`.
- Removed generic HTTP forwarding exports from `auth/web.ts`. All route and
  browser-test-worker consumers import response/body owners directly; browser-flow
  origin and cookie helpers remain in their existing owner.
- Full verification passed: 730 backend tests in 61 files, type checks, workspace
  lint and 15 architecture tests. Six existing exceptions remain unchanged.
- Server fixture coverage does not prove shipped Electron auth or live browser/
  provider flows. Remaining application/UI, tooling/configuration and final runtime
  evidence still apply. No CI settings or runner changes were made.

### Composition/configuration and contract review

- Reviewed backend composition, hosted configuration, mail/contact helpers,
  shared capability contracts and safe response/error foundations.
- Removed the unused caller requestDigest field from CommandContext and migrated
  all callers. Receipt derivation remains exclusively in commands.ts. The replay
  test still deliberately injects a runtime digest and rejects changed content.
- Removed unsupported password_reset from the advertised AuthEmail kind union;
  runtime rejection coverage remains intact. This does not enable password auth.
- Full verification passed: 730 tests in 61 files, type checks, lint and 15
  architecture tests. No CI/runner changes made.
- Current source-to-ledger comparison leaves 12 backend files without explicit
  rows: public Worker/releases/download-email; admission budgets/limits; OIDC
  cookies; domain access/base64url/input; HTTP body/cookies/input. Earlier migration
  notes exist for several, but must be reconciled with current source before
  claiming complete backend review. Other source areas and final evidence remain.

### Backend review-ledger reconciliation

- Reread the 12 remaining backend sources and reconciled their earlier migration
  evidence into explicit responsibility/retention entries. All current backend
  TypeScript files have review rows; that is source coverage, not whole-goal proof.
- Rechecked public download-email fixtures and all 15 architecture tests; the graph
  still has 207 code files, six explicit exceptions and zero errors. This tranche
  changes documentation only; the prior 730-test run remains the latest full suite.
- Began application review: Home duplicates release metadata and marks fallback
  URLs available without R2 evidence; UI owns the presentation type and the native
  loader returns unchecked JSON. These require coordinated contract/fallback work
  with component/Figma and consumer verification. GitHub-star cache behavior also
  needs application-level verification. Details are in review-coverage.md.
- UI cycles, broader tooling/configuration/SQL review and final runtime/CI evidence
  remain outstanding. No CI/runner or provider settings were changed.

### Figma recheck and browser integration evidence

- Rechecked Figma design context for manifest node 165:5351 with screenshot
  requested. The service still returns Starter-plan MCP quota exhaustion. Session:
  1ee7aad9-baff-4247-97d9-986e843fedb8. Required component context/screenshots remain
  unavailable, so no component implementation was changed in this tranche.
- Reviewed shared browser fixture harness/proxy responsibilities. Proxy contract
  test passed. Real Chromium passkey verification passed using a virtual CTAP2
  authenticator; OIDC passed Chromium and Firefox; SAML Chromium passed.
- Full OIDC/SAML commands terminated at WebKit launch due to missing host libraries
  libevent-2.1-7t64 and libavif16. The matrix is incomplete, not green. No runner,
  host dependency, CI configuration or provider change was made.
- Evidence uses loopback HTTPS, workerd and ephemeral D1 with fixture providers;
  no real IdP/mail or production claims. Application/UI work remains pending its
  source requirements; independent tooling/configuration review can continue.

SAML Firefox 157.0 was also verified in a separate successful run after the
matrix interruption. WebKit remains unverified for the missing-library reason.

### Release verifier policy boundary

- Reviewed release verification/repacking and repository privacy tooling. Extracted
  signed-download redirect checks into a pure owner with independent tests.
- Fixed verifier false-acceptance: missing, negative and nonnumeric expiry formerly
  passed the sole upper-bound comparison. Require one canonical positive expiry
  up to 300 seconds, one expected algorithm, HTTPS and exact destination without
  credentials, nondefault port or fragment before following the redirect.
- Three focused tests and all 15 architecture tests passed; source syntax checks
  and tracked-tree privacy scan passed. Graph: 209 files, six existing exceptions,
  zero errors. No repack, deploy, remote download or CI/runner change occurred.
- This improves verification correctness; it does not resolve application catalog
  duplication, Figma-dependent UI work or missing WebKit/runtime evidence.

### Password research tooling ownership

- Reviewed local/hosted password research modules and their evidence boundaries.
  Consolidated immutable KDF sizes/work factors so parameter validation and actual
  derivation consume one owner. Algorithms and independent vectors are unchanged.
- Five password-runtime tests passed, including both vectors/wrong passwords and
  mutation of every numeric profile field. Three mocked hosted-runner tests passed.
  Type checks, lint and 15 architecture tests passed; final test types rechecked.
- No hosted probe, remote Worker creation, credentials, CI configuration or provider
  settings changed. The benchmark remains research tooling, not production auth.
- Application/UI, broader tooling/non-code review, Figma source access and final
  runtime/CI evidence remain outstanding.

### Architecture verifier import resolution boundary

- Closed a checker blind spot: absolute paths, URL imports and package # aliases
  were treated as external packages and could bypass source ownership checks.
  They now fail as unsupported until deliberate resolution is implemented.
- Declared the existing runtime virtual module cloudflare:test exactly in the tests
  zone. Backend/app use and subpaths fail. This preserves a known fixture capability,
  not a wildcard alias allowance; no exceptions or dependency edges were broadened.
- All 17 architecture tests pass, covering static/export/type/dynamic/require forms,
  legitimate package imports, Node restrictions and virtual-module scope. Current
  scan: 209 files, six prior exceptions, zero errors. CI config remains unchanged.
- Recorded checker source responsibilities and limits. UI/application, remaining
  tooling/non-code review and final evidence still prevent whole-goal completion.

### Strict web compiler configuration

- Configuration review found strict checking omitted from both web TypeScript
  targets while UI/Electron/Worker enable it. Enabled strict for web application
  and Vite configuration; no component edits or weakened checks were needed.
- Corrected the Stage 0 test-config comment to distinguish shared repository
  migrations from isolated database state/credentials. No SQL or remote settings
  changed. Recorded target/build/package/Wrangler responsibility distinctions.
- All type checks, workspace lint and workspace builds passed. Rebuilt UI passed
  13 behavior tests. No signed desktop packaging/deployment or visual parity claim.
- CI/runner configuration remains unchanged; application release ownership, UI
  source access, SQL/CSS/tooling review and final runtime evidence remain open.

### SQL grant-policy alignment

Added real D1 insert coverage for the final migrated membership and invitation
schemas using independent action expectations. The tests preserve the distinction
between stored action vocabulary, grant issuance and live ownership authorization.
Historical migrations remain fixed; future policy changes require forward migrations.
Full Stage 0 verification passed: 733 tests in 61 files, plus workspace/backend
type checks and 17 architecture tests. Six architecture exceptions remain unchanged.
No CI, provider or production database changes. Broader SQL/CSS review and the
previously listed application/UI migration and runtime evidence remain outstanding.

### Shared release-sample verification

Consolidated the two-byte CDN sample contract for three operator commands in
`scripts/desktop-release-validation.mjs`. Fixed the domain verifier's NaN/missing
range-total acceptance and bounded sample-body consumption. Added independent
response fixtures for metadata, status, magic bytes, chunking and cancellation.
Six validator tests, 17 architecture tests and command syntax checks pass. No live
provider calls or CI configuration changes were made. Whole-codebase completion
remains subject to the outstanding application/UI, non-JS/TS and runtime evidence.

### Browser-check evidence review

Reviewed six website/component/navigation/loading verification scripts and recorded
their distinct responsibilities and evidence limits. Corrected the website check's
unsubstantiated sheet-focus claim by adding real keyboard/focus assertions, including
native Chromium's browser-chrome traversal behavior. Website checks passed at five
widths, dynamic-loading checks passed, and the component check passed 31 families
across 12 theme/material/frost settings in the web consumer. Architecture tests (17)
and syntax checks passed. No component/Figma changes or CI fixes. These local web
results do not complete the outstanding native, second-consumer or Figma work.

### Native service-envelope ownership

Added a private response-envelope decoder in desktop main and strict email success
acknowledgement. Invalid catalog envelopes now fail before reaching the renderer.
Real Electron IPC tests cover malformed JSON/envelopes, false-success values and a
valid empty catalog, alongside existing sender/input/failure checks. Desktop build,
type/lint and 17 architecture tests passed. Release-item DTO ownership/validation
and the wider application/UI migration remain incomplete; no duplicate DTO schema
was introduced to bypass that coordinated work.

### Semantic color source of truth

Added deterministic generation and drift enforcement for the existing semantic token
CSS. Local tokens.json is authoritative; explicit generation derives CSS hex values
and RGB channels. Existing CSS is unchanged byte-for-byte. Package checks/builds
run four generator/CLI tests and fail on drift without rewriting files. Workspace
and backend checks, 17 architecture tests, UI build and 13 UI tests pass. This resolves
local color duplication maintenance, not live Figma parity or all stylesheet ownership.
Fresh Figma source retrieval remains quota-blocked; component work is still incomplete.

### Entry points and CI review reconciliation

Reconciled tracked paths with the explicit review ledger, then inspected native/web
entry points, native/download verifiers and CI source/test/action boundaries. Retained
these cohesive operations with documented authority and evidence limits. Removed
unreferenced web App.css from the earlier app-shell implementation. Current entry
points never imported it; the web build passed after removal. Thirteen local CI
fixture tests passed, while the live current-SHA delivery check failed. CI sources,
runner configuration and provider state remain unchanged under the read-only request.
The whole migration is still active with the remaining source/design/runtime work.

### Shared UI foundations: review complete, fixes pending

Recorded responsibility decisions for material, skeleton, asset maps, primitive
barrel, controls/composites, calendar, pagination, empty state and GitHub link.
Confirmed all 111 FigmaAsset file references exist, and reproduced inherited-name
acceptance (`toString`, `constructor`, `__proto__`) in the current asset lookup.
Required fixes now explicitly include own-property asset lookup, shared theme-pair
ownership, private frost/page normalization and the five existing barrel cycles.
No component edits were made because current Figma context/screenshots remain
unavailable. These recorded reviews do not mark affected files compliant or finish
the remaining workflow/website/gallery/CSS/SQL/runtime review.

### Application cache boundary verification

Extended the shared-star browser verifier to cover the independent 15-minute cache
contract, future/corrupt records and storage denial in web and built desktop renderer
pages. All eight scenarios per consumer and existing behavior checks pass. Fresh
output uses a temporary directory instead of overwriting dated evidence. Architecture
tests (17) pass. Component changes remain pending current Figma access or the user's
explicit decision on the requested narrowly scoped nonvisual exception; no exception
has been assumed from elapsed time or automatic goal continuations.

### Historical SQL responsibility review completed

Recorded retention decisions for all 16 migrations and their boundary with service
clock, protocol, authorization and transaction guards. Retain historical table
rebuild definitions; they preserve upgrade history and are not generated artifacts
of current TypeScript policy. Verified the explicit distinction between session-view
validity and caller time checks, and passkey retirement versus live authentication.
No SQL/provider changes. A fresh full Stage 0 run passed 733 tests in 61 files.
This closes the migration-file responsibility inventory, not all security/remote
schema evidence or the overall objective. Remaining component/application/gallery,
CSS, recording and final browser/native/CI work remain active.

### Workflow/gallery review and nested fidelity gap

Recorded workflow, website and six gallery/demo composition responsibilities and
separated intentional fixtures from Home's unresolved real-catalog fallback.
Identified repeated workflow stage/count knowledge for the pending structural pass.
Both browser-rendered consumers pass the existing fidelity command against stored
sources, but visual inspection found the hero-sheet close surface is 44×36/radius8
rather than the stored reference's circle. Persisted its current render and CSS
specificity evidence. This remains an unresolved source-required correction, not a
visual parity claim. No component/style edits were made; the Figma exception request
remains pending. Recorder review, broader CSS and final runtime/CI evidence remain.

### Recording tool review and evidence corrections

Validated recording options before driver/browser access, rejected duplicate chapters
that overwrite earlier evidence, and recorded appearance-only mode in clip metadata.
Corrected the dynamic-loading motion probe to assert the visible SVG mask instead of
a hidden pseudo-element. Invalid CLI fixtures and valid appearance/interaction chapter
12 runs were checked; complete 13-chapter playback and a human visual watch are not
claimed. Recorder responsibility review is now explicit. Remaining component fixes,
CSS review and final-state browser/native/CI evidence still prevent completion.


### Stylesheet cascade inventory

Verified layer ancestry across all 15 tracked CSS files. All shared UI rules are
layered; the suspected appended unlayered website rules are absent. Corrected the
README's overly broad utility-override claim to disclose important wrapper and
accessibility declarations. Recorded app-versus-gallery ownership and remaining
root-default duplication/source-order cleanup. No CSS/component behavior changed.
A fresh Figma context request still returns the Starter-plan tool quota limit;
required source-backed component corrections and the nonvisual exception decision
remain unresolved. The goal is not complete.
