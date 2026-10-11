# @ovelle/ui

Shared **React 19 + TypeScript** components for the Ovelle website and Electron renderer, with **Tailwind CSS 4** overrides. All 31 public Figma families have named exports and typed props. Default geometry and meaningful states are derived from their actual high fidelity source contexts; Inter and original Light/Dark assets are bundled.

[Figma components](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=4-2) · [Property mapping](./figma-manifest.json) · [Migration evidence](../../docs/design-system/migration/README.md) · [Glass audit](../../docs/design-system/glass-audit.md)

## Use in either app

Run `npm install` and `npm run build -w @ovelle/ui` from the repository root. Both apps already depend on this workspace package and load its stylesheet and Tailwind utilities. Their existing pages are preserved.

```tsx
import { Button, Field, OvelleProvider } from '@ovelle/ui';

export function Home() {
  return (
    <OvelleProvider material="liquid-glass" glassFrost={35}>
      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-24">
        <Field label="Search contacts" kind="search"
          placeholder="Name or company" wrapperClassName="w-full" />
        <Button variant="primary" className="w-fit"
          onClick={() => console.log('Create contact')}>
          Add contact
        </Button>
      </section>
    </OvelleProvider>
  );
}
```

Use these source components as the implementation for designs composed in Figma. This is a maintained component library, not an automatic lossless Figma exporter. The manifest maps each Figma node and Appearance property to the corresponding React prop.

### Styling setup in another project

Import `@ovelle/ui/styles.css` once. For Tailwind 4, configure `@tailwindcss/vite` in the Vite/renderer plugins, import Tailwind, and include the package source if the app needs to scan it:

```css
@import "tailwindcss";
@source "../node_modules/@ovelle/ui/dist";
```

The path is relative to that stylesheet; adjust it for your project. In this monorepo the app stylesheets scan `packages/ui/src`. Existing apps import only Tailwind theme and utilities, without Preflight, to preserve their current page styles. All component CSS is in `@layer components`, so Tailwind utilities override its defaults. `className` styles the public wrapper; action controls expose `surfaceClassName` for the inner surface. `Field` and `Select` expose `wrapperClassName` for layout; Field exposes `inputClassName`.

## Exports

| Export | Main props |
| --- | --- |
| `Button` | `variant`, `tone`, `size`, `disabled`, `state`, `loadingLabel`, `successLabel` |
| `IconAction` | `icon`, accessible `label`, Button props |
| `Field` | `label`, `kind`, `value`/`defaultValue`, `hint`, `error`, `success` |
| `Select` | `label`, `options`, `value`/`defaultValue`, `error`, `disabled` |
| `FilterChip` | `selected`, `tone`, `onClick`, `disabled` |
| `Checkbox` | `label`, `checked`/`defaultChecked`, `mixed`, `onChange` |
| `Switch` | `label`, `checked`/`defaultChecked`, `onChange` |
| `NavigationItem` | `href`, `current`, `disabled`, children |
| `SectionLabel` | `tone`, children |
| `StatusMessage` | `tone`, `title`, children |
| `FAQRow` | `number`, `question`, `answer`, `open`, `onToggle` |
| `FeatureCard` | `surface`, `icon`, `title`, children, `link` |
| `DownloadCard` | `platform`, `title`, children, `action`, `unavailable` |
| `DownloadAction` | `href`, `download`, `label`, `detail`, `tone`, `unavailable`, `state` |
| `SiteNavigationDesktop` | `brand`, `links`, `action`, `githubStarCount`, `githubStarsLoading` |
| `SiteNavigationMobile` | `brand`, `links`, `action`, `githubStarCount`, `githubStarsLoading` |
| `GitHubLink` | `href` (Ovelle repository by default), `layout="compact" \| "menu"`, `disabled`, `contentClassName`, `starCount`, `starsLoading` |

| `SegmentedControl` | `label`, `options`, `value`/`defaultValue`, `onValueChange` |
| `ConfirmationDialog` | `open`, `onOpenChange`, `onConfirm`, `title`, children, `state`, `error`, `purpose`, `showTrigger` |
| `DatePicker` | `label`, `value`/`defaultValue`, `onValueChange`, `min`, `max`, `disabled`, `required`, `error`, `hint` |
| `Pagination` | `page`, `pageCount`, `onPageChange`, `disabled`, `size` |
| `EmptyState` | `title`, children, `icon`, `action`, `size`, `align`, content/action slot classes |
| `Skeleton` | children (real layout), `shape`, `width`, `height`, `animated` |
| `SkeletonRegion` | one accessible loading `label`, children |

