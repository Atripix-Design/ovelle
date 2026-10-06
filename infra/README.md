# Ovelle infrastructure operations

## Resource ownership

The personal Cloudflare account is `47b7e4cbf6e4918eecb9241815337c9e`. The resources were created with Wrangler and are currently operated through `wrangler.jsonc`; Terraform state has not been configured for this personal account. Keep the Worker names, D1 IDs, and R2 bucket names in that file aligned with live resources. Never recreate a missing database or bucket without inventorying the account first.

| Environment | Worker | D1 name and ID | R2 bucket |
| --- | --- | --- | --- |
| Development | `ovelle-development` | `ovelle-db-development`, `6faa4ab6-6773-4078-9fe4-01ef0972a458` | `ovelle-storage-development` |
| Production | `ovelle-production` | `ovelle-db-production`, `692c48ec-2b6c-402e-bfa1-eb93730c1bd2` | `ovelle-storage-production` |

Wrangler owns Worker code, static assets, and bindings. The ubuntu-box user supplies the personal Cloudflare OAuth credential from `~/.config/.wrangler`; no Cloudflare token is committed to Git or put inside the build container. Refresh authentication with `npx wrangler login` on the host if delivery reports an authentication failure.

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
