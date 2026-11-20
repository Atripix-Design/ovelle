# Development workflow API surface

The development Wrangler environment uses `worker-development.ts`, separate
from the unchanged production `worker.ts` entry. The development entry delegates
only the OIDC sign-in, OIDC contact enrollment, browser session and passkey
registration/step-up, native device handoff, and named native volunteer workflow
routes. SAML, recovery, invitations and unrelated browser administration are not
admitted by this entry. The existing backend adapters still enforce their fixed
browser/native transport, CSRF, session, tenant and transaction rules.

The entry admits the surface only for `APP_ENV=development` and the exact
`https://dev.ovelle.org` origin. It requires Cloudflare request metadata and a
single `CF-Connecting-IP`, rejects `CF-Worker` subrequests, and fails closed if
the mail binding or backend configuration is unavailable. Cloudflare documents
that [direct requests receive a client IP and Worker subrequests carry the
`CF-Worker` marker](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker);
same-zone Worker subrequests can influence `CF-Connecting-IP`, hence the explicit
rejection. This is an ingress assumption to verify against the deployed custom
domain, not proof from a local mock. Forwarded headers are not used as authority.

The development environment alone adds `nodejs_compat` for the composed backend.
This requires the named development D1 and sender bindings plus the existing
server-owned authentication settings. No migration or secret provisioning runs
as part of deployment. The route map and local tests do not prove provider
configuration, real Turnstile completion, mail delivery, recovery, a physical
passkey, or an installed Mac client. Verify the exact deployed revision and those
external dependencies separately. Production remains on the original entry point.
