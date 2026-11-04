# Responsive scene controls and panel layout

Implemented and locally checked 2026-11-03 (Hong Kong), v0.1.0. This is browser/UI evidence, not physical-device or live-provider certification.

## Reproduced failure and inspected source

At **390×900**, opening a real player course then using the actual sheet handle's **End** key reproduced the old camera rail positions:

| Old action | Top | Bottom | Centre hit-test |
|---|---:|---:|---|
| Fit view | -140 | -96 | false |
| Top view | -88 | -44 | false |
| Tilt view | -36 | 8 | false |
| Zoom in | 16 | 60 | false (navigation overlay) |
| Zoom out | 68 | 112 | true |

This was measured in Chromium from actual DOM rectangles and `elementFromPoint`, not inferred from a screenshot. `OrthoOverlay.tsx` anchored a 252px vertical rail at `sheet-height + 14px`; an 86%-height sheet left too little space above it. The same anchor pushed the information pill through the navigation bar.

Source inspection also found:

1. The desktop branch of `BottomSheet` had no container ref; its sync effect returned on a null ref **before publishing desktop panel width**. Overlay placement could retain old mobile dimensions, including after rotation.
2. `InfoPill` consumed a prop named `css` but did not forward Emotion's generated `className`. Parent styling therefore never reached the real element. A 3,000-UTF-16-unit synthetic title produced an **882px-high** pill with top **-764px** in the first new regression run. Forwarding `className` makes wrapping, clamping and the compact container query actually apply.
3. Safe-area padding was added to an already inset-inclusive TopNav height without border-box sizing. The new simulated-notch test explicitly checks a **76px**, not 100px, navigation box.

The supplied policy AGENTS was reopened at inspected revision `206cb0c24d028651d804ec19942dc9791b499fdd` using page retrieval (this environment has no `browser.open`). Its relevant source-inspection, lightweight/safety, three-width screenshot and honest-check requirements were retained; no unrelated backend/account template was imported.

## Implemented behaviour

- Keep **Back**, **Camera controls / 相機控制** and **North** in a 44px target row below navigation, inside the scene width excluding a sidebar.
- Camera opens a labelled five-action palette: Fit / Top / Tilt / Zoom in / Zoom out. Buttons have visible translated text, accessible names and at least 44px targets. A repeated command gets a fresh nonce.
- Native Popover API provides modeless top-layer display, Escape, outside-pointer dismissal and focus restoration. On opening, focus moves explicitly to the first action. This is not a modal dialog and does not trap keyboard focus.
- If `showPopover` is unavailable, an explicit modeless fallback uses a body portal, keyboard/outside-pointer listeners, focus return and the same actions. It is not an extra package or a claimed old-browser polyfill certification. Browsers without container queries omit the nonessential hint rather than overlap controls.
- Palette portals unmount with the scene. Its fixed placement is not trapped by a container-query containing block. Source attribution remains visible below the scene controls when closed and inside the palette when open; it is wrapped, not truncated.
- `sheetStops` reserves **116px** beneath the measured navigation bar. Peek ≤ half ≤ full, all finite/nonnegative, even when short heights collapse several stops to the same physical position. This is a UI layout budget, not a course size restriction.
- A short landscape viewport (width ≥500px, height ≤500px) uses the existing sidebar pattern; regular phones/tablets retain the bottom sheet. Headers enter the panel scroll body on short layouts so long content cannot reduce the body to zero height.
- Both panel forms publish dimensions before paint and clear the six owned CSS variables on unmount. `ResizeObserver`, viewport resize/orientation and visualViewport resize/scroll track navigation size and visible bounds. TopNav and the panel account for visual viewport pan/shrink.
- The canvas width excludes the sidebar, and camera framing scales for narrow aspect ratios, so a short-landscape sidebar does not hide the scene's centre. Geometry, coordinate units and exported data are unchanged.
- Player headings and optional scene hints clamp visually to two lines. The full course name remains in state/DOM/backup; no field or stored data is shortened. Compact scene areas omit the hint, not the source credit.

## Regression evidence

- Production build: **18 files / 1512.3 kB / gzip 464.9 kB**, unchanged budget 2929.7 kB. `verify`, `check`, `audit:deps` and `git diff --check` pass; existing i18n Fast Refresh and upstream lottie eval warnings remain visible.
- **17** new DOM-free layout checks, total **369/369**. Covers ordered stops, measured navigation, empty/non-finite/negative input, excessive peek, short heights and visual viewport shrink.
- **27** new browser checks, total **188/188**. Existing 161 checks remain, including actual ground picking, exact 1MB JSON round-trip, private player snapshots, two real shared-storage tabs/locks, native beforeunload and 24 Leaflet zoom/remount cycles. No pageerror filtering was added.
- Native palette checks at **390/768/1440×900**: real hit tests, all five dispatches and repeated zoom, keyboard opening/initial focus/Escape/return, outside dismissal, Chinese language toggle, sheet keyboard stops and captured pointer drag, desktop width publication, unmount cleanup and unchanged private localStorage.
- Additional live DOM resize/rotation: **320×568, 390×568, 390×320, 844×390, 568×320**. Check full credit/trigger bounds, actual canvas/sidebar non-overlap, usable panel scrolling and hit-testable export. Camera controls are also exercised at these sizes.
- **Synthetic** safe-area insets: top24/bottom20/left8/right8, plus a **synthetic visualViewport** height400/offsetTop80 within a 390×568 layout. These exercise measured geometry and events; they are not a real notch/keyboard, browser chrome or device test.
- **Forced capability absence in Chromium** exercises the non-Popover branch with real DOM hit tests, dispatch, Escape/focus return and outside dismissal. This is not Safari/Firefox execution.

Screenshots are outside Git: `/home/user/artifacts/map3d-v0.1.0-overlay/` contains **50 current-suite screenshots plus one pre-fix reproduction** (`before-full-390.png`). Normal course/palette screenshots were opened at 390/768/1440; short portrait/landscape, simulated safe-area/visual viewport and fallback images were also inspected. Earlier course images were compared with the new panel/credit placement. This is an app-before/after comparison, not equivalence to GeoLibre/TopoExport. The test font still lacks some CJK/emoji glyphs; the long-title stress images are not typography certification.

All external provider requests in the full harness are mocked/aborted. The plain/neutral terrain shown is not evidence of working live map imagery. No runtime dependency, service proxy, deployment or remote CI run was introduced. Production audit remains **0**, full graph **12 moderate** under the unchanged policy; see `dependency-security.md`.

## Still open

Physical iOS/Android keyboard pan, pinch zoom/browser chrome, different safe-area values, VoiceOver/screen readers, real Safari/Firefox and legacy-browser behaviour need independent checks. The fallback and simulated viewport tests do not close those tasks. Extremely small visible viewports cannot fit every action and panel field at once; scrolling/collapsed stops are intentional. No unrestricted all-screen-size guarantee is made. Original GIS, partial-LoD2/CAD and reference-product/deployment limits remain in `STATUS.md`.
