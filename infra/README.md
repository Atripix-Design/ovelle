# Ovelle infrastructure operations

## Configuration and resources

Configure account identifiers and credentials outside Git. GitHub Actions uses the `CLOUDFLARE_ACCOUNT_ID` repository variable and `CLOUDFLARE_API_TOKEN` repository secret. The token needs Account Settings Read, Workers Scripts Edit, Workers R2 Storage Edit and Zone Read/Workers Routes Edit for `ovelle.org`. Direct D1 inventory needs D1 Read; applying migrations separately needs D1 Edit.

Wrangler owns Worker code, assets, domains and bindings. The workflow injects `R2_ACCOUNT_ID` as a Worker variable during deployment. For manual deployment, export `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then use `node scripts/ci/deliver.mjs development` or `production` after building the website and desktop packages. Manual delivery uploads packages and deploys; it does not apply D1 migrations.

| Environment | Worker | D1 name | R2 bucket | Application domain |
| --- | --- | --- | --- | --- |
| Development | `ovelle-development` | `ovelle-db-development` | `ovelle-storage-development` | `dev.ovelle.org` |
| Production | `ovelle-production` | `ovelle-db-production` | `ovelle-storage-production` | `ovelle.org` |

Keep resource bindings in `wrangler.jsonc` aligned with live resources. Never recreate a missing database or bucket without inventorying the account first.

## Desktop downloads

Delivery uploads packages directly to R2 with `Content-Disposition: attachment` and `Cache-Control: no-store`. The site links to `cdn.dev.ovelle.org` or `cdn.ovelle.org`, with a deployment SHA query parameter. R2 supports range requests. The Worker's legacy `/downloads/` route streams from R2 or returns a five-minute presigned URL when signing credentials are installed.

Optional download-signing credentials are separate from the deployment API token. Create an **R2 Object Read** key limited to the two application buckets and store `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as Worker secrets. With `CLOUDFLARE_ACCOUNT_ID` configured, `bash scripts/ci/install-r2-signing-secrets.sh` reads the keys interactively, verifies ranged downloads and writes both environments' Worker secrets. Keep values out of Git and CI logs.

## Terraform adoption

`infra/terraform/envs/development` and `infra/terraform/envs/production` follow the business-site layout. Terraform declares the durable D1 database and R2 bucket in each environment and reads the matching R2 custom domain as a data source. Wrangler owns the CDN domain connections and the Worker builds, deployment, assets, bindings, and secrets. The live D1 databases have read replication disabled, as declared in the module.

The configurations name HCP Terraform workspaces `ovelle-development` and `ovelle-production` for separate remote state. **The live resources have not yet been imported into Terraform state.** Do not run `terraform apply` against empty state: that would try to create resources with names that already exist. The two CDN domains were attached to the existing buckets through Wrangler. The Cloudflare provider cannot import an R2 custom-domain resource, so Terraform reads those connections instead of owning them. Before adoption, create and authenticate the two HCP workspaces with local execution and a scoped Cloudflare API token, then import the exact live IDs below into the matching environment. Follow the import-first procedure in the Atripix Terraform websites skill, check state addresses individually so retries are safe, and require a post-import plan of exactly `0 to add, 0 to change, 0 to destroy` before treating Terraform as the live owner. Production adoption also needs a D1 Time Travel bookmark and owner approval.

| Environment | Terraform address | Existing import ID |
| --- | --- | --- |
| Development | `module.site.cloudflare_d1_database.app` | `<account-id>/d5d4e909-cac1-4ce4-ad56-888cdb24a05a` |
| Development | `module.site.cloudflare_r2_bucket.storage` | `<account-id>/ovelle-storage-development/default` |
| Production | `module.site.cloudflare_d1_database.app` | `<account-id>/03263655-7eca-4586-a46f-9e502d52675b` |
| Production | `module.site.cloudflare_r2_bucket.storage` | `<account-id>/ovelle-storage-production/default` |

## Custom CI/CD

The only delivery pipeline is `.github/workflows/ci.yml`. Atripix's selector routes three non-secret check lanes; the hosted fallback preserves the original source SHA and prevents replay loops. Forks and Dependabot stay hosted. The selector and failure replay use the reviewed no-watchdog revision `57557facab9b8fa6404a874c122d39845f0cbd50`. The adaptive Node action uses reviewed revision `9d96739889abafddf80bb8a546df0da7568199c6`, also used by Atripix consumers; the no-watchdog revision omitted that action, so its existing implementation is pinned separately. No queue watchdog is used.

After all checks pass, trusted application-branch pushes package and publish on hosted runners. Provider credentials are supplied only to the publish step. The hosted job creates no GitHub release or artifact. It verifies local archives before uploading, rechecks the source SHA before publishing, and verifies ranged CDN downloads afterward. Branch protection requires the `build`, `typecheck` and `lint` checks before promotion to `main`.

Check operation:

```bash
node scripts/check-repository-privacy.mjs
node scripts/verify-ci-live.mjs development
node scripts/verify-cloudflare-live.mjs workers
node scripts/verify-cloudflare-live.mjs resources
OVELLE_RELEASE_DIR=release/desktop node scripts/verify-desktop-releases.mjs local
```

Use `node scripts/verify-ci-live.mjs main` after source is promoted to production. To verify published downloads against locally built packages, pass `development` or `production` to `verify-desktop-releases.mjs`; signed redirects also require `CLOUDFLARE_ACCOUNT_ID`.

## Recovery

Inspect the failed workflow job in GitHub Actions. Rerun it if the source still matches the branch head, or push a corrective commit. Upload failures stop delivery before Worker deployment. A Worker deployment failure can leave the previous application version active; R2 downloads retain their existing versioned names. D1 databases are not recreated or migrated by delivery. Apply reviewed migrations separately before deploying source that requires them.

For local/manual tooling, provide credentials through environment variables. Set `TF_VAR_cloudflare_account_id` for Terraform; do not commit account identifiers or tokens in variable files. Terraform adoption still requires the import-first checks above.
