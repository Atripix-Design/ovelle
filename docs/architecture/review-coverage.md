# Source responsibility review coverage

This records explicit source reviews, including decisions to retain existing
boundaries. It supplements `migration-status.md`; it is not a completion checklist
that can turn green merely because a file appears here. Unlisted files remain
unproven by this ledger. Final whole-repository verification is still required.

## Account and session foundation

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/auth/accounts.ts` | Retain account creation/own-account reads and private row projection together. Contact normalization already has its own owner. Account/audit insertion stays atomic; creation does not establish verified identity or membership. Own-account reads recheck live session authority in SQL. | `accounts.test.ts`: unverified creation, plus addressing, duplicate refusal, malformed input before writes, fabricated account/session rejection. |
| `src/cloudflare/stage0/auth/sessions.ts` | Retain issuance, resolution, rotation and revocation as credential lifecycle operations. Row projection and live-session predicates are deliberate reusable service interfaces. Prepared issuance remains a statement plus safe result for callers to commit with their own evidence; it must not commit independently. Rotation preserves authentication time and absolute expiry. Keep session-CSRF's raw-string HMAC domain distinct from JSON-context MACs. | `sessions.test.ts`, `http-sessions.test.ts`, `secret-representation.test.ts`: storage secrecy, expiry, federation versions, revocation, audit rollback, transport separation, cookies and independent CSRF vector. |
| `src/cloudflare/stage0/auth/secrets.ts` | Retain random-secret representation, stored digest, MAC and comparison together. No password hashing belongs here. Protocol callers own domain-separated context values; raw session-CSRF compatibility must not be forced into this JSON MAC interface. No request or storage capability is hidden in these helpers. | `secret-representation.test.ts` plus protocol integration tests. This is behavior evidence, not a cryptographic certification. |
| `src/cloudflare/stage0/auth/prelogin.ts` | Retain this browser transport owner: origin checks, signed cookie verification and CSRF bootstrap are one protocol. Consolidated its lifetime and cookie signature definition so issuance and verification cannot drift independently. Cookie reissue retains the original deadline. | `prelogin.test.ts`: exact expiration, cookie reuse, wrong origin/environment/CSRF, duplicate cookies and independently generated HMAC compatibility vectors. |
| `src/cloudflare/stage0/auth/turnstile.ts` | Retain a single provider adapter with an explicit injectable fetch capability. The action tuple now owns both the TypeScript vocabulary and runtime membership check. Fixed endpoint, no redirects, timeout, bounded JSON, hostname/action and time checks stay together; failure detail is collapsed at this boundary. | `turnstile.test.ts`: request contract, every supported action, unknown-action rejection before I/O, provider/network/body failures and timestamp boundaries. |

The broader federation, passkey, recovery, staff and access reviews are not implied
by the session foundation entries. UI/application, tooling, configuration, SQL and
generated artifacts also need their remaining review and final evidence described
in `migration-status.md`. A matching-looking validator or constant is not sufficient
reason to share policy across these domains.

## Recovery and passkeys

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/auth/recovery.ts` | Retain provider-proof admission, code issuance/consumption and replacement-enrollment guard together as account recovery. They share security-epoch and one-time credential semantics. Consolidated the account-bound stored code digest. Provider proof alone stays enrollment-only; code consumption atomically changes the epoch and revokes sessions. Metadata reads do not reveal secrets, and rotation cannot replay plaintext codes. | `recovery-codes.test.ts`, `provider-recovery.test.ts`, recovery schema/migration tests: independent persisted digest calculation, account binding, concurrency, authority/recency, revocation, one-time use and replacement completion. |
| `src/cloudflare/stage0/auth/recovery-routes.ts` | Retain browser routing, origin/CSRF and explicit confirmation at the adapter. Reuse `exactObject` rather than maintaining another equivalent field whitelist implementation. Numeric/code meaning remains service-owned. | `recovery-code-routes.test.ts` and provider-recovery HTTP tests. |
| `src/cloudflare/stage0/auth/passkeys/protocol.ts` | Retain the maintained WebAuthn verifier adapter separately from persistence. Ovelle envelope/attestation restrictions surround, not replace, signature verification. Algorithm choices, top-level origin policy, credential bounds and transport hints are coherent protocol decisions. Returned hints never establish authority. | `passkey-protocol.test.ts`: signed fixture registration/authentication, malformed envelope, origin/RP/challenge and user-verification cases. Final real-browser verification remains separate. |
| `src/cloudflare/stage0/auth/passkeys/service.ts` | Retain challenge issuance/claim, registration, login and step-up orchestration together. Private helpers expose shared transaction predicates and row preparation; splitting each SQL statement into a repository layer would obscure atomic credential/account/challenge checks. Recovery registration shares these mechanisms but keeps its explicit epoch/old-key/session invalidation transaction. Admission callback is a trusted adapter capability, not a request field. | `passkeys.test.ts`, `provider-recovery.test.ts`: challenge replay, counters, concurrent operations, recency, account binding, provenance and recovery replacement. |
| `src/cloudflare/stage0/auth/passkeys/routes.ts` | Retain fixed browser routes, flow CSRF/cookies and payload dispatch. Reuse exact object-shape parsing while preserving per-operation fields and byte limits. Protocol response contents remain validated by the verifier, not by a cast at this boundary. | `passkey-routes.test.ts`: browser/admission boundaries, payload constraints and fixed operation dispatch. |

Resolved lifetime follow-up: `sessions.ts` owns `absoluteSessionLifetimeMs`,
consumed by ordinary issuance, passkey issuance/replacement and SAML
issuance/enrollment. Each caller retains its authentication anchor and earlier
provider deadline. SAML protocol acceptance independently owns its maximum
authentication age; the equal current duration does not make it session policy.

