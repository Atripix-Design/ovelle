# Ovelle glass audit — 8 October 2026

[Figma library](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=4-2) · [Ten-level board](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=58-908)

## Earlier work completed

All 20 original component families are represented by 18 unified public assets (three button styles share Button). Material switches preserve nested Appearance choices. Families remain horizontal columns with variants beneath them. The blank 1440 × 6000 Home canvas remains available for composition.

## Visual audit

Ten native Figma renders were inspected at **0, 11.1, 22.2, 33.3, 44.4, 55.6, 66.7, 77.8, 88.9, 100**. Each combines FAQ, Search Field, open Select, Button and Switch over navy/cyan/coral shapes and actual Feature card instances.

| Levels | Observed appearance |
| --- | --- |
| 0 / 11.1 | Clear liquid; background colors remain visible, edge sheen is strongest. |
| 22.2 / 33.3 | Background softens while maintaining color influence. |
| 44.4 / 55.6 | Medium diffusion, consistent foreground text. |
| 66.7 / 77.8 | Heavy diffusion; background detail recedes. |
| 88.9 / 100 | Frosted, near-opaque tint; strongest background blur. |

Corrections: alpha now lives in RGBA color variables rather than ineffective paint opacity on opaque variables. Dropdown corners and clipping were corrected. Menu tint has an .88 floor and blur an 8px floor to prevent text underneath competing with options. Dark/pigmented controls have a .92 tint floor. Switch thumbs remain opaque white. Glass secondary text uses primary contrast; disabled semantics remain separate.

Screenshots are on the Figma board. Local accepted captures use `01-frost-0.png` through `10-frost-100.png` in the chat's `ovelle-components/frost-audit` artifact directory. Earlier v2 captures are superseded. Visual inspection is not a WCAG compliance measurement.

## Runtime validation

The corrected deployed engine was retested on **402 actual Figma glass surfaces**, at every level above plus **37.5**. All effect radii and paint opacities were valid, including the corrected zero-level gradient clamp. Reduce Transparency disabled all glass effects. The library was restored to **35**, with transparency enabled.

Normal plugin UI launch in the user's editor remains untested. Validation used the deployed engine's material function through the native Figma API; it does not verify panel interaction, polling or plugin persistence in the editor.

[Open Glass Tuner](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?try-tool-resource-content-id=920068c6-0076-4fa4-94bf-67f7325bb96f&try-tool-resource-type=gen_tool)

Deployed version: `8adfcaa4fc115c9e8e8e4a6185d44e2ba77c4728`. Source is preserved in `glass-tuner/code.ts` and `glass-tuner/ui.html`.

`glass/intensity` is a FLOAT frost setting. The plugin is required to propagate it into native GLASS effects because those properties cannot bind Figma variables. Reduce Transparency is an independent BOOLEAN setting. Derived RGBA variables stay in the semantic Light/Dark collection.

## Web and desktop material

`@ovelle/ui` uses real browser `backdrop-filter` sampling and RGBA surface colors. It accepts fractional `glassFrost` values, defaults to 35, and mirrors panel/control blur and tint progression. `reduceTransparency`, OS reduced-transparency preferences, reduced motion, forced colors and a missing-backdrop-filter fallback are independent considerations.

Figma optical refraction and CSS backdrop filtering are different renderers. The package reproduces the material progression and component structure; it does not claim lossless optical export. Native select menus and checkboxes retain platform rendering for reliable keyboard behavior.
