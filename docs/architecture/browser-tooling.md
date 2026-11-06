# Installed browser tooling capability

`scripts/browser-tooling.mjs` owns operator-selected tooling imports. Component
verification uses `loadChromium`; recording uses `loadInteractionDriver`.

The default browser is the declared Playwright dependency. Operators can select an
already installed module through `OVELLE_PLAYWRIGHT_MODULE`. The recording driver
uses `OVELLE_VIDEO_INTERACTIONS_MODULE`, falling back to the installed video-creator
skill's existing path. Package specifiers, absolute paths and file URLs resolve
from the scripts module. The provider must resolve to `file:`; HTTP, data URLs and
native-module specifiers are rejected. Missing or malformed providers fail without
silently falling back. Browser overrides expose `chromium.launch`; recording
providers expose `createInteractionDriver`.

This supports the existing installed-tool override workflow; it does not download
code or accept application/user-request input. Local modules are trusted executable
operator configuration, not sandboxed plugins. Validating the export shape does not
prove their implementation is safe. Changing this policy needs source review and
`npm run test:browser-tooling`.

The exact dynamic-import finding is retained in `architecture/exceptions.json` as
a deliberate tooling capability. Three previous unvalidated sites were removed.
Removing all dynamic imports would discard a supported workflow, so a zero-finding
count is not the acceptance criterion. No production code may import this module.
