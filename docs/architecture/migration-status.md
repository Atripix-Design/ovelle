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

Three dynamic-provider imports are exact exceptions. Review their portability and
capability contract rather than deleting configuration support blindly. Audit all
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
