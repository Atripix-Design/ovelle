# Internal staff access and ownership services

October 23, 2026. This backend increment implements staff grant/role changes,
revocation and explicit ownership succession from Task 8 of the
[identity/access plan](../superpowers/plans/2026-10-19-stage-0-identity-access.md).
It follows [organization and access](../feature-list.md#01-organization-and-access).
These are internal services exercised with local Workers/D1. Internal HTTP composition is implemented as described below. Public routing,
real mail/provider changes, native renderer work and remote identity migrations
remain disabled. Task 8 remains incomplete without its recovery-code demonstration;
see the [operator recovery review](stage0-recovery-review.md).

## Staff authority

`changeMembershipGrants` replaces the reviewed grants and optionally changes the
admin/coordinator preset. `revokeMembership` removes grants and revokes an active
membership. Both require organization, membership and expected membership version,
plus an actor-bound idempotency key. State/version, grants, audit and receipt commit
in one guarded batch. Revoked membership cannot be reactivated through editing.
Existing browser/native sessions lose that organization's access on their next
protected request, retaining unrelated organization access.

A coordinator cannot manage staff or escalate through inserted administrative
grants. An administrator managing a coordinator needs `staff.manage_coordinators`
and complete coverage of both the target's existing grants and the replacement
set. Separate program/location grants cannot be unioned into broader authority.
Historical archived dimensions can be compared for removal; replacement grants
must reference current, active resources. Broader removals require the owner.
Coordinator grants remain limited to program/location read/manage in this increment;
private documents, finance and other unimplemented actions deny by default.

Changing or revoking an administrator, or promoting a coordinator, requires the
current owner's passkey confirmation less than five minutes old. Promotion also
requires an enabled, email-verified account with an active passkey. These conditions
are rechecked at the final batch. Credential loss does not prevent demotion/removal.
The owner membership cannot be revoked or demoted through these commands.

Receipts hash the explicit requested preset rather than mutable current role.
Same-key retries reauthorize current authority before returning the historical
snapshot; changed request bodies conflict. Reads return explicit membership/grant
snapshots. Without `staff.read`, members see only their own membership; list results
are bounded to 100 and ordered by ID. Pagination remains future API work.

## Ownership succession

`requestOwnershipTransfer` records the current owner, exact initiating session,
organization version and active, passkey-ready administrator target/version. The
owner must have recent passkey assurance. A pending request expires in 15 minutes
and does not alter ownership or grant access. It is not a bearer link.

`acceptOwnershipTransfer` requires explicit acceptance by the intended target,
current target passkey confirmation less than five minutes old, unchanged target
membership/version and current passkey readiness. At the final batch it also
requires the original owner/version and initiating session to remain authorized.
Source logout, account security invalidation or enterprise policy changes therefore
invalidate acceptance. Source confirmation is evaluated when requesting; it need
not remain within five minutes at acceptance, preserving the 15-minute window.

Acceptance updates request, organization owner/version, audit and receipt atomically.
**The previous owner remains an active administrator with existing grants.** A future
confirmation flow must disclose this; removal is a separate reviewed action.
Competing requests, cancellation and acceptance have one valid transition.
`revokeOwnershipTransfer` permits the current recently authenticated owner to cancel
a pending unexpired request. Reads are limited to the current owner and intended
target. Expired state is derived on read; accepted/revoked evidence is immutable.

Migration `0011_staff_access.sql` preserves existing audit/receipts while extending
their closed action sets. Transfer proof fields are immutable; terminal transitions
require completion timestamps and version increments. An accepted organization
version has at most one request. Application predicates establish caller authority;
privileged raw D1 access remains outside that boundary.

## Evidence boundaries

Local tests cover cross-organization and scope denial, browser/native revocation,
role promotion/demotion, target-key removal immediately before promotion commit,
current delegated authority changes, stale versions, receipt replay, audit rollback,
owner/target session invalidation, 15-minute expiry, competing accept/cancel and
same-key races. Populated migration tests retain sessions, invitation offers,
grants, audit and receipts and check foreign keys and immutable evidence.
Synthetic session/key fixtures establish service behavior, not real login ceremony,
provider acceptance or hosted D1 concurrency. Recovery, native sign-in, UI and controlled hosted rollout still need their own
verification. The HTTP tests below cover internal transport composition only.

## Internal HTTP contract

`handleStaffAccessRequest` composes these services with a server-selected browser
or desktop transport. It shares strict DTO/path parsing with invitation routes
and uses the existing session/origin/CSRF adapter. No principal, transport,
assurance, organization override or request digest is accepted from JSON.

| Route | Method and behavior |
| --- | --- |
| `/api/v1/organizations/:orgId/memberships` | GET authorized list, bounded to 100. |
| `/api/v1/organizations/:orgId/memberships/:membershipId` | GET authorized membership/grants. |
| `/api/v1/organizations/:orgId/memberships/:membershipId/grants` | PATCH explicit `expectedVersion`, replacement `grants`, optional `preset`. |
| `/api/v1/organizations/:orgId/memberships/:membershipId/revoke` | POST explicit `expectedVersion`. |
| `/api/v1/organizations/:orgId/ownership-transfer` | POST `targetMembershipId`, `expectedOwnerVersion`, `expectedTargetVersion`; creates pending request (201). |
| `/api/v1/organizations/:orgId/ownership-transfer/:transferId` | GET current owner/intended target detail. |
| `/api/v1/organizations/:orgId/ownership-transfer/:transferId/accept` | POST intended target acceptance with `expectedVersion`. |
| `/api/v1/organizations/:orgId/ownership-transfer/:transferId/revoke` | POST current owner cancellation with `expectedVersion`. |

All mutations require `Idempotency-Key`, strict JSON within 16 KiB and exact
allowed fields; nested grant/scope fields are checked before domain validation.
IDs are decoded once and bounded; malformed encodings, control/path/query
delimiters and query strings are rejected. Unsupported methods return 405 with
an explicit Allow header. GET performs no transition. Required fields/types,
role bounds and current versions remain authoritative in the domain services.

Browser mutations require the exact configured Origin and session-bound CSRF.
Desktop calls use bearer authentication and reject browser cookies, Origin and
fetch metadata; a credential from the other transport fails. Enrollment-only
sessions cannot access these organizations. Safe responses use no-store,
no-referrer, nosniff, restrictive CSP and request-ID headers without CORS grants.
Unexpected database failures become generic `unavailable` responses, never SQL
or credential details. Transfer snapshots omit source-session proof fields.

Local HTTP tests cover all route families, retries/version conflicts, explicit
acceptance/cancellation, concurrent accept/cancel, cross-organization role
confusion, existing-session revocation across both transports, strict DTOs and
safe errors. A signed software WebAuthn fixture verifies OIDC-preserving owner
step-up before source connection disabling invalidates acceptance; required SAML
policy also blocks an existing non-SAML target session. Native acceptance retains
the same passkey/recency requirements. These tests do not prove an Electron
main-process callback, native credential storage, real provider login or hosted
identity rollout. No public Worker import registers these routes.
