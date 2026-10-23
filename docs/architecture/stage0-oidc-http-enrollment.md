# Stage 0 browser login and contact enrollment

October 23, 2026. Implemented internally and tested with signed provider fixtures
in Workers/D1. These modules are disconnected from the public Worker. No provider
settings, hosted identity migrations, real authentication emails or live sign-in
are enabled. This extends the [OIDC protocol boundary](stage0-oidc-security.md);
the original Stage 0 plan remains incomplete.

## Browser boundary

`auth/oidc/routes.ts` accepts only fixed Google/Microsoft start, link and callback
paths and the pre-login/enrollment paths below. Server composition supplies the
provider configuration, stable environment-specific 32-byte budget key, Turnstile
secret and trusted edge IP. Body/header values cannot select endpoints, IPs,
session transport or redirects. Dependency injection replaces network calls in
tests; there is no local Turnstile bypass.

| Method and path | Behavior |
| --- | --- |
| GET `/api/v1/auth/prelogin` | Sets a signed HttpOnly pre-login cookie and returns a distinct derived CSRF token. |
| POST `/api/v1/auth/oidc/{google,microsoft}/start` | Checks pre-login CSRF, admission budgets and Turnstile, then returns the authorization URL and sets the short-lived callback binding cookie. |
| POST `/api/v1/auth/oidc/{google,microsoft}/link` | Uses the live account session/CSRF and recent authentication policy, then the same admission controls. |
| GET `/api/v1/auth/oidc/{google,microsoft}/callback` | Claims and verifies the browser transaction, then sets a cookie or completes linking; redirects to a fixed clean account path. |
| GET `/api/v1/auth/enrollment` | Returns safe provider hints and CSRF for the initiating enrollment browser. |
| POST `/api/v1/auth/enrollment/contact` | Accepts an explicitly nominated email/name and returns generic `202 {accepted:true}`. A confirmed matching authoritative Google contact can finish immediately. |
| POST `/api/v1/auth/enrollment/confirm` | Requires the initiating enrollment cookie, CSRF and separately delivered email token; returns 204 and a session cookie. |

The two enrollment capabilities and the pre-login cookie use separate purposes.
Hosted pre-login/enrollment cookies use `__Host-`, Secure, HttpOnly, Path=/ and
SameSite=Strict; local fixtures use distinct names. Their absolute lifetime is
fifteen minutes. Reloading pre-login does not extend its original expiry. The
pre-login server MAC binds its random secret and timestamp to the exact origin;
the CSRF value uses a different HMAC domain. Duplicate cookies fail closed.

All mutations require the exact configured Origin and CSRF; null/foreign origins,
cross-site fetches and Authorization headers are denied. The callback alone
permits cross-site top-level GET navigation with its Lax transaction cookie. It
rejects fetch-mode/destination mismatches when those browser headers are present.
Successful callbacks redirect only to `/account`, `/account/enroll` or
`/account/security`; failures redirect to `/account/sign-in?result=failed`. No
provider error, query token or caller-selected return URL is reflected.

Bodies stream with a 4 KiB bound, strict UTF-8/JSON and a fixed field allowlist.
Responses include no-store, no-referrer, nosniff, restrictive CSP and request ID,
including errors, redirects and empty responses. No CORS permission is emitted.
Session bearers appear only in HttpOnly cookies, never response JSON.

## Admission and delivery

The transaction service consumes durable start budgets before calling the
trusted Turnstile admission hook, then performs provider discovery. This avoids
double charging and protects external verification work too. Siteverify uses the
fixed Cloudflare endpoint, manual redirects, a ten-second timeout and a streamed
16 KiB response bound. It requires success, the configured hostname, the exact
login/link action and a valid challenge timestamp less than five minutes old.
Failed verification never reaches the provider. Upstream details are not exposed.

An unlinked verified OIDC identity creates a digest-only pending enrollment, not
an account. Migration `0007_oidc_enrollments.sql` stores the verified identity and
connection version with an immutable fifteen-minute expiry. Every read/write
requires the current enabled configuration. Microsoft tenant GUID shape and
issuer binding are constrained in SQL as well as the protocol verifier.

Explicit submission can use Google's authoritative Gmail/verified Workspace
contact only when the normalized nominated address matches that evidence.
Microsoft, missing/untrusted contact hints and different nominated addresses
require a separate Ovelle email proof. All sends consume the existing durable
email/IP budgets. A new random email secret is persisted only as a digest before
delivery; the full secret goes in a URL fragment for the future verification
page. That page must remove the fragment promptly and submit through the POST
endpoint from the original browser. GET and mail preview scanners consume
nothing. Opening the email in another browser requires restarting enrollment in
that browser; the email alone is not sufficient authority.

Resending changes the contact version and invalidates old email tokens. A late
delivery completion updates only its original version and cannot overwrite the
current delivery state. Delivery can fail after persistence; the HTTP response
still acknowledges acceptance and exposes no provider details or delivery status.
An address already assigned to an account suppresses delivery and receives the
same acknowledgment. It never links or modifies that existing account. This
generic response is not a claim of constant-time behavior or confirmed delivery.

Email confirmation consumes durable failed-attempt capacity. A guarded atomic
batch checks current enrollment/configuration, token version/expiry, email
uniqueness and exact identity uniqueness, creates the verified account/identity,
consumes enrollment and appends both audits. Competing confirmations have one
winner; audit failure rolls the whole batch back. If a later revocation prevents
session issuance, the committed verified account remains available for a fresh
login. No organization membership, staff role or passkey assurance is granted.

## Evidence and integration gates

Tests exercise signed RSA authorization-code flows through the HTTP adapter,
real PKCE challenge derivation, same-origin and CSRF denial, pre-network admission
limits, cookie-only sessions, linking without the Strict account cookie on the
callback, separate contact proof, replay/expiry, resend/delivery ordering, email
claim races, configuration revocation and audit rollback. Only provider,
Turnstile and mail delivery dependencies are fixtures. These results do not
prove real provider acceptance, real mail delivery, hosted D1 concurrency or
browser/UI acceptance.

Future composition must supply trusted dependencies and preserve the fixed
origin/transport contracts. The account/enrollment/verification pages above are
destinations for future Figma-backed UI, not implemented pages. Public routing,
real provider and mail configuration, separately authorized migrations, passkeys
and recovery, SAML, organization workflows, Electron handoff and full acceptance
remain open. There is no hosted rollout or enablement change in this increment.

Reference: [Cloudflare Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
