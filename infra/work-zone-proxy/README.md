# Temporary Ovelle domain bridge

`ovelle.org` is registered in Cloudflare account `83952a1be987e4a12647732861a60925`.
The application Workers, D1 databases, and R2 buckets are in the personal account
`47b7e4cbf6e4918eecb9241815337c9e`. This Worker serves the production and
development custom domains from the work zone while the registration cannot be
moved between accounts.

The bridge is deployed as `ovelle-domain-bridge` and currently owns the custom
domains `ovelle.org` and `dev.ovelle.org`. It forwards GET and HEAD requests to
the corresponding personal-account Worker. Do not delete it while either custom
domain still points here.

Cloudflare rejected creating a personal-account zone through the available
Wrangler OAuth login because that login lacks `account.zone.create`. Cloudflare
Registrar also requires the domain to be more than ten days old before an
account transfer. The work zone was created October 4, 2026. A dashboard login
with zone-create and registrar access is needed to complete the move.

After the personal-account zone and registrar transfer are active, attach both
custom domains to the personal Workers, verify `/health` and downloads on each
domain, then remove the two bridge custom domains and delete the bridge Worker
from the work account. Keep the GitHub repository and CI/CD in Atripix.
