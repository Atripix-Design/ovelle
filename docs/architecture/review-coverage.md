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
