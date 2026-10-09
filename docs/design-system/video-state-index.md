# Ovelle component walkthrough — recorded coverage

Final video: `/home/jeremy-mathew/Videos/ovelle-walkthrough/ovelle-component-walkthrough.mp4` (14:15.87, H.264, 1440 × 900, 30 fps, no audio).

Recorded 2026-10-09 from actual shared React components. The dedicated fixture is available at `http://100.114.150.83:5174/components?walkthrough`; the built desktop renderer uses `http://100.114.150.83:5175/?components&walkthrough`. Both consumers were independently checked. The video demonstrates browser UI, not Electron native integrations.

## Chapters

| Start | End | Chapter | Recorded coverage |
|---|---|---|---|
| 00:00.00 | 01:12.73 | 01 · Actions | Button and IconAction: three styles, three tones; regular state matrix (default/disabled/loading/success), compact icon-only busy/success and numeral defaults; hover/held press/keyboard focus. Icon action Blue/Neutral with accessible labels and disabled example. |
| 01:12.73 | 02:27.50 | 02 · Fields and select | Field and Select: Text/Search empty/typed/filled/error/success/disabled; pointer open/select, ArrowDown/Enter, Escape; invalid/disabled select specimens. Open select in all six appearance combinations. |
| 02:27.50 | 03:11.57 | 03 · Choices | FilterChip, Checkbox and Switch: real selected toggle; Blue/Neutral chips; pointer and Space toggle; focus; mixed and each disabled checkbox state; disabled off/on switch. Small glass checkbox against actual colored backdrop. |
| 03:11.57 | 03:49.10 | 04 · Navigation and labels | NavigationItem and SectionLabel: current/noncurrent, hover/press/focus and disabled navigation; Blue/Neutral/Success presentation labels. Local links intercepted to keep recording in the fixture. |
| 03:49.10 | 04:36.90 | 05 · Messages and FAQ | StatusMessage and FAQRow: Info/Success/Warning/Error specimens with status/alert roles checked; FAQ pointer open and Enter close; open FAQ appearance comparisons. No invented presentation interactions. |
| 04:36.90 | 05:14.90 | 06 · Feature cards | FeatureCard: Ice/Cream; linked hover/held press/focus; default source asset and caller-supplied icon/content slots. |
| 05:14.90 | 06:21.17 | 07 · Downloads | DownloadCard and DownloadAction: macOS/Windows available and unavailable; nested action pointer activation; Blue/Neutral/Danger action default/unavailable/loading/success specimens; six-mode lower-state surface comparisons. |
| 06:21.17 | 07:38.70 | 08 · Site navigation | SiteNavigationDesktop and SiteNavigationMobile: verified 889px desktop width; current and other links, action; mobile open/closed, links, ArrowDown/ArrowUp/Home/End, Escape with trigger focus, outside close; all six open-menu appearance combinations. |
| 07:38.70 | 08:14.60 | 09 · Segments | SegmentedControl: Contacts/Companies/Campaigns pointer and native radio arrow/wrap navigation; selected/focused and disabled examples. |
| 08:14.60 | 10:03.70 | 10 · Dialogs | ConfirmationDialog: Archive/Export, trigger/open/default, cancel, Escape and focus restoration; locally simulated loading→success and loading→error for both purposes, Done close. Open-dialog appearance comparisons; cursor capture repaired for native modal top layer. |
| 10:03.70 | 11:36.37 | 11 · Calendar | DatePicker: empty/filled/open/closed, month next/previous, pointer day selection, clear; ArrowLeft/Right/Up/Down, Home/End/PageUp/PageDown/Enter/Escape; min/max-disabled days, disabled/error specimens; open-calendar appearance comparisons. |
| 11:36.37 | 12:29.70 | 12 · Pagination and empty states | Pagination and EmptyState: first/middle/last/single page, gaps, previous/next disabled, pointer page selection and keyboard focus; narrow 330px pagination; compact/start search and regular/center downloads with real nested Clear search/Check again actions. |
| 12:29.70 | 14:15.87 | 13 · Dynamic loading | LoadingBoundary utility: load/finish, retained input, changed text/list while loading, narrow wrapping and inert controls. Supplemental visible map animation proves normal ov-skeleton-pulse versus reduced-motion none. Transparency fallback compared independently. |