## SAML protocol and persistence

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/auth/saml/protocol.ts` | Retain bounded DOM/envelope policy and maintained signature-verifier adaptation together. Local parsing rejects ambiguous structures before verification; it does not replace cryptography. A frozen proof in a private WeakSet provides single-use in-process provenance; durable replay protection remains elsewhere. Settings/key validation is the verifier's input boundary. Maximum authentication age is an independent protocol rule. | `saml-protocol.test.ts`: signed fixture verification and hostile XML/signature/condition/time cases. No network or database effects occur in the adapter. |
| `src/cloudflare/stage0/auth/saml/authorization.ts` | Retain outbound Redirect generation/signing, connection validation and settings digest together. The digest captures reviewed endpoint/key/profile changes; request-state persistence remains transaction-owned. The maintained library's cache stub does not claim durable issuance or replay protection. | `saml-authorization.test.ts` and transaction tests: fixed endpoints, signatures, frozen settings and input/profile rejection. |
| `src/cloudflare/stage0/auth/saml/transactions.ts` | Retain start/callback orchestration and the final transaction together. Response/assertion replay IDs, pending request, live connection and identity effects commit atomically. Login, linking and pending enrollment have explicit authority branches, not a generic account-upsert abstraction. Shared session ceiling replaces repeated values while existing deadline minima stay local. | `saml-transactions.test.ts`, transaction migration tests and enrollment tests: replay, concurrency, connection/profile changes, linking authority and provider deadlines. |
| `src/cloudflare/stage0/auth/saml/enrollment.ts` | Retain contact submission/confirmation as a pending SAML enrollment service. Email is independently verified contact data, never account-link authority. Delivery is version-guarded after commit; confirmation atomically creates account/identity/session and consumes enrollment. The session ceiling is shared but contact verification never restarts IdP time. | `saml-enrollment.test.ts`, schema/migration tests: suppression, stale delivery/confirmation, identity collisions, request quotas and original authentication/session expiry. |

SAML HTTP source review is recorded below. Final real-browser flow verification
remains separate from these source and signed-fixture checks.

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/auth/saml/form.ts` | Extracted strict callback form decoding from route orchestration. Owns content-type/byte bounds, fatal UTF-8 decoding, strict percent escapes and exactly two unique decoded field names. It has no profile, credential or persistence authority. Retained cancellation on completion/failure. | `saml-form.test.ts`: valid encoding, malformed/duplicate/unknown fields, invalid UTF-8, unsupported encodings and oversized stream cancellation. |
| `src/cloudflare/stage0/auth/saml/routes.ts` | Retain routing, trusted profile selection, browser-origin/CSRF, per-flow cookies and fixed redirects together. JSON shape checks use the existing domain owner; callback form decoding uses its dedicated parser. Keep callback failure redirects distinct from JSON endpoint errors. Form origin must match the selected server profile, never a body-supplied endpoint. | `saml-routes.test.ts`, `saml-enrollment.test.ts`: signed callback flows, origin/profile binding, payload rejection, enrollment/confirmation, cookies and failure responses. |

## OIDC protocol, settings and transaction boundary

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/auth/linking.ts` | Retain shared account-link assurance policy and live SQL predicate. Elevated members need recent local passkey evidence. The preflight and final transactional guard share the predicate, but preflight never replaces the guard. | OIDC transaction and route tests exercise initiating-session binding and changed authority. |
| `src/cloudflare/stage0/auth/oidc/settings.ts` | Retain immutable credential capture and live connection lookup together. Missing providers remain unavailable; partial configuration fails. Strict binding validation and protocol input validation are distinct boundaries. No endpoint or secret alias comes from a request, and DB diagnostics collapse to a safe configuration error. | `oidc-settings.test.ts`: malformed/partial configuration, changed connection/version, frozen credentials and signed browser flows. |
| `src/cloudflare/stage0/auth/oidc/protocol.ts` | Retain maintained OIDC/JOSE adaptation with pinned discovery/token/JWKS URLs, bounded response parsing and Microsoft key-issuer checks. Configuration and captured keys are per exchange. Frozen WeakSet-backed proof is single-use in process; durable replay protection remains transaction-owned. Its JSON decoder currently has different content-type/UTF-8 semantics from the HTTP foundation; merging them would require an explicit behavior change, not a structural substitution. | `oidc-protocol.test.ts`: signed tokens and issuer/nonce/state/time/key restrictions; fixture network, not live provider certification. |
| `src/cloudflare/stage0/auth/oidc/identities.ts` | Retain immutable issuer/subject resolution and guarded linking. Exact identity collision checks, current connection and live-account authority stay with writes; email never selects an account. Removed aliases re-exporting shared linking policy through this repository. | OIDC protocol/transaction/route tests and provider recovery tests. |
| `src/cloudflare/stage0/auth/oidc/transactions.ts` | Retain browser-binding derivation, durable start and callback consumption. Claim occurs before provider exchange, including failures. Login, linking, recovery and enrollment remain explicit results. Imports shared linking guards directly from their owner; no forwarding repository dependency. | `oidc-transactions.test.ts`, route/enrollment/recovery tests: single-use callback, initiating-session binding and downstream effects. |

| `src/cloudflare/stage0/auth/oidc/enrollment.ts` | Retain pending enrollment loading, contact nomination/verification and completion together. Exact issuer/subject and live connection predicates guard atomic account/identity/audit/enrollment writes. Session issuance is a subsequent live-authority check; failure leaves committed account data intact. Mail occurs after persistence with version-guarded status updates. Existing email suppresses delivery without creating login authority. The enrollment lifetime owns both record expiry and transport cookie duration; contact challenge lifetime remains independently capped by the original enrollment expiry. Private helpers now name the pending load and enrollment completion explicitly. | `oidc-enrollment.test.ts`: stale delivery, competing confirmations, audit rollback, revocation, suppression, and late contact submission at the exclusive original deadline. |
| `src/cloudflare/stage0/auth/oidc/routes.ts` | Retain fixed browser dispatch, origin/CSRF checks, trusted provider selection and cookie/redirect handling. Use shared exact object validation after bounded JSON decoding; field meaning remains operation-specific. Cookie lifetime derives from the enrollment service owner. Callback failures retain clean fixed redirects, while JSON endpoints retain safe status/error responses. | `oidc-routes.test.ts`: signed callback flows, malformed shapes, cookies, CSRF, contact confirmation and explicit 900-second enrollment-cookie contract. |

Provider and real-browser verification remain separate from signed local fixtures.

## Staff membership and ownership transitions

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/staff/memberships.ts` | Retain membership reads and atomic membership/grant transitions together. Target grant containment applies to revocation as well as replacement. Promotion readiness is rechecked in the final batch; removal does not require the target to retain a passkey. A private discriminated operation replaces optional-argument mode selection: empty grants preserve active membership, revocation is explicit. Receipt digests continue to capture explicit caller choices rather than mutable target roles. | `memberships.test.ts`: replay, scope containment, promotion/demotion, authority races, audit rollback, concurrent mutations and clearing grants followed by explicit revocation. |
| `src/cloudflare/stage0/staff/ownership.ts` | Retain the two-party request/accept/revoke state machine. Initiator's session stays live; request-time recency must not shorten the acceptance window. Recipient readiness, current owner/version, request state and recipient recency are checked in the final transaction. Expired is a derived read state. No generic membership mutation abstraction hides these different invariants. | `ownership.test.ts`: exclusive expiry, ten-minute acceptance, authority/version changes, race ordering, audit rollback and idempotency. |
| `src/cloudflare/stage0/staff/access-routes.ts` | Retain fixed membership/ownership paths and method dispatch. Transport is selected by trusted composition; request casts do not confer authority. Service validators own IDs, versions, roles and grants. Import object shape directly from its domain owner. | `staff-access-http.test.ts`: authenticated transports, payload/method boundaries and command integration. |
| `src/cloudflare/stage0/staff/routes.ts` | Retain invitation-specific HTTP adaptation. Preview takes a deliberate header capability; navigation does not accept invitations. Trusted IP/budget inputs remain composition-owned. Import shape validation directly from its owner. | `invitation-http.test.ts`: preview, acceptance, transport and payload boundaries. Invitation service source review is separately tracked. |
| `src/cloudflare/stage0/access/routes.ts` | Retain organization route selection, bounded query parsing and DTO dispatch. Query filters are read selectors, never write authority. Pagination decoding and exact-body requirements stay visible at the adapter. Import shape validation directly from the domain owner. | `organization-http.test.ts`: queries, methods, request shapes and live command/read behavior. |

