# Ovelle infrastructure operations

## Configuration and resources

Configure account identifiers and credentials outside Git. GitHub Actions uses the `CLOUDFLARE_ACCOUNT_ID` repository variable and `CLOUDFLARE_API_TOKEN` repository secret. The token needs Account Settings Read, Workers Scripts Edit, Workers R2 Storage Edit and Zone Read/Workers Routes Edit for `ovelle.org`. Direct D1 inventory needs D1 Read; applying migrations separately needs D1 Edit.

Wrangler owns Worker code, assets, domains and bindings. Account-named `workers.dev` endpoints are disabled; application access and checks use the branded custom domains. The workflow injects `R2_ACCOUNT_ID` as a Worker variable during deployment. For manual deployment, export `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then use `node scripts/ci/deliver.mjs development` or `production` after building the website and desktop packages. Manual delivery uploads packages and deploys; it does not apply D1 migrations.

| Environment | Worker | D1 name | R2 bucket | Application domain |
| --- | --- | --- | --- | --- |
| Development | `ovelle-development` | `ovelle-db-development` | `ovelle-storage-development` | `dev.ovelle.org` |
| Production | `ovelle-production` | `ovelle-db-production` | `ovelle-storage-production` | `ovelle.org` |

Keep resource bindings in `wrangler.jsonc` aligned with live resources. Never recreate a missing database or bucket without inventorying the account first.

## Desktop downloads

Delivery uploads packages directly to R2 with `Content-Disposition: attachment` and `Cache-Control: no-store`. The site links to `cdn.dev.ovelle.org` or `cdn.ovelle.org`, with a deployment SHA query parameter. R2 supports range requests. The Worker's legacy `/downloads/` route streams from R2 or returns a five-minute presigned URL when signing credentials are installed.

Optional download-signing credentials are separate from the deployment API token. Create an **R2 Object Read** key limited to the two application buckets and store `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as Worker secrets. With `CLOUDFLARE_ACCOUNT_ID` configured, `bash scripts/ci/install-r2-signing-secrets.sh` reads the keys interactively, verifies ranged downloads and writes both environments' Worker secrets. Keep values out of Git and CI logs.

## Infrastructure ownership

Ovelle uses Wrangler and Cloudflare directly. The unused Terraform configuration was removed on October 16, 2026; no Terraform imports or applies were performed during this work. No HCP Terraform workspace or state backend is required.

| Surface | Source of truth / operator |
| --- | --- |
| Worker code, assets, bindings, variables and application domains | `wrangler.jsonc`, deployed by the hosted CI delivery job |
| D1 databases and R2 buckets | Existing Cloudflare resources; inventory before any deliberate change through Wrangler or the Cloudflare API/dashboard |
| D1 schema | Reviewed SQL in `migrations/`; apply separately to the matching environment before dependent code |
| R2 CDN connections and DNS/TLS | Cloudflare; verify the correct bucket, domain and active TLS before changing |
| Worker secrets | Cloudflare secret store; install through Wrangler, never commit values |
| Deployment credentials | GitHub Actions settings; secret-bearing publishing runs hosted |

Wrangler bindings reference existing resources; deployment does not reconcile all account configuration or provision missing databases/buckets. Record deliberate infrastructure changes here and verify live resource identity afterward. Never recreate resources to resolve an account or permissions error.

| Environment | Existing D1 ID | R2 jurisdiction | CDN domain |
| --- | --- | --- | --- |
| Development | `d5d4e909-cac1-4ce4-ad56-888cdb24a05a` | `default` | `cdn.dev.ovelle.org` |
| Production | `03263655-7eca-4586-a46f-9e502d52675b` | `default` | `cdn.ovelle.org` |

Both D1 databases have read replication disabled. Both buckets are Standard storage in ENAM. These CDN buckets are public download storage: never put private app data, SQL exports or credentials in them. Future app storage and service choices belong in the upcoming architecture documents.

## Custom CI/CD

The only delivery pipeline is `.github/workflows/ci.yml`. Atripix's selector routes three non-secret check lanes; the hosted fallback preserves the original source SHA and prevents replay loops. All pull requests, manual dispatches and Dependabot run hosted. Because GitHub prohibits public callers of private reusable workflows, the consumer-facing components are vendored in `.github/workflows/select-runners.yml` and `.github/actions`. `.github/ci-platform-source.json` records the reviewed upstream commits and both source and adaptation checksums. Regression tests verify those checksums. The selector and replay are from no-watchdog revision `57557facab9b8fa6404a874c122d39845f0cbd50`; adaptive Node setup is from `9d96739889abafddf80bb8a546df0da7568199c6`. No infrastructure host code or credentials are vendored, and no queue watchdog is used.