## Appearance and evidence limits

Every chapter includes Light/Dark Solid and Liquid Glass and Light/Dark Soft Glass specimens. Each base chapter includes Liquid Glass frost 0, 35 and 100, a continuous pointer sweep from 0 to 100, and independent Reduce transparency. Open Select, FAQ, Mobile menu, Dialog and Calendar have separate appearance reels. Supplemental loading comparisons show the real measured loading surface in all six appearance combinations. Colored radial content remains behind the glass; this is actual browser backdrop sampling, not a substituted screenshot.

Named family states are covered across representative variants; this is not every Cartesian product of state × style × tone × material × theme. Compact Button alternate tones/styles, per-tone icon disabled combinations, and every state under every frost value are not independently recorded. Native Figma editing, its glass tuner/variable UI, source column layout fixes, and the removed Skeleton sheet are not filmed. This video does not establish pixel-perfect Figma/browser glass parity or prove first loading without a representative mounted layout.

Busy/success/error regular specimens are static examples, visibly labeled. Dialog transitions use a timed local simulation and explicitly say no server request. Download links activate only local demo links. Status/alert roles are asserted; no screen-reader speech is recorded.

## Technical and visual QA

Playwright source captures are VP9 at 25 fps. FFmpeg exports a constant 30 fps H.264 video by repeating source frames; it does not create additional independently captured motion detail. Each source is explicitly trimmed to the recorded interval, with final-state holds included. Assembly boundaries and all state keyframes are inspected; the final file is fully decoded and probed.

A complete human visual watch of the assembled video at normal speed remains unverified: the available vision interface reads still images. Frame inspection, playback instrumentation and successful full decode do not substitute for that requirement. Do not claim it was watched in full.

The initial LoadingBoundary pseudo-element motion probe inspected a hidden `::after`; those base clip events are not evidence of visible reduced motion. The final verified motion comparison instead inspects `.ov-skeleton-map`, asserts pulse/none and adds visible captions.

Persistent source clips, render report and QA frames: `/home/jeremy-mathew/Videos/ovelle-walkthrough/`.

## Re-recording

Run `node scripts/record-component-video.mjs --chapters 0,1,2 --output /absolute/artifacts`. `--appearance-only` records Dark Soft Glass supplements. `--url` selects the consumer. The helper comes from the installed video-creator skill at `~/.codex/skills/video-creator/scripts/recording-interactions.mjs`; set `OVELLE_VIDEO_INTERACTIONS_MODULE` to override its absolute module path. Each invocation owns isolated browser contexts and output directories. The source manifest includes chapter, title, source, trimStart, duration and timestamped screenshot/state events.

## Timestamped state index

Chapter boundaries use measured encoded durations. State timestamps are matched to encoded video frames sampled at 5 fps (0.2-second precision), within two seconds of the original screenshot mark. Monotonic matching preserves the recorded action order; narrow screenshots are padded to the recording canvas before matching. This avoids wall-clock marks that fell just after a state closed.

### 00:00.00 — 01 · Actions

| Time | State/evidence |
|---|---|
| 00:00.60 | Light / Solid · initial examples |
| 00:02.00 | Hover · blue |
| 00:02.60 | Held pointer press |
| 00:04.20 | Keyboard focus |
| 00:08.40 | Icon action Neutral hover |
| 00:09.00 | Held pointer press |
| 00:09.40 | Keyboard focus |
| 00:11.60 | Compact default and icon action · disabled/loading/success static examples |
| 00:14.20 | dark / solid / frost 35 |
| 00:18.40 | dark / liquid-glass / frost 35 |
| 00:20.80 | light / liquid-glass / frost 35 |
| 00:25.00 | light / soft-glass / frost 35 |
| 00:28.20 | Liquid Glass frost 0 |
| 00:31.40 | Continuous frost sweep / frost 100 |
| 00:33.60 | Reduce transparency on independently at frost 100 |
| 00:38.00 | Dark / Liquid Glass frost 35 |

### 00:39.30 — 01 · Actions — regular state matrix