The shared site header replaces the desktop Download navigation item with a GitHub mark and label. Mobile keeps Download and adds GitHub inside the dropdown. `githubHref` selects the repository; pass `null` to either navigation component to opt out. Get Ovelle continues to use the Download destination. `GitHubLink` composes `NavigationItem`, inherits material, frost, transparency and theme settings, supports `className` and anchor props, and opens the repository in a new tab with `noopener noreferrer`. Its exact Figma SVG is 16×16 in both themes. Hover, press, focus and disabled feedback come from the navigation control; selected, success, error and open states are inapplicable to the external action; count loading is described below.

```tsx
import { GitHubLink } from '@ovelle/ui';
<GitHubLink material="liquid-glass" glassFrost={35} />
<GitHubLink layout="menu" />
<GitHubLink starCount={0} />
<GitHubLink starCount={1337} />
<GitHubLink starCount={null} starsLoading />
```

Star counts are caller data: `starCount={undefined}` omits the badge, `null` displays an unavailable dash, and `0` is a valid count. Large values use compact notation with the exact count available to assistive technology and in the tooltip. `starsLoading` applies the dynamic `LoadingBoundary` to the badge while leaving the repository link usable. The badge reserves 40×24px and the compact control reserves 152×44px throughout loading. Both site navigation components accept `githubStarCount` and `githubStarsLoading`. Home reads the public repository API, shares the request through StrictMode, uses a five-second timeout, validates nonnegative integer counts and caches successful responses for 15 minutes. No authentication token is needed or shipped.

[Dynamic loading workflow](../../docs/design-system/skeleton-workflow.md). `LoadingBoundary` measures the actual mounted page layout and accepts `loading`, `label`, `regionClassName`, material settings and Skeleton props. Loading controls are inert; finishing loading restores the same mounted content. Initial requests need representative content or an expected layout. There is no Figma Skeleton sheet. DatePicker and Pagination are reusable controls, previewed at website `/components` and desktop `?components`.

All surfaces accept `material`, `glassFrost`, `reduceTransparency`, `className` and `style`. Native events and attributes are exposed on the appropriate HTML element. Icons and links are React nodes, so consumers can supply their own icon library or router link. IconAction requires an accessible label.

Section labels use content-based width, a 6px tone marker, an 8px internal gap, 12px vertical / 16px horizontal padding, and a 44px minimum height. These dimensions match the linked Figma masters.

## Design tokens

`@ovelle/ui/tokens.json` exports all 25 semantic Figma colors in Light/Dark modes. The stylesheet uses matching `--ov-surface-*`, `--ov-text-*`, `--ov-border-*`, `--ov-action-*` and `--ov-status-*` CSS variables. Semantic colors were resolved directly from the Figma variable collection; spacing, radius and component dimensions are implemented in the component stylesheet.

## States and behavior

Hover, pressed and focus-visible states come from CSS automatically. Native inputs provide keyboard behavior; Select uses a source-matched combobox/listbox with arrow, Home/End, Enter, Escape and type-ahead handling. Checked/selected values can be controlled or uncontrolled. Native `details` drives FAQ; the mobile menu supports controlled or uncontrolled open state. SegmentedControl uses radios, including native arrow-key navigation. ConfirmationDialog uses `showModal()`, providing browser focus containment, Escape handling and restoration; the caller owns its open state. Keep the dialog mounted while toggling `open`.

Loading, success and validation are application state; components do not simulate network requests or downloads. Example:

```tsx
<Button state={saving ? 'loading' : saved ? 'success' : 'default'}
  onClick={saveContact}>Save contact</Button>
```

Pass `unavailable` to both DownloadCard and its DownloadAction when the download is unavailable. Navigation links use normal anchors; desktop renderer navigation targets should match your app routing. Responsive composition uses Tailwind (for example separate `hidden md:flex` and `md:hidden` navigation instances), rather than assuming one desktop breakpoint for every app.

## Continuous glass

`glassFrost` accepts any finite number: **0 = liquid → 100 = frosted**, default **35**. Decimals work; out-of-range values clamp and non-finite values fall back to 35. Change the provider for all components or override any individual surface. Bind it directly to your accessibility/settings slider; React updates its CSS variables immediately.

```tsx
<OvelleProvider material="liquid-glass" glassFrost={frost}
  reduceTransparency={reduceTransparency} reduceMotion={reduceMotion}
  theme="dark">
  {children}
</OvelleProvider>
```

Glass samples actual colors and content **behind** the component via `backdrop-filter`; keep the surface over real backgrounds to see it. Text/icons remain opaque. Panel blur progresses 0–40px; controls 0–24px; menu blur 8–32px. Pigmented and dark surfaces use stronger tint for readable labels. Reduce Transparency makes surfaces opaque without changing the frost setting. OS reduced-motion/reduced-transparency preferences and forced colors have CSS fallbacks; unsupported backdrop filtering uses opaque surfaces.

Native Figma GLASS refraction cannot be reproduced identically by CSS. Select menus and native checkbox/switch skins retain the Figma visual slots and exact Light/Dark SVGs. The glass tuner plugin edits Figma effects; it is not required at runtime in the apps. Student-plan Code Connect publishing is unavailable; use the checked-in manifest and the React export descriptions on the Figma assets.

