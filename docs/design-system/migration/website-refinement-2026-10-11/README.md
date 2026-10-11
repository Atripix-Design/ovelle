# Live website refinement — 11 October 2026

Compared fresh Figma Home desktop (46:2), mobile 390 (182:2114), mobile 320 (185:9144), Liquid Glass preview (135:3256), and pinned workflow sources against browser captures. Source contexts and PNGs are adjacent; exact downloaded image/SVG assets remain in `packages/ui/assets/website` with their existing fingerprints.

Corrections:

- Riverside desktop image now uses the source crop translation −201.6px at 1440px; companion image uses −12px at 720px. Mobile retains its native FILL crops.
- Companion header restores its 48px top inset, 12px gaps, 184px header and 24px separation before the photo.
- Home typography no longer overrides shared workflow headings, summaries or sheet typography. The demo icon retains its source 44px width.
- Both native coastal feather SVGs use quoted bundled URLs and intersecting masks. Previously the CSS declaration was invalid, leaving an unmasked rectangular image seam.
- Home mobile navigation uses its source instance's 54px header and compact 19.692308px logo. The public component's default remains independently defined by its source.
- Desktop Liquid Glass preview restores the source 10% panel tint, nested 20% results tint, 10px results padding, 20px corners and real backdrop sampling. Nested glass becomes opaque with reduced transparency.
- Pinned progress fills continuously within each phase, preserves completed segments and includes overall percentage. Incoming and outgoing source stages overlap for 400ms ease-out; outgoing controls are inert and hidden from accessibility APIs. Forward/reverse scroll and stage navigation stay consistent. Reduced motion uses three ordinary sections.

Figma component set 145:4284 now has 24 variants: the existing 12 Complete variants plus Start/Mid for each of the six standard stage/material combinations. Reduced-motion partial states are inapplicable. Variants remain in the same vertical family column and preserve linked public nested components. Native ON_DRAG prototype transitions connect Start → Mid → Complete → next Start using 400ms ease-out Smart Animate. `Progress` maps to optional overall React `progress`: Start=phase/3, Mid=(phase+0.5)/3, Complete=(phase+1)/3. Figma and React remain independently maintained; this is an explicit mapping, not automatic synchronization.

Validation: typecheck/lint, responsive website interactions at 1440/1024/768/390/320, all 31 source dimensions, 98 exact SVGs and 39 website asset fingerprints, loaded/skeleton and dynamic loading checks in web/Electron across 12 theme/material/frost settings. `scripts/check-website-refinement.mjs` checks actual image translations, valid bundled masks, continuous progress, overlapping inert transitions, reverse scrolling, reduced motion, midpoint captures in both consumers and nested reduced transparency. The skeleton check selects the outer specimen explicitly so a nested data-loading badge cannot substitute for its parent. Packaged Electron build and native download integration also passed.

Source/renderer limits observed side by side: Figma native GLASS includes refraction, dispersion and specular lighting that CSS backdrop blur/tint cannot reproduce exactly. Font shaping and antialiasing also differ slightly; source font sizes, weights, line heights and widths are preserved. The compact navigation source exports a 44.308px outer instance box containing a 54px header; the visible native header is the geometry reproduced here. The desktop scroll runway occupies three viewport heights to drive the 900px source composition; compare its sticky viewport, rather than the full runway, to the static Figma frame. No claim of pixel-identical native optical rendering.

`live-home-*`, `live-midpoint.png` and `live-crossfade.png` capture the deployed website; `web-*-mid.png` and `desktop-*-mid.png` document the shared static progress states. Figma source PNGs are prefixed `figma-`.