| Time | State/evidence |
|---|---|
| 00:41.90 | primary / Blue, Neutral, Danger · default / disabled / loading / success |
| 00:44.90 | primary hover |
| 00:46.50 | primary held press |
| 00:47.30 | primary keyboard focus |
| 00:51.10 | secondary / Blue, Neutral, Danger · default / disabled / loading / success |
| 00:53.10 | secondary hover |
| 00:54.70 | secondary held press |
| 00:56.50 | secondary keyboard focus |
| 00:59.30 | quiet / Blue, Neutral, Danger · default / disabled / loading / success |
| 01:03.10 | quiet hover |
| 01:03.70 | quiet held press |
| 01:07.30 | quiet keyboard focus |

### 01:07.60 — 01 · Actions

| Time | State/evidence |
|---|---|
| 01:08.00 | Light / Solid · initial examples |
| 01:12.40 | dark / soft-glass / frost 35 |

### 01:12.73 — 02 · Fields and select

| Time | State/evidence |
|---|---|
| 01:13.33 | Light / Solid · initial examples |
| 01:14.73 | Text typed and focused |
| 01:16.73 | Search typed and focused |
| 01:18.53 | Select open |
| 01:20.53 | Pointer selected Active |
| 01:21.53 | Select Arrow navigation |
| 01:22.73 | Keyboard selected Archived |
| 01:24.93 | Select closed with Escape |
| 01:30.93 | dark / solid / frost 35 |
| 01:32.13 | dark / liquid-glass / frost 35 |
| 01:37.33 | light / liquid-glass / frost 35 |
| 01:37.93 | light / soft-glass / frost 35 |
| 01:41.53 | Liquid Glass frost 0 |
| 01:43.73 | Continuous frost sweep / frost 100 |
| 01:47.13 | Reduce transparency on independently at frost 100 |
| 01:51.73 | Dark / Liquid Glass frost 35 |

### 01:52.30 — 02 · Fields — validation state matrix

| Time | State/evidence |
|---|---|
| 01:54.10 | Text: empty / filled / error / success / disabled |
| 01:56.90 | Search: empty / filled / error / success / disabled |

### 01:59.00 — 02 · Fields and select

| Time | State/evidence |
|---|---|
| 01:59.80 | Light / Solid · initial examples |
| 02:02.80 | dark / soft-glass / frost 35 |

### 02:04.00 — 02 · Fields and select — open surfaces

| Time | State/evidence |
|---|---|
| 02:06.00 | Open surface: light/solid; frost 35; reduce transparency false |
| 02:08.80 | Open surface: light/liquid-glass; frost 35; reduce transparency false |
| 02:11.00 | Open surface: light/soft-glass; frost 35; reduce transparency false |
| 02:13.80 | Open surface: dark/solid; frost 35; reduce transparency false |
| 02:16.20 | Open surface: dark/liquid-glass; frost 35; reduce transparency false |
| 02:18.20 | Open surface: dark/soft-glass; frost 35; reduce transparency false |
| 02:21.40 | Open surface: light/liquid-glass; frost 0; reduce transparency false |
| 02:23.00 | Open surface: light/liquid-glass; frost 100; reduce transparency false |
| 02:25.80 | Open surface: light/liquid-glass; frost 100; reduce transparency true |

### 02:27.50 — 03 · Choices

| Time | State/evidence |
|---|---|
| 02:27.70 | Light / Solid · initial examples |
| 02:29.30 | Hover · Active |
| 02:30.10 | Held pointer press |
| 02:31.10 | Keyboard focus |
| 02:33.30 | Chip toggle |
| 02:35.50 | Checkbox pointer checked |
| 02:36.90 | Checkbox Space unchecked/focus |
| 02:38.30 | Switch pointer on |
| 02:39.70 | Switch Space off/focus |
| 02:42.10 | dark / solid / frost 35 |
| 02:46.50 | dark / liquid-glass / frost 35 |
| 02:49.70 | light / liquid-glass / frost 35 |
| 02:53.50 | light / soft-glass / frost 35 |
| 02:55.70 | Liquid Glass frost 0 |
| 02:58.70 | Continuous frost sweep / frost 100 |
| 03:00.50 | Reduce transparency on independently at frost 100 |
| 03:05.50 | Dark / Liquid Glass frost 35 |

### 03:06.57 — 03 · Choices

