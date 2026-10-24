# Server-owned direct-provider settings

The internal Google/Microsoft HTTP adapter can use
`createOidcSettingsResolver(db, bindings)` from
`src/cloudflare/stage0/auth/oidc/settings.ts` as its `getSettings` dependency.
The resolver joins fixed Worker binding values to the exact live D1 connection.
It does not create provider registrations, provision secrets, enable a connection,
apply migrations or compose public routes. `worker.ts` remains disconnected.

## Binding contract

Configure each target Worker independently. These names are a contract for the
future composition root; they are not currently provisioned by this change.

| Binding | Required value when that provider is configured |
| --- | --- |
| `AUTH_GOOGLE_CONNECTION_ID` | Reviewed Google D1 connection ID; 1–128 ASCII letters, digits, underscores or hyphens |
| `AUTH_GOOGLE_CONNECTION_VERSION` | Exact D1 version as a canonical positive decimal string within JavaScript's safe integer range |
| `AUTH_GOOGLE_CLIENT_ID` | Exact registered client ID matching the D1 row; at most 1024 characters, without whitespace |
| `AUTH_GOOGLE_CLIENT_SECRET` | Server-only client secret; at most 4096 characters |
| `AUTH_MICROSOFT_CONNECTION_ID` | Reviewed Microsoft D1 connection ID with the same ID restrictions |
| `AUTH_MICROSOFT_CONNECTION_VERSION` | Exact reviewed Microsoft D1 version with the same version restrictions |
| `AUTH_MICROSOFT_CLIENT_ID` | Exact registered Microsoft client ID matching the D1 row |
| `AUTH_MICROSOFT_CLIENT_SECRET` | Server-only Microsoft client secret with the same secret restrictions |

All values must be strings without control characters or leading/trailing
whitespace. Nothing is trimmed or coerced. No alternate variable names, automatic
connection IDs, default versions or caller-selected secret names are supported.
All four bindings absent makes that provider unavailable; a partially configured
provider fails resolver construction. Release readiness must establish both
approved providers explicitly: an unavailable provider is not a successful setup.

Client secrets belong in the target Worker's secret bindings, never checked-in
Wrangler variables, renderer configuration, a browser response or D1. The other
three values are server configuration. Creating a resolver captures immutable
copies, so subsequent mutation of the input binding object or a returned settings
object cannot replace the credentials. This is not a secret rotation mechanism.

The existing `loadStage0Config` still validates the exact environment, auth origin,
RP ID, sender and Turnstile settings, and keeps `enabled: false`. The future root
must construct its request context and resolver from the same target Worker's
bindings and D1 database. This resolver cannot independently determine which
environment owns a registered provider client; target-account review remains
necessary. Browser request fields cannot supply bindings or choose a database.

## Live authority and rotation

Every lookup requires an enabled, organization-independent `oidc` connection with
the exact connection ID, provider, client ID and version. Google requires the
existing protocol issuer `https://accounts.google.com`. Microsoft supports the
existing common issuer template `https://login.microsoftonline.com/{tenantid}/v2.0`
or an explicitly reviewed GUID-tenant issuer at that host. The common discovery
URL is not itself an identity issuer. Endpoints and callback paths remain fixed
by the existing protocol module; no endpoint is read from a request or binding.

There is no cache of successful D1 authority. Disabling a connection, changing its
client or advancing its version makes the old resolver's next lookup fail. A
coordinated rotation must preserve the existing database versioning rules and
replace the matching Worker bindings/resolver. Existing session and transaction
checks continue to enforce the connection version; do not weaken them to make a
rotation seamless. Updating a row or secret requires separate operator authority.

The resolver is a preflight check, not a transaction boundary. Connection changes
after lookup remain subject to the existing final SQL guards in start, callback,
enrollment, linking, session and recovery services. It does not grant account or
organization authority and does not alter issuer/subject identity matching.

Missing configuration, unavailable schema, disabled/mismatched connections and
database failures produce the closed `configuration` error without diagnostics
or credential values. Existing HTTP adapters translate that into their safe
response or fixed failed-callback redirect. No automatic retry, mail or provider
request is performed by the resolver.

## Evidence and remaining rollout

`oidc-settings.test.ts` uses the existing workerd/D1 fixture to exercise malformed
and partial bindings, provider/client/issuer mismatches, unavailable providers,
live disabling/version rotation, and explicit Microsoft tenant issuers. Signed
Google and Microsoft HTTP login journeys verify the maintained OIDC protocol and
session issuance using the captured credentials, even after attempted binding and
returned-object mutation. The external IdP and Turnstile transports are fixtures.
An unavailable connection returns a generic no-store HTTP error and persists no
transaction.

This evidence does not prove a real provider registration, provider credential
validity, browser recovery, a physical passkey, actual delivery, remote schema
application or public authentication. Continue the
[rollout acceptance](../operations/stage0-identity-access.md#separate-rollout-acceptance)
and [original-plan requirements](../operations/stage0-status.md). The next backend
composition step must wire these concrete settings and existing adapters together,
preserve trusted edge-IP and browser/native transport boundaries, and retain the
separate public rollout gate.
