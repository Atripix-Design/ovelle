# Internal staff access and ownership services

October 23, 2026. This backend increment implements staff grant/role changes,
revocation and explicit ownership succession from Task 8 of the
[identity/access plan](../superpowers/plans/2026-10-19-stage-0-identity-access.md).
It follows [organization and access](../feature-list.md#01-organization-and-access).
These are internal services exercised with local Workers/D1. No public routes,
real mail/provider changes, native renderer work or remote identity migrations
are enabled. Task 8 remains incomplete without its recovery-code demonstration;
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
provider acceptance or hosted D1 concurrency. HTTP composition, recovery, native
sign-in, UI and controlled hosted rollout still need their own verification.