| Time | State/evidence |
|---|---|
| 03:06.97 | Light / Solid · initial examples |
| 03:10.17 | dark / soft-glass / frost 35 |

### 03:11.57 — 04 · Navigation and labels

| Time | State/evidence |
|---|---|
| 03:11.77 | Light / Solid · initial examples |
| 03:13.17 | Hover · Features |
| 03:13.57 | Held pointer press |
| 03:15.17 | Keyboard focus |
| 03:17.57 | Current/noncurrent navigation; presentation labels |
| 03:19.77 | dark / solid / frost 35 |
| 03:23.57 | dark / liquid-glass / frost 35 |
| 03:26.37 | light / liquid-glass / frost 35 |
| 03:29.77 | light / soft-glass / frost 35 |
| 03:33.57 | Liquid Glass frost 0 |
| 03:36.57 | Continuous frost sweep / frost 100 |
| 03:37.97 | Reduce transparency on independently at frost 100 |
| 03:43.17 | Dark / Liquid Glass frost 35 |

### 03:44.13 — 04 · Navigation and labels

| Time | State/evidence |
|---|---|
| 03:44.33 | Light / Solid · initial examples |
| 03:48.53 | dark / soft-glass / frost 35 |

### 03:49.10 — 05 · Messages and FAQ

| Time | State/evidence |
|---|---|
| 03:49.50 | Light / Solid · initial examples |
| 03:51.30 | FAQ pointer opened |
| 03:52.70 | FAQ keyboard closed |
| 03:54.70 | dark / solid / frost 35 |
| 03:59.30 | dark / liquid-glass / frost 35 |
| 04:01.10 | light / liquid-glass / frost 35 |
| 04:05.70 | light / soft-glass / frost 35 |
| 04:08.30 | Liquid Glass frost 0 |
| 04:11.30 | Continuous frost sweep / frost 100 |
| 04:13.30 | Reduce transparency on independently at frost 100 |
| 04:18.30 | Dark / Liquid Glass frost 35 |

### 04:19.27 — 05 · Messages and FAQ

| Time | State/evidence |
|---|---|
| 04:19.27 | Light / Solid · initial examples |
| 04:23.27 | dark / soft-glass / frost 35 |

### 04:24.20 — 05 · Messages and FAQ — open surfaces

| Time | State/evidence |
|---|---|
| 04:25.60 | Open surface: light/solid; frost 35; reduce transparency false |
| 04:26.60 | Open surface: light/liquid-glass; frost 35; reduce transparency false |
| 04:27.80 | Open surface: light/soft-glass; frost 35; reduce transparency false |
| 04:29.40 | Open surface: dark/solid; frost 35; reduce transparency false |
| 04:31.00 | Open surface: dark/liquid-glass; frost 35; reduce transparency false |
| 04:32.20 | Open surface: dark/soft-glass; frost 35; reduce transparency false |
| 04:32.40 | Open surface: light/liquid-glass; frost 0; reduce transparency false |
| 04:34.00 | Open surface: light/liquid-glass; frost 100; reduce transparency false |
| 04:36.00 | Open surface: light/liquid-glass; frost 100; reduce transparency true |

### 04:36.90 — 06 · Feature cards

| Time | State/evidence |
|---|---|
| 04:37.30 | Light / Solid · initial examples |
| 04:38.70 | Hover · Explore contacts |
| 04:39.30 | Held pointer press |
| 04:40.50 | Keyboard focus |
| 04:42.90 | Ice / Cream and supplied content/asset slots |
| 04:45.30 | dark / solid / frost 35 |
| 04:48.90 | dark / liquid-glass / frost 35 |
| 04:51.70 | light / liquid-glass / frost 35 |
| 04:56.90 | light / soft-glass / frost 35 |
| 04:59.30 | Liquid Glass frost 0 |
| 05:02.50 | Continuous frost sweep / frost 100 |
| 05:05.10 | Reduce transparency on independently at frost 100 |
| 05:07.70 | Dark / Liquid Glass frost 35 |

### 05:09.97 — 06 · Feature cards

| Time | State/evidence |
|---|---|
| 05:10.77 | Light / Solid · initial examples |
| 05:13.57 | dark / soft-glass / frost 35 |

### 05:14.90 — 07 · Downloads

