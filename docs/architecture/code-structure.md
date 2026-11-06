# Code structure contract

This contract applies to all maintained Ovelle code: applications, shared packages,
Worker backend, scripts, tests and design tooling. Existing Figma and runtime
verification requirements still apply. Passing the automated gate proves only the
mechanical properties it checks, not that the whole codebase has good abstractions.

## Authority and ownership

`architecture/ownership.json` owns the module boundary map and important concept
locations. Implementations own executable policy. This document owns the review
criteria. The coding skill routes to these sources instead of copying their rules.

Before adding behavior, read its owner, callers, tests and relevant architecture
notes. Extend that owner when the concept is the same. Share implementations only
when they express the same knowledge; matching text is insufficient. Derived data
must identify authoritative inputs. Caches must document lifetime, invalidation and
failure semantics. Client hints never replace server authorization. Tests must
express independent expected behavior, not calculate expectations through the
implementation under test.

Do not change provider settings, data or deployment authority as part of structural
cleanup. Preserve current live-session SQL guards and transactional invariants.

## Dependency boundaries

- Shared UI owns presentation, interactions, accessibility and material behavior.
  It must not import app code, backend policy, Node or Electron capabilities.
- Shared app code owns routing-independent application composition and data loading.
  Web and renderer code may consume it; it cannot depend on either consumer.
- Desktop main and preload own native capabilities. Renderer code cannot import
  them, even through type-only imports. Shared transport contracts should be
  platform-independent when extracted.
- Worker code cannot import frontend, test or tooling implementations.
- Public package imports must use declared package exports. Relative imports into
  UI implementation files from apps are prohibited.
- Feature modules should expose deliberate public entry points. Package-private
  implementation imports inside the same package are appropriate; importing the
  package's own barrel from its implementation creates avoidable cycles.
- Domain calculations and policy must be independent of runtime I/O. Existing
  Stage 0 SQL authorization is coupled to atomic database enforcement by design;
  do not replace it with stale in-memory preflight checks merely to resemble layers.
- Interfaces are required where they hide a real capability boundary, not for
  every function, class or database operation.

The `backend-domain` zone owns pure action/scope classification, contact
normalization and the closed error vocabulary. It cannot import backend
implementations, external packages, Node or Electron. Backend consumers may use
that zone. The `backend-transport` zone owns the current route adapters and browser
transport helpers. `backend-composition` wires those adapters to resources.
Backend services cannot import either zone. The `http-foundation` zone provides
bounded JSON decoding and private response construction without dependencies on
services or adapters. The remaining backend services still need finer feature and
persistence review; these boundaries alone do not prove whole-codebase compliance.

## Function and file review

A function must express a coherent operation, expose understandable inputs,
outputs, side effects and failures, and simplify its caller. Private helpers stay
near their consumers. Do not export speculative helpers, add meaningless forwarding
layers, silently convert errors into success, or conceal required mutable global
state. Positional booleans selecting unrelated behavior require redesign; an
options object alone does not cure mixed responsibility. A policy option such as
archived-receipt replay must document its narrow semantics and preserve guards.

Files group coherent responsibilities, not arbitrary line counts. Organize by
feature and expected change. Split independent responsibilities or hide a meaningful
decision; retain code together when splitting leaks private knowledge. Do not add
broad `utils`, `misc` or `common` dumping grounds. Line count, complexity and clone
reports are review signals, never automatic instructions to fragment code.

For each new shared abstraction identify its concept, real consumers, private
decisions and why using it requires less knowledge. One consumer is sufficient
when encapsulation provides value. Reconsider abstractions that accumulate caller
flags, bypasses, unrelated branches or repetitive forwarding layers.

Comments explain intent, constraints, side effects and non-obvious decisions. Do
not restate implementation line by line or duplicate changeable policy constants.

## Changes and verification

Declare behavior versus structural scope before implementation. Preserve public
contracts, errors, permissions, loading behavior and side effects unless the task
explicitly changes them. Update consumers together with intentional contract
changes. Remove obsolete task-related paths after migration; temporary compatibility
requires a removal condition. Preserve unrelated work.

Run `npm run check:architecture` and `npm run test:architecture` for structural
changes. Run relevant type checks and behavior tests; use integration tests for
storage/native boundaries and existing Figma/loaded/skeleton checks for components.
A refactor must retain observable behavior, not merely compile. Never weaken tests
or mock away the boundary used to claim success. Distinguish local, fixture, CI and
live evidence. All CI remains self-hosted.

Before completion verify owner, absence of competing policy, dependency direction,
minimal public interface, meaningful abstraction, explicit effects/errors, relevant
behavior tests, removal of obsolete code and disclosure of exceptions. Report the
actual checks and their scope. A passing architecture check is not whole-goal
completion. Follow the existing development publishing instructions.

## Mechanical enforcement and exceptions

The syntax-based checker covers all tracked and nonignored untracked JavaScript and
TypeScript files. It checks unique zone ownership, local import resolution, static,
re-export, require, import-type and dynamic-import forms, output-to-source extension
mapping, direction, native/browser boundaries, UI external imports, package export
subpaths and dependency cycles (including type dependencies).

