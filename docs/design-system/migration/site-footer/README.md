# Many Hands · Ovelle site footer

Each character is small. Together the characters make a tide. The footer echoes the coastal home photography and gives volunteer teams a place to find their next step.

## References and decisions

- [Lusion v3](https://www.awwwards.com/sites/lusion-v3) is an Awwwards Site of the Year. [Its footer](https://lusion.co/) separates ordinary contact/navigation tasks from the more immersive artwork. Ovelle borrows that separation and keeps the scene below the primary reading area.
- [Ochi Design](https://www.cssdesignawards.com/sites/ochi-design/41443/) scored 8.65 with CSS Design Awards. [Its footer](https://ochi.design/) gives brand typography enough scale to stand alone while leaving useful links accessible. Ovelle borrows the scale and clear groupings, not Ochi’s layout or copy.
- The generated concept board explored a balanced crest, a sparse swell, and a dense crest. The sparse version weakened depth and the dense one competed with navigation. The selected balanced version replaces illustrative placeholder links with real site destinations and rounds out the visual hierarchy with Ovelle’s existing Section label and Switch.

## Review

Review standard: [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md). Scores below are an internal design critique, not a third-party award or an accessibility certification.

| Check | First render | Revised render |
|---|---:|---:|
| Hierarchy and brand fit | 8/10 | 9/10 |
| Legibility and narrow-screen spacing | 7/10 | 9/10 |
| Expressive, interruptible motion | 7/10 | 9/10 |
| Navigation and accessible interaction | 8/10 | 9/10 |

The first pass had a crest behind the tagline, crowded wordmark tracking, and a pause that rebuilt the scene. The revised pass lowers the field, separates copy from the ink, and freezes the current frame. Link hover and keyboard focus now generate local damped wakes without altering layout or navigation. Decorative characters never enter the accessibility tree. Test cases cover focus visibility, 44 px link targets, keyboard section navigation, motion preferences and responsive overflow. Offscreen and hidden surfaces do not schedule frames.

## Penpot source

The editable [desktop board](https://design.penpot.app/?screen=viewer&file-id=51f2d744-23b9-8138-8008-f3bdd65662b2&page-id=2afdd151-2efd-80d3-8008-f3bd241faeae&section=interactions&frame-id=f4b2b2fe-96aa-80e1-8009-0252e42be2e4) and [390 px mobile board](https://design.penpot.app/?screen=viewer&file-id=51f2d744-23b9-8138-8008-f3bdd65662b2&page-id=2afdd151-2efd-80d3-8008-f3bd241faeae&section=interactions&frame-id=f4b2b2fe-96aa-80e1-8009-0252b29f2266) live on 01 Home. Each contains editable text, three vector ink layers, and linked Ovelle controls. The board IDs are Penpot references, not Figma nodes.

The native `Ovelle / Site footer` variant set is also saved on 01 Home, separate from the composition boards. It contains seven vertical variants across Size, Theme, Material and Motion. The set reuses linked Section label and Switch instances. It remains on 01 Home because opening 05 Components for the move exhausted browser memory. The [Penpot manifest](../../../../packages/ui/penpot-manifest.json) records the verified location, intended sheet, individual component and board IDs, and runtime mappings.

[Penpot desktop phase](penpot-preview.webp) · [Penpot dark variant](penpot-dark.webp) · [Browser desktop and mobile](website-layouts.webp)

The Penpot evidence uses screenshots from the actual editor and viewer because native still export timed out. Compare composition, palette and spacing across the captures. The browser uses a procedural field, so glyph positions vary from the fixed Penpot phase. The dark screenshot verifies that the linked controls retain contrast against the dark variant. No static wave asset is shipped in the runtime.

## Runtime handoff

The footer is static content, outside the independent release-catalog loading boundary. No footer skeleton, async error or success states are applicable. Theme changes are inherited from the provider. The sea is an opaque three-ink artwork. Material, frost and reduced transparency are passed to the two existing nested controls. Paused, running and system-reduced motion are intentionally separate. The Penpot waveform is a phase sample with editable character paths, not a simulation. Browser motion varies slightly between visits.

```sh
npm run build -w @ovelle/ui
npm run dev -w @ovelle/web -- --host 0.0.0.0 --port 4388 --strictPort
OVELLE_WEB_URL=http://127.0.0.1:4388/ node scripts/check-footer-tide.mjs
npm test -w @ovelle/ui
```
