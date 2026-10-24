# Development identity database rollout packet

This packet prepares the database portion of original Task 11. It does not
authorize execution. The original plan requires separate rollout authority for
the private backup and remote migrations. Provider registration, mail, public
Worker composition, native clients and production remain separate actions.

## Observed baseline and exact target

Read-only Cloudflare inspection at preparation on October 24, 2026 UTC confirmed:

| Item | Observed development state |
| --- | --- |
| Worker | `ovelle-development` |
| D1 binding | `DB` → `d5d4e909-cac1-4ce4-ad56-888cdb24a05a` |
| D1 name | `ovelle-db-development` |
| Migration history | Only `0001_download_email_limits.sql`, applied October 11 |
| Application schema | Download-email limiter table/index; no identity tables |
| Hosted settings | No `AUTH_*` or Turnstile bindings |
| Turnstile | No widget for `dev.ovelle.org` or `ovelle.org` in the owning account |

The inspection queried schema and migration names, never account credentials or
application row contents. Both SELECT results reported zero rows written and no
database change. The D1 storage version reports `production`; that field names
Cloudflare's current storage engine, **not** the Ovelle production environment.
The target is the development UUID above. Do not use the separate production UUID
from Wrangler. Keep the verified owning account and private receipts outside git.

Cloudflare MCP authentication works. It does not establish that a local Wrangler
profile has the same account, credentials or permissions. Check the actual account,
Worker binding and database UUID again immediately before any operation. A changed
history, schema, target or source digest requires a new review, not a forced retry.

## Reviewed migration set

The set was rehearsed from source
`7c0c81c42e327264e4e1782d05788f0bc6a2888c`. Its existing baseline file has SHA-256
`6e557e24a6a9d8fc49c5bba658db151249ab22a39fa6d0fa0a0e37872a137a49`.
The pending set is exactly these fifteen files, in this order. No new migration
was added for the backend root.

| Pending file | SHA-256 |
| --- | --- |
| `0002_identity.sql` | `3c6afd013bf99b776ef2709c3858c9299a9e619e1ab732ab59f7686b4cc4f6ab` |
| `0003_organization_access.sql` | `61f9928b4cb611ce84d1bd4c1a9c996690e2daac55bb2527effedaf846699d39` |
| `0004_auth_limits.sql` | `2a67bba51110aca915255f63e2ec1e3675c98d2f48a2fbb2b7d438dffb6cdd0f` |
| `0005_oidc_identities.sql` | `dc067f9535cb8a1d9ed86fc1247b4bf59378ac39974f5695a78d03c6964aa17c` |
| `0006_oidc_transactions.sql` | `c249c00d27e3c2a644c19540954b6dd70bc6e10e06458cc9db052e5eb59863ff` |
| `0007_oidc_enrollments.sql` | `4978e8aecaec364267c59d2ea1e7c60b66995a018f1618d134db3dddab716173` |
| `0008_passkeys.sql` | `e073bf83675dac0589517778ce09c2af94bd77483ccc75755db9cf9ad767665e` |
| `0009_organization_commands.sql` | `3a4d303e8ec49c1e16ae1c21ae4625def1b9fdf6e0ce860dcc539b826de69eea` |
| `0010_staff_invitations.sql` | `c0e3d61bf67e906cbda50801b63db2f19c67ff8d799f6d4ee54338133f95042d` |
| `0011_staff_access.sql` | `2e45cd0ed46929e374e9074d647fffa6a2479b35385ea378087ebe40ea82410f` |
| `0012_desktop_auth.sql` | `c3feeea8efd5576a7b7847110c1b5ff56d48f4cdd3cd4ca3bfa03aad693800fa` |
| `0013_recovery_codes.sql` | `1b02dae299e6f52abf0f0f906298bf893173d139ad374124e8a36c6a6697da8e` |
| `0014_saml_transactions.sql` | `cc4e6a20deb3525d6027a743c324d5fbe4ec26bcfaa9d9faf23c52a6370662ee` |
| `0015_saml_enrollments.sql` | `8c857ec29d5d4e459b47e3a9b13dfe7098dc57336ecd5ee3e26cdc7b5c5ed3d8` |
| `0016_provider_recovery.sql` | `dac4b18820dd4210991df5f12bf3e810d49d5d6d5bac0c05ec46ad954099bc66` |

