# Home section redesign — 2026-10-09

Replaces the Connected workspace and Desktop companion sections in the existing Home desktop composition.

- [Connected workspace](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=139-479): 1440 × 1032. Introduction, edge-to-edge 1440 × 440 photograph, three native Ovelle FeatureCard instances.
- [Desktop companion](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=149-2256): 1440 × 720. Copy and a linked evidence card on the left; a 720 × 440 landscape photograph on the right, vertically centered with 140px above and below. The image stays shorter than the section rather than extending through its entire height.

## Composition and reuse

No new component family or component variant was required. Existing public component definitions were not changed. All seven reused public parts remain instances linked to their source:

| Instance | Source variant | Family |
| --- | --- | --- |
| 169:1437 | 54:1346 | Feature card / Solid |
| 169:1453 | 54:1346 | Feature card / Solid |
| 169:1469 | 54:1346 | Feature card / Solid |
| 169:1485 | 54:1297 | Section label / Solid |
| 169:1489 | 54:1297 | Section label / Solid |
| 169:1497 | 54:1346 | Feature card / Solid |
| 169:1514 | 54:1362 | Feature card / Liquid Glass |

Native nested icons and actions retain their source links. The opportunity overlay uses the existing native glass component above the photograph. Content text uses the existing Inter styles and semantic color variables. Geometry token bindings supply component spacing. Suggestion and opportunity records are labeled as examples. The companion presents interests, availability and capacity, with review before assigning.

The evidence card retains its native 360 × 260 appearance inside a wider content slot; its fixed-width inner appearance does not automatically stretch with the public wrapper. This is an existing source-component sizing characteristic, preserved instead of modifying the library for a single composition.

## Assets and evidence

- `riverside-volunteers.png`: standalone generated photograph; Figma fill on 169:1568, image hash f4c2847fd77c40b933b3f2d2552da55d932864da.
- `companion-review.png`: standalone generated photograph; Figma fill on 169:1571, image hash 27d538f5201a0dd2642635f6c4483c30e4bc826f.
- `connected-figma.png` and `companion-figma.png`: final native Figma section captures, visually inspected. These are reference evidence, not flattened implementation assets.

Figma structural verification confirmed both full-width section bounds, both nonempty photograph fills, the companion's 440px image height and 140px vertical inset, and seven public source links with zero detached public roots. Captures show legible content, retained native card geometry and no visible text overlap.

This change is a Figma composition and source-asset deliverable. Website and Electron still use their existing app screens; runtime parity, responsive behavior and loading checks for these sections await their separate React implementation. Figma and source code are separately maintained.

## Generation

Built-in imagegen was used with the previously approved visual concept as a style reference. Full prompts:

### Riverside photograph

Use case: photorealistic-natural. Asset type: standalone panoramic editorial photograph for Ovelle volunteer management website, not a UI mockup. A few adult community volunteers collecting litter along a blue river bank on a sunny morning, foreground woman wearing work gloves carefully placing found litter into a transparent bag, another volunteer further along the bank. Natural candid action, authentic, restrained serene blue and green palette, realistic texture. Wide landscape 3:2 composition with ample open water and sky on the right for a future UI overlay. Camera at eye level, no posed smiles. No text, no typography, no logos, no watermark, no UI. Match the natural riverside photography mood of the provided reference, but output only a photograph.

### Companion photograph

Use case: photorealistic-natural. Asset type: standalone landscape editorial photograph for Ovelle volunteer-management companion section, not a UI mockup. Two adult community volunteers sitting at an outdoor wooden table beside a blue river, a woman pointing to a laptop and a man reviewing the screen, calm natural collaboration after a riverside clean-up. Landscape 3:2 framing, both people and laptop contained in the upper and middle area with little empty table foreground, naturally sunlit, blue water and green trees softly behind. Authentic natural skin and materials, no staged expressions. No visible text or logos on laptop or belongings, no signs, no watermark, no UI. Match the reference photography mood, output only a photograph.
