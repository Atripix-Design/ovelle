# Desktop proportion revision — 2026-10-09

This revision supersedes the section dimensions and composition described in README.md. Existing photos and public component source definitions are unchanged.

- Connected workspace (139:479): 1440 × 800, reduced from 1440 × 1032. A 132px horizontal label/introduction, a full-width 360px panoramic photograph, and a 308px strip containing the three native 360 × 260 FeatureCard instances.
- Desktop companion (149:2256): 1440 × 560, reduced from 1440 × 720. The centered introduction matches the surrounding Home headings. A 720 × 320 photograph reaches the left edge beside a native 360 × 260 evidence card and its example-record note. The photograph has landscape proportions instead of occupying an entire vertical column.
- The evidence instance wrapper now also uses its native 360px width. There is no wider wrapper with a fixed-width inner appearance.
- The two sections together are 392px shorter. The Home composition now measures 1440 × 4332.

Native image crop transforms preserve faces in the shallower slots. Both use their original image hashes. Riverside crop: [[1,0,0],[0,0.375,0.21]]. Companion crop: [[1,0,0],[0,0.6666666666666666,0.025]]. These transforms select a portion of the original content photographs; no flattened UI is used.

Final section captures: connected-desktop-v2-figma.png and companion-desktop-v2-figma.png. Full-page context capture: home-desktop-v2-figma.png. Visually inspected the sections at desktop width and within the complete Home page. Geometry validation confirmed the 800px/560px section bounds, 360px/320px photo heights, seven unchanged public source links, and zero detached public component roots. No new component or variant was needed. This revision changes Figma composition only; React app implementation and runtime parity checks are outside this deliverable.
