# Ovelle

Ovelle is the 2026–2027 FBLA Coding & Programming project. The competition brief has not been added yet, so the browser and desktop apps show a starter screen and desktop download links.

## Applications and environments

| Application | Development | Production |
| --- | --- | --- |
| React/TypeScript website | [ovelle-development.jeremymathewgithub.workers.dev](https://ovelle-development.jeremymathewgithub.workers.dev) | [ovelle-production.jeremymathewgithub.workers.dev](https://ovelle-production.jeremymathewgithub.workers.dev) |
| D1 | `ovelle-db-development` | `ovelle-db-production` |
| R2 | `ovelle-storage-development` | `ovelle-storage-production` |
| Source branch | `development` | `main` |

Cloudflare resources live in the personal account `47b7e4cbf6e4918eecb9241815337c9e`. `wrangler.jsonc` binds each Worker to its own D1 database and R2 bucket. The Worker serves the Vite site, checks its D1 binding at `/health`, and streams desktop downloads from the matching R2 bucket. The `VITE_` variables in the web and desktop apps are public build variables, never secrets.

## Local development

Use Node 22.12 or later and npm:

```bash
npm ci
npm run dev:web
```

For Electron, run its one-time binary setup, then start it in a graphical session:

```bash
npm run setup -w @ovelle/desktop
npm run dev:desktop
```

Checks and production builds:

```bash
npm run check
npm run lint
npm run build
```

The website uses plain React, TypeScript, and Vite. Electron has a separate TypeScript main process and a sandboxed React renderer. A web build goes to `apps/web/dist`; an Electron source build goes to `apps/desktop/out`.

## Desktop downloads

The ubuntu-box pipeline produces unsigned macOS x64 and arm64 ZIPs containing `Ovelle.app`, plus an unsigned Windows x64 portable EXE. They are stored on ubuntu-box under `~/.local/state/ovelle-ci/releases/<branch>/` and uploaded to the branch's R2 bucket. GitHub Actions artifacts and Releases are not used for these packages. Downloads are linked from each website.

Packaging manually on ubuntu-box:

```bash
npm run package:all -w @ovelle/desktop
```

The macOS archives are repacked with symlink preservation so each stays below Wrangler's 300 MiB upload limit. No package is notarized or code signed; macOS Gatekeeper and Windows SmartScreen may display warnings.

## CI/CD

Ubuntu-box runs the application checks, Electron cross-platform packages, R2 uploads, and Cloudflare Worker deployments. A user systemd timer polls `development` and `main` every three minutes. For a new branch commit, it checks out the exact SHA in a temporary directory, builds in an unprivileged Docker container without host credentials or a Docker socket, then deploys from the authenticated host to the personal Cloudflare account. It posts the `ovelle/ubuntu-box` commit status back to GitHub. `main` requires a pull request and that status before promotion.

See [infra/README.md](infra/README.md) for installation, credentials, recovery, and live verification. The existing Atripix organization JIT runner group has not granted Ovelle repository access; this project-specific host pipeline does not depend on that access.
