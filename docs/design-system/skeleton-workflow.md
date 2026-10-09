# Dynamic page loading

Use `LoadingBoundary` from `@ovelle/ui` around the real data-dependent portion of a page. Keep navigation and loading/retry controls outside it. There is no Skeleton sheet in Figma and no component-to-mask registry.

```tsx
<LoadingBoundary loading={isFetching} label="Loading contacts…">
  <ContactsLayout contacts={contacts ?? expectedLayout} />
</LoadingBoundary>
```

The boundary measures actual text, control, media and painted-shape geometry. It updates after resize, DOM mutations, image loads and font loads. It preserves the same mounted children when loading ends, including their state and input values. Loading content is inert and hidden from assistive technology; the region announces loading once. Reduced motion removes shimmer and reduced transparency uses opaque materials.

Initial loading requires a rendered expected layout. The boundary cannot know the number or geometry of data that has never been rendered. Supply representative content with the expected structure, or retain the previous data during a refresh. Do not open modal dialogs inside a loading region.

For unusual custom artwork, mark its outer element `data-skeleton="block"`. Exclude decorative content using `data-skeleton="ignore"`. These are optional semantic overrides, not a per-component registry.

For every new or changed component/page, check loaded/loading geometry at wide and narrow widths, multiline wrapping, asynchronous media, keyboard exclusion while loading and restored interaction afterward. Run `npm run check:components` and `npm run check:loading` in website and desktop previews. A loading state needs runtime evidence; it does not need a duplicated native Figma component.