| Time | State/evidence |
|---|---|
| 05:15.50 | Light / Solid · initial examples |
| 05:16.70 | Hover · Download for macOS |
| 05:17.70 | Held pointer press |
| 05:19.10 | Keyboard focus |
| 05:22.10 | All download action tones · unavailable/loading/success examples |
| 05:25.90 | dark / solid / frost 35 |
| 05:29.70 | dark / liquid-glass / frost 35 |
| 05:33.90 | light / liquid-glass / frost 35 |
| 05:38.50 | light / soft-glass / frost 35 |
| 05:40.30 | Liquid Glass frost 0 |
| 05:44.70 | Continuous frost sweep / frost 100 |
| 05:48.30 | Reduce transparency on independently at frost 100 |
| 05:51.90 | Dark / Liquid Glass frost 35 |

### 05:53.23 — 07 · Downloads

| Time | State/evidence |
|---|---|
| 05:53.63 | Light / Solid · initial examples |
| 05:57.03 | dark / soft-glass / frost 35 |

### 05:58.30 — 07 · Downloads — all state surfaces

| Time | State/evidence |
|---|---|
| 06:01.50 | Download lower states: light/solid |
| 06:05.10 | Download lower states: light/liquid-glass |
| 06:07.90 | Download lower states: light/soft-glass |
| 06:11.50 | Download lower states: dark/solid |
| 06:16.10 | Download lower states: dark/liquid-glass |
| 06:19.90 | Download lower states: dark/soft-glass |

### 06:21.17 — 08 · Site navigation

| Time | State/evidence |
|---|---|
| 06:21.77 | Light / Solid · initial examples |
| 06:23.57 | Hover · Features |
| 06:23.77 | Held pointer press |
| 06:24.37 | Keyboard focus |
| 06:28.17 | Mobile menu open |
| 06:29.77 | Mobile ArrowDown navigation |
| 06:30.57 | Mobile End navigation |
| 06:31.37 | Mobile Home navigation |
| 06:32.77 | Mobile ArrowUp navigation |
| 06:34.77 | Mobile Escape closed and trigger focus restored |
| 06:37.97 | Mobile link closes menu |
| 06:41.17 | Mobile outside close |
| 06:46.57 | dark / solid / frost 35 |
| 06:47.77 | dark / liquid-glass / frost 35 |
| 06:51.17 | light / liquid-glass / frost 35 |
| 06:53.97 | light / soft-glass / frost 35 |
| 06:56.37 | Liquid Glass frost 0 |
| 06:59.97 | Continuous frost sweep / frost 100 |
| 07:02.17 | Reduce transparency on independently at frost 100 |
| 07:07.17 | Dark / Liquid Glass frost 35 |
| 07:09.77 | Dark Liquid Glass / open mobile menu |

### 07:10.57 — 08 · Site navigation

| Time | State/evidence |
|---|---|
| 07:10.97 | Light / Solid · initial examples |
| 07:15.37 | dark / soft-glass / frost 35 |

### 07:15.53 — 08 · Site navigation — open surfaces

| Time | State/evidence |
|---|---|
| 07:16.73 | Open surface: light/solid; frost 35; reduce transparency false |
| 07:19.33 | Open surface: light/liquid-glass; frost 35; reduce transparency false |
| 07:21.53 | Open surface: light/soft-glass; frost 35; reduce transparency false |
| 07:24.93 | Open surface: dark/solid; frost 35; reduce transparency false |
| 07:26.73 | Open surface: dark/liquid-glass; frost 35; reduce transparency false |
| 07:30.13 | Open surface: dark/soft-glass; frost 35; reduce transparency false |
| 07:31.73 | Open surface: light/liquid-glass; frost 0; reduce transparency false |
| 07:34.73 | Open surface: light/liquid-glass; frost 100; reduce transparency false |
| 07:36.73 | Open surface: light/liquid-glass; frost 100; reduce transparency true |

### 07:38.70 — 09 · Segments

