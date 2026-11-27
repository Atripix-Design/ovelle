# Stage 0 authentication mail

`src/cloudflare/stage0/auth/mail.ts` implements the existing `AuthMailer`
interface with an explicitly injected Cloudflare `SendEmail` binding. Contact
verification (OIDC and SAML) and staff invitation services retain token issuance,
persistence, expiry, rotation, rate limits and delivery-status authority. The
adapter composes messages and reports transport acceptance; it never grants
membership, consumes a credential or establishes identity from an email address.

## Transport decision and composition

The original design proposed Resend but left provider selection open. This
implementation uses the Cloudflare binding already supported by this repository's
separate download service, avoiding another credential and SDK. This is an
internal transport choice, not approval to reuse the download sender or binding.
The public Worker does not import the adapter, and no Wrangler configuration,
provider settings, sender domains, migrations or public routes change.

The structured message fields and `messageId` acknowledgement follow the
[Cloudflare Workers email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
and the installed `@cloudflare/workers-types` interface. Cloudflare requires an
onboarded sender domain and supports binding restrictions; see its
[send-binding configuration](https://developers.cloudflare.com/email-service/configuration/send-bindings/).
No live provider configuration or delivery was performed for this increment.

`createAuthMailer(config, binding)` captures the sender, origin and bound send
method once. It accepts only the exact development or production origin/RP pair;
local fixture configuration cannot construct this transport. Tests inject the
external binding without provisioning it. Production callers must supply a
separately reviewed environment-specific sender/binding; the constructor cannot
prove that an address or binding is provisioned or entitled to send.

Each message has one structured recipient, a controlled structured Ovelle sender,
a fixed subject, plain text and HTML. The adapter uses the shared nominated-contact
normalizer, then rejects controls and address-list/header syntax at the transport
boundary. This narrower transport rule does not change account normalization or
turn nominated contact into an identity-linking authority. Caller-supplied HTML,
headers, CC/BCC, reply addresses and attachments are not supported.

| Purpose | Accepted destination | Credential/action lifetime owned by service |
| --- | --- | --- |
| `verification` | Exact origin + `/account/verify-contact#token=<43 base64url characters>`; optional final `&flow=saml` | At most 15 minutes, capped by the enrollment deadline; one-use explicit confirmation |
| `staff_invitation` | Exact origin + `/account/staff-invitation#token=<43 base64url characters>` | 72 hours, explicit acceptance by intended verified account |
| `password_reset` | Rejected pending approved reset authority and URL contract | Password/KDF/reset work remains incomplete |

The complete destination must match the canonical spelling. Queries, credentials,
foreign hosts, nonstandard ports, encoded or normalized paths, unknown/duplicate
fragment parameters, wrong-purpose paths and token query strings fail before the
binding is invoked. The HTML link escapes the fragment separator; the plain text
preserves the exact URL. The token remains a fragment, and the adapter performs no
HTTP request, URL shortening, tracking or token lookup.

## Delivery and failure semantics

A bounded nonempty message ID with the accepted transport-safe identifier syntax
produces `{status: 'accepted', providerId}`. This means binding acceptance, not
inbox delivery, reading or confirmation. Invalid input, thrown provider errors or
malformed acknowledgements produce only `{status: 'failed', retryable: false}`.
Provider exceptions and credential URLs are not logged or returned as diagnostics.
There is exactly one send attempt. `retryable: false` prohibits automatic adapter
retry after uncertain acceptance; it does not prohibit a deliberate service-level
resend, which must apply its existing quota and rotate the credential.

Current contact callers already turn generic delivery failure into their existing
response. Staff invitations persist the pending offer before calling the adapter
and record delivery separately; successful sending never activates membership.
Existing resend-generation guards still prevent an old completion overwriting a
new generation. No durable outbox, automatic delivery retries, bounce processing,
read receipt or provider webhook is added by this adapter.

## Evidence and remaining acceptance

`tests/worker/stage0/auth-mail.test.ts` exercises actual composed boundary messages,
canonical destination/fragment restrictions, recipient/sender injection attempts,
provider acknowledgement/error handling, authority snapshots, the actual shared
contact helper and real D1 invitation persistence/status/no-membership effects.
Only the external binding is replaced. Existing OIDC/SAML enrollment and invitation
suites retain their separate token-use, rotation, quota and race evidence.

The tests do not prove a verified sender, provider entitlement, actual delivery,
mail-client URL behavior, hosted execution, public confirmation presentation or
real-provider signup. Those remain acceptance work before rollout. Password/reset,
recovery policy, native integration and the full Stage 0 roadmap remain unfinished.
