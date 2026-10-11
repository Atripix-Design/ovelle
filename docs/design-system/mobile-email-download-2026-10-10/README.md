# Mobile email download — Figma first

Updated October 11, 2026 to match the user’s removal of the routine helper text beneath the email input. All seven states in both materials and their linked mobile Home/review instances now omit that hint. Validation and send-failure messages remain. Captures below reflect this revision.

The mobile download section now asks for an email address instead of offering operating-system choices. It uses linked public Ovelle Field and Button instances inside a native Ovelle / Email download link component.

- [Component family on 05 Components](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=246-8205)
- [Integrated mobile Home section](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=182-2490)
- [State review on the current Home sheet](https://www.figma.com/design/6jsC9SLa0LYsZKjJXxlY1K?node-id=248-4129)
- [390 px integration with FAQ and footer](home-integrated-context.png)
- [320 px integration](integrated-320.png)
- [Light/Dark and request states](states.png)

The native family has seven request states: Default, Focused, Sending, Sent, Invalid, Error and Disabled; each supports Solid and Liquid Glass. Light/Dark inherit Color modes. Source controls retain their hover, pressed, focus and material behavior. Native blur samples the backdrop in Glass; continuous frost and reduced-transparency consumer behavior remain implementation work.

Default copy: “Get Ovelle on your computer.” / “We’ll email you a download link to open on your computer.” Field: Email address. Action: Email me the link. Sent, validation and service-error examples retain the recipient and provide resend/retry actions.

Mobile download source variants 165:5322, 188:9504, 188:9560 and 188:9598 now contain linked instances of the new component. Both full mobile Home widths and existing download preview screens inherit the replacement. Six obsolete platform-switch hotspots were removed. Desktop download variants retain their platform choices.

The new family occupies its own horizontal column on 05 Components with variants arranged vertically. Home composition and its review frame remain on 01 Home. Hero backgrounds, three workflow sections and other Home content were not changed.

Planned delivery: Cloudflare email sending, from downloads@mail.ovelle.com. This address is recorded in native source descriptions rather than exposed as implementation detail in the user flow. No email has been sent or infrastructure configured. This task is the requested Figma design first; React export, API/props, manifest mapping, keyboard/email semantics, real sending, loading retention, reduced motion and website/Electron behavior remain pending implementation.

Visually inspected the actual 390 px Home section beside its FAQ and footer, the 320 px section, and linked Light/Dark, Sending, Sent, Invalid and Error examples. Input and action labels stay on one line; supporting prose wraps naturally. State examples are static Figma variants, not a verified submission prototype.

Structural audit: no OS-choice labels and no missing source references in either live mobile download section. See audit.json.

Existing component regression passed: 21 source dimensions, action geometry/typography/states, Select/Dialog keyboard/focus, 96 exact SVGs, and SVG geometry across 12 theme/material/frost settings. The first run was blocked because the gallery was stopped; restarting the unchanged gallery resolved it. Preview verified HTTP 200: http://100.114.150.83:5174/components. This is the existing component gallery, not an implemented email flow.
