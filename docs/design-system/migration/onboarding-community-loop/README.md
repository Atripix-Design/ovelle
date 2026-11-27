# First-use onboarding · The Community Loop

Design source is the Penpot page **10 Onboarding — Community Loop** in Ovelle Website — Manual Design Workspace. [Open the first board](https://design.penpot.app/?screen=viewer&file-id=51f2d744-23b9-8138-8008-f3bdd65662b2&page-id=cb37fa3a-905d-809a-8009-024a1ada5579&section=interactions&frame-id=cb37fa3a-905d-809a-8009-024a4a306892).

- The flow appears only after a signed-in user has a successful empty-organization lookup. Returning users take the existing workspace path. Signing in and verifying the account still happen outside this UI.
- Step 1 collects organization name, contact email and the first location’s street address. Step 2 asks for the first program. The device supplies the IANA time zone. Step 3 reviews the details, including the detected time zone, and requires deliberate confirmation. The existing first-location display name stores the formatted address.
- Pressing Continue shows an inline, associated message and focuses the first invalid field. Back preserves entered data. The organization email can differ from the sign-in email. For address suggestions, Arrow keys select a result, Enter fills the entire address, and Escape dismisses the list. The form still accepts manual entry if no result appears or the service fails. Only the debounced address query goes to the public Photon service. The public endpoint is best-effort and may limit traffic. No device coordinates, email, organization name, or session token are sent.
- A lost create response locks the reviewed values and reuses the same command key. A confirmed create followed by a failed list read offers a list refresh, not another create. Backend passkey enforcement and the idempotency receipt remain authoritative.
- The wide view clips an editable dotted wave derived from the site footer’s tide inside its right half. The art is decorative, so the narrow layout removes it. The renderer reuses the shared Field and Button implementations. Penpot holds linked field, button and icon instances with onboarding-specific layout and material overrides. No public component API or canonical source reference was replaced.

## UX review

Persistent labels, visible focus, contrast and field errors take priority over the soft inset styling. The preview does not claim accessibility conformance. Follow-up usability testing should ask first-time coordinators whether “first program” and “first location” are immediately clear and whether the device time zone is a sensible default for their organization.

Criteria used: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) and [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Verification

Run browser checks against the running Electron renderer with a fixture bridge. This exercises real rendering and interactions without using real account data or sending organization creation commands to a live service.

```sh
OVELLE_DESKTOP_PREVIEW_URL=http://127.0.0.1:5175/ node scripts/check-organization-onboarding.mjs
OVELLE_DESKTOP_PREVIEW_URL=http://127.0.0.1:5175/ npm run check:live-workflow-ui
```

The focused check can capture 1920 × 1080 evidence with `OVELLE_ONBOARDING_CAPTURES`. The prior screen showed empty selectors beneath all five setup fields. The new layout closes that dead end and verifies widths from 320 to 1920 CSS pixels, keyboard continuation, field validation, safe replay and the transition to the workspace.
