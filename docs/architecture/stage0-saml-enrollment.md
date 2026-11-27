# Internal SAML account and contact enrollment

October 23, 2026. This continues the maintained SAML verifier, durable transactions
and internal browser adapter with first-time account/contact enrollment. The
public Worker still does not import these handlers. Local signed-message,
Workers/D1 and HTTP evidence does not establish live provider/mail delivery,
hosted CPU/headroom, supported browser acceptance or rollout readiness.

## Signed proof becomes pending authority

An unlinked, verified login subject now creates a pending enrollment instead of
an account or session. Request consumption, both issuer/message replay records
and pending insertion share the existing final guarded D1 batch. Any insertion
failure rolls all of them back. Duplicate callbacks admit one winner. Explicit
linking continues to require the existing account/session and linking assurance;
it cannot substitute enrollment for proof of the existing account.

Any existing exact connection/issuer/subject blocks new enrollment, including a
disabled identity, disabled account, different NameID format or unknown legacy
format. A normal existing-account login retains its previous behavior. Email-like
subjects and SAML attributes supply no contact proof, account matching, membership
or role. The person nominates an address and display name after the callback.

Migration `0015_saml_enrollments.sql` adds private pending state: a random token's
digest, organization/connection/version, full reviewed-settings digest, exact
issuer/subject/NameID format, original authentication time, optional signed IdP
session deadline, absolute expiry and versioned contact-verification/delivery state.
No XML, raw assertion, private signing key, raw pending token or mail secret is
stored. Indexed cleanup deletes at most 100 expired rows during pending creation.
It cannot reopen consumed SAML request/replay evidence.

The pending proof lasts at most fifteen minutes, bounded further by the original
twelve-hour SSO age and any signed SessionNotOnOrAfter. These proof selectors,
formats and clocks are immutable. Initial rows cannot supply preverified contact
or consumption state. Contact updates require a new generation; consumed rows
cannot be reset. Digest-bearing contact state requires a non-null bounded expiry,
and consumption must precede both contact and enrollment expiry.

## Browser and contact HTTP contract

The callback returns only a fixed 303 to `/account/enroll` and sets a separate
HttpOnly, host-only, Path=/, SameSite=Strict pending cookie:
`__Host-ovelle_saml_enrollment` with Secure hosted, or the established local-fixture
`ovelle_local_saml_enrollment` name. Its lifetime never exceeds the pending row's
remaining lifetime. It contains a controlled connection selector and independent
random token. It grants no ordinary authenticated session or organization access.
The existing cross-site SAML flow cookie is cleared.

The fixed internal paths are:

| Path | Method | Outcome |
| --- | --- | --- |
| `/api/v1/auth/saml/enrollment` | GET | Validate the browser capability/current profile and return its independent CSRF token. |
| `/api/v1/auth/saml/enrollment/contact` | POST | Accept bounded email/displayName JSON and acknowledge generically with 202. |
| `/api/v1/auth/saml/enrollment/confirm` | POST | Verify a mail token with the initiating browser and CSRF; atomically create the new account, identity and SSO session. |

All use exact application origin and existing no-store/no-referrer/no-CORS response
rules. Mutations require independent enrollment CSRF; cookies are ambiguous if
duplicated. Body fields cannot choose IP, endpoints, issuer, keys or authority.
GET confirmation is method-rejected and never consumes verification evidence.
The controlled profile lookup is revalidated against the pending settings digest;
connection/version/issuer/organization must remain current and enabled.

Contact normalization, display-name validation and generic delivery handling are
shared with OIDC in `auth/contact.ts`. Existing OIDC issuer/tenant predicates and
Google contact-proof policy remain in its own enrollment service. SAML always
requires independent contact verification. An address already belonging to any
account is suppressed with the same 202 body and no session, identity link or
account-existence detail. The person can choose another address or authenticate
the existing account and explicitly link identities. A contact race cannot merge
accounts or move an identity.

Shared durable address/IP mail quotas are charged before delivery. Submission
replaces the contact generation/digest, invalidating previous mail. Failed or
suppressed delivery does not consume proof or disclose provider details. The
mail capability is in the existing verification page's fragment, with `flow=saml`
so future presentation can select the correct confirmation contract; the query
contains no token. This backend change does not implement that presentation.
Confirmation also reserves the shared durable authentication quota.

## Atomic account creation and original SSO time

Final confirmation rechecks the unconsumed pending generation/digest, exclusive
contact/proof expiry, current connection and absence of both the nominated account
email and exact external identity inside one guarded D1 batch. It creates the
verified-contact account, exact SAML identity including immutable NameID format,
browser session, pending consumption and account/identity/session audit events.
Any constraint/audit failure rolls all effects back. Competing confirmations,
email creation, identity linking and connection revocation admit no partial state.

The existing session preparation helper is used with the original verified SAML
authentication time. Neither contact nomination nor mail confirmation refreshes
SSO age. Session expiry is bounded by twelve hours from authentication and any
signed IdP session ceiling, including a deadline crossed during asynchronous
credential preparation. Connection/identity versions and SAML provenance remain
live; assurance is authenticated, never local passkey assurance. No organization
membership, grant, volunteer record, document or role is provisioned.

The successful HTTP response is empty 204, sets only the existing HttpOnly Strict
browser session cookie and clears pending enrollment. Credentials are absent from
JSON and redirects. Invalid/expired contact proof returns generic authentication
failure. Callback failures retain the existing generic fixed failure redirect.

## Verification and remaining scope

Tests cover actual signed callback to pending state to nominated contact/mail
confirmation, schema upgrade and SQL NULL/expiry defenses, no premature account,
no email merge/membership, separate browsers/tokens/CSRF, resend invalidation,
failed/suppressed mail, quotas, exact profile revocation/substitution, unknown or
disabled identities, duplicate callbacks, concurrent pending confirmations,
competing email/identity creation, pending/audit rollback and original SSO clocks.
Existing OIDC and SAML login/link tests remain required regressions.

This implements the internal first-time enrollment contract; it does not make
complete SAML sign-in ready for rollout. Actual provider profiles/form origins,
metadata/certificate lifecycle, hosted execution/headroom, real mail, full browser
navigation/security metadata and UI completion remain required. Public route
composition and remote identity migrations remain separately controlled. Recovery
consumption/replacement, password decisions, native Electron acceptance and the
remaining Stage 0 records/documents/backup/pilot-policy requirements stay open.
