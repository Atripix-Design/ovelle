# Content states and future component workflow

The shared primitives are `DatePicker`, `Pagination`, `EmptyState`, `Skeleton` and `SkeletonRegion`. Their Figma masters live in the **05 Components** primary row, with variants vertically underneath. Skeleton counterparts for the 18 original families and the three new content/control families sit beneath the Skeleton master in that column. IDs are recorded in `packages/ui/figma-manifest.json`.

## Skeletons follow real content

Render the actual component inside `Skeleton`, with its real layout props, slots, content lengths and responsive classes. The source stays in the document to reserve its dimensions but is hidden and inert. The overlay follows native Figma mask semantics: a stretched TEXT slot (card heading/body, status heading/body, dialog heading/body, empty heading/description, select value, download label/requirements) becomes one mask across its allocated box, including wrapped lines. Natural-width labels use their text line box; native inputs use their allocated text slot; icons and checkbox indicators use their visible bounds. Do not substitute ink-width bars for stretched Figma text boxes. A resize observer, content observer and font-ready measurement keep the overlay aligned when content or wrapping changes.

```tsx
<SkeletonRegion label="Loading downloads…">
  <Skeleton>
    <DownloadCard platform="macOS" action={
      <DownloadAction label="Download for Mac" detail="Apple silicon" />
    }>
      A workspace ready for your desktop.
    </DownloadCard>
  </Skeleton>
</SkeletonRegion>
```

Use expected content lengths when data is unavailable. Keep page navigation, headings and existing data visible; replace only the region that is waiting. Use the same layout container for loading and loaded states. For grid/table pages, preserve the same columns and expected row/card count. Do not replace a specific composition with unrelated generic bars.

`Skeleton` without children provides text/rectangle/circle blocks with explicit `width` and `height` for layouts that cannot render their source before data arrives. These are decorative: supply one `SkeletonRegion` loading status for the whole region. `animated={false}`, provider reduced motion and OS reduced motion stop animation. Transparency settings are independent of motion. A **closed** `ConfirmationDialog` reserves its source launcher composition; its hidden dialog remains hidden. Never open a real modal as a hidden skeleton source. An open dialog skeleton requires an explicit non-modal inline preview contract that preserves its source geometry without calling `showModal`.

## Every new or changed component

1. Read `figma:figma-design-to-code` before calling `get_design_context`. Fetch the actual component set and its source screenshot. If the response is sparse, identify visible child IDs from the hierarchy and fetch their full contexts before writing code. Inspect every meaningful variant/state and theme/material combination. Record the actual node IDs and source geometry, typography, spacing, colors, asset slots and nested public component links. Never invent a secondary label, relocate an icon or substitute geometry because a similar control exists elsewhere.
2. Build the loaded component from those high fidelity contexts using existing shared React parts and linked public Figma instances. Preserve the exact default dimensions, line heights, font weights, tracking, radii, padding and nested instance sizing. Keep dynamic labels, imagery and actions configurable without changing the source defaults. Download every static asset from its context URL using the response's download instructions, preserve its SVG root dimensions, and store it locally. Do not trace screenshots, redraw SVGs or replace source assets with Unicode characters unless the source itself is a text glyph. Establish responsive adaptations explicitly and keep their source model documented.
3. Add its linked skeleton counterpart beneath the Skeleton family in the existing primary row. Keep Light/Dark × Solid/Liquid Glass variants vertically arranged. Reuse the public component as a hidden, linked source instance; overlay masks at its text/icon bounds. Never detach or redraw the source.
4. Use `figma-skeleton-workflow.js` through the Figma Plugin API to refresh the mask from that source instance. Preserve the counterpart component/set IDs and public source link. Apply Glass Tuner after refreshing glass masks so they inherit the current continuous frost and transparency settings. Figma masks need an explicit refresh after source layout/text changes; React measures automatically. There is no automatic Figma–React synchronization.
5. Record the actual source and counterpart IDs in `figma-manifest.json` under `skeletonCounterparts`. Add export/usage notes and inapplicable states to the Figma asset description. Skeletons have no hover, pressed, focus, selected, disabled, success or error interaction states.
6. Add a loaded/skeleton pair to `apps/shared/ComponentPreview.tsx`. Both the website `/components` route and desktop `?components` view consume that same example from `@ovelle/ui`. Also maintain a source fixture with the exact Figma default labels, dimensions and slot values; application examples with different copy do not prove source likeness.
7. Export the native reference and capture the rendered source fixture at the same dimensions after the exact fonts and assets load. Inspect side by side and measure root geometry, child geometry, text metrics and each asset's rendered dimensions. Test all meaningful states and theme/material variants; compare frost 0/35/100 and independent Reduce Transparency over actual backdrop content. Preserve source geometry rather than modifying Figma to match an approximation. Document the native glass/CSS optical limitation specifically instead of describing the whole transfer as approximate.
8. Compare loaded and skeleton dimensions, text wrapping and mask bounds at wide and narrow widths. Test changed slots/text, no tab stops in skeletons, one loading status and reduced motion. Match the native source's allocated TEXT node bounds rather than replacing wrapped text with independent ink-width bars. Small visual controls must remain masked even when their unchecked/off state has no icon asset. Record before/after captures and checks. Do not claim parity while a mismatch is unresolved.

## Empty regions follow context

`EmptyState` supplies structure, not domain rules. The app supplies title, explanation, icon and existing Button/link actions. Preserve the surrounding section heading, filters and navigation. First-use empty content might offer “Add item”; a filtered collection should explain no matches and offer “Clear filters”. Downloads should explain unavailable builds. Do not mask a failed request as empty content—use the existing `StatusMessage` for errors.

Use `size="compact"` / `align="start"` for inline regions, and regular/center for larger blank regions. `contentClassName`, `actionClassName`, `className` and `style` support composition. Actions own their own disabled/loading/focus states. The empty surface itself is static.

## Control contracts

DatePicker stores a local `YYYY-MM-DD` value, supports controlled/uncontrolled selection, min/max, error/hint and disabled state. `required` identifies a required selection and prevents clearing; the app must validate submission (the hidden form field does not implement browser required validation). The calendar uses six stable Sunday-first rows. Arrow keys move one day/week, Home/End move to week bounds, PageUp/PageDown move one month, Shift changes the year, Escape closes and restores focus. Bounds clamp keyboard moves. Locale changes month/date labels; the week starts Sunday.

Pagination is controlled through `page`, `pageCount` and `onPageChange`; it supplies first/last pages, neighbors and ellipses without creating every page. Invalid counts fall back to one; invalid/out-of-bounds page values clamp. Narrow layouts use the compact summary. There is no data fetching inside the component.

## Material rendering

New Figma surfaces use the existing native glass material engine and semantic Light/Dark variables at frost 35. The existing Glass Tuner applies continuous frost and independent Reduce Transparency to these GLASS surfaces. React uses the shared provider and real backdrop sampling. Native refraction and CSS backdrop filtering differ; do not claim lossless optical parity.