These are ordered schema changes, including identity/session authority, grants,
protocol transactions, passkeys, organization/staff commands and recovery.
Several later files rebuild audit/receipt/transaction tables. Do not cherry-pick
the recovery file, run only CREATE statements, alter an applied file or claim this
is an additive-only operation. The initial provider/passkey release still uses
the complete schema; these files do not establish a password KDF or credential.

## Local rehearsal evidence

Wrangler 4.152.0 applied the baseline in a new isolated local D1 store, inserted
one fictional download-limit sentinel, exported it, then applied all fifteen
pending migrations through `d1 migrations apply --local`. It exported the migrated
store after adding fictional account, organization, trigger-created owner
membership and program rows. Each export was imported into a different empty
local D1 store using `d1 execute --local --file`.

The October 24 rehearsal verified baseline history and absence of identity tables
after pre-migration restore; all sixteen migration names after migration; exact
download sentinel preservation; exact restored schema, migration history and
related fixture rows; and an empty `PRAGMA foreign_key_check`. Offline SQLite
`integrity_check` on the closed, restored local database file returned `ok`.
D1's HTTP/CLI query surface rejected that integrity pragma with `SQLITE_AUTH`;
do not claim it ran against hosted D1. Deleting the restored owner membership was
rejected, proving the restored trigger remained effective.

Reproduce in disposable directories with an isolated Wrangler config containing
only a fictional local D1 database and an absolute `migrations_dir`. First point
that directory at a copy containing only `0001`; after baseline export, point it
at the reviewed full migration directory. Run every command with `--local` and
the relevant isolated directory as its working directory. Export uses that
directory's default `.wrangler/state`, not a separate `--persist-to` path.

This is local migration/export/import evidence with fictional data, not a backup
of development, a hosted Time Travel restore, a populated identity upgrade, or
restoration of R2 documents/signatures. No remote export, migration or restore ran.

## Execution sequence requiring development rollout authority

1. Freeze the reviewed source and verify every digest above. Re-read the owning
   account, Worker binding, D1 UUID, schema and `d1_migrations` using the existing
   authenticated connection. Require exactly the observed baseline. Record UTC
   timestamps and resource IDs in a private receipt. Arrange a development
   maintenance window: export/migration can interrupt database queries, including
   the existing download-email limiter. Account for any intervening legitimate
   limiter writes rather than treating a changed count as automatic corruption.
2. Capture a fresh Time Travel bookmark for this UUID immediately before the
   operation. Keep it in the private receipt. A bookmark is a provider restore
   locator, not a downloaded backup or proof of a successful restore.
3. Create a private directory outside the checkout with mode `0700`; create backup
   and receipt files with mode `0600`. Export the complete development database,
   including schema, data and migration history. Through MCP, use the D1
   `/accounts/{account_id}/d1/database/{database_id}/export` endpoint with
   `output_format: "polling"`, poll its returned bookmark until terminal, then
   download the signed result directly to that private file. Never print its URL,
   SQL, token or row contents. Capture byte count and SHA-256 privately. Continue
   polling the same operation; an observation timeout is not permission to start
   another export. Cloudflare warns that export can make the database unavailable.
4. Import this actual backup into a fresh isolated local D1 store and compare its
   schema, migration history and relevant row content to its backup snapshot.
   Run foreign-key checks and offline integrity checks. Keep actual row data and
   local restored stores under the same private protection. A successful fictional
   rehearsal does not satisfy this step. Stop before migration if backup capture
   or readback fails; retain no backup or signed URL in CI artifacts or git.
