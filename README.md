# Ovelle

Starter repository for the 2026–2027 FBLA Coding & Programming project. The competition brief has not been added yet, so both applications intentionally contain only a neutral starter screen.

## Applications

| Path | Runtime | Purpose |
| --- | --- | --- |
| `apps/web` | React, TypeScript, Vite | Browser website; no server framework |
| `apps/desktop` | Electron, React, TypeScript, electron-vite | Desktop app with a separate Electron main process and sandboxed renderer |

The apps are independent npm workspaces. Product features can be added to one or both after the brief is available. There is no shared package or backend yet.

## Start developing

Use Node 22.12 or later and npm.

```bash
npm ci
npm run dev:web
```

In another terminal, for the desktop app:

```bash
npm run setup -w @ovelle/desktop
npm run dev:desktop
```

Electron 44 distributes its executable separately; the one-time `setup` command downloads it. The desktop window needs a graphical session and an operating-system sandbox that permits Electron to start.

## Checks and builds

```bash
npm run check
npm run lint
npm run build
```

Web output is `apps/web/dist/`. Electron output is `apps/desktop/out/`. The Electron build produces application code; no installer or deployment target is configured yet.

## Environments and branches

`development` is the integration branch. `main` is the production source branch. Promote tested changes to `main` through a pull request. No deployment or desktop release workflow runs from either branch yet.

Each app has `.env.development` and `.env.production`. Vite selects the matching file for `dev` and `build`. Variables prefixed `VITE_` are embedded in browser or renderer code and must never contain secrets. Local overrides belong in ignored `.env.local` or `.env.*.local` files. Electron main-process secrets, if needed later, should use a separate secure source and stay out of renderer code.

## CI

`.github/workflows/ci.yml` runs web and desktop checks as two non-secret lanes. The selector uses the Atripix private runner pool only for trusted events and otherwise selects GitHub-hosted capacity; a failed local lane is replayed once on hosted capacity. Shared CI references are pinned to infrastructure commit `9d96739889abafddf80bb8a546df0da7568199c6`.

Local routing requires the private repository to be selected in the Atripix CI Runners App installation and `atripix-private-builders` runner group, plus an Actions variable `ATRIPIX_RUNNER_APP_ID` and secret `ATRIPIX_RUNNER_APP_PRIVATE_KEY`. Those access settings are managed outside this repository. Set the variable last: until it exists, the workflow explicitly requests hosted capacity.
