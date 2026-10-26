# Self-hosted CI capacity

Ovelle's development workflows require self-hosted runners. There is no hosted
selector, failure replay, or automatic fallback. Capacity or dependency shortages
queue or block the affected job; they do not authorize a hosted run.

Ordinary build, type checking, lint, and unsigned packaging use the selected-workflow
`atripix-private-builders` group with the `self-hosted`, `linux`, `x64`,
`atripix-build`, and `atripix-ephemeral` labels. These jobs receive no project
secrets or write token. Preserve GitHub's selected-repository and selected-workflow
restrictions, including the reviewed development/main workflow references. Pull
requests or dispatches outside those approved references cannot borrow a less
restricted group.

Identity browser acceptance additionally requires `atripix-browser`. Provision
Playwright's OS dependencies in a reviewed unprivileged runner image before
assigning that label. The job installs browser binaries without `--with-deps`;
it cannot modify the host or install privileged OS packages.

Deployment, transfer-artifact deletion, and the manually dispatched hosted-Worker
runtime probe require a separate `atripix-ovelle-publishers` group and
`self-hosted`, `linux`, `x64`, `ovelle-publish`, `atripix-ephemeral` labels.
"Hosted" in the probe's name refers to the Cloudflare Worker under test.
The publishing group must use disposable, isolated runners approved for provider
credentials and write tokens, with access restricted to Ovelle's reviewed branch
workflows. Do not add the publishing label to an ordinary builder or expose host
Docker, host mounts, or elevated privileges. It needs Node 22, npm, GitHub CLI,
and normal outbound access for GitHub and Cloudflare.

On 2026-10-26, the live organization API confirmed the restricted builder group
and Ovelle development/main workflow allowlist. No Ovelle publisher group existed.
Two online builders advertised `atripix-browser`; the new exact-SHA browser job
must still verify their dependencies and actual runtime behavior. Publisher
capacity remains an unmet prerequisite. Until provisioned, this workflow does not establish a new
successful deployment. The main branch retains its own workflow until an explicitly
reviewed promotion; changing development does not update that branch.

Development Wrangler configuration separately preserves `AUTH_EMAIL`, restricted
to `accounts@dev.mail.ovelle.org`. Authentication secrets remain remotely managed
secret bindings. This change does not expose Stage 0 routes or enable production
authentication. The original 46-row Stage 0 acceptance audit still applies.
