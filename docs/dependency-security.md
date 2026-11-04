# Dependency security and repeatable browser gate

Current snapshot: 2026-11-03, Node **22.22.3**, npm **10.9.8**. These are npm advisory-database results, not a source-code/security certification.

## Supported lint-toolchain migration — completed locally

The unsupported ESLint 9 toolchain has been replaced with supported, peer-compatible releases. Inspected the [official ESLint 10 migration guide](https://github.com/eslint/eslint/blob/main/docs/src/use/migrate-to-10.0.0.md), npm package metadata and installed plugin/config implementations; tested the actual flat config, not just declared versions.

| Development package | Previous installed | Current locked |
|---|---|---|
| ESLint | 9.39.5 | 10.14.0 |
| @eslint/js | 9.39.5 | 10.0.1 |
| typescript-eslint | 8.24.1 | 8.72.1 |
| eslint-plugin-react-hooks | 5.1.0 | 7.1.1 |
| eslint-plugin-react-refresh | 0.4.19 | 0.5.7 |
| globals | 15.x | 17.14.0 |

- Package engines now match ESLint 10: Node `^20.19.0 || ^22.13.0 || >=24`; local verification uses **22.22.3**, CI selects current Node 22. TypeScript stays **5.7.3**, within the parser's supported `>=4.8.4 <6.1.0` range. No runtime dependency or React Compiler transform was added.
- Flat config now uses ESLint's native `defineConfig`. Full new Hooks recommended rules remain enabled; no new rule suppression, weakened severity or compiler-rule opt-out was added. Existing intentional loose-payload typing, unused-variable warnings and Fast Refresh policy are unchanged.
- Fixed **8 new error diagnostics** across six files: commit-only import refs/layout invalidation; guarded sheet command adjustment with one DOM-sync effect; derived legacy bounds; declarative OrbitControls distance props; request-tagged asynchronous ground textures and memoized/disposed hillshade; store-event-driven external-load restoration and guarded pre-commit player navigation. These are lint/lifecycle changes, not eight claimed security fixes.
- `npm run verify:lint` runs **13 real ESLint API contract checks**. Negative fixtures must still report conditional hooks, render ref writes, hook-value mutation, synchronous effect resets, missing dependencies, Node/browser global mistakes and ESLint 10's unassigned-variable rule. Positive fixtures and ignored generated/dependency paths are checked too. The command is included in `npm run check` and therefore CI.
- An initial simultaneous in-place major update hit npm's stale peer graph. Updating the compatible plugins under ESLint 9 first, then the core major, resolved it without `--force` or `--legacy-peer-deps`. Subsequent **clean `npm ci --no-audit --no-fund` and `npm ls --all` pass**, with no unsupported-ESLint/dependency warning or invalid peers.

**This migration does not clear the minimatch advisory.** Current supported upstream ranges are ESLint `^10.2.6`, config-array `^10.2.4` and typescript-estree `^10.2.2`; the resulting lock has only **minimatch 10.2.6**. Those ranges cannot select the advisory's patched **11.0.1**. Production remains **0**, full graph remains **12 moderate / 0 high / 0 critical / 0 low**. The remaining work is an upstream-compatible patched dependency path, not the now-completed ESLint major migration.

## Earlier compatible security repairs (historical)

The previous lock reported **21 vulnerable dependency nodes: 11 high, 7 moderate, 3 low**. Inspected `npm audit --json`, then applied compatible `npm audit fix` and a targeted `npm update picomatch`. No `--force`, security suppression or cross-major override was used. Major app libraries (React 19, Three 0.173, Fiber 9 and Drei 10) were not migrated.

Selected lockfile repairs:

| Package | Before | After |
|---|---|---|
| Vite | 6.1.1 | 6.4.5 |
| ESLint | 9.21.0 | 9.39.5 |
| esbuild | 0.24.2 | 0.25.12 (Vite's compatible transitive range) |
| Rollup | 4.34.8 | 4.67.4 |
| PostCSS | 8.5.3 | 8.5.32 |
| fflate | 0.8.2 / nested 0.6.10 | 0.8.3 / nested 0.6.11 |
| picomatch | 2.3.1 | 2.3.2 |

Babel, browserslist, source-map-js, flatted, YAML, nanoid and affected lint helpers were also patched within dependency ranges. Package minimums for Vite/ESLint now reflect the tested patched versions; `npm ci` uses the checked-in lock.

## Current result and the exception we have not hidden

- Production graph, `npm audit --omit=dev`: **0 reported vulnerabilities**.
- Full graph: **12 moderate**, **0 high / critical / low**.
- The 12 reports are minimatch plus its dependent lint-tool nodes, not 12 unrelated newly discovered defects. `minimatch` **10.2.6** remains in the development toolchain after the supported major migration.
- Inspected [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): it reports pattern preprocessing amplification, affected `<11.0.1`, patched `11.0.1`. Its described trigger uses attacker-supplied glob patterns with optimization level ≥2. The app does not expose its linter or arbitrary glob-pattern evaluation as a service.
- No blanket `minimatch: 11` override: it is outside all three reviewed upstream dependency ranges. An audit-proposed downgrade/force fix is not a reviewed compatible repair. ESLint 10 migration is complete, but the reports remain visible pending supported upstream changes. Do not run lint over untrusted project/config/pattern inputs in a privileged environment.

`npm run audit:deps` enforces **no reported production vulnerabilities at low or higher**, plus **no high/critical in the full graph**. It intentionally still prints the known development-only moderate reports; a zero command exit is not a claim of zero total advisories. Registry/advisory lookup failure fails the gate, rather than being treated as clean. Audit data can change after this snapshot.

## Dev-server protections and real checks

`vite.config.ts` no longer sets `allowedHosts: true`. Localhost/IP access remains supported, and the `.e2b.app` suffix is explicitly accepted for Arena previews. This is development configuration, not authentication or a reason to expose Vite as a production web server.

The real local browser harness checks:

1. `Host: attacker.invalid` → **403**; `Host: map3d-smoke.e2b.app` → **200**.
2. A random, temporary `.env.map3d-smoke-*` **fake canary**, created with exclusive file creation and removed in `finally`, is denied for direct, `?raw`, `?raw??` and `/@fs` requests. No real credentials/environment file is inspected or printed.

These host/file checks run when `UI_BASE_URL` is loopback; they deliberately do not rewrite the Host header through a remote preview proxy. They test Vite, not the deployed CDN's response policy.

## Browser/CI reproduction

```sh
npm ci
npm run audit:deps
npm run verify
npm run check
npx playwright-core install --with-deps chromium
npm run verify:ui:isolated
```

`verify:ui:isolated` creates the real Vite server via its API on port 5174, imports the browser suite, then closes the server in `finally`. `UI_TEST_PORT` can select another port; a busy/invalid port fails instead of accidentally testing an unrelated server. No polling shell, background orphan process or extra runtime dependency is needed. For an already running dev server, `npm run verify:ui` still works; set `UI_BASE_URL` if needed. Browser binaries may alternatively be supplied through `CHROMIUM_EXECUTABLE` and JSON `CHROMIUM_ARGS`.

**44 Chromium checks passed locally**: the original 30 GIS/GPX/export checks, 12 dialog-accessibility checks across 390/768/1440 and 2 dev-server protection checks. New dialog checks cover native top-layer/inert background, visible keyboard focus, Tab/Shift+Tab cycling, Escape/close-button focus restoration, backdrop close and immediate reopening. An initial native-only Tab test failed (Chromium moved focus out of the content); explicit edge cycling fixed it, and the suite was rerun. Screenshots of the export dialog at all three widths were opened and inspected. They show mocked external imagery and a synthetic GPX track, not live-provider certification.

GitHub Actions now includes the dependency gate, Chromium install, isolated browser suite and seven-day screenshot artifacts, with `contents: read` permissions. **The equivalent commands passed locally; the updated workflow has not been run remotely in this turn.** The sandbox uses a temporary npm-distributed Chromium 153 plus its shared libraries because browser CDN downloads/system browser libraries are not available here; this package/binary is not committed or added to app dependencies.

Screenshots default to `node_modules/.cache/ui-artifacts/` (ignored), or `UI_ARTIFACT_DIR`. This session's evidence is `/home/user/artifacts/map3d-v0.1.0-security/{gis,gpx,export}-{390,768,1440}.png`.

Still unverified: real screen-reader/VoiceOver behaviour, Safari/Firefox keyboard differences and physical iOS/Android interaction. The dialog uses modern native `HTMLDialogElement.showModal()` support; no legacy-browser dialog polyfill is bundled. Live GIS sources, the two bulk-dataset rendering pathways, production deployment and independent CAD application testing retain their previous limits.

## Later application-flow extension

The same harness now passes **83 browser checks**, including local GeoJSON, actual ground placement/deletion and course/clipboard/player flows, plus **262** DOM-free checks. See `local-data-and-sharing.md` for the current application-flow evidence and privacy/input contracts; the dependency advisory exception described above is unchanged.


## Draft-reliability extension — 2026-11-03

The current superset passes **281 DOM-free / 113 Chromium checks**; the draft/storage changes add no runtime dependency and do not remove the minimatch exception. This round's `npm run audit:deps` still reports production **0**, full graph **12 moderate / 0 high / 0 critical**. See [completed and remaining work](STATUS.md), including the lint-toolchain migration that was pending at that stage (now completed above). No remote Actions or deployment was executed.


## Bounded-edit continuation — 2026-11-03

Current local superset: **325 DOM-free / 128 Chromium checks**, with no new runtime dependency. Audit policy and exception are unchanged: production **0**, full graph **12 moderate / 0 high / 0 critical**. New editor/export validation is an application data-integrity boundary, not authorization against devtools manipulation; raw recovery files and backups can contain private notes. See `course-budgets.md` / `STATUS.md`.


## Cross-tab / lifecycle continuation — 2026-11-03

Latest local superset: **352 DOM-free / 161 Chromium checks**, with no new runtime dependency. Web Locks are cooperative same-origin data-integrity coordination, not authentication or atomic protection against writers bypassing the lock. No-lock fallback warns to use one editing tab; native beforeunload is not guaranteed mobile recovery. Production audit stays **0**, full graph **12 moderate / 0 high / 0 critical**. See `draft-concurrency.md` / `STATUS.md`; remote CI/deployment and physical devices are not claimed.


## Post-migration regression evidence — 2026-11-03

After clean installation: **352/352 DOM-free**, **13/13 lint contracts**, release checks, typecheck, repository/build guards, full dependency-tree validation and the unchanged audit policy pass. Full isolated Chromium rerun: **161/161**, including actual two-tab writes, file-read races, player/private snapshots, external area loads and 24 Leaflet zoom/remount cycles; strict pageerror checks remain. Build: **18 files / 1507.1 kB / gzip 463.1 kB**, budget 2929.7 kB. One pre-existing i18n Fast Refresh warning and upstream lottie eval warning remain visible.

**36** mocked-network screenshots: `/home/user/artifacts/map3d-v0.1.0-toolchain/`. Course-panel images at 390/768/1440 were opened and compared with the previous round; no migration layout regression was observed. At that stage the expanded-mobile top scene hint could be clipped; the subsequent responsive-scene continuation fixes the reproduced path, without claiming all-device certification. External imagery is mocked, not a live supplier test. Remote CI/deployment, reference-product comparison and physical devices remain unverified.


## Responsive-scene continuation — 2026-11-03

Responsive checkpoint: **369 DOM-free / 13 lint-contract / 188 Chromium checks**. Source changes add no package/runtime dependency and retain the full Hooks recommended rules, strict pageerror checks and dependency policy. Native camera popover has an explicit modeless fallback with forced-capability-absence coverage; that does not constitute testing an old or non-Chromium browser. Production audit **0**, full graph **12 moderate / 0 high / 0 critical**. See `responsive-scene.md` / `STATUS.md` for actual hit tests, synthetic viewport boundaries and screenshot evidence; no deployment or remote CI.


## Courtyard continuation — 2026-11-03

Courtyard checkpoint: **460 DOM-free / 13 lint-contract / 200 Chromium checks**. No new dependency, lockfile change or security exception. Exact-topology validation has visible per-object complexity rejection (2,048 source coordinates / 65 assembled rings) rather than ring truncation/filled-hole fallback; this is not a DoS-proof or device-performance certification. Audit remains **production0/full12moderate/0high/0critical**; the upstream compatible minimatch patch path is still outstanding. See `building-courtyards.md` / `STATUS.md`.


## Ring-island continuation — 2026-11-03

Island checkpoint: **610 DOM-free / 13 lint-contract / 212 Chromium PASS**. No package/lockfile change or new dependency. Source complexity now explicitly counts raw member entries before deduplication; strict nearest-parent topology refuses crossings/touches and invalid role nesting rather than silently filling holes. This is not arbitrary-input DoS or device certification. Production audit0/full12moderate/0high/0critical remain; the supported upstream minimatch fix is still pending. See `building-islands.md` / `STATUS.md`.


## Skillion continuation — 2026-11-03

Current full gates: **663 DOM-free /13 lint-contract /224 Chromium PASS**. No new package/lockfile change. Non-finite or ambiguous direction tags do not create NaN vertices or invented directed slopes; positive-rise missing-direction fallback is counted visibly. This is input validation, not a security certification. Audit remains production0/full12moderate/0high/0critical; supported minimatch remediation still depends on upstream. See `skillion-roofs.md` / `STATUS.md`.


## Elevation continuation — 2026-11-03

**762 DOM-free /13 lint-contract /242 Chromium PASS** (+99/+18), no additional dependency. Reject malformed vertical metadata and roof-overlapping occupied intervals atomically; keep claimed outer suppression to prevent a rejected relation becoming ground-filled. This is bounded input validation, not security certification. Production audit0 / full12moderate / 0high / 0critical; no incompatible override or advisory suppression. See `building-elevation.md` / `STATUS.md`.


## Export visibility continuation — 2026-11-03

**812 DOM-free /13 lint-contract /278 Chromium PASS** (+50/+36), no new dependency. Hierarchy snapshots prune hidden Object3D descendants/ancestors consistently across encoders; this is an export-content rule, NOT confidentiality/access control (source data remains in memory). No GPU/material/camera clipping or atomic geometry-buffer snapshot claim. Production audit0/full12moderate/0high/0critical exception remains; no override/suppression. See `export-visibility.md` / `STATUS.md`.


## Pyramidal continuation — 2026-11-03

**925 DOM-free /13 lint-contract /296 Chromium PASS** (+113/+18), no dependency changes. Convex/no-hole/tagged-rise fan subset; unsupported cases retain validated hole-aware flat geometry and visible counts, not unchecked cross-hole triangles or invented angle inference. This is bounded geometry validation, not security certification. Production0/full12moderate/0high/0critical retained; no incompatible override/suppression. See `pyramidal-roofs.md` / `STATUS.md`.


## Production CSP continuation — 2026-11-03

**966 DOM-free /13 lint-contract /296 dev Chromium +27 built-production CSP PASS** (+41 program, +27 production browser). Enforced hosting header, same-source preview headers and native browser attack probes, zero positive-flow violations, actual GIS/GPX/course/player and CAD/GLB/STL downloads. Script self-only without inline/eval/blob/data exceptions; style-only inline is explicit for Emotion/Leaflet; exact provider origins and documented Arena framing exception. No new dependencies or report collector. Not a nonce/hash strict CSP, XSS certification or deployed-header/live-provider evidence. Final audit remains production0/full12moderate/0high/0critical, with no override/suppression. See [policy, reproduction and outstanding limits](content-security-policy.md).


## GPX layout continuation — 2026-11-03

**966 program /13 lint /317 dev Chromium +27 built-production CSP PASS**. No new dependency/network origin/header exception. In-flow help, native translated disclosure, labelled44px range controls/value descriptions, scrolling/footer clearance and changed-base STL readback; retain full-name wrapping and parameter state. Expanded settings still overlay the model; collapse is explicit, not account access control. Production CSP normal paths still zero violations/pageerrors. Prod audit0/full12moderate unchanged. See `gpx-model-layout.md` / `STATUS.md`.


## GPX import safety continuation — 2026-11-03

**1032 program /13 lint /338 dev Chromium +30 built-production CSP PASS** (+66/+21/+3). No dependency or CSP origin/exception added. Strict full-point validation before sampling; bounded10MB UTF-8 bytes and cancellable latest-only file reads; native XML subset rejects DTD and disconnected tracks. Missing source elevations use explicit whole-model flat fallback; provider null/invalid values fail/fallback rather than fabricate0m. No upload of the file itself; user-triggered DEM lookup still sends sampled coordinates to existing public services. Prod audit0/full12moderate unchanged. Not XSD completeness, live-provider/security certification, physical-browser/CAD or production deployment. See `gpx-import-safety.md`.

## Current native-footer / restored GIS refresh — 2026-11-03

Fresh `npm ci --no-audit --no-fund`; actual disk was at the GPX milestone, so reconstructed collection/guidance tests are counted against that baseline, not prior chat reports. **1081 program/13 lint/368 dev +36 built-production CSP PASS** in one complete isolated run. Scale uses public native same-corner stacking; no new app dependency, observer, origin/CSP relaxation or data flow. Temporary Chromium153.0.0 and Noto CJK font stay in ignored cache/tmp, not root manifests or runtime assets. Both full stages use the font environment. Build18files/1531.1kB/gzip472.1 under unchanged2929.7kB cap; audit prod0/full12moderate/0high/0critical unchanged. CI20min keeps all checks/no retry/skip. Not live/device/deployed security certification. See `map-footer-layout.md`.

## Hipped roof refresh — 2026-11-03

No app dependency, backend, origin or CSP relaxation. **1172 program/13 lint/386 dev+39 production-CSP PASS**; full Chromium stages ran together (exit0/625059ms), including native Overpass→WebGL→DXF hipped flow. Production audit0/full12moderate/0high/0critical remain separate. Build18files/1533.8kB/gzip473.0 under unchanged2929.7kB cap. Test-only Chromium153/NotoCJK and142mock PNGs remain outside runtime/Git. Pinned OSM2World MIT LICENSE.txt freshly confirmed; attribution retained. No deployed/live/device security certification. See `hipped-roofs.md`.

## Explicit hipped ridge refresh — 2026-11-03

Clean npmci and npmls passed. No new root/runtime dependency, CSP origin or backend. **1260 program/13 lint/404 dev+42 production-CSP PASS**; complete isolated browser run exit0/898315ms, native ridge/short-axis CAD under unchanged CSP. Build18files/1534.0kB/gzip473.0 under original2929.7kB cap. Auditproduction0/full12moderate/0high/0critical. Temporary npm-cache Chromium153/AL2023 libraries/NotoCJK and148mock PNGs do not ship. Removed single-process/insecure-content from temporary supplied-browser arguments after a launcher SIGSEGV; final full run passes with web security enabled, no skips/pageerror filters. See `hipped-ridge-direction.md`. Not deployed/live security certification.

## Hipped boundary-node refresh — 2026-11-03

No new app/runtime dependency, backend or CSP origin. **1342program/13lint/422dev+45production-CSP PASS**, entire isolated browser exit0/863999ms with no skipped prior cases. Build18files/1535.1kB/gzip473.5 under unchanged2929.7kB cap. Auditprod0/full12moderate/0high/0critical.154mock PNGs and test-only Chromium153/AL2023/NotoCJK remain outside runtime/Git. A temporary supplied-browser startup SIGSEGV was resolved by minimal launcher flags without single-process/in-process-gpu/web-security disable; final complete run passes. No deployed/live/device security certification. See `hipped-collinear-nodes.md`.

## CAD ownership/install integrity refresh — 2026-11-03

Runtime dxf-writer pinned EXACT1.18.4; small Drawing/Layer ownership/null-plot-style patch applies in root postinstall with exact original/patched SHA256 guards, idempotent and fail-closed on drift.13positive/negative patch contracts added tocheck; directbuild/dev verify patch too. Actual clean npmci/postinstall/npmls succeeded. No new application dependency; test-only pinned Python3.11/ezdxf1.4.5 and supporting packages stay outside bundle/backend. npm auditprod0/full12moderate remain JS-graph results, not Python-toolchain certification.1342program/13lint/422dev+45production rerun; independent14fixtures/9negative controls/51real downloads pass raw references before loader/audit. Build18files/1535.2kB/gzip473.5 under2929.7cap. No CSP origin change or deployed security claim; see `cad-conformance.md`.


## DEM integrity follow-up — 2026-11-03

No dependency/lockfile/runtime origin change for this task. Shared existing numeric bounds and whole-grid source validation, with mocked native UI/production fallback gates.1400program/13lint/13patch/437dev+48production and independent14fixtures/9negative/57downloads pass. Build18files/1536.0kB/gzip473.7 under original cap; refreshed npm audit prod0/full12moderate, same disclosed exception, not Python-toolchain certification. See `terrain-elevation-integrity.md`.


## In-scene recovery follow-up — 2026-11-03

No runtime dependency/lockfile/origin/header change for this task.1427program/13lint/13patch/455dev+66built-CSP and independent14fixtures/9negative/63downloads pass. Build18files/1537.9kB/gzip474.3; unchanged2929.7cap. RefreshedJS auditprod0/full12moderate, not Python security certification. Native requests/retry gates reuse existing clients/cache; no proxy/backend/auth introduced. See `scene-data-recovery.md`.
