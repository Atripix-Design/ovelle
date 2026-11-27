# Stage 0 internal SAML requests and account transactions

October 23, 2026. This continues the [maintained SAML verifier](stage0-saml-security.md)
with durable internal request, replay, existing-account login and explicit identity
linking services, with [pending first-time enrollment](stage0-saml-enrollment.md). It does not register HTTP routes, set browser cookies or establish hosted/real-provider acceptance. The separate
[internal HTTP composition](stage0-saml-http.md) adds browser admission and cookies. The public Worker does
not import these services. The original Stage 0 plan remains incomplete.

## Request creation

`startSamlTransaction` accepts server-selected connection configuration and a
trusted purpose, optional authenticated browser principal and edge IP. The [internal HTTP adapter](stage0-saml-http.md) supplies admission: exact Origin and pre-login CSRF/Turnstile for
login, or authenticated CSRF for linking, followed by Turnstile after the durable start budget. This transaction service itself is not an HTTP admission layer. All login and linking starts share five attempts per IP window across SAML connections,
plus the existing global thirty-per-IP challenge ceiling.

The maintained Node-SAML Redirect implementation creates an AuthnRequest with a
random server-selected XML ID, exact SP audience, fixed callback, reviewed NameID
format and HTTP-POST response binding. Linking requests use ForceAuthn. No
RequestedAuthnContext is invented to imply local passkey assurance. The reviewed
IdP entry point must be a canonical HTTPS URL without credentials, fragments or
reserved SAML query parameters. No metadata is fetched. Optional reviewed RSA
private material signs Redirect parameters using RSA-SHA256; it is never returned
or persisted. Unsigned requests require an IdP profile that permits them.

Migration `0014_saml_transactions.sql` adds five-minute requests. The public
AuthnRequest ID persists as a selector; RelayState and the independent browser
binding persist only as digests. A settings digest binds the exact origin,
organization, connection/version, issuer, audience, format, pinned key set, entry
point and optional SP public key. Configuration substitution fails even without
a version bump. Trusted settings and initiating principal selectors are copied
before asynchronous work. Saving the request rechecks the current connection and,
for linking, the initiating account's live assurance inside the D1 guard.

## Callback and atomic effects

`completeSamlTransaction` accepts a strict RelayState/browser-binding/response
object from trusted composition. It reserves the existing durable authentication
budget before parsing/verifying a response. Wrong or expired browser state cannot
select a transaction. The selected row supplies the request ID, creation time,
purpose and initiating account/session; callback attributes cannot choose them.
The maintained verifier validates both signatures and all configured claims.

A final guarded D1 batch rechecks the unconsumed request, its selected configuration,
current connection, current account/identity or initiating session, exclusive
expiry and required assurance. It consumes the request, inserts both replay
records, applies the session/link effect and appends the applicable audit event.
Constraint or audit failure rolls the whole effect back. Concurrent callbacks
admit one winner. Independent request verification alone cannot mint a credential.
The in-process proof brand remains additional to this durable boundary.

Replay digests include a domain separator, exact issuer, response/assertion kind
and ID. They remain effective across connections and key/version changes sharing
that issuer. Replay records are immutable and retained for a full five-minute
verification window after consumption. Indexed cleanup deletes at most 100 expired
requests and 100 expired replay rows during a start; it cannot erase still-valid
replay evidence. No raw assertion, attributes or provider token enters D1/audit.

Login locates only the exact already-linked connection, issuer, subject and NameID
format. It does not search by email or grant membership. An absent exact identity now
creates [pending contact enrollment](stage0-saml-enrollment.md), with no immediate
account/session; any existing but unusable exact identity still denies. The
new browser session uses the existing session preparation helper, keeps SAML
connection/identity/version provenance, and has authenticated or contact-enrollment
assurance according to the account. Provider roles/MFA never establish local
passkey assurance. Authentication time comes from verified AuthnInstant; expiry
is bounded by its twelve-hour age ceiling and any signed SessionNotOnOrAfter.
The assertion's short acceptance deadline does not become a new twelve-hour
session by forgetting the independent IdP ceiling. Final preparation rechecks
proof and session deadlines before any credential is returned.

Linking reuses the same live account-link guard as OIDC. It requires a recent
existing browser account and fresh new IdP authentication; current owners/admins
require a recent local passkey. The initiating source is loaded from D1, not the
possibly absent account cookie on a cross-site callback. Both proofs must remain
recent at the final write. New IdP authentication must also be no earlier than
one minute before request creation. A foreign or disabled identity is never moved
or revived. An already-linked own identity is repeat-safe but the new request and
message IDs are still consumed. Organization membership is independent.

## Exact identity format and migration

Migration 0014 also adds nullable `saml_name_id_format` to external identities.
New SAML links record the verified format, and its value is immutable. An exact
subject in another format is not treated as the same person. The existing unique
connection/issuer/subject constraint remains; a format migration needs a reviewed
identity transition/new connection rather than automatic reassignment.

Existing unqualified SAML rows remain null; the migration does not guess their
format or rewrite account/session/audit history. This new protocol login/link
service rejects unknown or mismatched formats. Legacy trusted internal fixture
issuance remains separate from protocol login and is not evidence that such a
row can sign in through SAML. Operators must resolve legacy identities before
provider enablement. Remote migrations are still manual and were not applied.

## Verification and remaining work

Tests use real workerd/D1, ephemeral signing keys, maintained Redirect generation
and genuinely signed responses/assertions. They cover independent Redirect
signature verification, exact binding, one-winner races, profile substitution,
issuer-wide replay, final revocation/version/epoch guards, identity-link conflicts,
freshness/deadline races, quotas, migration constraints and audit rollback. The
existing authorization policy tests remain authoritative for organization actions;
a SAML session does not confer new grants or access to another organization.

The [internal HTTP adapter](stage0-saml-http.md) and
[contact enrollment](stage0-saml-enrollment.md) now implement those server contracts.
Still required: full browser/real-provider/mail enrollment acceptance and browser
cookie/RelayState binding acceptance
and error handling; reviewed provider metadata/key lifecycle and customer setup;
hosted CPU/headroom and real IdP/browser acceptance; controlled public routing and
manual migration/rollout. A SameSite=Lax OIDC GET callback cookie must not simply be
copied to a cross-site SAML POST. Recovery consumption, password runtime/delivery,
native Electron integration and the broader Stage 0 obligations remain open.
