# Stage 0 HTTP sessions and durable authentication budgets

October 23, 2026. Continuation of the shared backend implementation, covering
parts of Tasks 2–3 of the identity/access plan. These internal adapters are not
imported by the public Worker. Live login, provider verification, real email,
remote migrations and frontend/native integration remain unfinished.

## Session HTTP boundary

`auth/http.ts` resolves the current database session from one explicit transport.
The route chooses browser or desktop; request headers and JSON never choose a
transport or supply a trusted principal. The request URL must use the configured
exact origin. Forwarded host headers do not change that trust decision.

Browser cookies use `__Host-ovelle_session`, `HttpOnly`, `Secure`,
`SameSite=Strict`, `Path=/`, and no Domain on hosted environments. Only the local
fixture environment uses `ovelle_local_session` without Secure. Cookie lifetime
comes from the current database deadline, rounded down to seconds. Rotation
preserves that deadline. Duplicate selected cookies, malformed credentials and
mixed cookie/Authorization authentication fail closed.

Cookie-authenticated mutations require the exact configured Origin and the
session-bound `X-CSRF-Token` header. Missing/null/foreign origins are denied.
Browser reads also reject an explicitly foreign Origin or cross-site Fetch
Metadata. Reads without Origin remain available for normal same-origin loads;
the adapter never emits CORS permission headers. Native bearer requests reject
Cookie, Origin and Sec-Fetch-Site headers and resolve desktop sessions only.
An absent Origin cannot promote a browser cookie to native authority.

The CSRF value is now a domain-separated HMAC-SHA-256 output keyed by the random
32-byte browser bearer secret. Only its SHA-256 digest remains in D1. This lets
the server reconstruct the same CSRF value for an authenticated page reload,
without persisting a plaintext secret or rotating another tab's session. A CSRF
value cannot authenticate a request without its HttpOnly cookie. This supersedes
the initial implementation's independently generated CSRF values; the account
and session migrations have not been rolled out remotely. Any retained local
fixtures from that implementation must sign in again to use CSRF bootstrap.

`auth/routes.ts` implements the following internal contract:

| Method and path | Result |
| --- | --- |
| `GET /api/v1/me` | Own account display fields, current assurance/method/times, browser CSRF or native null. No bearer, digests, roles or database security fields. |
| `POST /api/v1/auth/session/rotate` | Browser-only replacement cookie plus new CSRF. Native token exchange/rotation is a later main-process integration. |
| `POST /api/v1/auth/logout` | Revoke the current session; clear the browser cookie only after success. |
| `POST /api/v1/auth/logout-all` | Revoke all of the account's transports; other accounts remain unaffected. |

Every response, including errors and method denials, uses no-store,
no-referrer and nosniff headers plus the trusted context's `X-Request-ID` for audit
correlation. Mutations cannot run through GET/HEAD/OPTIONS.
Unexpected exceptions yield a closed unavailable response without SQL/provider
messages. Existing session services retain atomic revocation/audit behavior.

Cookie and request-boundary references:
[MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie),
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Durable authentication budgets

Migration `0004_auth_limits.sql` adds indexed quota/attempt tables, tested only on
the local Workers/D1 binding. `auth/limits.ts` uses a stable, environment-specific
random 32-byte server key to HMAC the canonical email/IP selectors. Raw email,
IP, key material and provider credentials are absent from these tables. The
future HTTP composition must source a canonical trusted edge IP and server key;
neither may come from browser input. Rotate keys deliberately: a new key starts
new budgets, so per-request keys would defeat limits.

The implementation enforces fixed windows beginning at a counter's first use:

- Five failed or in-flight challenge attempts per normalized email/IP pair per
  15 minutes, plus 30 per IP across accounts. A reservation increments both in
  the same atomic batch. A verifier success refunds both once; failure keeps
  their counts. A crash conservatively occupies the window's budget.
- Five auth-email reservations per address and five per IP per hour, shared by
  the future verification/reset/invitation delivery adapters. Delivery failure
  does not refund a reservation or permit unlimited resend attempts.

These are fixed-window controls, not a sliding-window guarantee: requests near a
window boundary can use consecutive budgets. Future endpoint-specific OIDC/SAML
transaction-start and callback limits must be defined when those adapters exist;
this helper alone does not protect endpoints that do not call it.

A database check aborts the whole batch when either quota is exhausted, so a
denied IP-wide attempt cannot leave a partial account counter. An attempt lease
records each counter's window identity. Late or repeated success cannot refund
a replacement window or decrement a counter twice. Request-path cleanup removes
at most 100 expired leases and 100 expired quota rows per reservation.

## Evidence and remaining work

The new Workers tests use real local D1 migrations/SQL and real Web Crypto. They
cover cookie attributes/deadlines, CSRF bootstrap after reload, exact Origin,
duplicate/malformed cookies, browser/native separation, token-free account and
rotation responses, no-store errors, revocation/audit rollback, quota concurrency,
IP-wide rollback, success refunds, expiry and pseudonymous storage.

Local validation: all 73 Stage 0 tests (33 added in this continuation), 13 shared
UI tests, six CI contract tests and three hosted-probe harness tests pass.
Workspace/Worker/Stage 0 typechecks, workspace and changed-backend lint, full
workspace build, download-email regression and repository privacy checks pass.
A fresh read-only review found no security blocker; its missing request-ID
contract finding was reproduced by failing route assertions and corrected, then
the complete Stage 0 suite passed again. A broader optional backend lint scan
also reported the pre-existing intentional control-character regex warning in
`auth/accounts.ts`; that file was not changed by this continuation.

This is local adapter evidence. It does not establish browser cookie behavior,
hosted D1 races, actual provider login, real mail, WebAuthn or packaged native
sign-in. Provider adapters must verify assertions before session issuance; account
linking still needs fresh proofs; public registration/delivery must retain generic
acknowledgments and enumeration resistance. Recovery and passkey ceremonies,
organization/staff commands, native handoff, UI and the separately gated remote
rollout remain part of the original plan.
