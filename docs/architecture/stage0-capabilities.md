# Stage 0 advisory permission snapshot

The internal `getAdvisoryCapabilities(ctx, principal, organizationId)` service
completes the planned Task 5 display snapshot. It reuses the existing live SQL
policy; it introduces no second authorization engine, command permission cache,
HTTP route or UI. Public identity routing remains disconnected.

`CapabilitySnapshot` contains only `organizationId`, `asOf`, `capabilities` (action
and complete scope pairs), and `truncated`. It omits account/session rows, role
flags, credentials, digests and other staff data. The timestamp describes when
the query evaluated its trusted clock; it is not an authorization lease.

## Meaning and limits

Each pair describes a current match of the shared organization/action/scope
policy. A complete `(program A, location X)` grant remains that intersection;
separate `(program B, location Y)` data cannot create `(A,Y)`. One-dimensional
program/location scopes remain one-dimensional. An explicit organization scope
comes only from an actual organization-wide policy match. No selected organization
or client-supplied owner/assurance field grants rights.

These are display hints, not target-command approval. A program.manage pair
restricted to both a program and a location cannot approve renaming the whole
program: that command still requires its fixed program-wide scope. Staff commands
also retain target-role, existing/proposed grant containment, recent passkey,
version and other operation-specific checks. Every command uses current database
authority and atomic SQL guards even if the client presents an older or edited
snapshot. There is no API that accepts a capability snapshot as proof.

The shared closed action catalog supplies organization-scope candidates, allowing
implicit organization.read and current owner authority to be represented. The
same final SELECT also obtains the requesting account's own stored grant pairs.
Stored grants are selectors only. Every candidate passes the existing policy,
including current membership, role, assurance, required SSO, live account/session,
provider/key evidence and active organization-qualified program/location rows.
Reserved owner actions still require recent owner passkey evidence. Administrative
actions inserted into a coordinator's historical grant rows still deny. Unknown
and unimplemented private-domain actions are never emitted.

The query preserves exact distinct candidates; it does not independently merge
scope dimensions. Broader and narrower allowed pairs may both appear. Ordering
is deterministic by action/scope/program/location. Results are bounded to 100;
a 101st match sets `truncated: true`. There is no cursor or completeness claim for
a truncated historical set. Normal grant writes already bound each membership to
32 proposed grants. Callers must use the existing resource-specific authorized
reads for actual data and cannot interpret a truncated list as all permissions.

Preflight checks produce the established unauthenticated/not-found behavior.
All candidate matching happens again inside one final SELECT, rather than a
JavaScript loop that could mix results from different grant states. Loss of all
visible authority during preflight/query returns not_found; it does not return a
stale capability list. The final query makes no writes or audit events.

## Runtime and verification

The server-owned action catalog is bound once as JSON and expanded with SQLite
json_each. Building a compound SELECT per action exceeded the Workers test
runtime's compound-term limit during development; the JSON catalog avoids that
shape. The current query stays within D1's documented 100 bound-parameter and
100 KB statement limits. A regression measures the actual statement and bindings,
not an assumed constant. See [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Local Workers/D1 tests exercise owner/admin/coordinator policy, admin in one
organization and coordinator in another, complete intersections, one-dimensional
scopes, duplicate candidates, archived resources, grant/session/membership
revocation, required-SAML acceptance and provider disablement, database-owned
assurance/recency, bounded larger historical sets and safe projections. Final
SELECT tests invalidate the account security epoch or downgrade the membership
after preflight. A real guarded command rejects a cached snapshot after grant
removal. Existing authorization, membership and full backend regressions remain
required because the shared policy gains a fixed capability-row mode.

The original plan's synchronous `assertGrantSubset(actor, requested)` helper is
not added as a duplicate authority path. Existing invitation and membership
services validate proposed grants and run current complete-scope containment in
preflight and the final mutation guard; membership changes also cover existing
target grants. The source plan now records these actual boundaries instead of
implying that a cached AuthorizedContext is sufficient to delegate authority.

This service does not complete identity rollout, UI composition, recovery or
Electron sign-in integration. Original Task 4/8 recovery, password runtime choice,
Task 9 listener/storage/IPC/packaged acceptance, real provider/mail verification
and the broader Stage 0 record/document/backup requirements remain open.
