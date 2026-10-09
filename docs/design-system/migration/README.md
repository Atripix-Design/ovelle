# Source-driven migration evidence

The library was rebuilt from the actual high fidelity Figma contexts for all 22 public families. `sources.json` records master IDs, native default dimensions, context fingerprints and reference screenshots. `variants.json` records the original Solid/Liquid internal state nodes. `assets.json` traces the original local SVGs to their retrieved contexts and intrinsic dimensions. Contexts included complete meaningful variant code; sparse new-family responses were expanded into visible child contexts before implementation.

The shared website `/components` and Electron `?components` preview use exact source defaults, loaded/skeleton counterparts and an additional state gallery. Application copy and optional slots remain configurable. Inter is bundled. Static source icons have separate original Light/Dark exports; they are neither substituted with text symbols nor recolored with filters.

## Verification

Run the normal unit, typecheck, lint and build checks. Playwright is a repository development dependency. Install its browser once with `npx playwright install chromium`, start the component preview, then run:

```sh
npm run check:figma
npm run check:components
```

`OVELLE_PLAYWRIGHT_MODULE` can select an existing installation. `OVELLE_PREVIEW_URL` selects the built Electron renderer preview. The source check verifies all 22 default root sizes against independent Figma references; action wrapper/surface/icon offsets, Inter typography, hover/pressed/focus geometry; keyboard menu/dialog behavior; local SVG metadata and every visible asset's effective native dimensions across Light/Dark, Solid/Liquid and frost 0/35/100. It writes captures to `/tmp/ovelle-fidelity` by default (`OVELLE_FIDELITY_OUTPUT` overrides this). Review those captures beside the corresponding references. Passing dimensions alone does not certify every pixel or state.

The content check verifies calendar keyboard bounds/focus, page boundaries, all 21 source/skeleton pairs at wide/narrow widths, independent transparency and reduced motion. The source desktop navigation remains 889px wide in its comparison; a narrow viewport scrolls the comparison. Applications choose the separate Mobile component for narrow layouts.

## Renderer differences

Native Figma GLASS refraction and CSS backdrop filtering are different rendering models. Geometry, tint, gradients, typography and exact assets are source driven; native optical refraction is not losslessly synchronized. The Figma exporter also omits some native optical effects in its captures. Continuous browser materials sample actual backdrop content and retain independent Reduce Transparency.

The source Mobile current-label node `9:542` has `text/brand` bound to its semantic Light/Dark aliases. Both its full parent context and exact child context specify brand blue; the tool's native exported screenshot paints that label black. Code follows the resolved semantic token and high fidelity context. This source/export discrepancy is recorded rather than changing the Figma master or describing a black screenshot as blue.

Figma and React are separately maintained. Every new or changed component must follow [the source and skeleton workflow](../skeleton-workflow.md), refresh its source references and masks, preserve linked public parts, and pass both consumer checks before a fidelity claim.
