# Mobile Home Figma reference QA

Scope: editable native Figma design matched to the user's attached generated board. This is Figma render QA, not a browser implementation or real-device accessibility acceptance.

**Findings**

No remaining actionable P0/P1/P2 findings in the inspected native mobile composition. The last alignment finding is resolved: volunteer metadata and its dividers share both center axes in Regular and Compact, Solid and Liquid Glass, without wrapping the organization or controls.

**Evidence and normalization**

- Visual truth: /home/jeremy-mathew/.codex/attachments/ebbb5751-f8d2-4143-a83c-f6738de63557/codex-clipboard-a2861204-1d0f-42f8-b4ac-ab0dfad7b958.png.
- Source: 1536×1024 board; closed crop (239,78)–(719,938), open crop (818,78)–(1298,938), each 480×860. Normalize by 390/480 to 390×699.
- Implementation: docs/design-system/mobile-home-2026-10-10/reference-match/implementation-closed.png and implementation-open.png, 390×699, Light, Partners selected; implementation-320.png is 320×574.
- CSS size/deviceScaleFactor: not applicable to native Figma. Figma exports use one pixel per design unit; source density normalized as above. Board captions and surrounding whitespace excluded.
- Full combined comparisons: [closed](docs/design-system/mobile-home-2026-10-10/reference-match/comparison-closed-final.png), [open](docs/design-system/mobile-home-2026-10-10/reference-match/comparison-open-final.png).
- Focused combined comparisons: [record](docs/design-system/mobile-home-2026-10-10/reference-match/comparison-closed-detail.png), [sheet](docs/design-system/mobile-home-2026-10-10/reference-match/comparison-open-detail.png).

**Comparison history**

1. P1 region proportions, CTA placement and photo crop differed from the supplied board. Resized the navigation, copy, buttons, hero and card. Evidence: comparison-before.png → comparison-closed-1.png.
2. P2 internal record and open-sheet composition drift: separated organization context and volunteer count, restored the source avatar, added divider columns, resized native chips and sheet rows, and aligned labels/icons. Evidence: comparison-closed-1.png / comparison-open-1.png → comparison-closed-2.png / comparison-open-2.png.
3. P2 source chip labels and background layering: restored component-property references on cloned native variants, preserved source-set ownership, corrected absolute photo placement and patch feathering. Evidence: comparison-closed-2.png / comparison-open-2.png → comparison-closed-3.png / comparison-open-3.png and final comparisons.
4. P2 volunteer metadata was off-center within its divider column. Centered the separators around the actual metadata slot and on the record's vertical axis, preserving single-line names. Final post-fix closed/detail captures and the 320 px render were opened and inspected. Exact center measurements are recorded in reference-match/audit.json.

All comparison filenames above are relative to docs/design-system/mobile-home-2026-10-10/reference-match.

**Required fidelity surfaces**

- Typography: native Inter uses 36/40 headline typography, 16/22 supporting copy, and 14/20 CTA labels at 390. Organization/status/count controls remain one line at both widths. Source AI raster lettering has small optical differences from real font rendering; P3 accepted for native editability.
- Spacing/layout: hero, sheet, CTA and card regions now follow normalized source geometry; metadata is centered in both widths. Native organization text requires a slightly different column boundary from the raster reference, with consistent column centers and intact information.
- Colors/tokens: existing Ovelle foreground and blue action tokens retained; sheet selected/subtle tones match the reference roles. Native glass, shadows and scrim have minor P3 optical differences.
- Image quality: exact visible photo-only regions and source avatar retained, with reconstructed imagery only where original UI occluded the photo. Background layers preserve horizon and foreground placement. Missing photo detail cannot be recovered exactly; small sky/patch transitions are P3 limitations.
- Copy/content: all three complete scroll sections have identical content at 390 and 320. Hero retains count, name, category, volunteer count, status and section link. Removed only the requested mobile demo row.

**Open questions and test limits**

None needed for this Figma correction. Native prototype destination/hit geometry was inspected; focus trapping, Escape, loading behavior, continuous frost, reduced transparency, enlarged text and website/Electron behavior remain implementation checks. No production parity claim.

**Implementation checklist**

- Native geometry, source assets, metadata centering and responsive single-line controls: completed.
- Complete workflow information and linked sources: audited.
- Existing component regression: passed, 21 source dimensions and 96 exact SVG assets; does not establish mobile Home parity.
- Future React/API/manifest implementation and consumer accessibility verification: pending separate code work.

**Follow-up polish**

P3: raster-reference font optics, native icon stroke/shape differences, reconstructed occluded photo detail, and glass/scrim optical tuning. These do not change information or interaction meaning.

final result: passed
