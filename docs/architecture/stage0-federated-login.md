# Stage 0 social login and enterprise SSO exploration

October 22, 2026. **Confirmed direction:** explore enterprise SSO; Google and
Microsoft are the first two social connectors; Microsoft Entra ID is the likely
first enterprise identity provider. The user asked for a universal approach.
Everything below is a proposal, not provider configuration or a working login.

## Universal boundary

Use an Ovelle account independent of login method, with one or more linked
external identities and optional password/passkey credentials. Organization
memberships, grants and live D1 authorization remain Ovelle-owned. Authentication
establishes who a person is; it does not establish which organizations they may
access or whether they are an administrator.

Generic OpenID Connect covers Google, Microsoft, Entra ID and other conforming
providers without an application-specific implementation for every vendor.
Enterprise SAML needs a maintained SAML service/provider as well; OIDC alone does
not cover all enterprise installations. A broker can normalize both protocols
into one Ovelle integration. Even a broker requires each customer's connection
onboarding, policy review, certificate/key lifecycle and verified tenant binding.

## Implementation options

| Approach | What Ovelle owns | Benefit | Cost / limitation |
| --- | --- | --- | --- |
| Direct generic OIDC first | Credential/session lifecycle plus OIDC callback validation, linking, discovery/JWKS and per-organization connections | No required SSO broker; Entra and the two social connectors share a protocol implementation | We maintain protocol integration and operational edge cases; SAML still requires another integration |
| Broker for federation only | Ovelle accounts/passwords/passkeys/sessions; broker adapter for social and enterprise assertions | Universal SAML/OIDC boundary without moving all account authentication | Additional service and per-connection costs; password runtime work remains necessary |
| Broker for all authentication | Ovelle application accounts/memberships/grants; broker identity/session mapping | Passwords, social login, passkeys and enterprise federation can share a provider | Replaces significant parts of the current Stage 0 draft; pricing, recovery, session revocation, export and vendor dependency need review |

