# Mobile Home direct reference match

This revision supersedes the earlier hero-revision captures. The attached generated board directly supplies the mobile composition, photo positioning and record avatar. All interface elements remain native Figma components and text.

[390 px Home](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=182-2114), [320 px Home](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=185-9144), [closed hero](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=188-9676), [open sheet](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=202-3949).

## Source geometry

The source board is 1536×1024. Its 480×860 phone regions normalize to 390×699. The 390 px hero now uses a 360×54 navigation bar at (15,17), introductory copy at (24,103), two 145×44 visible buttons separated by 14 px, and a 364×172 scene at (13,419). The open sheet starts at y392 and measures 390×307. The 320 px hero measures 320×573.54 and uses a native Compact scene.

The record avatar is extracted directly from the board. Five photo-only crops preserve the visible coast, sea and foreground rocks. A reconstructed photo supplies portions obscured by source interface elements, with native gradient feathering where patches meet. No source UI is pasted over the native controls.

The latest correction centers “24 volunteers” exactly between the dividers and on the Match control's vertical center. Source-local centers are (227,82) for Regular and (187,65) for Compact, in both Solid and Liquid Glass. Northlight Labs, metadata and Match remain on one line. Dividers follow the metadata column instead of overlapping adjacent columns.

## Native sources

- Workflow scene set 199:7256: three stages × two materials × Regular/Compact, 12 variants; public Select, Button, Filter Chip and icons stay linked.
- Stage sheet set 201:6782: three selected-stage states, linked public buttons and native icons.
- Public Mobile navigation now includes Hero sizing variants 225:7894 / 225:7924 with a 54 px source header; regular callers retain their sizing.
- Public Filter Chip now includes Hero variants 225:7950 / 225:7956 with compact visible surfaces and working nested label properties.
- Exact Lucide SVG sources are retained alongside captures. Native heart, chart and chevron-right components are 218:11178, 218:11179 and 218:11180.
- Source families remain on 05 Components, in separate horizontal columns with variants arranged vertically.

These source additions are Figma-only. New React props, exports, manifest entries and website/Electron implementation remain pending. Do not infer automatic synchronization or production parity.

## Verification

[Audit](audit.json) confirms matching complete section text at both widths, eight heroes without the removed demo row, and no missing instance sources. Prototype stage selection, dismissal and section-scroll destinations retain the prior wiring, with hit geometry updated for the new card and sheet.

Inspected combined [closed comparison](comparison-closed-final.png), [record detail](comparison-closed-detail.png), [open comparison](comparison-open-final.png), [sheet detail](comparison-open-detail.png), and [320 px capture](implementation-320.png). Earlier comparisons remain as iteration evidence. See the project-root design-qa.md for limitations and findings.

The existing React regression command passed: node scripts/check-figma-fidelity.mjs — 21 source dimensions, action geometry/typography/states, Select/Dialog keyboard and focus, 96 exact SVGs, and native SVG geometry across 12 theme/material/frost settings. It does not validate the unimplemented mobile Home. Existing gallery verified HTTP 200 at http://127.0.0.1:5174/components.