5. Apply only the fifteen reviewed files, manually, in numeric order. Use the
   supported Wrangler migration path only after independently verifying its
   credential/account target. The equivalent authenticated D1 query path must
   submit each complete reviewed file plus its matching `d1_migrations` insertion
   as one operation, preserving trigger bodies; this is the algorithm used by
   pinned Wrangler 4.152.0. Never split SQL on semicolons or record a file before
   executing it. Require successful results and inspect history after each file.
   On any error, stop and inspect actual schema/history before deciding whether
   a retry or recovery is justified. Do not skip a failed file or restart blindly.
6. Verify exact ordered history `0001`–`0016`, expected tables/indexes/triggers,
   foreign-key consistency, unchanged download-limiter schema and preservation
   of existing data with legitimate concurrent writes accounted for. Verify
   `/health` and the existing application/download behavior. Public browser/native
   auth, organization and staff routes must still be `404`: schema installation
   does not import the backend root or create provider connections.

Do not treat a partially applied sequence as a completed rollout. Returning to
the earlier Worker artifact alone cannot undo schema changes. In-place Time
Travel restore overwrites later data and cancels in-flight work; it requires a
separate explicit recovery decision naming the bookmark and affected later
writes. Prefer diagnosing in a disposable restored copy first. Preserve the
before/after receipts and restore evidence for that decision. No automatic
downgrade, remote restore or identity migration belongs in CI.

The supported export/import flow and its foreign-key caveats are documented by
[Cloudflare](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
and [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
for operation and recovery semantics.

## Provider registration packet for a later setup action

The existing protocol implements server-side authorization code flow with PKCE,
fixed endpoints and scopes `openid profile email`. Prepare separate development
registrations with these exact Web callbacks:

| Provider | Development callback | Registration requirement |
| --- | --- | --- |
| Google | `https://dev.ovelle.org/api/v1/auth/oidc/google/callback` | Web application OAuth client in the chosen Google Cloud project; review consent branding, audience and designated test users |
| Microsoft | `https://dev.ovelle.org/api/v1/auth/oidc/microsoft/callback` | Web platform in the chosen Entra tenant; support organizational and personal Microsoft accounts for the existing common-endpoint flow |

These callbacks terminate at the backend. Do not register Electron loopback URLs
as these providers' callback or change this confidential Web client to SPA/public
client mode. Electron's separate backend handoff remains its own native work.
Do not enable implicit grants, request mail/Graph access or provision production
callbacks to make the current code work. The exact Web callback and provider
audience follow [Google OIDC setup](https://developers.google.com/identity/openid-connect/openid-connect),
[Microsoft registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
and [Microsoft redirect guidance](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

Owner/project/tenant selection, provider-admin access, client IDs/secrets and
designated test identities remain unverified. Cloudflare authentication supplies
none of them. Once separately authorized and created, match each server-owned
client to the reviewed D1 connection and version using the
[OIDC binding contract](../architecture/stage0-oidc-settings.md). Google uses
`https://accounts.google.com`; the existing Microsoft common issuer template is
`https://login.microsoftonline.com/{tenantid}/v2.0`, not the common discovery URL.
Secrets belong only in the target Worker's secret bindings.

The eventual hosted configuration also needs exact development origin/RP,
environment-specific reviewed auth sender/binding, an Ovelle Turnstile widget and
secret, and a stable random 32-byte admission key in canonical base64url. Follow
the [backend root contract](../architecture/stage0-backend-composition.md) and
[auth mail contract](../architecture/stage0-auth-mail.md). Do not create duplicate
sender domains that already exist or silently reuse the download-mail binding.

Database migration approval does not enable these settings, insert connections,
send mail or expose login. Public composition needs its own reviewed development
artifact and actual provider/mail/passkey/recovery/tenant acceptance. Product
confirmation pages, packaged native sign-in, physical devices, hosted concurrency,
the remaining data/document policies and full Stage 0 requirements stay open in
the [original-plan status](stage0-status.md).
