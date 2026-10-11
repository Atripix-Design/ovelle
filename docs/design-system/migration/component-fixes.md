# Component corrections — October 9, 2026

Pagination is 62px high. Compact buttons retain a 44px target and a 36px square surface. Calendar rows have seven equal 42px cells with 36px inner surfaces, aligned with weekday headers; the default field is 72px and its open version 496px. Regular Button geometry is preserved.

The first Button column's public set ends at y=1724; the next heading starts at 1804 and the original Solid set at 1834. Compact internal sets sit below the existing regular states. All compact native state masters now use 44px outer/36px inner geometry; default labels are a single numeral, and busy/success states show the original native icons. `variants.json` records all nine compact state sets. No detached copies of public buttons were used in calendar or pagination.

Checkbox native glass has zero refraction/dispersion, shallow depth, low light intensity, restrained gradient alpha and no authored drop shadow. The CSS checkbox has restrained sheen, no shadow and semantic border/tint states. The Glass Tuner enforces this even when reading older saved baselines. Native Figma glass and CSS backdrop blur are different renderers: their lighting and edge rendering are not pixel-identical. This remains an explicit renderer discrepancy, not an automatic synchronization claim.

The native Skeleton column and counterpart mappings are removed. Runtime `LoadingBoundary` measures arbitrary mounted content instead of component-specific selectors. It handles resize, text/DOM changes, fonts and media loads, includes CSS-only unchecked indicators, and keeps children mounted after loading. Initial rendering still requires representative layout content. See the dynamic loading workflow.

Verification: all 21 source default dimensions, 96 original SVG fingerprints/native dimensions, action states and keyboard interaction checks pass in the website and built Electron renderer preview. All 21 loaded/loading layout pairs pass at wide/narrow widths across twelve theme/material/frost settings, transparency and reduced motion. The independent dynamic page check verifies arbitrary HTML/media, shape masks, live content changes, inert focus exclusion and retained input state.

Rendered pagination was inspected beside its native reference; the open calendar capture was inspected beside `references/80-1471.png` (demo uses additional date bounds and a custom label). Checkbox Light/Dark captures were inspected. Native public Button sheet and compact default/loading/success captures were inspected. Source contexts and native references are retained in this directory.

The video was intentionally deferred by the user. Its dedicated agent assignment and complete required coverage are in `../video-agent-handoff.md`.
