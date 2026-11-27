# Desktop download delivery

The Ovelle website serves its catalog through `/api/releases`. Development uses
the newest published `desktop-dev-<source SHA>` GitHub prerelease. Production
uses the stable release marked **Latest** on GitHub. The catalog returns the
release's real asset URLs for Mac Apple silicon ZIP, Mac Intel ZIP and Windows
x64 EXE. Missing files are unavailable. A GitHub error never turns into a
guessed download URL. The catalog can be cached for 60 seconds.

On a push to an application branch, the isolated publisher receives the builds
from that run. It checks the branch head and checkout, uploads the three
packages to a draft, compares GitHub's reported SHA-256 digests and sizes with
the local packages, and rechecks the source before publishing. Production
releases are marked Latest. Development releases are prereleases and cannot
become the production download. CI then checks the site's catalog and reads
the ZIP/EXE header bytes via each public download URL.

The packaging artifact in GitHub Actions is temporary and deleted by cleanup.
Published GitHub Release assets are durable and independent of Actions
retention. R2 uploads and old `/downloads/<filename>` routes are retained for
existing links. The website no longer needs R2 to resolve the buttons, and it
does not need a webhook when a new GitHub Release is published.

The macOS ZIPs contain `Ovelle.app` and are not notarized. Download validation
does not by itself prove that an installer was launched on its target OS.

## Production promotions

The non-secret runner group accepts trusted branch workflow refs, not synthetic
pull-request merge refs. Bring the current main base into development, ensure the
promotion PR has the exact development head, and wait for that SHA's push run to
pass the required build, typecheck, and lint checks plus browser acceptance.
Main branch protection is unchanged. A push to main after the protected merge
builds and publishes its separate stable release.