| Time | State/evidence |
|---|---|
| 07:38.70 | Light / Solid · initial examples |
| 07:40.50 | Companies pointer selected |
| 07:41.90 | Campaigns keyboard selected |
| 07:42.90 | Contacts radio wrap navigation |
| 07:46.70 | dark / solid / frost 35 |
| 07:49.30 | dark / liquid-glass / frost 35 |
| 07:52.70 | light / liquid-glass / frost 35 |
| 07:56.50 | light / soft-glass / frost 35 |
| 07:59.10 | Liquid Glass frost 0 |
| 08:01.30 | Continuous frost sweep / frost 100 |
| 08:03.50 | Reduce transparency on independently at frost 100 |
| 08:08.10 | Dark / Liquid Glass frost 35 |

### 08:09.67 — 09 · Segments

| Time | State/evidence |
|---|---|
| 08:09.87 | Light / Solid · initial examples |
| 08:12.87 | dark / soft-glass / frost 35 |

### 08:14.60 — 10 · Dialogs

| Time | State/evidence |
|---|---|
| 08:15.40 | Light / Solid · initial examples |
| 08:16.80 | Archive dialog open/default |
| 08:19.20 | Cancel restores trigger focus |
| 08:22.20 | Escape restores trigger focus |
| 08:26.60 | archive default |
| 08:29.00 | archive loading · local simulation |
| 08:30.40 | archive success · local simulation |
| 08:34.40 | archive default |
| 08:37.80 | archive loading · local simulation |
| 08:39.00 | archive error · local simulation |
| 08:44.40 | export default |
| 08:46.40 | export loading · local simulation |
| 08:48.40 | export success · local simulation |
| 08:52.60 | export default |
| 08:55.40 | export loading · local simulation |
| 08:57.00 | export error · local simulation |
| 09:02.00 | dark / solid / frost 35 |
| 09:04.00 | dark / liquid-glass / frost 35 |
| 09:07.40 | light / liquid-glass / frost 35 |
| 09:10.40 | light / soft-glass / frost 35 |
| 09:14.20 | Liquid Glass frost 0 |
| 09:17.60 | Continuous frost sweep / frost 100 |
| 09:18.80 | Reduce transparency on independently at frost 100 |
| 09:22.80 | Dark / Liquid Glass frost 35 |
| 09:24.80 | Dark Liquid Glass / open export dialog |

### 09:27.43 — Dialog surface comparisons

| Time | State/evidence |
|---|---|
| 09:30.23 | light / solid · open archive dialog |
| 09:34.03 | light / liquid-glass · open archive dialog |
| 09:37.83 | light / soft-glass · open archive dialog |
| 09:41.83 | dark / solid · open archive dialog |
| 09:45.43 | dark / liquid-glass · open archive dialog |
| 09:49.63 | dark / soft-glass · open archive dialog |
| 09:52.03 | Dark Liquid Glass frost 0 · open surface |
| 09:55.63 | Dark Liquid Glass frost 35 · open surface |
| 09:59.03 | Dark Liquid Glass frost 100 · open surface |
| 10:02.43 | Independent reduce transparency at frost 100 · open surface |

### 10:03.70 — 11 · Calendar

| Time | State/evidence |
|---|---|
| 10:04.10 | Light / Solid · initial examples |
| 10:05.70 | Empty date open · min/max disabled days |
| 10:06.90 | Calendar ArrowRight |
| 10:07.70 | Calendar ArrowDown |
| 10:09.50 | Calendar ArrowLeft |
| 10:09.90 | Calendar ArrowUp |
| 10:11.70 | Calendar Home |
| 10:12.30 | Calendar End |
| 10:14.10 | Calendar PageDown |
| 10:14.90 | Calendar PageUp |
| 10:17.10 | Keyboard selected date |
| 10:19.70 | Next month |
| 10:22.10 | Previous month |
| 10:23.30 | Pointer selected October 15 |
| 10:27.90 | Date cleared |
| 10:29.50 | Calendar Escape closed/trigger focus |
| 10:32.50 | dark / solid / frost 35 |
| 10:36.70 | dark / liquid-glass / frost 35 |
| 10:38.50 | light / liquid-glass / frost 35 |
| 10:42.30 | light / soft-glass / frost 35 |
| 10:46.10 | Liquid Glass frost 0 |
| 10:48.30 | Continuous frost sweep / frost 100 |
| 10:52.10 | Reduce transparency on independently at frost 100 |
| 10:55.10 | Dark / Liquid Glass frost 35 |
| 10:57.70 | Dark Liquid Glass / open calendar |

