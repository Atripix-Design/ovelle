# Ovelle component walkthrough — dedicated video agent handoff

## Assignment

Create a polished video showing every Ovelle public component, its real interactions and all meaningful associated states. The user explicitly requested a separate agent solely focused on the video. Do not redesign components, regenerate Figma, create skeleton sheets or broadly refactor code. Report a discovered component bug before relying on it in a recording. Small reversible demo-fixture corrections needed for truthful interaction are permitted.

Load `the installed `video-creator` skill` and its references before recording. Follow repository AGENTS.md and the publishing instructions for any repository changes. Deliver the final playable video with an absolute local path, plus a timestamped chapter/state index. Do not merely supply a script or still screenshots.

## Repository and runnable previews

Workspace: `the repository root`; shared implementations: `packages/ui`; shared demo: `apps/shared/ComponentPreview.tsx`, `FidelityVariants.tsx`, `LoadingPreview.tsx`.

Website: `http://127.0.0.1:5174/components`

Built desktop renderer: `http://127.0.0.1:5175/?components`

Confirm HTTP success before sharing a URL. Restart if needed:

```sh
npm run build -w @ovelle/ui
npm run dev -w @ovelle/web -- --host 0.0.0.0 --port 5174
# Separate terminal; rebuild after changes:
npm run build -w @ovelle/desktop
python3 -m http.server 5175 --bind 0.0.0.0 --directory apps/desktop/out/renderer
```

The browser preview uses identical shared UI but does not demonstrate Electron native integrations. Say so if describing desktop coverage.

Figma source: https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=4-2

`packages/ui/figma-manifest.json` is the current public family/property mapping. `docs/design-system/migration/sources.json`, `variants.json`, references and contexts hold independent native evidence. Browser and Figma glass renderers differ; avoid claiming pixel-perfect glass parity.

## Fixes to demonstrate

- Pagination outer height 62px; compact button outer hit target 44px with a 36px square surface.
- Calendar seven equal aligned columns: 42px day cells and 36px square inner surfaces. Default trigger height 44px, field 72px. Open field 496px.
- First Figma Button column no longer overlaps its regular state sections. Compact defaults are a single numeral; busy/success use an icon with an accessible label rather than clipped full text.
- Checkbox small glass uses restrained sheen, zero native refraction/dispersion and no shadow. Exact source check/mixed icons remain. Show unchecked/checked/mixed, focus, disabled, Light/Dark and low/high frost against actual colored backdrop content.
- Figma Skeleton column is removed. `LoadingBoundary` measures actual mounted DOM, follows wrapping/resizing/mutations and retains input state after loading. No component mask registry. First loading still requires a rendered representative layout; it cannot infer missing data.
- Glass control in Figma: Variables → collection `Ovelle / Material settings` → `glass/intensity` (0–100, default 35). Glass Tuner must be open with Library scope and Follow variable enabled for effect recalculation. Current plugin version `0871f41cd2c369c096afb9fe2c711db8c9e25e79`, id `920068c6-0076-4fa4-94bf-67f7325bb96f`.

## Coverage inventory

Use actual DOM clicks/typing/keyboard and verify the resulting state. Static state examples must be labeled as examples; do not imply they are the result of a server request. A focused per-component recording fixture is preferable if the long gallery is hard to frame. Keep public component implementations unchanged.

