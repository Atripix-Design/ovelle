# Ovelle

Ovelle is the 2026–2027 FBLA Coding & Programming project. The marketing website, shared component system and Electron delivery foundation are implemented. The [confirmed CRM feature scope](docs/feature-list.md) and [proposed build order](docs/build-priorities.md) are documented; the competition brief/rubric mapping remains pending. Stage 0 includes an internal [account/session/organization-access backend](docs/architecture/stage0-shared-backend.md), [HTTP session security and durable authentication budgets](docs/architecture/stage0-http-security.md), [OIDC verification, linking and browser transactions](docs/architecture/stage0-oidc-security.md), [guarded browser login and contact enrollment](docs/architecture/stage0-oidc-http-enrollment.md), [passkey enrollment and sign-in](docs/architecture/stage0-passkey-security.md), and [password-runtime evidence](docs/architecture/stage0-runtime-evidence.md). These services and migrations are exercised locally; live CRM authentication and remote identity migrations are not enabled. The [social-login and enterprise SSO direction](docs/architecture/stage0-federated-login.md) records the remaining provider integration work.

## Applications and environments

| Application | Development | Production |
| --- | --- | --- |
| React/TypeScript website | [dev.ovelle.org](https://dev.ovelle.org) | [ovelle.org](https://ovelle.org) |
| D1 | `ovelle-db-development` | `ovelle-db-production` |
| R2 | `ovelle-storage-development` | `ovelle-storage-production` |
| Source branch | `development` | `main` |

Infrastructure is managed directly through Wrangler and Cloudflare; Terraform is not used. Cloudflare account configuration is supplied through deployment settings. `wrangler.jsonc` binds each Worker to its own D1 database, R2 bucket, and custom domain. The Worker serves the Vite site and checks its D1 binding at `/health`. Public desktop downloads use the environment's R2 custom domain: `cdn.dev.ovelle.org` or `cdn.ovelle.org`. The Worker also retains its legacy `/downloads/` route. The `VITE_` variables in the web and desktop apps are public build variables, never secrets.

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

The CI/CD workflow produces unsigned macOS x64 and arm64 ZIPs containing `Ovelle.app`, plus an unsigned Windows x64 portable EXE. Packaging runs in the routed build job on a disposable self-runner when capacity is available, with hosted fallback. Only the finished installers are transferred through a temporary GitHub Actions artifact (no extra compression, one-day retention); a hosted cleanup job deletes it after delivery, including failed delivery. Cloudflare credentials and publishing remain exclusively hosted. Packages are uploaded to each environment's R2 bucket with attachment and `Cache-Control: no-store` metadata. R2 remains the permanent download store; GitHub Releases are not used. Production links use `https://cdn.ovelle.org/releases/desktop/`; development links use `https://cdn.dev.ovelle.org/releases/desktop/`. Each link includes the deployment SHA to bypass older cached copies. Both CDN domains support ranged downloads.

Package locally after building the shared UI:

```bash
npm run build -w @ovelle/ui
npm run package:all -w @ovelle/desktop
```

The macOS archives are repacked with symlink preservation so each stays below Wrangler's 300 MiB upload limit. No package is notarized or code signed; macOS Gatekeeper and Windows SmartScreen may display warnings.

The repository Actions allowlist must include the exact checkout, setup-node, upload-artifact and download-artifact commit pins used in `.github/workflows/ci.yml`. Packaging tools are prepared without sudo in the disposable job workspace; the runner image does not need Electron-specific system packages.

## CI/CD

[The CI/CD workflow](.github/workflows/ci.yml) uses Atripix's custom self-hosted runner platform for three unprivileged lanes: build, typecheck and lint. The reviewed platform components are vendored with source commits and checksums because this public repository cannot call private reusable workflows. The selector fails closed to hosted capacity, keeps all pull requests and Dependabot hosted, and replays a failed self-hosted run once on hosted capacity at the original source SHA. It assigns local capacity only when the selected runner group explicitly permits this public repository. Node setup uses the platform’s adaptive action.

After checks succeed on a push to `development` or `main`, a routed build job packages the desktop apps, then a hosted delivery job uploads them to R2 and deploys the corresponding Cloudflare Worker. Secret-bearing publishing remains hosted under the platform contract. Pull requests run checks without deploying. Delivery checks that its source is still the branch head before publishing.

Configure `CLOUDFLARE_ACCOUNT_ID` as a GitHub Actions variable and `CLOUDFLARE_API_TOKEN` as an Actions secret. The runner platform also requires the `ATRIPIX_RUNNER_APP_ID` variable and `ATRIPIX_RUNNER_APP_PRIVATE_KEY` secret. No deployment credentials enter self-hosted jobs. See [infrastructure operations](infra/README.md) for setup, recovery and verification.
