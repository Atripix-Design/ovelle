# Compact mobile hero revision

> Historical revision, superseded by the [direct reference match](../reference-match/README.md). The geometry and captures below describe the earlier state; use the new handoff and audit for current Figma geometry.

Revised October 10, 2026 following the approved Cluely-inspired approach: compose a focused product scene for the phone, with complete information in the three ordinary-scroll workflow sections. The user then selected [the generated image](reference-generated.png) as the direct source for the button layout and background positioning. Captures below show the resulting native Figma design.

- [390 px Home](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=182-2114)
- [320 px Home](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=185-9144)
- [Interactive mobile prototype](https://www.figma.com/proto/6jsC9SLa0LYsZKjJXxlY1K?node-id=188-9676&starting-point-node-id=188%3A9676)
- [Open stage sheet](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=202-3949)
- [Compact scene and material review](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=202-4285)

## Design and interaction

The hero contains one stage selector, one featured record with its status and context, and an action linking to the complete section. The scene is 260 px tall. Hero heights are 740 px at 390 px width and 732 px at 320 px width. Get Ovelle and Learn more are equally sized linked Regular buttons in a single horizontal row with a 16 px gap: 163×52 px at 390 and 136×52 px at 320. Their native visible surfaces remain 44 px tall; labels stay 14/20 and do not wrap. The separate “See Ovelle in action” row and its prototype hit targets are removed from all eight mobile hero compositions.

The [exact coastal photograph](coastal-source.png) remains a native image fill. Its image layer starts at 22% of hero height and fills the remaining 78%, putting the horizon at approximately 54.4%, with the cliff behind the CTA row and foreground rocks along the bottom, following the generated reference. A pale sky base and short gradient blend the photo into the introductory area. The image is not stretched or replaced with rasterized UI. A 62 px bottom inset in the copy group gives the scene room below the buttons. The 320 px headline retains 32/38 typography and its two-line composition.

The stage selector opens a sheet containing Partners, Relationships and Opportunities as separate single-line rows. Choosing a row changes the hero scene. Close and backdrop dismissal return to the current scene. The featured-scene action scrolls to its corresponding complete workflow section. The prototype uses explicit screen-state navigation to simulate a sheet; it does not establish production focus trapping, Escape handling, native overlay behavior or gesture dismissal.

Record alignment correction: the name and detail now form a 42 px vertical text block beside the linked 44 px status chip, centered as a unit. Removed the extra horizontal record inset; selector, record text and footer label now share the 17 px inner left edge. Result counts are vertically centered beside the selector. All six Solid/Liquid Glass stage sources propagate this correction to their linked instances. Verified 11 instances across both mobile widths, three stages and material examples: left edges match, text/status centers differ by 0 px, names remain 20 px tall and details 18 px tall. The 260 px scene and footer position remain unchanged, preserving prototype hit areas.

Closed scenes: Partners `188:9676`, Relationships `202:3149`, Opportunities `202:3549`. Sheet screens: `202:3949`, `202:4057`, `202:4165`. The existing desktop Home and download review frames remain separate.

The three workflow sections retain their original copy, actions, complete records, metadata, statuses and summaries. Redundant stage tab groups are hidden in the 12 Mobile preview variants. Search/company/opportunity context is now presented as read-only demonstration text, keeping the original labels, values and hints without a wrapping simulated input control. Paragraphs and explanatory headings can wrap; interactive labels remain on one line.

## Native sources and code status

- `Ovelle / Hero workflow scene`, set `199:7256`: three Stage variants × Solid/Liquid Glass, six total. It composes linked public Select, Filter Chip and Button instances. Nested instance properties are exposed. Light/Dark inherit existing Color modes.
- `Ovelle / Hero stage sheet`, set `201:6782`: three current-stage variants, stable Solid material, Light/Dark through existing Color modes. Rows and Close reuse public Buttons.
- Both sets occupy new horizontal family columns on **05 Components**, with variants arranged vertically. Source descriptions record purpose, composition and implementation limits.
- The selector reuses the exact linked 20 px chevron-down component and existing `packages/ui/assets/b80de.svg`; no static asset was substituted or redrawn. Contact-status reactions inherited from Select were cleared in the hero instances. Hero stage navigation is wired explicitly on the Home prototype.
- New composites are Figma-only. React exports, typed props, usage documentation, package manifest mappings and real loading/consumer behavior remain pending. Existing public control properties retain their source component state models, but the new hero has no verified production interactions. Static scene examples do not introduce data-dependent loading, success or error states. Do not infer automatic synchronization or visual parity.

## Evidence

The preservation audit found no missing original workflow content at either width, excluding redundant cross-stage tab labels that are available in the hero sheet. Both Home artboards have 95 linked instances and no horizontal overflow or missing source references after removing the demo controls. All eight hero compositions have equal-width horizontal buttons and no demo row. CTA hit areas match their resized buttons; stage-selector and section-scroll hits follow the moved scene. All checked hero, scene and sheet control labels are single-line. Prototype destination wiring was structurally inspected; a real-device presentation session was not tested. See [audit.json](audit.json).

Visually inspected all three full workflow sections at 320 px, both hero widths, the open sheet, all three compact scenes at 320 px, and Dark/Solid plus Light/Dark Liquid Glass scenes against the source coast image. Dark glass renders more opaque than Light in the inherited source material; no renderer parity claim is made. Continuous frost, reduced transparency, enlarged text and real-browser accessibility remain implementation checks.

`node scripts/check-figma-fidelity.mjs` passed for the existing React gallery: 21 source dimensions; action geometry/typography/states; select/dialog keyboard and focus; 96 exact SVGs; native SVG geometry across 12 theme/material/frost settings. This regression check does not validate the unimplemented mobile Home. The initial attempt failed because the local gallery server was stopped; restarting it resolved that check.

Gallery preview verified HTTP 200: http://127.0.0.1:5174/components. The revised Home is in Figma.

Captures: [hero 390](hero-390.png), [hero 320](hero-320.png), [open sheet](stage-sheet.png), [three scenes and sheet at 320](scenes-320.png), full sections [Partners](workflow-320.png), [Relationships](relationships-320.png), [Opportunities](opportunities-320.png), [Dark Solid](hero-solid-dark.png), [Light glass](hero-glass-light.png), [Dark glass](hero-glass-dark.png), full Home [390](home-390.png) / [320](home-320.png).
