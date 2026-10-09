# Ovelle component system

## Shared website and desktop UI

- Use `@ovelle/ui` in both the website and Electron renderer. Keep shared component implementations in `packages/ui`; app-specific routing, data and native desktop integrations belong in their apps.
- Follow the Apple Design skill and the established Ovelle design tokens, geometry, typography, glass materials and interaction conventions for new custom components.

## Every new custom component

- Add its native component set to the **05 Components** page in Figma file `6jsC9SLa0LYsZKjJXxlY1K`: https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=4-2.
- Preserve the sheet layout: each component family occupies a horizontal column, with its variants arranged vertically underneath. Keep the Home composition canvas separate.
- Establish its complete applicable variant/state model in Figma and typed React props: styles, tones, sizes, Light/Dark themes, Solid/Liquid Glass materials, and relevant default, hover, pressed, focus, disabled, loading, success, error, selected and open states. Include only combinations that have a meaningful behavior; document inapplicable states.
- Support continuous `glassFrost` (0 liquid to 100 frosted), independent `reduceTransparency`, reduced motion and shared token styling. Glass must sample real backdrop content. Use the established material utilities and provider.
- Add the TypeScript React export, its props and usage documentation to `packages/ui`. Support Tailwind overrides through `className`, and expose wrapper/slot styling when needed for composition.
- Update `packages/ui/figma-manifest.json` with the actual Figma node ID and property-to-prop mapping. Add the React export and usage notes to the Figma asset description.
- Verify applicable behavior, keyboard/focus semantics, responsive layouts and both website/desktop consumption. Visually inspect new variants and material states in Figma and the rendered app before claiming visual parity.

## Compose existing parts

- In Figma, use **linked instances of the public `Ovelle /` components** inside new composite components. Do not redraw, copy into detached shapes or detach a reused button, input, navigation item or other existing part.
- Expose nested instance properties and instance swaps as appropriate so a parent can configure the reused component's appearance while retaining its link to the source component.
- In React, import and render the existing `@ovelle/ui` component; inside the package, reuse its existing implementation. Do not duplicate its markup, styling, state logic or tokens in a new component.
- Extend the source component with a reusable variant when a new composition requires a capability it does not yet provide. Update the Figma source, React API and manifest together, and preserve existing callers.
- Source component changes must propagate through nested Figma instances and React composition. Figma and source code remain separately maintained; do not imply automatic synchronization between them.

## Finish

- Follow the user's global development-branch publishing instructions. Stage only task files, verify changes, and invoke `push-development-on-finish` before committing/pushing to `origin/development`. Never publish directly to `main` or `master`.