Removed the HTTP input module's forwarding export of `exactObject`; all four
remaining route consumers now import the domain implementation directly. The HTTP
module retains path decoding and grant DTO checks, which are its own responsibilities.
The desktop adapter import was migrated without claiming a complete source review.

## Invitation service and remaining access services

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/staff/invitations.ts` | Retain sealed offer lifecycle, issuer/recipient authority and acceptance transaction together. Issuer evidence deliberately survives normal logout/session expiry; security epoch, credentials, federation, membership and grant containment remain live. Final post-seal assertions must stay inside the transaction. Resend rotates the token and resets delivery; acceptance consumes the invitation and replaces membership grants atomically. Email nomination never substitutes for an authenticated recipient. | Invitation and acceptance suites: issuer/recipient changes, stale tokens, scope containment, concurrency, expiry and rollback. |
| `src/cloudflare/stage0/staff/invitation-delivery.ts` | Retain post-commit mail as a separate effect. Outcome persistence is guarded by version, digest and pending delivery state. Provider errors never enter command receipts or API errors. This is distinct from nonpersistent contact-mail delivery. | Invitation tests exercise delayed outcomes and delivery failure after durable creation. |
| `src/cloudflare/stage0/staff/validation.ts` | Retain pure staff input policy with this feature. Grant normalization uses the domain action vocabulary and scope validator, sorts deterministically and rejects duplicates. Invitation email rejects Unicode controls; access-command IDs trim while staff IDs do not. Similar-looking validators with different semantics are not interchangeable. | Staff validation, invitation and membership tests. |
| `src/cloudflare/stage0/access/policy.ts` | Retain the single live SQL authority predicate. Fixed row-kind aliases permit directory/capability/resource reads without caller-selected SQL names. Archived scope bypass is limited to receipt replay; it cannot authorize new changes. Action classification comes from the domain owner. | Authorization, capabilities, organization and receipt tests cover live revocation, scope intersections, federation and assurance. |
| `src/cloudflare/stage0/access/organizations.ts` | Retain authorized organization/program/location reads and preflight. Query predicates recheck live authority; preflight does not replace final mutation guards. Program/location helpers intentionally preserve the caller's other dimension so separate grants cannot be unioned into new authority. | Authorization and structure tests, including cross-tenant and intersected-scope reads. |
| `src/cloudflare/stage0/access/reads.ts` | Retain bounded directory, proposed-policy and access-audit projections. Audit's action list is a deliberate subset, not a replacement audit vocabulary. Cursor version, organization binding, UTF-8 and canonicality remain local; byte encoding now uses the existing base64url owner. Page object shape uses the domain validator. Each page checks current SQL authority. | Organization-read and HTTP suites cover ordering, limits, malformed/foreign cursors and authority changes. |
| `src/cloudflare/stage0/access/capabilities.ts` | Retain advisory projection separately from authoritative commands. Candidate grants are filtered through the same current policy with each intersection intact; a 101-row query reports truncation beyond 100. Empty results after preflight do not return stale hints. | Capability tests cover implicit rights, intersections, truncation, revocation and nonauthoritative snapshots. |
| `src/cloudflare/stage0/access/commands.ts` | Retain organization bootstrap/settings and structurally equivalent program/location mutations. The private closed kind selects fixed tables/actions; no HTTP value supplies SQL identifiers. Canonical normalization owns receipt equality. Bootstrap rows, owner grants, policy, initial resources and audit commit together. Archived receipt replay does not reopen archived resources. | Organization and structure suites: atomic rollback, concurrent receipt replay, canonicalization, creator allowance, stale versions and final authority checks. |
| `src/cloudflare/stage0/commands.ts` | Retain receipt lookup/replay and guarded commit coordination. Replay authorizes current access before comparing/disclosing past results; request digests are server-derived. Concurrent same-key conflict retries retrieve a committed receipt only after fresh authorization. | Organization, membership, invitation and ownership concurrency/rollback suites. |
| `src/cloudflare/stage0/db.ts` | Retain numbered value assembly, audit statement construction and transactional guard enforcement. Only trusted repository code supplies SQL fragments. A failed guard aborts the whole batch and maps to conflict. Invitation's internal post-seal assertion remains local because it checks effects within the batch rather than guarding entry. | Full backend transaction suites, including forced audit/guard failures. |

These entries complete the recorded staff/access service review. They do not
complete the remaining desktop/auth adapters, application/UI, tooling, SQL/config
and generated-artifact review or the required final runtime evidence.

## Desktop handoff and common authentication transport

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/auth/desktop.ts` | Retain request/approval/exchange as one durable handoff protocol. Raw callback validation precedes URL normalization. Approval binds one live browser session; exchange requires matching state, callback, code and S256 verifier, and consumes the code atomically with native issuance/audit. Copy original authentication provenance and absolute expiry; exchange is not reauthentication. Admission leases remain bounded. | Desktop-auth and schema tests cover exact callbacks, invalid DTOs, PKCE, expiry, concurrent use, authority revocation and rollback. |
| `src/cloudflare/stage0/auth/desktop-routes.ts` | Retain fixed endpoints, trusted edge inputs, bounded bodies and browser approval/native exchange separation. Explicitly reject browser credential headers on native operations; only native exchange receives a token. Generic response/body helpers now come directly from HTTP foundation owners. | Desktop-auth HTTP tests cover credential/header separation, methods, shape rejection and safe response content. |
| `src/cloudflare/stage0/auth/http.ts` | Retain server-selected credential transport, live resolution, browser CSRF and session-cookie construction. Browser cookies use database-owned remaining expiry; native bearer authentication rejects browser headers. Principals and transport cannot be selected by request JSON. | HTTP-session, session-route and cookie tests cover duplicate/foreign credentials, CSRF, expiry/rotation, disabled authority and transport confusion. |
| `src/cloudflare/stage0/auth/web.ts` | Retain browser-flow origin checks and Strict cookie naming/serialization/selection. Removed forwarding exports of bounded JSON and response construction, migrating every consumer and browser-test worker directly to those owners. OIDC/SAML alternate SameSite bindings remain protocol-owned. | Cookie parsing and all protocol-route suites, plus source/type checking of the browser-test worker. |
| `src/cloudflare/stage0/auth/routes.ts` | Retain fixed account/session read, rotation and logout adaptation. Native transport does not gain browser rotation. Account snapshots and authentication metadata omit bearer credentials; safe errors suppress database/provider details. | Session-route tests exercise both transports, rotation, logout-all, cookies and safe errors. |

