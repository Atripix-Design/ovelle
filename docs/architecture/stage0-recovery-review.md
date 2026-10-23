# Stage 0 operator recovery review

October 23, 2026. Review contract only; this does not authorize a reset or provide
an executable recovery path. It records the unresolved Task 4/8 acceptance work
from the [identity/access design](../superpowers/specs/2026-10-19-stage-0-identity-access-design.md).
Public authentication and staff invitation routing remain disabled.

## Implemented and missing

Session/global revocation, security epochs and live organization authorization are
implemented and tested internally. Staff revocation and two-party ownership
succession now have guarded services. Neither is lost-factor account recovery.

The proposed recovery contract requires eight high-entropy one-use codes shown
once, digest-only storage, recent existing-passkey authorization for issuance,
and password plus a consumed code to enter replacement enrollment only. Password
recovery must revoke sessions and pending desktop exchanges without removing
passkeys or granting staff assurance. Email-only removal of an existing passkey is
forbidden. These code/reset services and their demonstration are not implemented.
The password runtime decision remains pending; do not weaken the KDF to clear it.
Desktop exchange invalidation also requires its eventual implementation and tests.

## Before a live pilot

Approve the recovery decision, identity-check evidence, authorized reviewers and
escalation authority before enabling a pilot. All-factor loss must stop at review;
there is no support bypass, alternate admin endpoint or authorized raw SQL reset.
An email address, domain, nonprofit name or existing organization creation alone
is insufficient to establish recovery authority.

A review record should contain the request identifier, affected account and
organization identifiers, claimed issue, evidence references, reviewer decision
and reason, conflicts of interest and approved next steps. Keep evidence private
and collect only what the approved policy requires; never include passwords,
raw recovery codes, tokens or authentication URLs. Retention/access rules and
reviewer independence remain policy decisions requiring approval.

Before authorizing any future recovery action, verify the proposed effect on every
organization, sessions, pending exchanges and passkeys. Record what remains active,
including an old owner's administrator membership after ordinary ownership
transfer. Require explicit acceptance where the approved workflow requires it.
A review record alone must not alter account or organization authority.

After implementation, demonstrate one-use code races, expired/wrong-account
rejection, enrollment-only access, session/exchange invalidation, provider-policy
preservation and atomic audit/rollback. Independently read back the resulting
state and protected-access denial before recording completion. A failed or unclear
outcome remains unresolved; do not retry a destructive action blindly.