Limitations: it does not analyze CSS imports, dataflow, hidden global I/O, aliases
configured outside this map, transitive dependency internals, duplicate business
meaning or abstraction quality. It is not a security sandbox. Type checking, tests
and source review remain required. Absolute paths, URL modules and package `#` aliases fail as unsupported import
specifiers rather than being mistaken for external packages. Exact virtual modules
may be declared per zone: only tests currently declare `cloudflare:test`, supplied
by the test runtime. This is not a wildcard protocol or alias allowance. Other new
import aliases need explicit resolution support and negative tests before adoption.

`architecture/exceptions.json` is an exact finding list, never a wildcard ignore.
Each entry needs a reason, removal condition and tracking reference. Stale and
duplicate entries fail. There is no baseline-update command. Do not add exceptions,
weaken checks or expand allowed dependencies to make a change pass silently.
Explain the architectural change and keep it inside the user's authorized scope.
Existing debt remains incomplete migration work even when explicitly excepted.
A deliberately retained runtime capability must identify its owner, input trust
boundary, validation and tests; it is not interchangeable with migration debt.
The installed browser-tooling capability is documented in `browser-tooling.md`.

## Research basis

These are engineering policies synthesized from primary sources, not universal
scientific laws or arbitrary size limits:

- [Hunt and Thomas: knowledge duplication](https://media.pragprog.com/titles/tpp20/dry.pdf)
- [Parnas: information hiding](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html)
- [Fowler: intention-revealing functions](https://martinfowler.com/bliki/FunctionLength.html)
- [Ousterhout: deep modules](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)
- [Metz: wrong abstractions](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- [Bogard: feature/use-case organization](https://www.jimmybogard.com/vertical-slice-architecture/)

## Desktop download boundary

`apps/desktop/src/contracts/downloads.ts` owns the closed IPC channel vocabulary.
Main and preload consume it; it cannot import native, application or third-party
code. `main/downloads.ts` owns IPC registration, per-invocation sender checks and
the development download service requests. Its registration input is the trusted
renderer URL fixed at startup. The lifecycle entry point owns windows and the
external-navigation allowlist. The preload exposes only the two named operations;
it does not expose generic IPC invocation.

`npm run check:electron-ipc` runs against the built desktop application and requires
a display (a local virtual display is sufficient). It uses real Electron IPC with
fixture HTTP responses to check payload rejection, service failures and revocation
after navigation. It does not prove upstream delivery or OS-level sandboxing:
Playwright launches Electron with its automation flags. The separate existing
`check:electron-downloads` checks the live development catalog and native external
handoff; its email HTTP response is also a fixture, not a sent message.

Staff validation is part of `backend-domain` even though its file remains beside
its feature consumers. Its `Grant` type comes from the domain owner, not the
request capability contracts. Invitation delivery is a backend effect: it combines
post-commit sending with version/token-guarded outcome persistence. Keep that
operation separate from contact verification's non-persistent delivery helper;
sharing their similar mail calls would conceal different failure semantics.

Authentication admission has two owners: `auth/budgets.ts` derives versioned keyed
counter identities and window lifetimes without database access; `auth/limits.ts`
owns atomic consumption, bounded cleanup, leases and refunds. Flow-start selectors
are intentionally opaque identifiers, not mailboxes. Do not substitute contact or
invitation normalization for the admission selector contract. Start operations
share a non-refundable consumption path; verification attempts retain their leases
and window-aware refunds. Historical SQL migrations own the deployed counter
ceilings and remain unchanged by this separation.

`config.ts` owns the hosted auth-origin table. Mail setup consumes that table while
independently validating its binding, sender and RP ID; sharing the origin policy
does not remove validation at the mail capability boundary or enable public auth.

`domain/input.ts` owns exact object-shape validation for command and adapter
callers. It rejects unknown enumerable fields and can require named own fields;
it neither coerces values nor proves their meaning. `http/input.ts` owns decoded
path segments and transport grant shapes. Domain services import the shape owner
directly, and retain their own value and authorization checks. Avoid coupling a
service to HTTP solely to reuse a shape predicate.

`http/cookies.ts` owns unique named-cookie selection shared by session, strict-flow
and SAML readers. It rejects duplicates without decoding or unquoting values;
callers retain secret validation. OIDC keeps its stricter whitespace parser in
`auth/oidc/cookies.ts`, which is a transport owner and cannot be imported by OIDC
transaction services. Cookie naming, expiry and SameSite remain protocol-owned:
Strict sessions/flows, Lax OIDC redirects and Secure/None SAML POST bindings are
different policies, not interchangeable serializer defaults.

The public Worker is a separate composition owner. `releases.ts` owns the release
catalog, metadata-backed availability and R2 download transport; it cannot import
the Worker entry point. Storage failures propagate instead of becoming absent
releases. HEAD does not read bodies or sign URLs. Clients and signed URLs are
request-scoped, with no cross-request cache. UI fallback catalog/type ownership
still requires the shared-application review; this server boundary alone does not
resolve that separate concern.

`db.ts` owns SQL value types and numbered binding assembly alongside guarded D1
batches and audit statement construction. `access/policy.ts` consumes that binder
as a type and owns only live authorization predicates. Receipt coordination uses
the storage owner directly; it must not import authorization merely for parameter
assembly. Predicate callbacks remain responsible for their live SQL conditions.