These are server source and local fixture checks. They do not establish a shipped
Electron authentication UI, live provider approval or final real-browser evidence.

## Composition, mail and shared contracts

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/stage0/backend.ts` | Retain trusted resource capture, fixed transport namespaces, adapter dispatch and final private-response policy in the composition root. Browser/native selection never depends on credential presence. Canonical admission key and edge-owned IP remain required. Per-adapter route matching validates its own internal interface; root routing determines which capability is exposed. Construction does not enable public Worker routes. | Backend tests cover fixed namespaces, transport confusion, captured admission keys, headers and signed provider/passkey/recovery composition. |
| `src/cloudflare/stage0/config.ts` | Retain environment/origin/RP/sender validation with the immutable hosted-origin table. Local fixture configuration is explicit. Runtime flags cannot grant rollout approval. | Configuration and backend tests cover malformed and cross-environment inputs. |
| `src/cloudflare/stage0/auth/mail.ts` | Retain template/URL validation and Cloudflare delivery adaptation. Capture sender/origin/send capability at construction, validate supported fragment-token links, escape HTML and bound provider acknowledgements. Uncertain sends return failure without automatic retry. | Auth-mail tests cover invalid purposes/URLs, transport input, captured authority, acknowledgements and service composition. |
| `src/cloudflare/stage0/auth/contact.ts` | Retain pure nominated contact/name normalization. Contact email is not identity-link authority; historical control rejection remains distinct from staff invitation validation. | Account, contact-flow and mail suites cover normalization and malformed input. |
| `src/cloudflare/stage0/auth/contact-delivery.ts` | Retain contact-link delivery adaptation with explicit outcome. Persistence and resend/version policy stay with enrollment callers. The SAML marker selects an existing flow, not a caller-defined URL. | Auth-mail plus OIDC/SAML enrollment suites cover both links and delivery failures. |
| `src/cloudflare/stage0/contracts.ts` | Retain explicit request capabilities and safe snapshots. Domain action/scope exports deliberately expose canonical domain types through this backend contract. Removed unused caller-supplied requestDigest and unsupported password-reset mail kind; neither represented implemented authority or capability. Receipt digests remain server-derived. | Full type checking migrates every caller; organization receipt tests explicitly inject an unsupported digest and still reject changed content. Mail tests still reject unsupported runtime kinds. |
| `src/cloudflare/stage0/errors.ts` | Retain closed error/status vocabulary, including runtime refusal of unknown codes. Never use arbitrary provider messages as public error codes. | Error and HTTP response tests plus adapter failure tests. |
| `src/cloudflare/stage0/http/response.ts` | Retain private header enforcement and bodyless response handling. Apply headers in place at composition to preserve independent cookies. | HTTP response and backend tests cover policy override resistance, bodyless responses and Set-Cookie preservation. |

Remaining source coverage must be checked against the actual file inventory, not
inferred from these group names. Application/UI and tooling/configuration/SQL
reviews and final integration evidence remain open.

## Remaining backend source reconciliation

Current-source reread reconciles the earlier migration tranches below. Retaining a
boundary is an explicit review decision, not an instruction to split every file.

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `src/cloudflare/worker.ts` | Retain public routing, DB health and asset composition. Generic API rejection keeps internal Stage 0 composition disconnected. Release and mail services do not import this entry point. | Public-release tests cover routing, health, asset delegation and Stage 0 rejection. |
| `src/cloudflare/releases.ts` | Retain release catalog and archive transport together. R2 metadata owns availability; storage errors propagate. HEAD never signs or reads a body; GET streams or signs according to configured capability. Signing clients/URLs are request-local. Shared-app fallback catalog ownership remains a separate unresolved concern. | Public-release tests use fixture R2 plus the actual signer; no live R2/deployment claim. |
| `src/cloudflare/download-email.ts` | Retain public request decoding, quota reservation and link delivery as private helpers behind one entry point. Public email syntax and response contracts differ from Stage 0. Reservations are conservative, including failures/partial counter denial. Development-only sender/link capability stays explicit. | `check:download-email` verifies SQLite quota behavior, malformed/oversized requests and simulated delivery failures; no real email sent. |
| `src/cloudflare/stage0/auth/budgets.ts` | Retain pure versioned HMAC counter identity/window derivation. Email-like selectors also represent opaque flow purposes; normalization is not mailbox validation. Persisted counter ceilings remain migration-owned. | Auth-budget tests include independent expected hashes and selector/window cases. |
| `src/cloudflare/stage0/auth/limits.ts` | Retain atomic counter consumption, bounded cleanup and window-bound attempt settlement. Successful verification refunds once; failed/crashed attempts and starts consume capacity. Late completion cannot refund a different window. | Auth-limit tests exercise concurrent ceilings, leases, retention and repeat/late settlement. |
| `src/cloudflare/stage0/auth/oidc/cookies.ts` | Retain protocol-specific Lax browser binding and stricter whitespace parsing. It never authenticates ordinary requests. Do not substitute shared cookie parsing with different acceptance semantics. | Cookie and OIDC route/transaction suites. |
| `src/cloudflare/stage0/domain/access.ts` | Retain one immutable action policy table deriving runtime/type vocabulary and grantable actions. Scope validation checks shape/IDs, not resource ownership or live authority. SQL consumers enforce those separately. | Action-policy, authorization and scope tests. |
| `src/cloudflare/stage0/domain/base64url.ts` | Retain byte encoding only. Protocols own decoding limits, canonicality and failure semantics. Consumers currently encode bounded secret/cursor/protocol values. | Secret representation, protocol and cursor suites. |
| `src/cloudflare/stage0/domain/input.ts` | Retain exact enumerable-field validation with optional required own fields. It neither normalizes nor proves domain values. This is the shared shape owner, not an extensible schema framework. | Input-boundary and adapter/service tests. |
| `src/cloudflare/stage0/http/body.ts` | Retain content-type, byte bound, fatal UTF-8/JSON parsing and stream cancellation. Callers own size limits and external error mapping. OIDC/public-mail parsers retain documented different compatibility semantics. | Input-boundary and protocol-route tests cover malformed bodies and cancellation. |
| `src/cloudflare/stage0/http/cookies.ts` | Retain unique named-cookie selection without decoding/unquoting secrets. Protocol consumers own value syntax and attributes; duplicates fail. | Cookie parsing tests. |
| `src/cloudflare/stage0/http/input.ts` | Retain decoded path-segment restrictions and bounded grant DTO shape checks. Domain action/scope meaning remains validated by services. Removed forwarding exports are not reintroduced. | Input-boundary and staff/organization HTTP tests. |

All current `src/cloudflare/**/*.ts` files now have explicit review rows. This
proves source review coverage only: it does not resolve app-side catalog ownership,
UI cycles, non-TypeScript artifacts, live runtime/CI evidence or future changes.

## Next application findings

`apps/shared/Home.tsx` still owns fallback release metadata alongside rendering and
loading. Its fallback marks generated URLs available, independently of the R2-backed
server catalog. `packages/ui/src/website.tsx` owns the presentation release type,
while Electron's loader returns unchecked JSON. Resolve data-contract ownership and
fallback semantics with the required component source/Figma evidence and both
consumer checks; a server-only catalog review cannot settle this issue.

`apps/shared/useGitHubStars.ts` keeps API/cache data outside shared UI. Current cache
is browser-local, lasts 15 minutes and rejects future timestamps; an in-flight
request is shared within the loaded module, times out after five seconds and does
not update unmounted subscribers. Complete application verification must exercise
cache expiry/failure and consumer loading behavior, not infer them from this read.

## Browser fixture transport tooling

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `scripts/stage0-browser-harness.mjs` | Retain ephemeral certificate/workerd/D1/browser setup and cleanup as one fixture lifecycle. TLS captures real browser metadata before Node fetch can rewrite it. Fixed fixture origins, CONNECT routing, browser route blocking and denied Worker outbound requests bound the experiment. Provider URLs resolve to loopback fixtures, not real services. Cleanup settles all owned resources and removes temporary keys. | OIDC/SAML browser runs plus proxy tests; WebKit host prerequisites remain unmet. |
| `scripts/stage0-browser-proxy.mjs` | Retain exact-authority CONNECT routing to a single loopback listener, byte forwarding and tracked-socket cleanup. Deny plain HTTP and unlisted authorities; neither requested hostname nor port selects an arbitrary upstream. Closing is repeat-safe and destroys active tunnels. | `stage0-browser-proxy.test.mjs`: exact/foreign authorities, byte preservation, active-tunnel shutdown and refusal after close. |

On 2026-11-06, the current source passed Chromium passkey fixture verification
with a CDP virtual authenticator and zero external Worker requests. OIDC passed
Chromium 156.0.8078.4 and Firefox 157.0 with actual cross-site GET navigation,
Lax binding and negative controls. SAML passed Chromium cross-site POST binding
and enrollment controls. Full OIDC/SAML commands exited nonzero at WebKit launch:
missing `libevent-2.1-7t64` and `libavif16`. No browser matrix completion claim.
These checks do not prove physical authenticators, real IdPs/mail, public TLS or
production readiness; source hashes are emitted by each verifier.

SAML Firefox 157.0 was also verified in a separate successful run after the
matrix interruption. WebKit remains unverified for the missing-library reason.

## Release packaging and verification tooling

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `scripts/verify-desktop-releases.mjs` | Retain local artifact inspection and optional remote release verification as an operator command. Version comes from desktop package metadata; remote health, CDN ranges and Worker download paths are checked separately. Extracted signed-redirect validation before following the URL. Sample/header checks do not prove full artifact equality or code signing. | New pure redirect-validator tests and syntax check. No live release verification was run in this tranche. |
| `scripts/desktop-release-validation.mjs` | Own HTTPS/exact authority, bucket/artifact path, single algorithm and canonical positive 1–300 second expiry validation. Reject credentials, nondefault ports, fragments and duplicate security parameters before following the URL. This checks redirect policy, not cryptographic validity; remote fetch remains required. | Three table-driven tests cover accepted boundaries, malformed/missing/duplicate lifetimes and altered destination/transport. |
| `scripts/repack-mac.mjs` | Retain architecture-specific app discovery, temporary ZIP construction, integrity/size verification and rename together as packaging. Version comes from desktop metadata. It does not sign, notarize or deploy the app. Existing release directory is an operator build output; no repack was executed during review. | Source and syntax review only; final artifact/build evidence remains required. |
| `scripts/check-repository-privacy.mjs` | Retain tracked-file inspection and location-only reporting. Reads binary metadata as text as well as source. The explicit regex set is a bounded privacy heuristic, not comprehensive secret detection; untracked/ignored files are outside its scan. | Current tracked-tree scan passed; rerun after staging to include added files. |

## Password research tooling

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `scripts/stage0-password-candidates.ts` | Retain bounded research derivation and exact parameter validation. Immutable sizes/work-factor profiles now drive both paths, eliminating repeated execution constants. No storage format, user password endpoint or production fallback is introduced. | Password-runtime tests use independent PBKDF2/Argon2 vectors, wrong passwords and mutations of every size/work-factor field. |
| `scripts/stage0-password-probe.ts` | Retain public synthetic inputs and independent expected vectors separately from derivation. The local default handler records platform errors for research; hosted composition wraps only the named probe function with run-owned access controls. | Password-runtime vector tests and hosted runner fixture tests. |
| `scripts/benchmark-stage0-password.ts` | Retain in-memory workerd measurements, package/platform metadata and cleanup. External elapsed time explicitly remains distinct from hosted CPU/headroom. Candidate failure is recorded, not silently replaced by a weaker algorithm. | Source review; full timing benchmark was not rerun for the parameter-ownership refactor. |
| `scripts/stage0-hosted-probe.mjs` | Retain run-owned remote lifecycle, report and cleanup together. Names are checked against the current run prefix before deletion; cleanup continues after individual failures and confirms absence. Stable CPU-limit settings are checked before measurement. Synthetic HTTP outcomes and optional analytics remain separate evidence. Remote execution requires its own deployment authority and was not performed here. | Three network-fixture tests cover resource restrictions, rejected limits and continued cleanup after deletion failure. |

Hosted probe source review does not constitute execution approval, a successful
hosted measurement, production password readiness or a change to CI configuration.

## Architecture enforcement tooling

| Source | Responsibility and review decision | Behavior evidence |
| --- | --- | --- |
| `scripts/architecture/check.mjs` | Retain Git-aware source inventory, ownership/config loading and exact exception reconciliation as the CLI. Includes nonignored untracked source; absent deleted files are omitted. Concept owners must exist. Duplicate/stale exceptions fail rather than silently widening a baseline. It does not inspect ignored source or prove semantic abstraction quality. | Current repository scan and source review. |
| `scripts/architecture/dependencies.mjs` | Retain syntax dependency extraction, relative resolution, ownership/direction checks and cycle traversal as the pure analyzer. Unsupported absolute/URL/package-alias specifiers now fail instead of being treated as npm packages. Exact runtime virtual modules are zone-scoped; only test fixtures declare cloudflare:test. No wildcard exception was added. | 17 positive/negative tests, including 45 import-form/specifier combinations and virtual-module scope rejection. |
| `scripts/architecture/dependencies.test.mjs` | Retain synthetic graphs and real repository-map fixtures as independent checker tests. Assertions require specific violations and permitted cases rather than mirroring implementation traversal. | All 17 tests pass; current repository graph remains 209 files and six prior exceptions. |

## Build and runtime configuration review

- `apps/web/tsconfig.app.json` and `apps/web/tsconfig.node.json` now explicitly
  enable strict checking, matching the other maintained runtime/compiler targets.
  Application DOM/bundler settings remain separate from Node Vite configuration.
- `apps/web/tsconfig.json` owns project references. Desktop main/preload uses
  NodeNext while its renderer uses DOM/bundler semantics. Worker config owns
  Worker/Node ambient types; Stage 0 extends it to include fixture/runtime types.
  These differing target contracts should not be flattened into one broad config.
- `packages/ui/tsconfig.json` owns emitted JS/declarations; its package manifest
  exposes the deliberate JS/CSS/token/manifest surface and marks CSS side effects.
  Generated dist files are build outputs, not parallel maintained implementations.
- Web/Electron Vite configurations own their consumer plugins and local API proxy.
  Electron preload explicitly emits CJS. Local proxy settings do not establish
  production host routing or enable internal auth.
- `vitest.stage0.config.mts` owns ephemeral test DB bindings and test discovery.
  Corrected its comment: repository migration content is reused, deployed database
  state and credentials are not. Historical migrations were not rewritten.
- Workspace package manifests own runtime dependencies and build/packaging commands.
  Desktop metadata owns packaging version/name and unsigned platform targets.
  Release metadata duplication across app/server/packaging still needs coordinated
  review; identical version strings alone are not proof of one executable owner.
- `wrangler.jsonc` keeps development and production bindings explicit. Development
  has Worker-first routes and sender bindings that production does not; source
  inspection does not prove remote parity. No deployment/routing/binding edits made.

Verification: all workspace and backend type checks, workspace lint and workspace
builds passed; 13 shared-UI behavior tests passed against the rebuilt package.
These tests do not replace source Figma/rendered fidelity or real Electron checks.
SQL, CSS and broader configuration/artifact coverage remain unfinished.

## SQL grant-policy boundary

- `migrations/0003_organization_access.sql` retains the historical membership
  storage vocabulary, tenant-composite foreign keys and scope-shape constraints.
  A stored owner-only action is not proof of ownership; the live authorization
  predicate remains responsible for that check.
- `migrations/0010_staff_invitations.sql` has a narrower invitation vocabulary
  and a coordinator-specific insert trigger. These enforce the same issuance
  classifications as domain validation at the database boundary. Sealed offers
  cannot be appended, edited or deleted.
- `tests/worker/stage0/action-policy.test.ts` now exercises actual inserts after
  applying the complete migration chain. Independent expected actions drive both
  domain and storage assertions: all eleven membership action names, nine admin
  invitation actions and four coordinator invitation actions, with owner-only and
  unknown-action rejection for invitations. Invalid membership action samples are
  also rejected. This is behavioral coverage, not a proof over all possible strings.
- Historical migrations remain immutable snapshots. Repeated definitions in
  SQLite table rebuilds preserve earlier upgrade steps; generating them from the
  current TypeScript policy would make past migrations change with present code.
  Future intentional policy changes need a forward migration and updated independent
  expectations. No production database or provider state was touched.

The populated invitation and staff-access migration tests separately check row
preservation, receipt replay, audit immutability and foreign keys. Grant-policy
coverage does not establish complete migration or whole-repository compliance.

Verification: full Stage 0 suite passed (733 tests in 61 files), all workspace
and backend type checks passed, and 17 architecture tests passed. The current
architecture scan still reports six explicit exceptions and zero errors.

## Live release verifier sample ownership

- `scripts/desktop-release-validation.mjs` now also owns the two-byte CDN sample
  contract shared by the domain, Cloudflare release and desktop release verifiers.
  It requires a safe integer package size of at least one million bytes, HTTP 206,
  the exact requested range and total, a declared two-byte response, attachment
  disposition containing the filename, and ZIP/EXE magic bytes. The stream is
  cancelled on metadata rejection or excess bytes; it is not buffered unboundedly.
- `scripts/verify-domains-live.mjs` previously compared a parsed range total with
  the minimum size without rejecting NaN. Missing/malformed totals could pass that
  comparison. The shared validator now compares the exact range with HEAD size.
- `scripts/verify-cloudflare-live.mjs` retains separate workers/resources/releases
  entry modes. Resource inventory, public health/bundle checks and CDN samples
  provide different evidence; sharing sample validation does not merge those modes
  or authorize deployment. Its release mode and the desktop verifier now reuse the
  same validator instead of maintaining separate sample implementations.
- `scripts/verify-r2-key.mjs` was inspected only. It tests a signed one-byte range
  request with operator credentials, not the public two-byte CDN contract. Keeping
  its distinct operation avoids a flags-based abstraction that hides the difference.

Six release-validator tests pass (three existing redirect tests and three sample
fixture tests), as do all 17 architecture tests and syntax checks for the three
changed commands. No live verification, signed URL generation, credentials, provider
mutation or CI configuration changes occurred. Samples do not prove full artifact
identity, signatures, extraction integrity or runtime behavior.

## Browser verification responsibilities

| Source | Review decision | Evidence and limits |
| --- | --- | --- |
| `scripts/check-website.mjs` | Keep the whole Home journey together: responsive assets, workflow navigation, email retry fixture, modal interaction and pinned scrolling. Added actual sheet focus entry, forward/reverse keyboard traversal, rejection of background focus and restoration after selection/Escape; the prior success text claimed focus without those assertions. A local helper permits one browser-chrome traversal only when the document loses focus. | Passed Chromium at 1440/1024/768/390/320; modal checks at 390/320. Email transport is mocked, not sent. Public release availability is not verified by this check. |
| `scripts/check-dynamic-loading.mjs` | Keep mounted-state retention, inert controls, mutation-driven masks and responsive geometry together. Calendar/checkbox captures are supporting evidence, not Figma comparisons. | Passed against the current web gallery at desktop/mobile widths. |
| `scripts/check-content-components.mjs` | Retain keyboard/date/pagination expectations independently from implementation, with manifest-derived family count only for inventory coverage. Geometry, inert/focus, status count and asset/layout assertions remain explicit. | Passed all 31 loaded/skeleton pairs and 12 theme/material/frost combinations, transparency, reduced motion and mobile layout in the web consumer. |
| `scripts/check-github-navigation.mjs` | Retain navigation-specific link/native-icon semantics, focus, menu keyboard and theme/material evidence as one feature check. Its two URLs are browser-rendered consumers, not native Electron IPC. | Source review only in this tranche. Historical captures are not a fresh run. |
| `scripts/check-github-stars.mjs` | Retain the delayed API fixture, mounted badge identity, stable width, StrictMode request count, cache reload and invalid/error responses together. Each scenario uses an isolated browser context through newPage. | Source review only in this tranche. Fixtures do not prove live GitHub availability; short reload checks do not cover the full cache-expiry interval. |
| `scripts/check-website-refinement.mjs` | Retain independent crop/typography/mask and transition expectations. Gallery container changes are screenshot-only fixture adjustments, not product changes. | Source review only. Fixed-time transition sampling is timing-sensitive and does not prove every animation frame. No fresh Figma parity claim. |

No component implementation or design reference was changed. Seventeen architecture
tests and syntax validation passed; six prior exceptions remain. The local Tailnet
preview returned HTTP 200 during verification. Native Electron, second-consumer
execution, current Figma comparison and final-state CI remain separate requirements.

## Native service-envelope validation

`apps/desktop/src/main/downloads.ts` now owns one private decoder for successful
JSON object envelopes shared by its two service operations. HTTP failures, invalid
JSON, null, arrays and scalar envelopes produce the operation's stable IPC error.
The email handler requires literal `sent: true`; strings, numbers and objects can
no longer become false delivery success. Catalog responses require a release array,
including a legitimate empty array. This does not validate individual release DTOs:
coordinated catalog/type ownership across server, shared app and UI remains open.

The decoder stays private beside its two consumers. It introduces no renderer/native
back-import, new public abstraction, endpoint policy or speculative shared DTO.
Existing per-invocation sender/frame/document authorization remains before transport.

Verification: rebuilt desktop main/preload/renderer and passed both desktop TypeScript
targets, desktop lint, 17 architecture tests and the real Electron IPC verifier on a
local virtual display. Added malformed-envelope, truthy acknowledgement, non-JSON
response and empty-catalog fixtures. Existing invalid-input, HTTP failure, navigation
revocation and BrowserWindow preference checks also passed. Network responses were
fixture-controlled; these results do not prove mail delivery, live release metadata
or the OS sandbox beyond the checked preferences. The virtual display was stopped
after verification; no runner or provider settings were changed.

## Semantic token generation and CSS entry points

- `packages/ui/tokens.json` is the maintained local semantic-color source.
  `scripts/sync-design-tokens.mjs` deterministically derives `src/tokens.css` with
  the existing layer, selectors, hex values and RGB channels. The current stylesheet
  matches byte-for-byte: no component styles or design references changed.
- Generation requires explicit `--write`. `--check` compares without writing, and
  package checks/builds run it with the generator's regression tests. Invalid or
  missing modes, mismatched theme keys, malformed names/colors and normalized or
  derived-channel name collisions fail before output is written. The CLI fixture
  proves stale CSS fails without being overwritten and invalid source preserves
  the previous output.
- `packages/ui/src/styles.css` owns font/style inclusion order and final reduced-
  transparency rules. App Tailwind entries own their source-scan paths and explicit
  layer order; the renderer's relative path differs because its stylesheet is deeper.
  App root styles currently repeat base font/canvas declarations; that remains
  composition styling to review with current design evidence, not a resolved owner.
- JSON-to-CSS consistency does not synchronize Figma. A fresh design-context request
  for DeviceAwareDownloadCTA (`165:5351`) still returned the Starter-plan MCP call
  limit. Component/style refactors remain subject to the required current context.

Verification: four token-generator/CLI tests, all workspace/backend type checks,
17 architecture tests, shared UI build and 13 shared UI tests passed. The architecture
scan includes the two new tooling files, with six prior exceptions and zero errors.
Broader component CSS and generated-artifact review remains incomplete.

## Entry-point and CI source reconciliation

The ledger was compared with tracked source paths to locate missing explicit review
entries. A missing filename mention is an inventory signal, not proof that a file
was never inspected; the decisions below are based on current source reads.

| Source | Responsibility and decision | Evidence limits |
| --- | --- | --- |
| `apps/desktop/src/contracts/downloads.ts` | Retain the frozen two-channel vocabulary shared by main/preload; no native dependencies or generic invocation surface. | Source review and existing architecture boundary tests. |
| `apps/desktop/src/main/index.ts` | Retain window lifecycle, trusted renderer selection, sandbox preferences and restricted external-navigation handoff. Handler registration occurs once; activation can recreate a window without registering handlers twice. | Current source review; native fixture evidence is recorded above, not an OS sandbox proof. |
| `apps/desktop/src/preload/index.ts` | Retain two named contextBridge operations, importing channel names from the contract owner. | Does not expose ipcRenderer or arbitrary channels. |
| `apps/desktop/src/renderer/src/main.tsx` | Retain renderer mounting, stylesheet order, gallery selection and injection of the narrow download bridge into Home. | Its asserted DesktopRelease type does not validate native service data; coordinated release-schema work remains open. |
| `apps/web/src/main.tsx`, `apps/web/src/App.tsx` | Retain web mounting/style imports and path-based gallery/Home selection. Neither owns native capabilities. | Source review; web build passed. Removed unreferenced `apps/web/src/App.css`, which retained obsolete purple app-shell/download styling and was not imported by the current entry graph. |
| `scripts/check-download-email.mjs` | Retain in-memory SQLite adapter and independent public-mail assertions together. The adapter exercises transaction rollback and quotas but does not model every D1 runtime behavior. | Source review; existing recorded behavior evidence remains fixture-only. |
| `scripts/check-electron-downloads.mjs` | Retain separate live development catalog read, mocked email request and intercepted external handoff checks. | Source review only this tranche. Its successful catalog assertion would not prove downloadable artifact integrity; intercepted openExternal is not an actual OS launch. |
| `scripts/check-electron-ipc.mjs` | Retain real preload/main IPC with main-process response fixtures, input/envelope failures, navigation revocation and preference assertions. | Fresh fixture execution recorded in the native-envelope tranche above. |
| `scripts/ci/deliver.mjs` | Retain upload-before-deploy orchestration and environment/account admission. Version comes from desktop metadata. | Read-only review. Upload is sequential, not atomic; failure can leave earlier uploads. The wrapper is not itself a branch-authorization boundary. No deployment executed. |
| `scripts/ci/deploy-worker.mjs` | Retain the reusable Worker deployment operation consumed by CLI and delivery; validate environment/account before invoking Wrangler. | Read-only review. Caller/workflow owns authority; an exported helper does not grant permission to deploy. |
| `scripts/ci/verify-delivery-source.mjs` | Retain exact event/ref/current remote SHA/local checkout checks and environment output. | Read-only review. Checks are point-in-time; they do not lock the remote branch. Workflow rechecks immediately before publication. |
| `scripts/ci/verify-network.mjs`, `scripts/ci/verify-network.test.mjs` | Retain bounded transient transport retries with response-body handling delegated to the callback and sanitized terminal transport errors. Validation errors do not retry. | Existing local HTTP fixtures passed for truncation, stalls, permanent validation failures and diagnostic privacy. |
| `scripts/verify-ci-live.mjs` | Retain current-SHA delivery evidence separately from PR checks. Successful run and required job outcomes are checked, not merely a green badge. | Live read-only execution failed: no successful current-SHA development delivery. No runner/configuration fix attempted. |
| `scripts/ci/ci.test.mjs` | Retain workflow isolation/secret restrictions, fixture command routing, source-SHA gates, vendored fingerprints and required-check wiring. | All 13 CI tests, including network fixtures, passed. These are not proof of available runner capacity or successful remote delivery. |

Read-only workflow/action review confirmed self-hosted grouped routing, separate
publisher credentials, checksum-pinned temporary GitHub CLI installation and no
hosted fallback. No `.github` or CI script changes were made. File/function review
of the remaining component/gallery sources, broader CSS/SQL and recorded-video
coverage remains outstanding alongside the previously documented Figma blocker.

## Shared UI foundation review and unresolved findings

| Source | Responsibility and review decision | Remaining work / evidence |
| --- | --- | --- |
| `packages/ui/src/material.tsx` | Retain provider settings, normalization and derived material variables together. Components override provider values explicitly; caller style overrides are preserved. Material, transparency and motion are separate controls. | Default frost 35 is repeated within the owner and should use one private default when component changes are unblocked. Existing UI tests and browser material coverage are recorded above. |
| `packages/ui/src/skeleton.tsx` | Retain DOM measurement, observation and cleanup as one loading-mask capability. Atomic elements, painted empty shapes and text ranges are distinct measurement cases. LoadingBoundary composes one accessible region with inert, retained content. | No per-component mask registry. The effect disconnects observers/listeners and cancels frames on cleanup. Current web mutation/retention/geometry checks passed in the browser-review tranche; this is not exhaustive DOM/memory coverage. |
| `packages/ui/src/figma-assets.tsx` | Retain bundled URL inventory and theme image rendering behind a private table. All 111 referenced local asset files exist. | Confirmed inherited-key lookup defect below. Existence alone does not prove native geometry, identity or current Figma parity. |
| `packages/ui/src/website-assets.ts` | Retain semantic names for exact downloaded website image/mask assets. Source references remain separate from implementation images. | Current source review; full source-slot/geometry comparison still requires Figma evidence. |
| `packages/ui/src/index.tsx` | Public exports currently also implement Button, IconAction and DownloadAction. Their action state/material behavior is cohesive, but implementation in the barrel causes the documented import cycles. | Move these implementations behind direct internal imports after required source retrieval; retain public exports. Five migration cycle exceptions remain unresolved. |
| `packages/ui/src/controls.tsx` | Field/select/native-input behavior and material variants are shared UI responsibilities. Select's private helpers keep native form change semantics, pointer/keyboard selection and focus together. | Asset-pair policy overlaps composites; controls should consume a single pair owner while preserving wrapper/skin differences. No automatic split by line count. |
| `packages/ui/src/composites.tsx` | Retain composed status/FAQ/card/navigation/dialog behavior using existing controls. Modal lifecycle and focus restoration belong with the dialog; external-navigation actions remain caller-provided. | Replace self-barrel imports and consolidate repeated asset-pair knowledge. Two repeated pairs (`3a7d2.svg`, `2a5a3.svg`) currently agree. Matching wrappers should not be assumed: the two SourceAsset helpers render different markup/classes. |
| `packages/ui/src/date-picker.tsx` | Retain local-date parsing/formatting and calendar interaction; noon/local field comparisons avoid UTC date shifts and reject rollover. Month shifting clamps to the target month's last day. | Direct Button import still required to remove the barrel cycle. Existing independent date and browser keyboard tests cover selected boundaries, not every locale/date combination. |
| `packages/ui/src/pagination.tsx` | Retain bounded page-window calculation and pagination interaction together; it does not allocate all page numbers for large totals. | Page/count normalization is repeated in calculation and rendering. Introduce one private normalization owner with unchanged independent boundary tests when component work is unblocked. Barrel cycle also remains. |
| `packages/ui/src/empty-state.tsx` | Retain semantic empty-state layout with caller-owned content/action slots and material behavior. | No data loading, routing or business action decisions introduced. |
| `packages/ui/src/github-link.tsx` | Retain repository-link presentation, compact count formatting and loading state composed from NavigationItem and LoadingBoundary. | Count fetching/caching stays in the shared application hook. Repository default is overridable; no native capability import. |

### Confirmed inherited asset-name defect

Current built `FigmaAsset({ name: 'missing.svg' })` throws, but `toString` and
`constructor` return image elements whose `src` is a function; `__proto__` returns
an object-valued `src`. The private plain-object table is queried by truthiness
instead of own-property membership. This was reproduced directly against the built
module; it does not establish attacker control of a current call site.

Required fix: check own properties for both `name` and optional `darkName`, retain
all existing URL mappings/theme geometry, and add negative regressions for inherited
names alongside valid light/dark pairs. Component implementation is unchanged while
fresh Figma context/screenshots are quota-blocked. This finding is unfinished work,
not an accepted architectural exception or a passing test of correct behavior.

## Shared GitHub-star cache verification

`apps/shared/useGitHubStars.ts` remains the application data/cache owner; GitHubLink
only formats and presents supplied state. The hook shares one in-flight request,
keeps successful counts in optional localStorage, rejects invalid/future/stale
records, bounds HTTP duration and ignores updates after effect cleanup. The cache
is checked on mounting/reload, not continuously refreshed by an interval.

Expanded `scripts/check-github-stars.mjs` with independent cache expectations: zero,
one millisecond before the 15-minute expiry, exact expiry, a future timestamp,
malformed JSON, negative count, nonnumeric timestamp and unavailable localStorage.
Date.now is fixed in these isolated pages while network/render timers remain real.
Expected network calls and displayed values are asserted in each consumer. Fresh
captures now default to `/tmp/ovelle-github-stars`; an explicit output variable can
select another location without overwriting historical evidence by default.

Verification passed in current web source and the built desktop renderer served
over HTTP: all eight cache scenarios per consumer plus existing delayed/loading,
request-sharing, retained badge, invalid/error response, compact count, keyboard and
320/390-pixel mobile checks. No actual GitHub response or native Electron bridge is
claimed by these fixtures. Seventeen architecture tests and the current graph pass
with six unchanged exceptions. No hook or component source was edited.