The public adapter checks the `atripix-private-builders` runner group before selecting capacity: it must permit public repositories, have selected-repository visibility, and explicitly include Ovelle. Workflow access must also be restricted to selected workflows and include the exact caller workflow at its trusted branch ref. Allow `Atripix-Design/ovelle/.github/workflows/ci.yml@refs/heads/development` and `Atripix-Design/ovelle/.github/workflows/ci.yml@refs/heads/main`, preserving the workflow entries needed by existing private consumers. This server-enforced restriction blocks altered pull-request workflows from bypassing the selector with direct runner labels. It inspects only that group's runners. Missing access or unavailable API inventory sends every lane hosted rather than queueing on inaccessible capacity. Public runner-group access requires organization-owner configuration; do not widen selection to all repositories. Until that access is enabled, the custom workflow remains fully functional on hosted fallback.

After all checks pass, trusted application-branch pushes package on routed build capacity and publish on hosted runners. Provider credentials are supplied only to the publish step. Temporary installer-transfer artifacts are deleted after delivery; R2 is the permanent release store. GitHub Releases are not used. It verifies local archives before uploading, rechecks the source SHA before publishing, and verifies ranged CDN downloads afterward. Branch protection requires the `build`, `typecheck` and `lint` checks before promotion to `main`.

Check operation:

```bash
node scripts/check-repository-privacy.mjs
node scripts/verify-ci-live.mjs development
node scripts/verify-cloudflare-live.mjs workers
node scripts/verify-cloudflare-live.mjs resources
node scripts/verify-cloudflare-live.mjs releases
OVELLE_RELEASE_DIR=release/desktop node scripts/verify-desktop-releases.mjs local
```

Use `node scripts/verify-ci-live.mjs main` after source is promoted to production. To verify published downloads against locally built packages, pass `development` or `production` to `verify-desktop-releases.mjs`; signed redirects also require `CLOUDFLARE_ACCOUNT_ID`.

## Recovery

Inspect the failed workflow job in GitHub Actions. Rerun it if the source still matches the branch head, or push a corrective commit. Upload failures stop delivery before Worker deployment. A Worker deployment failure can leave the previous application version active; R2 downloads retain their existing versioned names. D1 databases are not recreated or migrated by delivery. Apply reviewed migrations separately before deploying source that requires them.

Before a D1 migration, capture a Time Travel bookmark with `npx wrangler d1 time-travel info DB --env development --json` (or `production`). Verify the account, database ID, timestamp and environment before any restore. A bookmark is a short-retention recovery reference, not a permanent SQL backup. See [Cloudflare Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) for the current plan-dependent retention and restore procedure.

SQL archive exports require a maintenance window because exports can block database queries. Store archives in separate private storage, with retention and a verified restore procedure, when the application data requirements are defined. Do not export into the public CDN buckets. No scheduled archive or restore drill is claimed by this baseline.

For local/manual tooling, provide scoped credentials through environment variables or Wrangler sign-in. Confirm the active account before operating; a local sign-in may target a different account from GitHub delivery. An access denial is not evidence that a resource is missing.

## Verified baseline — October 16, 2026

Both environments passed live website/D1 health checks. Cloudflare inventory confirmed the database IDs above, distinct buckets and enabled CDN connections with active ownership and SSL (minimum TLS 1.2). Time Travel bookmark reads succeeded for both databases. Existing CI delivery passed at development `e3a6c848a975abdc289d9d0ca1358cd99aa24d81` and production `daf50509b0dd626da795bd4f066108eddec3ba06` before this documentation/verification update; subsequent delivery must be checked at its own SHA.

Development D1 reported two tables; production reported zero. The download-email binding and schema are development-only in the checked configuration. Promoting that feature requires a separate production migration, sender setup and delivery verification. Worker settings inventory was denied to the connected Cloudflare tool; live endpoint checks verify behavior but do not substitute for full settings access. The local Wrangler sign-in also targets a different account from the deployment account, so it must not be used for Ovelle mutations without correcting authentication.

## Public repository controls

Keep the repository's default workflow token read-only and disable workflow approval of pull requests. Fork workflows require approval from all external contributors. Allow only organization actions plus the pinned `actions/checkout` and `actions/setup-node` commits used here; require full-length SHA pins for external actions. The failure-replay job alone requests Actions write permission.

Collaborators-only interaction limits block new outside pull requests, issues and comments while active. GitHub limits this setting to six months; the current restriction expires April 11, 2027 and must be renewed if still needed. Runner-group workflow restrictions remain the execution boundary regardless of that temporary interaction setting.