### 10:59.40 — Calendar surface comparisons

| Time | State/evidence |
|---|---|
| 11:02.40 | light / solid · open calendar |
| 11:06.40 | light / liquid-glass · open calendar |
| 11:10.40 | light / soft-glass · open calendar |
| 11:13.80 | dark / solid · open calendar |
| 11:18.00 | dark / liquid-glass · open calendar |
| 11:21.60 | dark / soft-glass · open calendar |
| 11:24.60 | Dark Liquid Glass frost 0 · open surface |
| 11:28.40 | Dark Liquid Glass frost 35 · open surface |
| 11:31.80 | Dark Liquid Glass frost 100 · open surface |
| 11:35.20 | Independent reduce transparency at frost 100 · open surface |

### 11:36.37 — 12 · Pagination and empty states

| Time | State/evidence |
|---|---|
| 11:36.97 | Light / Solid · initial examples |
| 11:40.97 | dark / soft-glass / frost 35 |

### 11:41.67 — 12 · Pagination and empty states

| Time | State/evidence |
|---|---|
| 11:42.07 | Light / Solid · initial examples |
| 11:43.27 | Last page; next disabled |
| 11:50.67 | Middle page 6 and gaps |
| 11:52.07 | Hover · 6 |
| 11:52.87 | Held pointer press |
| 11:54.87 | Keyboard focus |
| 11:56.67 | First/single page and narrow compact |
| 11:58.07 | Compact/start search cleared |
| 12:00.07 | Regular/center nested action |
| 12:02.87 | dark / solid / frost 35 |
| 12:07.07 | dark / liquid-glass / frost 35 |
| 12:11.07 | light / liquid-glass / frost 35 |
| 12:15.67 | light / soft-glass / frost 35 |
| 12:18.27 | Liquid Glass frost 0 |
| 12:21.07 | Continuous frost sweep / frost 100 |
| 12:23.27 | Reduce transparency on independently at frost 100 |
| 12:27.67 | Dark / Liquid Glass frost 35 |

### 12:29.70 — 13 · Dynamic loading

| Time | State/evidence |
|---|---|
| 12:30.50 | Light / Solid · initial examples |
| 12:33.30 | Loading actual mounted layout; controls inert |
| 12:35.50 | Text/list mutations during loading |
| 12:36.10 | Narrow wrapped loading layout |
| 12:37.50 | Input retained after loading |
| 12:40.50 | Hidden pseudo-element instrumentation probe; not visible motion evidence (Motion no-preference / CSS animation ov-skeleton-shimmer) |
| 12:44.90 | Hidden pseudo-element instrumentation probe; not visible motion evidence (Motion reduce / CSS animation none) |
| 12:48.70 | dark / solid / frost 35 |
| 12:51.70 | dark / liquid-glass / frost 35 |
| 12:54.90 | light / liquid-glass / frost 35 |
| 12:57.50 | light / soft-glass / frost 35 |
| 13:01.50 | Liquid Glass frost 0 |
| 13:04.90 | Continuous frost sweep / frost 100 |
| 13:07.30 | Reduce transparency on independently at frost 100 |
| 13:10.30 | Dark / Liquid Glass frost 35 |

### 13:12.33 — Loading surface comparisons

| Time | State/evidence |
|---|---|
| 13:15.93 | light / solid · mounted loading region |
| 13:19.33 | light / liquid-glass · mounted loading region |
| 13:25.93 | light / soft-glass · mounted loading region |
| 13:30.93 | dark / solid · mounted loading region |
| 13:35.73 | dark / liquid-glass · mounted loading region |
| 13:40.73 | dark / soft-glass · mounted loading region |
| 13:45.33 | Dark Liquid Glass frost 0 · open surface |
| 13:49.93 | Dark Liquid Glass frost 35 · open surface |
| 13:54.33 | Dark Liquid Glass frost 100 · open surface |
| 13:59.33 | Independent reduce transparency at frost 100 · open surface |

### 14:01.23 — Verified reduced motion comparison

| Time | State/evidence |
|---|---|
| 14:06.03 | no-preference · visible map CSS ov-skeleton-pulse |
| 14:13.63 | reduce · visible map CSS none |

