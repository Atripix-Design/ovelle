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
