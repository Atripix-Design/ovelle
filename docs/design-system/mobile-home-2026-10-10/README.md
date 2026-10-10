# Mobile Home design

Created October 10, 2026 using the approved three-section scroll plan. This is a native, editable Figma design; application implementation remains pending.

**Current revision:** the hero now uses a compact stage selector and focused scene, with all original workflow detail preserved below. See [Compact mobile hero revision](hero-revision/README.md) for current captures, native sources and verification. The captures and dimensions below document the initial composition before that revision.

## Review links

- [Home at 390 px](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=182-2114)
- [Home at 320 px](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=185-9144)
- [390 × 844 scroll prototype](https://www.figma.com/proto/6jsC9SLa0LYsZKjJXxlY1K?node-id=188-9676&starting-point-node-id=188%3A9676)
- [State and material review](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=188-9915)

Compositions remain separate from the desktop Home canvas on **01 Home**. Source variants remain in their existing family columns on **05 Components**, arranged vertically. Original photographs and linked public `Ovelle /` components are reused. Text wraps and cards grow with content. Dense previews use Solid surfaces; navigation and material examples use real backdrop content for glass.

## Information preservation

| Region | Preserved meaning and content |
| --- | --- |
| Hero | Original promise and introductory copy; Get Ovelle, Learn more, demo action; coastal identity and three partner records |
| Introduction | First connection → shared impact; original supporting introduction; partner/relationship/opportunity sequence |
| 01 Find partners | Northlight Labs, Helix Studio, Tideway; environment/mentoring/community; 24/12/40 volunteers; Match/Review; three-partner result |
| 02 Build relationships | Maya Chen; outdoor projects; Friday 9–12; 12 verified service hours; Active/Match/Verified and original supporting context |
| 03 Coordinate opportunities | 12 volunteers confirmed; Thursday 10 briefing; ready-for-review invitation; Confirmed/Planned/Draft and original next steps |
| Connected | Riverside clean-up; Friday 9–12; 8 of 20 places open; example label and action; all three cards covering records/preferences, capacity/assignments/shifts, attendance/hours/report filters |
| Companion | Maya → Riverside; interests, availability and capacity; review action; confirm current records before assigning |
| FAQ | All three questions and complete source answers |
| Download | Desktop guidance; manual platform choices; Apple silicon, Intel and Windows x64; descriptions, build details and preview/unsigned guidance |
| Footer | Wordmark, product summary and copyright |

Workflow sections appear in ordinary vertical scroll order, with copy/action followed by complete previews. No hover, pinned progression, drag or required horizontal swipe hides a stage. Record headers group the linked status chip beside its name, with metadata underneath; stage controls wrap. The 390 px design uses 24 px gutters and the 320 px design uses 16 px gutters. No copy is line-clamped.

## Source changes

| Family | Source set | Variant model |
| --- | --- | --- |
| Workflow preview | `135:3508` | 12 Mobile variants: three stages × Default/Hover × Solid/Liquid Glass; 12 existing Desktop variants retained; 24 total |
| Workflow section | `138:3092` | Six Mobile variants: three stages × Solid/Liquid Glass; six existing Desktop variants retained; 12 total |
| Device-aware download CTA | `165:5351` | Mobile macOS `188:9504`, Windows `188:9560`, All downloads `188:9598`; existing mobile guidance `165:5322`; seven variants total |

Layout is an explicit Mobile/Desktop variant property. Main mobile workflow sources are Find `180:5238`, Relationships `180:5334`, Opportunities `180:5430`; their Home sections are `182:2188`, `182:2244`, `182:2300`.

Public Field, Feature Card, FAQ, Mobile Navigation and Download Card wrappers now fill their available composition width while retaining default source widths. Nested public components remain linked. Mobile Liquid Glass record panels bind to `surface/default`, correcting a pale panel that lost label contrast in Dark mode. Existing theme/material tokens are reused.

The review includes open navigation, expanded FAQ answers, all download outcomes, a Dark/Solid static workflow, and Light/Dark Liquid Glass previews on the coast photograph. Full frost range, independent reduced transparency, loading and production behavior require implementation-time verification.

## Prototype behavior

Flow start `188:9676` contains a native 390 × 844 vertical scroll viewport. Hero Get Ovelle scrolls to downloads; Learn more and demo actions scroll to the workflow introduction. All three workflow stages remain in the scroll document.

Platform choices navigate to phone-sized scroll screens: macOS `189:3204`, Windows `189:3258`, All downloads `189:3294`. Each screen allows selecting the other platforms. These are explicit Home-page prototype links. Native component `CHANGE_TO` switching could not be established for new mobile download variants; desktop-targeting reactions were removed from the mobile guidance source. Flat compositions/source variants are not verified interactive platform switching. File downloads and destination-page behavior were not tested end to end.

## Verification and implementation limits

- Both Home artboards have 135 linked instances, no missing main-component references, and no nodes beyond horizontal page bounds. Required content strings passed the preservation check at both widths; see [audit.json](audit.json).
- Final captures were visually reviewed for wrapping, record grouping, card/action geometry and photo subjects. Dark/Liquid Glass was corrected and recaptured.
- `node scripts/check-figma-fidelity.mjs` passed against the existing React gallery: 21 source dimensions, action geometry/typography/states, select/dialog keyboard and focus checks, 96 exact SVGs and visible native SVG geometry across 12 theme/material/frost settings. This is an existing-code regression check, not proof of new Home implementation or parity.
- No React components, typed props, manifest mappings or loading behavior were changed. Mobile code APIs, website composition, Electron consumption, responsive loading and source-to-render comparisons remain pending. Figma and source code are separately maintained.
- Real iOS/Android, browser chrome, safe areas, keyboard behavior, enlarged text and measured contrast were not tested in this Figma deliverable. The long page preserves discoverability of all essential information.
- The original third FAQ answer says “all platforms,” while download guidance names desktop builds. The source wording is preserved; reconcile the product claim before website publication.

Existing library preview verified HTTP 200: http://100.114.150.83:5174/components. It displays the shared gallery; the new Home design is in Figma.

## Accepted captures

- Full Home: [390 px](captures/home-390.png), [320 px](captures/home-320.png)
- [Hero](captures/hero-390.png), workflow [390 px](captures/workflow-390.png) / [320 px](captures/workflow-320.png)
- [Connected](captures/connected-390.png), [Companion at 320 px](captures/companion-320.png)
- FAQ [closed](captures/faq-390.png) / [expanded](captures/faq-expanded.png)
- [macOS downloads](captures/downloads-macos.png), [complete state review](captures/states.png)
- Liquid Glass [Light](captures/glass-light.png) / [Dark](captures/glass-dark.png)

Captures are source-reference evidence, not rasterized component implementations.