[WorkOS SSO](https://workos.com/docs/sso) supports SAML/OIDC connections and Google
and Microsoft OAuth; [AuthKit](https://workos.com/docs) adds user-management
features. Its [published pricing](https://workos.com/pricing), checked October 22,
quotes $125/month per enterprise SSO connection at 1–15 connections, with directory
sync priced separately and free staging. Do not mistake free social/user-management
allowances for free production enterprise SSO. For example, one production
connection is $125/month and ten are $1,250/month at that tier, before optional
extras, taxes or negotiated terms. A connection is a customer's SSO relationship,
not an individual login.

[Auth0 enterprise OIDC](https://support.auth0.com/center/s/article/Connect-to-Azure-AD-using-an-OIDC-Enterprise-connection)
is another broker option. Its [pricing](https://auth0.com/pricing) includes plan,
organization and enterprise-connection limits; verify the selected B2B tier and
expected organizations before selecting it. No subscription or vendor is approved.

**Recommendation for review:** adopt the provider-independent account/connection
model now. If universal SAML support is needed in the first release, evaluate a
broker before implementing our password lifecycle. If Entra OIDC plus Google and
Microsoft meet the pilot requirements and broker fees are unsuitable, start with
generic direct OIDC and leave SAML behind a separate adapter. Do not implement a
handwritten SAML parser/signature verifier in the application Worker.

For direct OIDC, [openid-client v6](https://github.com/panva/openid-client) documents
Workers support and provides discovery and authorization-code handling. It is a
candidate dependency, not installed or verified here. The broker adapter likewise
requires runtime tests; a vendor feature page is not Workers integration evidence.

## Proposed data and security contract

- `accounts` identifies an Ovelle person. Password credentials are optional;
  federated-only users must not receive a placeholder password or forced password
  recovery. Retain the distinction between an account and a volunteer/donor record.
- `external_identities` links an account to validated issuer/subject and the
  applicable provider/client or connection context. Preserve exact validated
  identifiers; do not merge identities by email. Define pairwise-subject/client
  migration and broker-to-direct migration before adding uniqueness constraints.
- `identity_connections` is controlled server configuration: organization ID for
  enterprise connections, protocol, trusted issuer/tenant, client identifier,
  secret reference, lifecycle/version and reviewed metadata endpoints. Google and
  Microsoft social connections are distinct from organization-specific enterprise
  connections even where they share a brand or issuer.
- Email is a display/contact attribute and a possible invitation hint. Linking an
  external identity to an existing account requires fresh proof of the existing
  account and the new identity, with an auditable transition and conflict handling.
  Never link automatically because emails match. Google's [OIDC reference](https://developers.google.com/identity/openid-connect/openid-connect)
  requires `sub` as the account identifier; its `hd` claim is relevant to Workspace
  restrictions, not an email-domain guess.
- Use authorization code flow with S256 PKCE, single-use server-bound state and
  nonce, exact callback allowlists, audience/issuer/signature/expiry validation and
  a maintained protocol library. Discovery endpoints are reviewed configuration,
  never arbitrary browser-supplied URLs; prevent metadata/JWKS SSRF and cross-tenant
  callback substitution. Request `openid profile email` only; no Mail, Calendar,
  Contacts or Graph permissions are implied by login.
- For Entra enterprise connections, pin and validate the intended tenant/issuer
  and signing-key issuer. A Microsoft social login through `common` is not proof
  of admission to an organization's SSO connection. [Microsoft's multitenant
  validation guidance](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
  explains binding issuer, tenant and signing-key scope; use the corresponding
  maintained OIDC ID-token validation flow for actual sign-in.
- A provider callback yields an internal authenticated-identity result, not an
  organization role. Resolve Ovelle account/session state, invitation and current
  membership independently. Start with explicit staff invitations; just-in-time
  membership provisioning and directory group-to-role mapping need separate rules.
- Store session authentication provenance: method, connection, issuer/tenant,
  authentication time and validated assurance evidence. Do not label every OIDC
  login as passkey/MFA. Sensitive owner/admin actions continue to require the
  approved recent step-up; whether enterprise MFA may satisfy it needs an explicit
  mapping and tests. The current `Principal` contract cannot represent federation
  and must be extended intentionally before a federated route exists.
- Organization SSO enforcement applies to access to that organization on every
  protected request, including existing sessions and Electron. A password/social
  session for another organization must not bypass required enterprise SSO.
  Connection disablement and membership revocation must block existing sessions
  under explicit policy, independently of upstream browser logout.
- SSO does not provide automatic employee deprovisioning. Directory sync/SCIM,
  webhook validation, event replay/idempotency, local revocation and reconciliation
  are a separate lifecycle capability. Decide session lifetime/revalidation and
  behavior after an employee is disabled before claiming enterprise readiness.
- Account recovery must respect SSO enforcement. Prevent a password-reset email
  from adding a local-password bypass for an enterprise-only account. Approve
  lockout recovery and any emergency admin procedure before policy enforcement.
- Electron opens the system browser and receives only a one-time Ovelle exchange
  through the existing proposed loopback handoff. Provider tokens stay server-side;
  renderer code receives no provider secret, password or refresh token.

## Decisions before the account schema is implemented

1. Direct federation, federation-only broker, or full managed authentication?
2. Is SAML required for the first pilot, or is Entra OIDC sufficient?
3. Expected enterprise connection count/budget and broker exit/export requirements?
4. Who may configure/verify an enterprise connection, and when may SSO be enforced?
5. How do step-up, identity linking, staff invitations, employee departure and
   lost-access recovery work for each login method?

Revise the Task 2 account/session schema and Tasks 3–4 authentication/recovery
contracts after these decisions. The original design's exclusion of a third-party
identity provider predates this request; it does not prohibit this exploration or
authorize silently choosing and provisioning one.
