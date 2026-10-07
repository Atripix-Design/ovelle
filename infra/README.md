# Ovelle infrastructure operations

## Resource ownership

The personal Cloudflare account is `jeremymathew100` (`83952a1be987e4a12647732861a60925`), including the `ovelle.org` zone. The Atripix GitHub repository remains the CI/CD source. Keep the Worker names, D1 IDs, and R2 bucket names in `wrangler.jsonc` aligned with live resources. Never recreate a missing database or bucket without inventorying the account first.

| Environment | Worker | D1 name and ID | R2 bucket |
| --- | --- | --- | --- |
| Development | `ovelle-development` | `ovelle-db-development`, `d5d4e909-cac1-4ce4-ad56-888cdb24a05a` | `ovelle-storage-development` |
| Production | `ovelle-production` | `ovelle-db-production`, `03263655-7eca-4586-a46f-9e502d52675b` | `ovelle-storage-production` |

Wrangler owns Worker code, static assets, custom domains, and bindings. The ubuntu-box service uses the isolated personal Cloudflare OAuth login in `~/.config/ovelle-auth-flow/.wrangler`; the service sets `XDG_CONFIG_HOME` and `CLOUDFLARE_ACCOUNT_ID`. No Cloudflare token is committed to Git or put inside the build container. Refresh this isolated login if delivery reports an authentication failure.

## Desktop download signing

The desktop files are uploaded from ubuntu-box to each environment's R2 bucket with `Content-Disposition: attachment`. A download request to the application Worker checks that the file exists. Until signing credentials are installed, it streams the object with attachment headers. When both signing secrets are present, it responds with a five-minute presigned `GET` URL on the personal account's R2 S3 API domain. The presigned URL is a bearer token and is not logged or cached by the Worker.

Create a personal-account **R2 Object Read** API token limited to `ovelle-storage-development` and `ovelle-storage-production`. Store its Access Key ID and Secret Access Key as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` secrets on each application Worker in the Cloudflare dashboard. The credentials do not need to be stored on ubuntu-box. Alternatively, from an interactive ubuntu-box terminal, run `bash scripts/ci/install-r2-signing-secrets.sh`; it verifies a one-byte ranged GET from both buckets and writes the values directly into the four Worker secrets without recording them in shell history. Keep the values out of Git and CI logs. The existing Wrangler OAuth token can upload objects but cannot create R2 S3 signing keys. The host verification accepts either a valid streamed download or a redirect with a one-byte ranged GET through the signed URL.

## Custom domains

`dev.ovelle.org` is the custom domain of `ovelle-development`; `ovelle.org` is the custom domain of `ovelle-production`. Both the zone and Workers belong to `jeremymathew100`. The temporary bridge used during migration has been removed.

## Terraform adoption

`infra/terraform/envs/development` and `infra/terraform/envs/production` follow the business-site layout. Terraform is configured to own only the durable D1 database and R2 bucket in each environment. Wrangler remains the sole owner of Worker builds, deployment, assets, bindings, and secrets. The live D1 databases have read replication disabled, as declared in the module.

The configurations name HCP Terraform workspaces `ovelle-development` and `ovelle-production` for separate remote state. They have passed `terraform fmt -check` and `terraform init -backend=false` plus `terraform validate`. **The live resources have not yet been imported into Terraform state.** Do not run `terraform apply` against empty state: that would try to create resources with names that already exist. Before adoption, create and authenticate the two HCP workspaces with local execution and a personal-account Cloudflare API token, then import the exact live IDs below into the matching environment. Follow the import-first procedure in the Atripix Terraform websites skill, check state addresses individually so retries are safe, and require a post-import plan of exactly `0 to add, 0 to change, 0 to destroy` before treating Terraform as the live owner. Production adoption also needs a D1 Time Travel bookmark and owner approval.

| Environment | Terraform address | Existing import ID |
| --- | --- | --- |
| Development | `module.site.cloudflare_d1_database.app` | `83952a1be987e4a12647732861a60925/d5d4e909-cac1-4ce4-ad56-888cdb24a05a` |
| Development | `module.site.cloudflare_r2_bucket.storage` | `83952a1be987e4a12647732861a60925/ovelle-storage-development/default` |
| Production | `module.site.cloudflare_d1_database.app` | `83952a1be987e4a12647732861a60925/03263655-7eca-4586-a46f-9e502d52675b` |
| Production | `module.site.cloudflare_r2_bucket.storage` | `83952a1be987e4a12647732861a60925/ovelle-storage-production/default` |

## Host service

The host uses Docker for an isolated Node 22 build and a user systemd timer for polling. It needs `git`, `gh`, Docker, Node 22+, an authenticated `gh` CLI, and Wrangler authentication to the personal Cloudflare account. The user must have Docker access and systemd lingering enabled. Build containers receive only the temporary checkout and task-specific npm/Electron caches; they do not receive the host's SSH key, Cloudflare OAuth config, GitHub token, Docker socket, or other home directories.

From the repository on ubuntu-box:

```bash
docker build -t ovelle-ci-builder:node22 -f scripts/ci/Dockerfile .
mkdir -p ~/.config/systemd/user
cp infra/systemd/ovelle-ci.service infra/systemd/ovelle-ci.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ovelle-ci.timer
systemctl --user start ovelle-ci.service
```

The service runs `scripts/ci/host-ci.mjs`. It clones the exact remote SHA for each branch, runs `npm ci`, typechecks, lint, production builds, and all three desktop packages inside Docker, then uploads packages to R2 and deploys the matching Worker on the host. It verifies the Worker health and download headers before marking the commit successful. A failed branch remains eligible for the next timer run. Successful SHAs and local release copies are stored in `~/.local/state/ovelle-ci/`.

Check operation:

```bash
systemctl --user status ovelle-ci.timer ovelle-ci.service
journalctl --user -u ovelle-ci.service -n 100 --no-pager
node scripts/verify-cloudflare-live.mjs workers
node scripts/verify-cloudflare-live.mjs resources
node scripts/verify-ci-live.mjs
node scripts/verify-desktop-releases.mjs
```

To retry immediately, run `systemctl --user start ovelle-ci.service`. To rebuild the image after changing `scripts/ci/Dockerfile`, run `docker build` again before retrying. Keep `development` as the integration branch and promote it to protected `main` through a pull request. Do not place desktop packages in GitHub Actions artifacts or Releases.

## Recovery

If a Worker deployment fails, inspect the user journal and `npx wrangler whoami` in this repository. The timer retries a branch whose SHA is not in its successful state file. Restore a Worker by rerunning the host service after fixing the cause; it rebuilds from the exact remote commit. If R2 upload fails, the service stops before Worker deployment and retries the upload on the next run. The most recent successful desktop packages also remain in the branch-specific local release directory. D1 databases are separate from Worker deployments and are not recreated or overwritten by this pipeline.
