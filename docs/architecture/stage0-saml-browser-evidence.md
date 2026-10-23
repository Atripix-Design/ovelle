# SAML backend browser acceptance fixture

October 23, 2026. `npm run test:stage0-saml-browser` runs the actual internal
SAML HTTP, maintained protocol, transaction, contact-enrollment and session
services in workerd with ephemeral D1. Chromium, Firefox and WebKit perform real
cross-site HTTPS form navigation. The public Worker does not import the fixture or auth handlers.
The HTML documents are test scaffolding, not product presentation.

## Transport and evidence

The runner reuses `scripts/stage0-browser-harness.mjs` and the authenticated
`tests/worker/stage0/browser-transport.ts` bridge with the OIDC suite. It retains
the SAML-specific assertions below. The shared harness generates a one-day self-signed TLS certificate/private key in a
temporary directory, starts a loopback-only HTTPS listener on an ephemeral port,
and uses a browser-configured HTTP CONNECT proxy to route the three exact
fixture host/port authorities to that listener. It changes neither the
machine hosts file nor trust store. The isolated browser context ignores
certificate errors. This verifies cookie/navigation behavior over TLS, not
public certificate trust or production transport configuration.

Three fixture hosts represent application, IdP and attacker sites. A request
guard permits only their exact origins, including the chosen port. An intentional
external-fetch control proves blocking. The proxy rejects other CONNECT
authorities, ports and plaintext HTTP requests; it never resolves destinations
or connects anywhere except the fixture listener. Socket tests prove binary
tunnel preservation, destination denial and active-tunnel cleanup. Worker
outbound requests are denied and zero attempts are required.
No real provider, mail service, account data, development application endpoint or
persistent database is used.

The TLS listener records actual Origin, Sec-Fetch-Mode, Sec-Fetch-Dest,
Sec-Fetch-Site and presence of the independent flow cookie. The successful form
POST arrives as cross-site/navigate/document with the exact IdP Origin and its
Secure, HttpOnly, SameSite=None flow cookie.

Node's fetch transport into Miniflare overwrites Sec-Fetch-Mode with `cors`.
The bridge passes **observed** metadata through a private fixture marker; the
fixture restores those exact values before calling application handlers. Missing
headers stay missing. The bridge overwrites client markers, authenticates its
internal marker with an ephemeral control secret, and strips markers before the
application call. Every callback's application input is compared to its TLS
observation. Navigation metadata is never inferred from a desired scenario.
This adapter is test-only; deployed edge metadata is not changed or verified.

The fake IdP uses the existing ephemeral RSA keys and maintained signed-message
fixture. Only external Turnstile and mail delivery are replaced. Request/replay
consumption, D1 authority, contact verification, account creation and session
issuance use application services. Sequential scenarios have independent trusted
TEST-NET client selectors so unrelated cases do not exhaust a shared start quota;
Worker/D1 tests cover quota enforcement. No application quota is weakened.

## Verified behaviors

- Existing exact SAML identity signs in. The flow cookie clears; the session is
  Secure, HttpOnly and Strict. Subsequent same-origin `/api/v1/me` succeeds and
  JavaScript cannot read the cookie.
- Callback replay changes no account, identity, session, pending, audit or consumed
  request counts. A second browser cannot use a signed response; the initiating
  browser can still complete that same response afterward.
- A valid binding and signed form from the attacker origin fail. An IdP form with
  `Referrer-Policy: no-referrer` actually emits `Origin: null` and fails. Providers
  with that behavior need separately reviewed support; exact-Origin policy stays.
- A credentialed cross-site fetch sends the legitimate Origin/binding but actual
  `cors`/`empty` metadata. It fails without consuming request authority.
- An unlinked subject receives only a Strict pending cookie, without account or
  session creation. Contact submission requires CSRF. Mock mail carries token and
  SAML selector only in a fragment. Another browser cannot consume the token.
  Its initiating browser creates the SAML account/session once, clears pending
  state, and receives no organization membership.
- Mail credentials never appear in URLs received by the HTTPS server. Browser
  and Worker external-network controls are checked. `finally` disposes resources,
  including temporary TLS private keys. Cleanup attempts all disposers even when
  one fails; proxy shutdown destroys active tunnels.

The success-only `SAML_BROWSER_VERIFIED` output includes engine, browser version,
observed metadata, negative-control names and exercised source/fixture hashes. It contains
no cookies, assertions, contact tokens, control secrets or private keys. CI's
hosted `SAML and OIDC browser acceptance` job installs Chromium, Firefox, WebKit and OS
dependencies, checks the proxy boundary, and runs every engine on Node 22.12.0
(the supported floor). It uses the exact checked-out source and gates deployment
alongside existing validation. No engine is optional or allowed to fail.
The runner prints `SAML_BROWSER_MATRIX_VERIFIED` only after all three engines
pass. An optional `chromium`, `firefox` or `webkit` argument runs one engine for
diagnosis and does not emit the matrix-success marker.
It needs no application/provider secrets or privileged local-runner changes.

## Limits and remaining acceptance

This is automated engine-fixture evidence, not a product/device support promise,
physical Safari/iOS acceptance, real IdP/mail acceptance, hosted Worker CPU/headroom,
production TLS/metadata behavior, customer profile/certificate lifecycle or a complete sign-in interface. Test TLS is untrusted
outside the isolated context. Passkey browser tests provide separate evidence.

Public routes, manual hosted identity migrations and rollout remain separately
controlled. Recovery consumption/replacement, password decisions, native Electron,
UI/Figma and remaining Stage 0 records/documents, backup/restore and pilot policies
stay unfinished. This does not complete Task 3, Task 10, Task 11 or Stage 0.
