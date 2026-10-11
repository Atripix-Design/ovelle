# Figma website implementation — 11 October 2026

The website and Electron renderer now compose the same `@ovelle/ui` components through `apps/shared/Home.tsx`. The desktop Home source is [46:2](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=46-2); mobile sources are [182:2114](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=182-2114) and [185:9144](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=185-9144). Full contexts, source captures, authored transitions and independent variant dimensions accompany this document. Exact downloaded image fills/SVGs retain original bytes and native dimensions, fingerprinted in `assets.json`. Temporary asset URLs have been removed from the context captures.

Nine website composition families were implemented from their existing public component sets on **05 Components**. `source-families.json` records their native properties and variants. `packages/ui/figma-manifest.json` maps their actual set IDs and property values to typed React APIs. FeatureCard's Summary density and Field's hidden supporting-text appearance remain linked source variants. Figma set and variant descriptions reference the implemented export and source path. Home remains separate from the component sheet; reused parts remain linked instances.

Figma and React are separately maintained. Code Connect suggestions/publishing returned a plan/seat eligibility restriction (Organization/Enterprise with an eligible seat). No automatic Figma-to-code synchronization was established. The manifest, Figma descriptions, and independent fidelity checks provide traceability without claiming automatic synchronization.

## Geometry and visual evidence

`figma-*.png` are source exports. `rendered-web/` and `rendered-desktop/` contain default specimens and meaningful email/workflow variants from the final passing fidelity run. `live/` contains actual deployed Home captures at 1440, 390 and 320 pixels. These were inspected against the source captures.

| Mobile section | 390px | 320px |
| --- | ---: | ---: |
| Hero | 699 | 573.53 |
| Workflow, Find | 834 | 834 |
| Connected | 977 | 1045 |
| Desktop companion | 1002 | 1026 |
| Questions | 456 | 456 |
| Download email | 408 | 408 |
| Footer | 154 | 154 |

Independent component-state checks preserve EmailDownloadLink heights of 312px (default/focused/sending/disabled), 316px (sent), 334px (invalid) and 346px (error). MobileWorkflow heights are 834/828/810px for Find/Enrich/Follow up; the standalone mobile WorkflowSection heights are 882/876/858px. Hero scenes preserve 364×172 and 298×142 native dimensions.

Recorded renderer/source-export differences:

- Some Figma component screenshot exports crop 24px from the right (MobileWorkflow 390px exports at 366px; ProgramOverview 342px exports at 318px). React preserves the full native frame dimensions from source context; full Home exports include the complete composition.
- Browser Inter shaping/antialiasing causes small text-width differences. ProgramOverview's last summary wraps to two lines in Chromium and three in the cropped Figma export; the original 66px content slot preserves the section height.
- Figma native GLASS refraction has no identical CSS renderer. Shared glass utilities sample the actual backdrop with continuous frost, source tint, blur and opaque accessibility fallback; optical differences remain.
- The source desktop pinned specimen is a static 1440×900 frame. The runtime scroll composition supplies a 300svh runway and sticky 100svh stage, as described by the source component. At a 900px viewport this adds 1800px to a full-page capture. Reduced motion and short viewports render all three stages in normal flow.
- Browser stage text uses a 400ms fade rather than Figma's object-level Smart Animate interpolation. No unrelated entrance animations were added. FAQ height animation requires CSS `interpolate-size`; unsupported browsers retain native details semantics with an immediate height change.

## Motion and behavior

`prototype-transitions.json` records the authored reactions. Shared controls use the source 120ms dissolve; workflow context hover uses 220ms ease-out; section navigation uses the source 350ms ease-out scroll; pinned stage changes use 400ms ease-out. Button pressed geometry applies immediately. FAQ uses the authored spring (mass 1, stiffness 500, damping 45, 250ms) sampled into a CSS easing function. OS/provider reduced motion removes interpolation; reduced transparency preserves layout and makes glass opaque.

Both consumers passed fidelity checks for 31 public families, independent website state dimensions, original SVG fingerprints/native geometry and 12 theme/material/frost settings. Dynamic loading checks passed in both consumers: real mounted data regions, responsive masks, inert loading controls, live layout mutations and mounted-state retention. Website checks passed at 1440/1024/768/390/320px, including reversible natural scroll, reduced-motion flow, menu Escape, sheet focus restoration, validation, retry, preserved input and duplicate-submit prevention. Packaged Electron passed its live release catalog and restricted IPC/external-download handoff check under Xvfb. Type checks, lint, builds and shared component tests passed.

## Development deployment and email

Deployed [dev.ovelle.org](https://dev.ovelle.org) and [the development Worker](https://ovelle-development.jeremymathew100.workers.dev), version `95a6ee83-af92-45ec-8584-aeb42da28bd4`.

| Binding | Development resource |
| --- | --- |
| DB | `ovelle-db-development`, `d5d4e909-cac1-4ce4-ad56-888cdb24a05a` |
| STORAGE | `ovelle-storage-development` |
| EMAIL | Cloudflare Send Email, restricted sender `downloads@dev.mail.ovelle.org` |

Live `/health` returned 200 with `environment: development` and `database: true`. `/api/releases` verified all three release objects through actual R2 metadata; each corresponding CDN URL returned 200 with a nonempty binary. Production resources remain distinct. Migration `0001_download_email_limits.sql` was applied to development D1 only.

The mobile form submitted to live `/api/download-email`, received `{ "sent": true }`, and the authorized Outlook recipient received the message from **Ovelle <downloads@dev.mail.ovelle.org>** at 19:01:35 UTC. The body links to `https://dev.ovelle.org/#download`. No recipient address/message identifier is committed here.

Cloudflare email sending for `dev.mail.ovelle.org` is enabled. Public DNS verification found:

- `cf-bounce.dev.mail.ovelle.org` TXT: `v=spf1 include:_spf.mx.cloudflare.net ~all`.
- `cf-bounce._domainkey.dev.mail.ovelle.org` TXT: DKIM RSA 2048-bit public key, SHA-256.
- `_dmarc.dev.mail.ovelle.org` TXT: `v=DMARC1; p=reject;`.
- Cloudflare return-path MX records for `cf-bounce.dev.mail.ovelle.org`.

SPF/DKIM configuration and real delivery are verified; the Outlook connector does not expose Authentication-Results headers, so a recipient-side header pass is not asserted.

The development endpoint validates same-origin JSON and bounded request/email lengths, acknowledges provider delivery acceptance, and stores only hashed recipient/IP quota keys. D1 enforces atomic limits of three messages per recipient and five per IP per hour. Error responses retain the email for retry. It creates no account or subscription.

For a fresh checkout, build `@ovelle/ui` before consumer builds. `npm run cf:deploy:dev` now does this automatically. Apply migrations with `npx wrangler d1 migrations apply DB --env development --remote` before deploying a fresh database. Run `npm run check:download-email` for validation/quota regressions. Run fidelity/loading/website checks against the web preview and desktop renderer (`OVELLE_PREVIEW_URL=http://100.114.150.83:5175/?components`, `OVELLE_WEBSITE_URL=http://100.114.150.83:5175`). The verified website preview is [http://100.114.150.83:5174](http://100.114.150.83:5174).
