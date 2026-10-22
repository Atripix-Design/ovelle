# Stage 0 social login and enterprise SSO exploration

October 22, 2026. **Latest confirmed direction:** email/password plus Google and
Microsoft OIDC for both consumer and business accounts; direct SAML for enterprise
SSO, without a broker. These supersede the earlier OIDC-only enterprise proposal.
Provider integrations and password runtime approval remain pending. The
[shared backend foundation](stage0-shared-backend.md) implements storage, sessions
and organization access, not the provider login routes.

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

## Chosen implementation

**Confirmed October 22:** Google personal/Workspace and Microsoft personal/work/
school OIDC, plus organization-specific SAML. No authentication broker, paid SSO
connection subscription or plan upgrade. Libraries, hosting, runtime compatibility,
maintenance and customers' identity-provider licensing have separate considerations.
No provider application has been registered by this work.

Microsoft consumer/business login must support both account categories; a
`consumers`-only authority would omit work/school users. Validate the actual tenant,
issuer, audience and key scope with a maintained OIDC implementation. Login with a
company account does not automatically establish an Ovelle organization membership.
When an organization requires SAML, social/password sign-in cannot bypass it.

SAML requires reviewed per-organization metadata, signed assertion validation,
recipient/audience/request/expiry checks, replay prevention and certificate
rotation. Validate a maintained library on the hosted runtime before enabling it;
do not write a custom XML signature verifier. SCIM remains separate future work.

Use a maintained OIDC implementation rather than handwritten token verification.
[openid-client v6](https://github.com/panva/openid-client) documents Workers support;
it remains a candidate until pinned and exercised in the Workers harness. Ovelle
owns sessions, linking, recovery, current organization authorization and connection
lifecycle. Provider secrets and tokens remain server-side. Provider onboarding and
real callback validation are separate from the current runtime experiment.

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

## Remaining decisions before enforcement

Connection administrators, verification and enforcement must have explicit
permissions and audit rules. Define invitation, identity linking, employee
departure, step-up and lost-access recovery behavior before enabling login. The
schema must support optional local credentials and external identities, rather
than requiring every account to have a password. Password support remains gated
on the [hosted runtime evidence](stage0-runtime-evidence.md); do not weaken a KDF
to fit free hosting.

Revise the Task 2 account/session schema and Tasks 3–4 recovery contracts to match
this direction before implementation. The original design's identity-provider
exclusion and earlier enterprise-OIDC-only proposal are superseded by consumer/
business OIDC plus enterprise SAML. No provider settings,
remote migrations or live authentication have been enabled by this decision.
