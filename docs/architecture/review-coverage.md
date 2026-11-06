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

Follow-up identified: twelve-hour values occur in session issuance, passkey
replacement and SAML freshness/session caps. Establish which represent the same
session policy during federation review before sharing them; matching durations
do not establish matching authority or lifetime anchors.
