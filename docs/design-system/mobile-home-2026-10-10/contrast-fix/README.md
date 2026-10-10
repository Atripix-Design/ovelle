# Hero contrast correction

Corrected October 10, 2026 in Figma. Existing hero layout, copy, photo assets, image transforms and positioning are unchanged.

The desktop hero workflow instance contained inverse foreground overrides despite its source using correct semantic text colors. Restored its source foreground paints for heading, field label, record names, metadata and summary. Selected chips retain inverse text on their blue surfaces.

Desktop and all eight mobile hero compositions now use the existing dark navy primitive token for copy over the unchanged bright coastal photograph, in both Light and Dark. Mobile scene counts and volunteer metadata now bind to text/secondary, so their foreground adapts to the dark card. The desktop photo caption uses the existing white primitive with a small shadow.

- [Desktop Light](desktop-light.png) / [Dark](desktop-dark.png)
- [Mobile Light](mobile-light.png) / [Dark](mobile-dark.png)
- Combined before/after: [desktop Light](desktop-light-comparison.png), [desktop Dark](desktop-dark-comparison.png), [mobile Dark](mobile-dark-comparison.png), [mobile Light](mobile-light-comparison.png)
- [Unchanged original geometry and image slots](geometry.json)

Inspected native Figma renders at 1440×920 and 390×699. No dimensions, positions, typography or image fills were edited. Public controls and scene instances retain their source links. Temporary capture frames were removed.

Existing React gallery regression passed: 21 source dimensions, action geometry/typography/states, Select/Dialog keyboard/focus, 96 exact SVGs, and native SVG geometry across 12 theme/material/frost settings. Gallery verified HTTP 200 at http://100.114.150.83:5174/components. These checks do not establish production mobile Home parity. This correction is Figma-only; browser/Electron implementation remains separate.
