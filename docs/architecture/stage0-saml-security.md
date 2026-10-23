# Stage 0 internal SAML protocol verification

October 23, 2026. This implements the maintained protocol-verification layer of the
confirmed direct enterprise SAML direction. It does not enable SAML login, create
an account/session, consume a durable request or prove hosted/provider readiness.
The public Worker does not import this module.

## Maintained implementation and runtime

`auth/saml/protocol.ts` uses pinned `@node-saml/node-saml` 5.1.0 for response and
assertion signature validation and signed-assertion extraction. It delegates
cryptography to the maintained library; Ovelle does not implement XML signature
verification. The [release advisory](https://github.com/node-saml/node-saml/security/advisories/GHSA-4mxg-3p6v-xgq3)
identifies 5.1.0 as the patched release for processing only authenticated assertion
contents. Dependency audit is a separate current check, not proof of correctness.

The wrapper uses `@xmldom/xmldom` 0.9.12 for strict structural parsing with its own
DOM types. The maintained verifier's compatible transitive parser is 0.8.15; its
resolved `xml-crypto` is 6.4.0. The test fixture directly pins xml-crypto 6.4.0 as a
development dependency for independently constructed, signed messages. The older
0.8.11 parser initially selected during investigation failed dependency audit and
was replaced before publication. Its global browser type declarations also
conflicted with the Worker type boundary; no global DOM library was added to the
application configuration to conceal that conflict. The Worker type configuration
includes Node types for the explicit `node:crypto` key-policy import, matching the
existing runtime compatibility date; this does not add browser DOM globals.

Real RSA signatures generated with ephemeral test-only keys run through the
maintained verifier in workerd under the existing `2026-10-06` compatibility date.
No private key fixture is committed. No compatibility date/flag change, deployed
probe or provider configuration is introduced. Local correctness, test wall time
and package engine declarations do not establish hosted CPU/headroom. That still
needs separate evidence before enablement.

## Trusted inputs and supported profile

Server configuration selects the exact organization, connection/version, issuer,
SP audience, stable NameID format and one to three pinned RSA public keys or
certificates. Keys must be at least 2048 bits. No URL or metadata endpoint is
fetched, and no incoming KeyInfo selects trust. Reviewed certificate rotation may
supply more than one key. Connection and request inputs are copied before awaiting
verification so concurrent configuration changes cannot relabel accepted evidence.

The initial profile requires both response and assertion signatures, RSA-SHA256,
SHA-256 digests, exclusive canonicalization and the enveloped/exclusive transform
pair. Each signature must reference its exact parent ID. Require one Response,
one direct Assertion, unique XML IDs, the correct namespaces, version 2.0 and a
success status. Exact destination and bearer recipient use the server's fixed
`/api/v1/auth/saml/callback`; response and subject confirmation must name the exact
selected request. Both issuers and audience must match reviewed configuration.
Conditions support only the single exact audience restriction and its standard
time attributes. Unknown condition elements or extension attributes fail closed,
including OneTimeUse and ProxyRestriction in this initial profile.

NameID is persistent or explicitly configured unspecified; transient/email NameID
formats are unsupported in this initial profile. Preserve the exact nonempty
subject, including case and spaces, within the existing 512-character limit.
Optional NameQualifier/SPNameQualifier must match the selected issuer/audience.
Attributes, groups, role claims and authentication-context strings never confer
Ovelle role or local passkey assurance and are absent from returned evidence.

Request state is strictly younger than five minutes. Response/assertion issue
instants cannot be future or older than five minutes. Conditions and bearer
confirmation require exclusive expiry, no future NotBefore and at most a
five-minute remaining assertion window relative to issuance. Authentication time
cannot be future or older than the current twelve-hour session ceiling. The
maintained library additionally checks timestamps against its wall clock; the
wrapper checks its trusted clock again after asynchronous verification. Both
must permit the evidence. A signed `SessionNotOnOrAfter`, when present, must be
valid and unexpired. It bounds the evidence deadline and is separately preserved
as `sessionExpiresAt` (otherwise null); a future session issuer must honor that
ceiling independently of assertion validity. No negative clock skew disables validation.

Canonical base64 and fatal UTF-8 decoding bound XML to 64 KiB. Reject malformed
XML, DTD/entities, comments, CDATA, non-declaration processing instructions,
multiple roots, ambiguous signatures/IDs and excessive depth/node count. External
references and alternate signature/digest/transform algorithms fail closed. This
is a deliberately explicit initial profile; encrypted assertions and additional
reviewed provider profiles remain future compatibility work.

## Evidence and remaining authentication boundary

The result is frozen, contains only selected connection/organization/request IDs,
issuer, exact stable subject, format, response/assertion IDs and authentication,
expiry, optional IdP session deadline and verification times. It contains no raw XML, attributes, email hints,
provider token, role or Ovelle credential. An in-process WeakSet makes
`consumeSamlIdentity` reject copied, deserialized or already consumed results.
Errors use the closed authentication/configuration vocabulary.

The pinned release's [cache interface](https://github.com/node-saml/node-saml/blob/v5.1.0/src/types.ts)
uses separate get/remove operations; it is not a durable atomic replay guarantee.
The wrapper supplies only a read view of the caller-selected request evidence.
Repeated verification of the same signed message is not persistent consumption.
A later service must atomically consume browser-bound request/assertion state,
recheck current connection/account authority and commit session/linking effects.
That service must use the branded result, preserve exact identity binding and
retain SSO provenance without automatic email linking or JIT membership grants.
There is deliberately no direct route from this protocol function to an issuer.

Remaining work includes durable SAML request/replay storage and races, connection
lifecycle/metadata review, identity linking/enrollment, browser POST/cookie binding,
HTTP quotas, hosted runtime/headroom evidence and real IdP acceptance. Existing
organization authorization, passkeys, desktop exchange and recovery issuance are
reused; full recovery, native integration and the broader Stage 0 remain open.

The supported condition and session-deadline policies follow the [SAML Core](https://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf)
condition evaluation rules and [profile errata](https://docs.oasis-open.org/security/saml/v2.0/errata05/csd01/saml-v2.0-errata05-csd01.html).
