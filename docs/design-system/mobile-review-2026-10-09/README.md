# Mobile review and proposed direction

Reviewed October 9, 2026. Status: initial planning proposal; no application components or Figma designs changed.

The goal is to preserve Ovelle's information and meaning on phones while retaining its coastal imagery, Inter typography, blue actions, rounded geometry, and glass materials. The recommended direction is a single-column narrative with explicit evidence, readable previews, and ordinary vertical scrolling.

## Scope and evidence

Inspected the structure of all six pages in [the source file](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K), retrieved Home and mobile download design context, and captured the Home sections, all three workflow stages, mobile download variant, and mobile QA examples. Reviewed shared React/CSS and captured the live component gallery and representative walkthrough chapters at phone widths.

| Figma page | Current contents | Implication |
| --- | --- | --- |
| 01 Home | Desktop Home, three workflow stages, reduced-motion variants, behavior notes | Main content source for mobile planning; no complete mobile Home composition |
| 02 Features | One internal button instance | No complete Features page to adapt or audit |
| 03 Download | Empty | Download experience currently exists as a component and QA composition |
| 04 Visual references | Two reference boards | Style grounding; not product screens |
| 05 Components | 23 numbered families plus workflow preview, workflow section, pinned workflow, and device-aware CTA | Reuse the public linked components; extend responsive variants at their source |
| 06 Examples, QA & icons | Material/state examples, mobile navigation, download review, regression examples | Useful state evidence; not a complete mobile journey |

The implemented web `/` is a project placeholder with desktop download links. `/components` exposes the shared library. Workflow, pinned workflow, and device-aware CTA compositions are currently Figma-only; no corresponding React implementation was found. This is a source-design review and representative component audit, not end-to-end verification of a finished website. Electron, real iOS/Safari, Android, screen readers, and every variant were not tested.

**Source discrepancy:** initial metadata reported Connected at 1440×1032 and Companion at 1440×720. Current screenshot exports returned 1440×800 and 1440×560, with a different Companion arrangement. The accepted captures below ground this proposal. Re-fetch current child context and geometry before implementation; do not implement from the earlier metadata dimensions.

## Findings in page order

1. **Navigation — usable foundation, incomplete integration.** The mobile component opens and closes in the browser. Its Figma QA preserves Home, Features, Download, descriptions, and current-page emphasis. The gallery specimen only supplies Home; this is demonstration content, not evidence that other destinations were removed. The desktop navigation remains fixed-width in QA and causes overflow at intermediate widths. Choose navigation based on available content width.

2. **Hero — strong identity, desktop-dependent presentation.** The coast and headline establish the visual language. A 64px heading, two columns, and a roughly 660px preview cannot retain their geometry on a phone. The source explicitly says “Hover to reveal volunteer partner context.” That content needs tap and keyboard access. Body text over detailed water also needs contrast testing with the actual mobile crop.

3. **Workflow — strong meaning, high adaptation priority.** Partners → Relationships → Opportunities explains the product. Desktop previews combine names, details, and statuses across rows. Scaling the whole panel would make these labels too small. Preserve the relationship between each row's name, metadata, and status by regrouping them vertically. Pinned/drag-driven progression needs a mobile alternative that lets readers encounter all three stages.

4. **Connected workspace — complete capability coverage, wide layout.** Keep all three capability cards: volunteer records; opportunities and schedules; participation and reports. The Riverside example carries date/time, capacity, an example label, and its action. Its photo overlay should move into normal flow on phones so the image can keep its subject and the record can keep its text.

5. **Desktop companion — important evidence already present.** The suggested match explains interests, availability, and capacity. The adjacent note says to confirm records before assigning. Keep this entire reasoning chain together; removing the note or substituting a generic “AI match” badge would change the meaning.

6. **FAQ — appropriate mobile pattern.** Three named questions and disclosure controls support progressive detail. Preserve complete answers and wrapping question text. Actual expanded phone layouts and focus semantics still need verification in the final page.

7. **Download CTA — honest device guidance, integration outstanding.** The existing 390px mobile source says the next step is on desktop and exposes macOS, Windows, and all downloads. Retain that truth and manual platform choice. Follow-up build lists must also fit a phone, including both Mac architectures, release details, and preview/unsigned guidance. Do not advertise a mobile installer.

8. **Footer — needs reflow.** Keep the wordmark, product summary, and copyright in a vertical layout. Fixed desktop text widths should become intrinsic wrapping content.

## Proposed mobile composition

| Region | Mobile arrangement | Meaning that must survive |
| --- | --- | --- |
| Header | Existing mobile navigation, full available width inside page gutters; expandable menu | Brand, all destinations, current location, download access |
| Hero | Heading, introduction, two wrapping actions, then a readable preview; deliberate coastal crop | Better relationships, less busywork, what Ovelle brings together, product evidence |
| Workflow intro | One heading and shared introduction | Find partners, build relationships, coordinate opportunities |
| 01 Partners | Copy and action above vertical preview records | All three partner examples, interests, volunteer counts, Match/Review labels, result count |
| 02 Relationships | Same rhythm with grouped details | Maya's interests, Friday availability, verified service hours, contact/context connection |
| 03 Opportunities | Same rhythm with grouped details | Confirmed volunteers, briefing time, invitation readiness, status labels and next steps |
| Connected | Introduction → landscape photo → opportunity record → three stacked capability cards | Profiles/skills/availability; capacity/assignments/shifts; attendance/hours/report filters |
| Companion | Introduction → landscape photo → complete evidence card and adjacent caveat | Suggestion, all reasons, review action, human confirmation |
| FAQ | Full-width wrapping disclosures | All questions and answers remain reachable |
| Download | Existing mobile guidance → platform choices → responsive build list | Mac/Windows support, architecture distinction, preview information |
| Footer | Stacked text | Brand, summary, copyright |

