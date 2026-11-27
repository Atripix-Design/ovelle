# Shared authentication backend foundation

User-approved scope: backend-only account/identity schema, sessions and organization
permissions, with enterprise security and RLS-style access rules. This implements
the reusable portions of the Stage 0 plan, not provider callbacks or account UI.

1. Add local migrations and real Workers/D1 constraint tests for accounts, optional
   external identities, organizations, memberships, scoped grants and audit.
2. Add trusted internal session issuance/resolution/rotation/revocation, with
   random digested secrets, fixed absolute expiry and database-owned provenance.
3. Add deny-by-default organization policy and fixed repositories. Read predicates
   filter rows in SQL; writes recheck the same policy and version inside an atomic
   D1 batch, including audit. Prove cross-tenant denial and scope intersections.
4. Run regression checks, fresh read-only review, publish to development under the
   user's existing instructions, and monitor exact-source CI.

Confirmed login direction: email/password; Google and Microsoft consumer/business
OIDC; enterprise SAML without a broker. Provider verification, credential linking,
password hashing, email/reset delivery, passkey ceremonies, membership management,
HTTP/cookie/CSRF middleware and frontend/native flows are later integrations. Do
not introduce any public fixture authentication or wire internal issuers to JSON.

D1 does not offer native PostgreSQL RLS. SQL policy predicates and transactional
guards protect only callers using these repositories; the server-side binding is
privileged. Do not expose arbitrary SQL, generic client CRUD, or D1 credentials.
Production rollout still requires manual account/environment/bookmark checks and
remote migrations. This task prepares migrations locally; delivery applies none.