| Family | Required coverage |
| --- | --- |
| Button | Primary/Secondary/Quiet; Blue/Neutral/Danger; Regular/Compact; default, hover, held press, keyboard focus, disabled, loading, success |
| Icon action | Default, hover, press, keyboard focus, disabled; Blue/Neutral; accessible label |
| Field | Text/Search; empty, typed/filled, hover, focus, disabled, error, success |
| Select | Closed/open, pointer selection, Arrow keys/Enter, Escape, focus, disabled, error |
| Filter chip | Unselected/selected toggle, Blue/Neutral, hover, press, focus, disabled |
| Checkbox | Off/on/mixed; pointer and Space toggle; focus; each disabled state; small glass |
| Switch | Off/on toggle, focus/Space, hover, disabled off/on |
| Navigation item | Current/noncurrent, hover, press, focus, disabled; avoid navigating away from demo |
| Section label | Blue/Neutral/Success; presentation-only, no invented interactions |
| Status message | Info/Success/Warning/Error; presentation and announcement semantics |
| FAQ row | Closed/open, click and keyboard activation |
| Feature card | Ice/Cream; linked card hover/focus/press; supplied content/asset slots |
| Download card | macOS/Windows, available/unavailable, nested action interaction |
| Download action | Blue/Neutral/Danger; default, hover, press, focus, unavailable, loading, success |
| Site navigation / Desktop | Current link, other link hover/focus, action; preserve native desktop width 889px |
| Site navigation / Mobile | Closed/open, menu links, keyboard arrows/Home/End, Escape, outside close, restored trigger focus |
| Segmented control | Each selection, pointer and radio keyboard navigation, hover/focus, disabled |
| Confirmation dialog | Trigger/open, archive/export purpose, confirm/cancel, Escape/focus restoration; default/loading/success/error |
| Date picker | Empty/filled, open/closed, month navigation, selected day, clear; arrows/Home/End/PageUp/PageDown/Enter/Escape, min/max, disabled/error |
| Pagination | First/middle/last/single page, gaps, previous/next disabled, page selection, narrow compact layout, focus |
| Empty state | Regular/Compact, Start/Center; contextual search/download examples and nested action |
| Dynamic page loading (utility) | Load/finish, input value retained, changed text/list while loading, narrow wrapping, inert controls, motion/transparency fallback |

For every applicable family, show Light/Dark and Solid/Liquid Glass; show Soft Glass where exposed, and continuous frost 0/35/100 with independent reduce transparency. Explain reduced motion using a verified comparison. There is no need to show meaningless cartesian combinations, but the chapter/state index must say exactly what was recorded and identify omissions. Default/hover/press/focus can often be one compact interaction sequence. Do not invent hover or loading states for presentation-only components.

The existing gallery covers many explicit states, but it lacks some fixture combinations (e.g. export dialog, compact busy/success, single pagination, empty date). Add those in the demo fixture or a dedicated walkthrough page using `@ovelle/ui` if needed. Review actual prop types before doing so. Some base examples intentionally use no-op callbacks; use controlled demo state when showcasing behavior.

## Recording and acceptance

Use a consistent readable viewport (e.g. 1440×900), at least 30fps, truthful chapter titles, smooth pointer motion, visible click feedback and deliberate readable pauses. Avoid giant page jumps, cursor teleporting, actions offscreen and clipped examples. The skill's `scripts/recording-interactions.mjs` provides `createInteractionDriver` for Playwright. Playwright/Chromium are installed in this repository. FFmpeg can encode browser WebM into H.264 MP4.

Prefer short chapter clips or a focused component explorer over a long uncontrolled gallery scroll. Keep the real colored backdrop visible when demonstrating glass; never simulate interaction by swapping screenshots. Save media outside Git under an absolute artifact directory. Commit reusable recording scripts, demo fixtures and the state index only if appropriate.

Before delivery: inspect the key frames for every chapter and state, watch the entire assembled video at normal speed, use ffprobe to confirm codec/dimensions/fps/duration, and fully decode with FFmpeg. Verify the final duration includes the final state and excludes dead capture time. No unverified "all states" claim.

Component checks available:

```sh
npm run check:figma
npm run check:components
node scripts/check-dynamic-loading.mjs
# Repeat against the built desktop renderer using OVELLE_PREVIEW_URL.
```

These verify geometry/behavior; they are not a substitute for visual video QA. Deliver the video inline via `![Ovelle component walkthrough](/absolute/path/video.mp4)` and link the chapter index. If making repository changes, invoke push-development-on-finish, stage task-only files and publish to origin/development; never main/master.