## Adding custom components

Every new custom component belongs in both this shared package and the Figma **05 Components** sheet. Match the established tokens and Apple Design conventions, establish all applicable variants and states, and update the manifest and Figma asset description with its React export. Keep the sheet's horizontal family columns and vertical variant layout.

Compose existing parts with linked Figma instances and existing React components. For example, a new toolbar should contain instances of `Ovelle / Button` and `Ovelle / Field` in Figma and render `<Button>` and `<Field>` in React. Expose their nested properties rather than redrawing or detaching them. If an existing part needs a new capability, extend its source variant so other compositions can reuse it.

The repository's [AGENTS.md](../../AGENTS.md) records these requirements for future development. Updates propagate through instances within Figma and through imports within React; maintaining parity between Figma and code is an explicit development step.

## Verification

`npm run test -w @ovelle/ui`, `npm run check`, `npm run lint`, `npm run build`. Tests cover export coverage, semantic markup, state/label forwarding and continuous material values. Run `node scripts/check-figma-fidelity.mjs` and `node scripts/check-content-components.mjs` against the web preview and built desktop renderer. Set `OVELLE_PLAYWRIGHT_MODULE` if Playwright is installed elsewhere, and `OVELLE_PREVIEW_URL` for the desktop URL. Figma reference captures and source/variant inventories live in `docs/design-system/migration`. The fidelity check verifies native root dimensions for all 31 families, action child geometry/typography/states, keyboard/focus and exact SVG geometry; screenshots still require human inspection.

Compact Button loading/success states use icon-only content to preserve square geometry. Supply `aria-label` for a contextual accessible label.

## Website compositions

The website and Electron renderer share `apps/shared/Home.tsx`. Routing, HTTP requests and Electron's restricted native IPC stay in the apps. The following compositions reuse the public controls, cards, fields and labels; their native Figma component sets and nested property mappings are recorded in `figma-manifest.json`.

| Export | Props and behavior |
| --- | --- |
| `WorkflowPreview` | `stage` (`find`, `enrich`, `follow-up`), `onStageChange`, `layout`, `showControls`, `interactive`; hover/focus reveals source context. |
| `WorkflowSection` | Same stage/layout API, `onExplore(stage)`; desktop and mobile source layouts. |
| `MobileWorkflow` | `stage`, `onStageChange`, `onExplore(stage)`; source heights vary with stage. |
| `PinnedWorkflow` | Stage API, `motion`, `presentation`, optional overall `progress` (0–1); scroll fills each segment continuously and crossfades stages for 400 ms ease-out, reduced motion/short viewports show all three in normal flow. `presentation="stage"` renders the static Figma specimen. |
| `HeroWorkflowScene` | Stage API, `size` (`regular`, `compact`), `onExplore(stage)`; selector opens the linked stage sheet. |
| `HeroStageSheet` | `stage`, `onStageChange`, `open`, `onClose`, `presentation` (`modal`, `inline`), optional `titleId`/`refElement`; native modal keyboard/focus handling, solid material only. |
| `ProgramOverview` | `onOpportunityClick`, `onProgramClick`; reuses summary-density `FeatureCard`. |
| `EmailDownloadLink` | `onSend(email): Promise<void>`, optional controlled `state`; default/focused/sending/sent/invalid/error/disabled variants. Validation prevents sending, retries preserve the address, repeated submission cannot start duplicate requests. |
| `DeviceAwareDownloadCTA` | `releases: DesktopRelease[]`, optional `device`; OS recommendations retain manual architecture choices and availability from real R2 metadata. Mobile Home uses `EmailDownloadLink`. |

All visual compositions inherit Light/Dark and the provider's reduced-motion preference, accept `className`, and support material/frost/transparency overrides where the source has glass variants. Stage sheets have no glass variant; static compositions have no artificial loading/success states. Nested interactive components retain their own hover, pressed, focus and disabled behavior. `FeatureCard` adds `density="summary"`; `Field` adds `supportingText="hidden"` to preserve the email form's native field geometry without hiding validation semantics.

```tsx
<EmailDownloadLink onSend={async email => {
  const response = await fetch('/api/download-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok || !(await response.json()).sent) throw new Error('Delivery unavailable');
}} />
```

See [source captures and implementation evidence](../../docs/design-system/migration/website-2026-10-11/README.md). Source motion uses the authored 120/220/350/400ms transitions and FAQ spring; OS/provider reduced motion removes interpolation. Run `check:figma`, `check:loading` and `check:website` in both consumers, plus `check:electron-downloads` against the built native app. The fidelity inventory now checks 31 families and independent email/mobile state dimensions. Figma and React remain separately maintained; Code Connect publishing requires an eligible Figma plan/seat.
