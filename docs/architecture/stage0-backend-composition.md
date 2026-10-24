# Internal identity/access backend composition

`createStage0Backend(bindings, resources)` in `src/cloudflare/stage0/backend.ts`
composes the existing session, OIDC, SAML, passkey, recovery, desktop handoff,
organization, invitation, membership and ownership HTTP adapters. It owns their
configuration and routing integration; their protocol verification, DTO checks,
live authorization and final transactional guards remain in those modules.

The public Worker does not import this root. Constructing it does not register
routes, enable public auth, create providers or apply migrations. The initial
provider/passkey decision does not remove the broader
[original Stage 0 obligations](../operations/stage0-status.md).

## Construction and trusted inputs

The root loads the existing exact hosted environment/origin/RP/sender/Turnstile
configuration and retains `enabled: false`. It uses the
[fixed OIDC binding resolver](stage0-oidc-settings.md) and concrete
[auth mail adapter](stage0-auth-mail.md) with the supplied D1 database and reviewed
mail binding. Both target resources must belong to the reviewed environment;
the root cannot discover their owning Cloudflare account. This hosted root has
no local-fixture mail fallback. Standalone local protocol/browser fixtures remain
separate and cannot enable hosted authentication through an environment flag.

The additional server secret `AUTH_ADMISSION_KEY` must be exactly 32 random bytes
encoded as canonical unpadded base64url: 43 characters, no whitespace. Generate
and provision it securely per environment. Missing, malformed or noncanonical
values fail construction. The root decodes and captures the key once, without
persisting or returning it. Do not regenerate it per request or silently replace
it after a configuration failure; durable abuse counters depend on its stability.
Rotation needs an explicit operational plan for the remaining quota windows.

Configuration, provider credentials, mail transport, clock/ID functions and
network dependencies are captured from server-owned inputs. Optional clock, ID,
provider-network and Turnstile-network seams support the existing isolated
runtime tests; none is selected from request JSON, headers or environment bypass
flags. Each request receives a fresh server-generated request ID, independent of
`X-Request-ID`. Standard security/cache headers are applied without rebuilding or
folding independent `Set-Cookie` values.

The server must supply the trusted edge address separately to `fetch(request,
trustedIp)`. The root bounds its shape and never reads `X-Forwarded-For` or
`CF-Connecting-IP` itself. A future public Worker must obtain the canonical address
from its reviewed Cloudflare ingress context, rather than forwarding a client
override or substituting a shared default. Absence fails closed. The address is
used by the existing HMAC admission budgets; it is not stored as a raw quota key.

## Fixed transport routing

Use the combined `fetch` entry point for the eventual server integration. It
selects transport from fixed paths, never credentials or caller metadata:

| External path | Transport and behavior |
| --- | --- |
| Existing `/api/v1/auth/oidc/...`, `/saml/...`, `/passkeys/...`, enrollment and recovery paths | Browser cookie/flow-cookie adapters with their own Origin/CSRF and callback rules |
| `/api/v1/me`, `/api/v1/auth/logout`, `/api/v1/auth/logout-all`, `/api/v1/auth/session/rotate` | Browser session adapter |
| Existing organization, structure, policy, audit, invitation, membership and ownership paths | Browser session plus live tenant/command authorization |
| `/api/v1/native/me`, `/api/v1/native/auth/logout`, `/api/v1/native/auth/logout-all`, and corresponding native organization/invitation/staff paths | Explicit desktop bearer surface; map the native prefix to the same internal adapter paths |
| `/api/v1/auth/desktop/requests`, `/api/v1/auth/desktop/exchange` | Existing credential-free native handoff creation/exchange; browser headers remain forbidden |
| `/api/v1/auth/desktop/approve` | Browser session, exact Origin and CSRF for explicit approval |

For example, `/api/v1/native/organizations/{id}/programs` uses native bearer
authentication, while `/api/v1/organizations/{id}/programs` uses browser cookies.
Dropping Origin or adding `transport=desktop` cannot change the second route.
Native shared calls reject Cookie/Origin/browser-fetch headers. Browser shared
calls reject Authorization. No CORS or successful preflight path is introduced.

Browser-only enrollment, provider, passkey, recovery and approval ceremonies are
not available under the native prefix. Native handoff creation/exchange keep
their existing paths and gain no prefixed alias. Unknown, extra or encoded route
segments do not gain a fallback. The target URL must match the configured origin.
Queries are permitted only for the existing OIDC GET callbacks and validated
organization GET filters; fragments and other queries are rejected. Each adapter
still owns allowed methods, parameter validation and bounded request parsing.

The separate `browser` and `desktop` methods remain internal fixed-transport
entry points using canonical adapter paths. They are for explicit server calls;
do not build a header/body-based transport selector around them. Electron main,
its storage/IPC implementation and approval presentation remain separate work.

## Verification and rollout limits

The composed tests check route families, unknown paths, fixed transport selection,
host/Origin/CSRF/cookie/bearer boundaries, security headers and per-request IDs.
Native start limits remain shared when forwarded headers and the original binding
object are changed. A signed provider fixture completes actual OIDC HTTP/session
verification, then maintained WebAuthn registration and recovery-code issuance
through the combined root. The external provider, Turnstile and mail transports
are fixtures; software/virtual authenticators are not physical-device evidence.

The existing connected two-organization acceptance journey now uses the combined
root for all organization and staff calls, including native-prefix reads and a
native program mutation replayed after revocation. Its
membership, audit, invitation failure/resend, idempotency, scoped denial, revocation
and ownership assertions are retained. Primary establishment remains fixture setup.

This does not verify actual providers/mail, hosted concurrency/CPU, remote schema,
browser recovery, physical passkeys, native clients or product UI. Before importing
the root into `worker.ts`, complete the separately authorized
[development rollout acceptance](../operations/stage0-identity-access.md#separate-rollout-acceptance),
including correct resources/secrets, protected backup/manual migrations and live
acceptance. There is no enable flag or automatic migration in this implementation.
