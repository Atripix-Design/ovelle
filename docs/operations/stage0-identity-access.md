# Stage 0 identity and access verification

The backend is implemented as internal modules. Public authentication is still
closed; the public Worker does not compose these handlers. This record describes
local/CI evidence and the acceptance still needed before a separately authorized
development rollout. The [original-plan status](stage0-status.md) maps implemented
internal behavior and remaining acceptance without treating this as a complete
Stage 0 release. This record does not approve remote migrations, provider changes,
sending mail, public signup or production rollout.

## Connected backend journey

Run `npm run test:stage0 -- tests/worker/stage0/acceptance.test.ts` for the connected
Task 11 backend journey. It uses the existing workerd/D1 harness, real internal
HTTP adapters and domain services. Its four new account identities begin with no
organization memberships. The general harness also contains unrelated legacy
fixtures; none supplies these actors' organizations, grants or memberships.

The journey proves these integration points in one persistent database:

1. Enroll three actual public-key credentials through the maintained WebAuthn
   verifier using the existing software authenticator fixture. Create two new
   organizations through the organization HTTP adapter, including their initial
   structure and owner grants; replay creation without duplicates.
2. Compose the first coordinator invitation through the concrete auth mail adapter.
   Simulate uncertain external send failure, observe pending/failed delivery and
   denied organization access, explicitly resend and rotate the token. Replaying
   resend does not send twice; the old token fails and the new token accepts once.
3. Accept coordinator membership in both organizations using a browser session
   issued before either invitation. A second server-side desktop credential for
   the same account also predates both memberships. Both see only the offered
   program scope, and deny foreign or ungranted resource IDs. A coordinator cannot
   widen its own grant. An authorized scoped program update succeeds.
4. Revoke only the first organization's membership, replay the revoke without
   duplication and deny a replay of the previously successful program command.
   The same browser and desktop credentials lose first-organization access while
   retaining second-organization access and its directory entry.
5. Invite and accept a passkey-ready administrator with only `audit.read`, deny
   its organization update before ownership, then request and explicitly accept
   ownership. Replaying acceptance does not duplicate the transition. The new
   owner gains owner authority; the previous owner remains an active admin with
   ordinary access but cannot issue another administrator invitation.
6. Reconcile exact actor/action/resource audit triples for each organization,
   including denied commands and replays producing no extra success events. The
   access-history HTTP endpoint deliberately excludes program edits; those are
   also reconciled against organization-qualified authoritative D1 audit rows.
   Verify stored owner, membership and program versions, absence of raw mail/session
   tokens from audit/receipts, and denial at absolute browser/desktop session expiry.

Primary identity establishment is trusted fixture setup, including an internally
issued primary session used before passkey enrollment. This does not demonstrate
password authentication or real Google/Microsoft/SAML account establishment.
Software authenticator verification is not physical-device/browser acceptance.
Desktop credentials exercise the server boundary, not Electron main/preload,
loopback exchange, IPC, safeStorage or packaged native sign-in. Only the external
mail binding is replaced; no provider is contacted and no mail is sent.

The separate OIDC/SAML suites retain callback expiry, protocol rejection and
identity provenance coverage. Existing invitation, permission, ownership and
concurrency tests retain their broader edge matrices. The connected test adds
coverage of newly created and accepted state flowing between those modules; it
is not a replacement for those suites or evidence of hosted concurrency.

## Reproduce and bind evidence

Run the focused journey and `npm run test:stage0`, `npm run check`, `npm run lint`,
`npm run build`, `npm run check:ci`, `npm run check:download-email`, and
`npm run check:privacy`. New files must be included in the index before relying on
the tracked-file privacy check. CI runs the full backend suite and the separate
`Identity browser acceptance` job; deployment depends on that browser job. On
Node 22.12.0 it requires the SAML and OIDC journeys in Chromium, Firefox and WebKit,
then the existing Chromium virtual-passkey registration/logout/login ceremony.
The [SAML evidence](../architecture/stage0-saml-browser-evidence.md),
[OIDC evidence](../architecture/stage0-oidc-http-enrollment.md) and
[passkey evidence](../architecture/stage0-passkey-security.md) describe the isolated
fixtures, observed behavior and explicit acceptance limits.

For a published increment, record the full source SHA and its exact `ci.yml` run.
Require every job terminal and successful or intentionally skipped, including
browser acceptance, deployment and artifact cleanup. Confirm the development
application bundle identifies the same full SHA, `/health` reports development
and a healthy database, and public auth/organization routes remain closed.
A healthy existing database does not prove identity migrations were applied.
Do not infer actual auth or provider readiness from a green site deployment.

## Separate rollout acceptance

Keep these obligations open until the corresponding evidence and authority exist:

- The October 23 decision selects Google/Microsoft plus passkeys, with fresh
  linked-provider plus code recovery. Verify its [internal recovery contract](../architecture/stage0-recovery-review.md)
  against actual providers and devices before rollout. Optional local passwords
  remain deferred behind KDF/runtime approval; `enabled` remains false.
- Review actual Google/Microsoft registrations and supported SAML customer profiles,
  form origins, certificate/metadata lifecycle, connection disabling and linking.
  Complete supported browser/device, hosted runtime/CPU and public TLS/edge checks.
- Review the auth sender domain, binding entitlement and restrictions separately
  from download email. Verify actual delivery and mail-client fragment behavior,
  expiry, deliberate confirmation and resend outcomes. The
  [auth mail contract](../architecture/stage0-auth-mail.md) documents transport
  acceptance and its unsupported password-reset purpose.
- Complete public confirmation presentation and separately scoped Electron
  integration. No backend test substitutes for UI or packaged native acceptance.
- Under separate migration authority, verify the Cloudflare account/environment
  and target D1 database, inspect its applied migration history, capture a D1 Time
  Travel bookmark and protected backup, review pending migrations in numeric order,
  and apply only the approved development set manually. Prepared identity migrations
  currently extend through `0016_provider_recovery.sql`; do not assume remote state
  or rerun them blindly. Never run identity migrations automatically from CI.
- Before composing public auth, review all required configuration: hosted
  `AUTH_ORIGIN`, `AUTH_RP_ID`, `AUTH_EMAIL_FROM`, `TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY`, plus separately injected admission keys and reviewed
  provider settings. These are contract names, not provisioned secrets. Hosted
  configuration rejects `AUTH_LOCAL_FIXTURES`; an environment flag cannot enable
  Stage 0. Future deployment composition must name and verify its own bindings
  without logging keys, assertions, recovery codes or complete credential URLs.
  The internal [direct-provider settings resolver](../architecture/stage0-oidc-settings.md)
  now defines the exact `AUTH_GOOGLE_*` and `AUTH_MICROSOFT_*` connection, version,
  client ID and secret bindings and rechecks their enabled D1 authority on each
  lookup. These bindings remain unprovisioned; signed fixture logins do not
  establish registration or credential validity with actual providers.
- Verify the exact development artifact with designated identities, actual email,
  passkeys, tenant denials, revocation and recovery. Keep production separate.
  Complete the broader Stage 0 volunteer records, private versioned documents,
  signatures, backup/restore exercise, pilot requirements and guardian/consent rules.

The connected backend journey completes one acceptance evidence gap. Original
Task 11, Task 3 and the full Stage 0 roadmap remain incomplete.
