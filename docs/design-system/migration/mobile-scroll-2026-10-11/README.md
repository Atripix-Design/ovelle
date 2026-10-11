# Compact mobile workflow and program overview

Updated October 11, 2026 in response to repeated mobile sections and the vertical cost of four large capability cards.

[Home 390](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=182-2114), [Home 320](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=185-9144), [mobile prototype](https://www.figma.com/proto/6jsC9SLa0LYsZKjJXxlY1K?node-id=188-9676&starting-point-node-id=188%3A9676), [material review](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=256-7660).

## Result

The workflow introduction and three full-height stages are replaced by one panel. Partners, People and Events controls expose the three stages in the same region. The marketing description is shortened; all original preview records, statuses, metadata, context and summaries remain in their linked source previews. Primary actions remain linked public Buttons. Tabs have 44 px targets and use normal control typography; no whole-section scaling is applied.

The Riverside example and three capabilities now share one bordered panel. Four linked Feature card instances retain their complete title/body content, with a new Summary density that removes repeated icons, large minimum heights and per-card actions. View opportunity and Explore volunteer program are shared public Buttons. The photo is cropped to 160 px; its source image is preserved.

| Measurement | Previous | Current |
| --- | ---: | ---: |
| 390 Home height | 7,485 px | 4,530 px |
| 320 Home height | 7,597.54 px | 4,496.54 px |
| 390 final download position | 6,891 px | 3,968 px |
| 320 final download position | 7,003.54 px | 3,934.54 px |
| 390 Connected section | 1,764 px | 977 px |
| 320 Connected section | 1,804 px | 1,045 px |

Home is approximately 39.5% shorter at 390 and 40.8% shorter at 320. The final CTA is 2,923 / 3,069 px closer. These are geometric savings, not measured conversion improvements. The hero CTA already links directly to downloads.

## Scroll and prototype behavior

Native Figma Design has no scroll-position trigger. The existing desktop prototype also uses drag to simulate scroll progression. Mobile prototype taps switch between the three full-page states with scroll position retained; the selected control supports desktop-style drag advance for the first two states. Content and body have no drag reaction, preserving ordinary vertical scroll. Backward and direct selection use explicit controls. Learn more and hero scene links target the new single workflow anchor; downloads retain their targets. Native reactions and destinations were structurally checked; a real-device presentation session has not been tested.

For browser implementation, use a single normal-flow panel by default. On tall mobile viewports, optional stationary scroll progression gets only 60svh extra travel across all three stages, with natural reversal and release. Never cancel body scroll, capture wheel events or force visitors to finish all stages. On viewports at most 700 px tall or with reduced motion, use instant explicit stage selection and no sticky runway. Production touch handling must allow pan-y. This is a specification, not implemented browser behavior.

## Native sources

On 05 Components, families retain separate horizontal columns with vertical variants:

- Mobile workflow set 253:12812: three Stage variants × Solid/Liquid Glass, linked Filter chip, Workflow preview and Button. Short mobile marketing copy replaces redundant paragraphs; original source sections remain intact.
- Program overview set 253:13087: Solid/Liquid Glass, four linked public Feature card instances and two linked Buttons. Glass uses the existing native GLASS material and real photograph backdrop in review.
- Feature card set 54:1378 adds Density=Regular|Summary. Regular retains the existing design. Summary is informational; its individual icon/action is inapplicable in the shared panel.
- Light/Dark inherit Color modes. Static narrative content does not need loading, error, success, disabled or open variants. Nested controls retain their existing state models.

These additions are Figma-only. MobileWorkflow, ProgramOverview, FeatureCard density props, package exports, manifest mappings, continuous frost, independent transparency, keyboard semantics and website/Electron Home implementation remain pending. Component descriptions record intended React APIs and this limit. Source and code are separately maintained; no visual parity claim is made for unimplemented Home designs.

## Evidence

Retrieved full source context/screenshots before editing; source code is retained in source-workflow.txt and source-connected.txt. Existing local static assets and linked native icons were reused; no new SVG or flattened UI asset was introduced. Earlier source captures remain in the mobile-home-2026-10-10 folder.

Inspected workflow-320.png, workflow-390.png, connected-320.png, connected-390.png, states.png and home-390.png. Both Home widths have one workflow, one program panel, no horizontal overflow and no missing instance sources. All three workflow previews passed original-text preservation checks. A selected-tab check icon initially inflated narrow control widths; hiding that redundant indicator in the new composition fixed it while preserving the selected fill. Source widths were explicitly corrected after component construction. Figma rejected nested CHANGE_TO wiring; explicit full-page state navigation is used instead.

Existing React regression checks passed in both consumers: scripts/check-figma-fidelity.mjs and scripts/check-dynamic-loading.mjs. These verify the current 21 implemented families, 96 exact SVG assets, loaded/skeleton retention and inert controls, themes/materials and keyboard behavior; they do not prove parity for these Figma-only additions.

HTTP 200 verified for the existing gallery at http://127.0.0.1:5174/components and desktop renderer at http://127.0.0.1:5175/?components. These previews contain the existing component gallery, not the new mobile Home.
