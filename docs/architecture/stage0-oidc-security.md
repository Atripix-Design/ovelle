# Stage 0 OIDC verification and account linking

October 23, 2026. Internal implementation, exercised in the local Workers/D1
test runtime. The public Worker does not import these modules. No provider app,
remote migration, live sign-in or contact-email delivery is enabled by this work.

## Protocol boundary

`auth/oidc/protocol.ts` pins `openid-client` 6.8.8 and `jose` 6.2.12. The maintained
OIDC implementation performs the authorization-code exchange and checks state,
PKCE, nonce, issuer, audience, algorithm, token expiry and authorized party.
Application-level ID-token signature verification is explicitly enabled with
`enableNonRepudiationChecks`; trusting only the token endpoint's TLS is insufficient
for this boundary. JOSE also decodes the already verified signing-key header.

Only RS256 and fixed Google/Microsoft public-cloud discovery, token and JWKS
endpoints are allowed. Redirects are rejected without following their Location;
JSON responses are streamed with a 256 KiB limit and a ten-second library timeout.
Callbacks use the configured exact origin and provider path. The adapter requests
only `openid profile email`, never offline access or Graph/API permissions. ID,
access and refresh tokens are not returned or persisted.

Microsoft uses the `common` authority to support personal and work/school accounts.
The verifier substitutes the signed GUID `tid` into the expected tenant issuer,
then checks the selected signing key's issuer scope against that exact issuer or
Microsoft's documented tenant template. A consumer-only key cannot authenticate a
business tenant. Each verification owns a fresh configuration and JWKS capture;
concurrent tenants do not share mutable proof state. Sovereign clouds and custom
enterprise OIDC endpoints are outside this adapter.

Google linking uses documented `select_account consent` and requests the signed
`auth_time` claim. Microsoft linking requests `prompt=login&max_age=0`. Both deny
linking without signed authentication evidence less than five minutes old, and
reject future issue/authentication times. Google does not document the same
forced-login parameter: account selection or consent alone is not proof of recent
authentication. An old Google session may require the person to sign in again at
Google before linking succeeds. Real provider behavior remains an acceptance gate.

The returned frozen identity is a one-use, in-memory branded proof. Deserialized
JSON and reused proof objects fail; repositories also reject proofs aged sixty
seconds or more. This is an internal adapter contract, never an HTTP DTO.

## Browser transaction and abuse controls

`auth/oidc/transactions.ts` composes the adapter with D1 and the existing account
services. A five-minute transaction records state/binding digests, provider,
connection version, purpose and the initiating account/session for linking.
The browser receives an independent random HttpOnly binding cookie. HMAC-SHA-256
derives nonce and PKCE verifier from that secret, with domain, purpose, origin,
provider, connection/version and random state separation. D1 holds neither raw
state, binding, nonce nor verifier; no encryption key or plaintext secret table is
needed. These are random-token operations, unrelated to password hashing.

The temporary hosted cookie is `__Host-ovelle_oidc`, Secure, HttpOnly, Path=/,
SameSite=Lax and Max-Age=300, without Domain. Lax permits the IdP's top-level GET
callback. The ordinary account cookie remains Strict; this transaction cookie
cannot authenticate an account or call protected commands. Local fixtures use a
distinct name. Duplicate/malformed/missing binding cookies fail closed. A new
start replaces the browser's previous flow; parallel browser tabs cannot complete
different flows using the same single cookie slot. Clear this cookie on completion
in the future HTTP adapter.

A single D1 UPDATE claims the transaction before any code exchange. It checks
state, browser binding, provider, configuration version, expiry and live initiating
session. Competing callbacks yield one claimant; failed verification consumes the
transaction too. Expired rows are deleted in bounded batches at new starts.
The callback rechecks configuration at account resolution and session issuance.

Starts consume durable keyed-digest counters: five per provider/IP per fifteen
minutes plus the shared thirty-per-IP challenge limit. Success does not refund a
start. This is conservative for shared networks and needs pilot measurement.
The start service requires a trusted edge IP and stable environment-specific
32-byte budget key. Its caller must still enforce exact Origin, pre-login CSRF,
Turnstile and fixed route handling. Those HTTP starts/callback responses are not
implemented or exposed yet. Never wire these internal functions directly to
unvalidated JSON or return their internal session object as JSON.

## Account and organization authority

`auth/oidc/identities.ts` resolves only an existing exact connection/issuer/subject
identity. Matching email never selects, merges or creates an account. Google Gmail
and verified Workspace contact evidence is distinguished from other email hints;
Microsoft email/UPN never becomes automatic contact verification. New-account and
missing/unverified-contact onboarding remains to be implemented.

Linking requires a live verified Ovelle account authenticated less than five
minutes ago. Owners and active administrators additionally require recent local
passkey assurance; upstream identity/MFA claims do not satisfy it. The service
loads authority from current D1 state rather than supplied principal fields. The
callback uses the recorded initiating session, preventing a returning cookie from
changing the target account. Identity insertion and `identity.link` audit share
one guarded atomic batch. An identity cannot move between accounts, and linking
cannot reactivate a disabled identity. Repeat linking is idempotent after fresh
proof; concurrent foreign-account attempts have at most one winner.

Migration `0005_oidc_identities.sql` adds immutable tenant IDs, a shared
`stage0_trusted_identities` view and the link audit action. Only Microsoft OIDC can
expand the approved common tenant template. Google and SAML retain exact issuer
checks. Existing populated Microsoft exact-issuer identities are backfilled;
existing audit records and sessions survive the migration. Migration
`0006_oidc_transactions.sql` adds the digest-only single-use transactions.
Both migrations remain local/unapplied to hosted databases.

Federated session issuance now requires the verified identity and connection
versions, not just an identity ID. A configuration change between protocol
resolution and issuance denies; later changes revoke existing sessions through
live view checks. Federation yields ordinary authentication, never passkey
assurance or organization membership. Existing scoped organization policies and
required-SAML enforcement continue to apply independently.

## Evidence and remaining work

The tests use real signed RSA tokens and maintained OIDC processing in Workers;
only provider HTTP responses are fixtures. Coverage includes Google signature,
algorithm, audience, issuer, nonce, PKCE, state and freshness failures; Microsoft
personal/business tenant and key-issuer validation; no email merge; serialized and
replayed proof rejection; linking/revocation races; atomic audit rollback;
populated-database migration; browser binding, expiry and single-use callbacks.
These are local protocol/security tests, not evidence of real provider delivery,
hosted concurrency, provider provisioning or user acceptance.

Still required: safe start/callback HTTP composition, pre-login abuse integration,
contact/new-account onboarding, maintained SAML verification, passkeys/recovery,
organization commands and invitations/ownership, native handoff, Figma-backed UI,
real provider setup and separately authorized hosted migration/rollout. The full
Stage 0 plan remains open. Password login remains gated by its runtime decision.

References: [openid-client OIDC example](https://github.com/panva/openid-client/blob/main/examples/oidc.ts),
[explicit ID-token signatures](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md),
[Google request and claim reference](https://developers.google.com/identity/openid-connect/reference),
[Microsoft tenant and key-issuer validation](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens).
