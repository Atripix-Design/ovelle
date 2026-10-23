# Stage 0 passkey enrollment, login and assurance

October 23, 2026. Implemented as internal services and browser adapters. The
public Worker still imports no Stage 0 authentication modules, configuration
cannot enable authentication, and migration 0008 has not been applied remotely.
This covers part of original Task 4; recovery and the complete Stage 0 plan remain
unfinished.

## Verification and storage

`@simplewebauthn/server` 14.0.3 performs WebAuthn registration and assertion
verification in Workers with real Web Crypto. Ovelle offers ES256 and RS256,
requires discoverable credentials and user verification, and verifies exact RP,
origin, challenge, user presence, UV, signature and counter. The wrapper also
rejects all cross-origin/top-origin contexts, including cross-origin responses
that omit topOrigin. It checks canonical bounded base64url credential material,
the credential ID and applicable user handle, with a 64 KiB JSON envelope limit.
Only public keys are stored; private keys stay with the authenticator.

Registration requests no identifying device attestation. The verifier accepts
`none` or self-attested `packed` responses, rejecting certificate/metadata formats
before they can trigger certificate or revocation network work. Device trust or
hardware attestation is not claimed. Protocol tests exercise actual P-256 and RSA
signatures rather than mocking verifier results. Backup eligibility is immutable;
backup state may change after a valid assertion. The maintained verifier handles
counter rules, including authenticators that consistently report zero. The final
write also compares the stored version/counter to prevent a stale concurrent
assertion from overwriting newer state.

Migration `0008_passkeys.sql` adds opaque account-scoped user handles,
account-bound credential public keys, counters, transport hints, backup metadata,
display names, versions and disabling state. Credential ownership and public keys
cannot be changed by UPDATE. No credential can be reassigned by the service.
Transport hints are a bounded allowlist for browser UX, not authority.

Five-minute challenges contain only token/challenge digests, purpose, configured
origin/RP, initiating account/session when applicable, and expiry/consumption.
Registration, discoverable login and session step-up have separate purposes.
Authenticated restarts invalidate the preceding pending challenge for that
session/purpose. A conditional D1 UPDATE claims each flow before verification;
failed verification consumes it too. Final writes recheck expiry and live account,
session and credential authority. Expired rows are cleaned in bounded batches.

## Enrollment and sessions

First enrollment requires a verified account with primary authentication less
than five minutes old. Later enrollment requires recent existing-passkey assurance
on a live session tied to an active credential. A primary-only session cannot add
or replace a passkey once any credential record exists, including disabled
records. The initial implementation caps an account at ten credential records;
future management/retention policy must retain the protection against primary-only
replacement. Recovery-only or unverified enrollment sessions are not accepted.

Registration atomically creates the credential, rotates the bearer, revokes the
old session and appends audit events. Competing first enrollments from separate
primary sessions have at most one winner. Audit failure rolls back credential and
session writes, while the already claimed challenge stays consumed.

Discoverable login requires a returned user handle matching the stored account
handle. Session step-up binds the assertion to the initiating live account and
session. Both atomically advance the credential counter/version, issue the new
session and append audit. Step-up revokes its predecessor and preserves the
original primary authentication method, identity/connection versions,
authentication time and absolute expiry. A required-SAML organization therefore
continues to require the original SAML connection after local UV. A standalone
passkey login cannot satisfy a required-SAML connection by itself. Disabling a
credential invalidates its derived sessions through the live-session view;
provider revocation remains effective for stepped-up federated sessions.

The shared internal session issuer remains a trusted credential-adapter boundary;
its synthetic use in fixtures is not a public authentication endpoint.

## Browser and abuse boundary

The internal adapter accepts POST only at:

| Path under `/api/v1/auth/passkeys/` | Required authority |
| --- | --- |
| `register/start`, `register/finish` | Exact origin and live account cookie/CSRF; finish also requires its flow cookie and verified registration. |
| `login/start` | Exact origin, signed pre-login cookie/CSRF and Turnstile `passkey_login`. |
| `login/finish` | Exact origin, flow cookie, separately derived flow CSRF and verified assertion. |
| `step-up/start`, `step-up/finish` | Exact origin and live account cookie/CSRF; finish also requires its flow cookie and verified assertion. |

Starts consume five passkey starts per IP per fifteen minutes plus the shared
thirty-per-IP challenge ceiling. Login reserves that capacity before Turnstile.
Verification reserves the shared durable failed-attempt capacity before crypto
and refunds only successful committed attempts. Registration and step-up use the
same conservative start budget; pilot measurement may inform changes.

The temporary hosted cookie is `__Host-ovelle_passkey`, Secure, HttpOnly,
SameSite=Strict, Path=/ and Max-Age=300. The local fixture name is separate.
The raw flow token and session bearer never enter JSON. Success sets the session
cookie and clears the flow cookie; errors expose only the closed error vocabulary.
No-store, no-referrer, request ID, nosniff, CSP and no CORS match the other internal
auth adapters. Trusted composition chooses IP, budget key, Turnstile secret and
transport; callers cannot select them in JSON.

## Evidence and remaining work

Workers/D1 tests cover signed protocol failures, account/session/purpose binding,
exclusive expiry, challenge replay, primary-only replacement denial, first
enrollment races, same-counter assertion races, uniqueness, revocation, durable
admission and audit rollback. The required-SAML authorization test now uses an
actual signed registration ceremony for local assurance rather than a synthetic
session insert.

`npm run test:stage0-passkey-browser` runs an ephemeral localhost:4173 fixture
with workerd, in-memory D1 and Chromium's virtual resident-key/UV authenticator.
It performs real `navigator.credentials.create/get`, registration, logout and
discoverable login through the HTTP adapters, checking cookie-only credentials
and resulting account assurance. [Captured local evidence](stage0-passkey-browser-local.json)
records an earlier local Chromium version and tested source hashes. Current runs
emit `PASSKEY_BROWSER_VERIFIED` with the actual ceremony result, browser version
and tested source hashes. The non-secret **Identity browser acceptance** CI job
requires this existing Chromium ceremony after both three-engine SAML/OIDC
matrices, on Node 22.12.0, before deployment. This is one Chromium virtual-device
journey; it does not add virtual authenticator coverage in Firefox or WebKit.
Primary authentication and Turnstile are explicit fixtures; all outbound Worker network requests are denied
and counted. Browser requests are restricted to the fixture origin, with an
explicit blocked-request control after the ceremony. No live provider is contacted.
The fixture is not imported by the application or a shipped product page.

This is browser protocol/transport evidence with a virtual authenticator, not
physical Apple/Windows/security-key acceptance or production provider acceptance.
Recovery codes and their primary-factor composition, passkey management UI,
public routing, real provider/mail configuration, hosted migrations, native
handoff, organization workflows and the full Figma-backed login UI remain open.
The original password-plus-recovery policy is still gated by the password-runtime
decision; this work does not introduce recovery-code-only access or an operator
bypass. No original Task 4 completion is claimed.

References: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server),
[passkey verification policy](https://simplewebauthn.dev/docs/advanced/passkeys/).