Use the existing source strings first. Change wrapping, grouping, placement, and spacing before shortening copy. Important facts stay visible; disclosures may hold optional explanations, not essential capabilities, statuses, or caveats. Do not use a required horizontal swipe to reveal cards or workflow stages.

**Options:** ordinary scroll sections provide the best discoverability and strongest content coverage; a tap-through workflow reduces page length but hides two stages until selected; a pinned mobile story retains desktop drama but adds viewport and gesture complexity. The user approved three ordinary scroll sections on October 10, 2026. See the resulting [Mobile Home design](../mobile-home-2026-10-10/README.md).

## Visual rules to prototype

- Start at 390px with 20–24px gutters; verify 320px using 16px gutters. Let content determine the tablet/navigation breakpoint.
- Explore a 36–40px hero heading, 28–32px section headings, and 16px body text. Keep the existing Inter weights, size-specific tracking, and tokens; these are proposed mobile values, not claimed source variants.
- Keep shared 44px-or-larger primary touch targets. Let actions wrap or stack before labels clip. Check calendar cells separately rather than assuming every control already meets this target.
- Preserve card geometry and internal rhythm, using content-driven heights. Avoid fixed-height text boxes, global scale transforms, line clamping, and overflow hiding that conceals meaning.
- Use glass for navigation and selected accents with real content behind it. Keep dense explanatory text on stable surfaces. Preserve continuous frost, independent reduced transparency, Light/Dark themes, and reduced motion.
- Keep native vertical scrolling; account for browser chrome, safe areas, landscape, and the software keyboard. Essential content must not depend on viewport-height pinning or hover.

## Implementation sequence after design review

1. Build a linked-instance mobile Home composition on **01 Home**, starting at 390px, with 320px and tablet checks. Preserve the separate desktop canvas and the **05 Components** horizontal-family/vertical-variant arrangement.
2. Establish mobile variants for workflow preview and section composition. Reflow records while retaining every field, status, label, and action. Establish standard/reduced-motion and applicable state evidence. Keep nested public components linked and expose meaningful nested properties.
3. Compose Connected, Companion, FAQ, and download behavior with existing public components. Validate phone photo crops and platform-selection outcomes before code work.
4. Implement reusable components in `packages/ui`; keep website routing/download detection and native desktop integration in their consumers. Update typed props, exports, usage notes, source descriptions, and actual-node manifest mappings together. Figma and code remain separately maintained.
5. Add the real web page composition and data-dependent `LoadingBoundary` regions. First fix QA wrappers that obscure phone behavior so evidence distinguishes consumer layout from shared component defects.
6. Retrieve fresh full source context, visible children, screenshots, and exact static assets for every changed component. Run fidelity and loaded/skeleton checks in both consumers, then compare accepted captures beside Figma.

## Validation and acceptance

The current gallery had no document overflow at 320, 390, 430, or 1440px. At 768px it measured 953px wide. Representative walkthrough chapters expose additional overflow, including segmented controls and desktop navigation; see the metric files. These are existing QA layouts, not proof that a future Home page fails. Their wrappers need correction before claiming mobile readiness.

For the finished design and implementation:

- At 320, 375, 390, 430, 768, and desktop widths, no page-level horizontal overflow or clipped labels. Check portrait/landscape and enlarged text.
- Every content item in the preservation table has a visible location or a clearly labeled reachable disclosure. No essential information is only available through hover or animation.
- All three workflow stages are discoverable, touch-accessible, and keyboard-accessible. Reduced motion preserves their complete content and ordering.
- Verify menu close/Escape/focus behavior, FAQ expansion, platform override, long labels, disabled/loading/error/success controls, and software-keyboard visibility in the appropriate flows.
- Check Light/Dark, Solid/Liquid Glass, frost 0/35/100, and reduced transparency against the real backgrounds. Measure contrast; screenshots alone do not prove accessibility compliance.
- Verify data-dependent loading has matching responsive geometry, inert loading controls, and retained mounted state in website and desktop consumers. Do not skeletonize static marketing text unnecessarily.
- Run `scripts/check-figma-fidelity.mjs` and the relevant loading/behavior checks; inspect new Figma and rendered variants side by side. Structural checks are not visual-parity evidence.
- Test real iOS Safari and Android Chrome, including browser chrome, safe areas, zoom, and touch. The current Chromium captures are preliminary evidence only.

## Captures

All captures were retrieved in this review. Source images are reference evidence, not implementation assets.

- [Hero](captures/source-hero.png)
- Workflow: [Partners](captures/source-partners.png), [Relationships](captures/source-relationships.png), [Opportunities](captures/source-opportunities.png)
- [Connected](captures/source-connected.png) and [Companion](captures/source-companion.png)
- [FAQ](captures/source-faq.png)
- [Mobile download source](captures/source-mobile-download.png) and [mobile QA source](captures/source-mobile-qa.png)
- [Live gallery mobile menu closed](captures/web-mobile-navigation-closed.png) and [open](captures/web-mobile-navigation-open.png)
- [Live phone-width fields](captures/web-fields-390.png), [segments at 390px](captures/web-segments-390.png), [segments at 320px](captures/web-segments-320.png), and [pagination](captures/web-pagination-390.png)
- Measurements: [gallery](captures/viewport-metrics.json), [walkthrough](captures/walkthrough-metrics.json)

Preview verified to return HTTP 200: http://100.114.150.83:5174/components. It shows the existing library, not the proposed mobile Home.
