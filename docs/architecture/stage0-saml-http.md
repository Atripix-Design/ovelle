# Internal SAML browser admission

October 23, 2026. `auth/saml/routes.ts` composes the existing maintained SAML
request/verifier and durable transaction services into internal browser HTTP
handlers. The public Worker does not import these handlers. This is local
signed-message/Workers/D1 evidence, not enabled public login, hosted CPU evidence or real-provider/browser acceptance. The separate
[contact enrollment continuation](stage0-saml-enrollment.md) adds the internal
first-time pending/contact/confirmation contract.

## Starts and explicit links

The fixed paths `/api/v1/auth/saml/start` and `/api/v1/auth/saml/link` accept POST
with bounded JSON containing only `connectionId` and `turnstileToken`. Query
parameters, caller-selected URLs/keys/IPs and extra fields are rejected. The
connection ID is a bounded public selector into an injected, controlled server
profile lookup. The returned profile must have exactly that connection ID;
the existing service validates and binds the full profile to its durable request.
The composition root must never implement this lookup by fetching a client URL.

Starts require exact application Origin, shared pre-login cookie/CSRF and a
successful `saml_login` Turnstile action. The existing pre-login bootstrap is
shared; this adapter does not introduce another bootstrap route. Links require
the existing authenticated browser mutation/CSRF boundary, fresh linking authority
and `saml_link` Turnstile. All login/link starts across SAML connections share the
same durable five-per-IP-window budget, plus the existing global ceiling. Capacity
is charged before Siteverify. Failed admission neither generates nor persists an
AuthnRequest. The optional service admission callback follows the existing OIDC
pattern; internal non-HTTP callers remain responsible for trusted composition.

Only the authorization URL is returned in JSON. The independent browser binding
is set in a five-minute HttpOnly, host-only, Path=/, Secure, SameSite=None cookie:
`__Host-ovelle_saml` hosted, `ovelle_local_saml` in the local fixture environment.
Its value contains a connection selector and a 32-byte random secret. The selector
is not authority: durable RelayState/browser/config binding rejects substitution.
Only one SAML flow per browser cookie is supported; starting another replaces it.
Secure is retained in local fixtures because None cookies require it; browser
acceptance must verify the actual localhost or HTTPS development environment.
This does not authorize insecure cookies on arbitrary HTTP hosts.

## Provider POST callback

`/api/v1/auth/saml/callback` accepts POST only, without query parameters. GET,
HEAD and other methods do not consume a request. The callback is intentionally
a cross-site top-level navigation, rather than an authenticated browser mutation.
It never depends on the ordinary Strict session cookie being sent by the IdP.
The originating account/session and purpose come from the durable request.

The callback requires the exact Origin of the reviewed entry-point URL. Missing,
null or different Origin is denied. If supplied, Fetch Metadata must describe a
navigation to a document. Authorization headers, iframe/fetch contexts and
ambiguous binding cookies are rejected. This supports a deliberately explicit
provider profile: an IdP posting from another origin, or an opaque/sandboxed form,
requires separately reviewed provider composition and acceptance evidence.
SAML Issuer is an entity identifier and is never treated as a browser Origin.

Only `application/x-www-form-urlencoded` (optional UTF-8 charset) is accepted.
The streaming body is bounded to 270,000 bytes before decoding, allowing the
verifier's maximal base64 response to be percent-escaped. UTF-8 and percent escapes
must decode correctly. Exactly one `SAMLResponse` and one `RelayState` are accepted;
duplicate decoded field names, unknown fields and malformed forms fail closed.
The existing transaction service applies its stricter response/secret bounds and
charges the durable callback budget before XML/signature verification.

The adapter calls the existing durable signed-response service. Login signs in an
exact previously linked identity and NameID format, or creates only pending contact
enrollment for a wholly unlinked subject; linking uses the stored
initiating account/session and retains current owner/admin local-passkey rules.
Final request/replay/session-or-link/audit effects remain atomic. Revocation,
expiry, wrong binding, profile substitution, duplicate callbacks or invalid
signatures cannot issue a session or link an identity.

Successful login sets only the existing HttpOnly Strict browser session cookie;
credentials are absent from JSON and redirects. Fixed 303 destinations are
`/account` for existing-account login, `/account/security` for linking and
`/account/enroll` for pending first-time contact enrollment. Callback success clears
the flow/pre-login cookies. Failure clears the flow cookie and returns a generic
303 to `/account/sign-in?result=failed`, without parser/provider details. Responses
reuse no-store, no-referrer, no CORS and restrictive CSP headers. Ordinary
session/pre-login/enrollment CSRF and SameSite rules are not weakened.

## Evidence and remaining acceptance

Signed fixtures exercise the actual maintained verifier and real D1 through HTTP:
login/link, hosted cookie attributes, wrong/missing/null Origin, Fetch Metadata,
CSRF, quotas before failed Turnstile, strict form/content/size decoding, ambiguous
cookies, browser/profile substitution, session revocation, replay/concurrent
callbacks, expiry and generic responses. These tests construct Requests and track
cookies explicitly. They do not prove an actual browser sends/accepts cookies or
that a Strict session is available throughout a cross-site redirect chain.

Before public composition, verify actual browser navigation/cookie behavior,
including the signed-in landing and subsequent same-origin requests, against the
supported browsers and reviewed IdP profiles. Verify the internal first-time SAML-only
[contact enrollment](stage0-saml-enrollment.md) and mail presentation without
email matching or automatic membership.
Trusted metadata/certificate lifecycle, hosted verification CPU/headroom, actual
provider acceptance, remote identity migrations, rollout and the original
recovery/native/UI/full Stage 0 requirements remain unfinished.
