# Mobile hero Figma source handoff

The current source is documented in the [direct reference match](../mobile-home-2026-10-10/reference-match/README.md), with native node IDs, source assets, normalized geometry, variant evidence and information preservation audit. Earlier hero-revision captures are historical and superseded.

The hero is now 390×699, with a 364×172 record card and a 390×307 open sheet. The 320 px composition uses the native Compact scene. Buttons, selector, navigation and status remain linked public components. Exact source photo-only regions and avatar are retained; reconstructed imagery fills portions hidden by source UI.

Volunteer metadata is centered horizontally between its dividers and vertically with Match in both widths and both material variants. Names and controls remain single-line. All three complete workflow sections preserve their content at both widths.

Source additions include Regular/Compact variants in scene set 199:7256, sheet set 201:6782, Hero sizing variants for public navigation and Filter Chip, and three exact Lucide native icon components on 05 Components. These additions are Figma-only; React exports, props, package manifest mappings and consumer parity remain pending. Existing React fidelity checks passed independently.

See project-root design-qa.md for combined source/render comparisons, iteration history and native-render limitations.
