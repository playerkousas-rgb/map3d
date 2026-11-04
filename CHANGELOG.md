# Changelog

## 0.1.0 — 2026-11-02

- 2026-11-04: Complete building/GPX model-view operation: auto-fit actual world-space visible/exportable model bounds within both FOVs, native44px keyboard Fit/Top/Zoom controls, damping-safe repeatable reset and finite zoom/clip limits. Fit reveals the GPX model by collapsing settings without losing parameters; short-screen toolbar stays clear of settings and Back/Export. Camera never changes print/export geometry or the course/player camera store.1786program/521dev+120built-CSP,12byte-identical actual STL pairs and17CADfixtures/9negative/63DXFs pass after final fixes; see docs/model-camera-controls.md. No new dependency/provider/proxy/backend/CI-timeout change or deployment.

- 2026-11-04: Fix gabled/skillion roof:levels=0 falling through to angle/default rise. Keep the APP's height>levels>angle priority, missing/invalid distinction, capped positive estimates and floor-level fallback; genuine-zero surfaces, total/eaves/min_height and warning counts now agree in both scenes and metric DXF.1716program/491dev+90built-CSP;17CADfixtures/9negative/63browser-download proof, including pre-fix failures and independently flat24/26m roofs (`docs/zero-roof-levels.md`). No new dependency/provider/workflow budget/proxy/backend or deployment.

- Hipped rectangular roofs now derive preliminary rise from valid roof:angle using source-inspected maximum vertex-to-finite-ridge distance, not a guessed half-width. Height/levels priority, zero, total/min-height/clamps, direction and source-node guards retained in both scenes/DXF; geometry-resolved metadata does not alter OSM tags. Updated bilingual fallback.1622program/479dev+87production-CSP and15CADfixtures/9negative/63actual-download proof; see docs/hipped-angle.md for separate final-focused runs and failures. CI workload redistributes complete production CSP into existing10min CAD job after same-run build/dev artifacts; check20min unchanged, local default retains both stages. Unreliable browser overlap removed, not masked with retries or longer timeouts.

- Strict, bounded browser-direct place-search response/coordinate/bbox validation; corrupted results cannot move maps or become cached empty successes. Actual queue-reserved request starts, cancelable waiting/fetch/body and generation guards now cover clear/edit/map interaction/mode/view/player/unmount, including transports ignoring cancellation. Existing explicit-submit/mobile/cache/attribution retained;1499program/473dev+84production-CSP and63independently audited browser DXFs pass. New-only isolated search matrix retains all old cases and exact CSP without increasing CI timeout; remote runtime remains unverified. Public Nominatim aggregate-rate/informed-service-choice/dynamic-switch policy obligations remain explicit release blockers (`docs/place-search-safety.md`), not a new provider/proxy or deployment.

- GeoLibre-referenced Horn hillshade (315°/45°) and 10 m mesh-aligned contours, with scene toggles and source licence notices.
- Shared OSM gabled-roof builder in both building scenes; roof-inclusive height semantics and orientation support.
- Library-based R2010/3DFACE DXF export, world-transform preservation, legacy map and GPX miniature unit corrections.
- Browser-direct GIS catalogue: ten datasets across seven providers; exclusive basemaps, GeoJSON overlays, provenance and retry. WorldPop/HydroRIVERS explicitly download-only.
- Visible export state, duplicate-request protection, delayed blob URL cleanup and modal-timer cleanup.
- No hidden 3D scene behind the front page; local scene lighting replaces optional remote HDR downloads. GPX geometry resources disposed on replacement; camera fit now accounts for narrow mobile aspect ratios.
- Accessible browser zoom, language metadata, heading/focus/reduced-motion improvements and responsive source controls.
- Original versioned PNG/ICO artwork, manifest/OG metadata and automated release-asset contracts. No offline-cache/service-worker claim.
- Expanded DOM-free tests and optional three-width real-browser smoke tests. See `docs/APP_AUDIT.md` for evidence, remaining advisories and unverified production/device behaviour.

### Continuation — security and keyboard interaction

- Compatible dependency repairs: Vite 6.4.5 / ESLint 9.39.5 minimums, patched build/archive dependencies and lockfile. Production audit 0; full audit 12 moderate / 0 high/critical, with minimatch exception documented rather than suppressed.
- Dev-server host check restricted to localhost/IPs and Arena preview suffix; local tests verify unknown-host rejection and fake `.env` direct/raw/@fs denial.
- Named native export/warning dialogs: inert background, Tab/Shift+Tab cycling, visible focus, Escape/backdrop/close-button dismissal and opener restoration. No stale animation timers.
- Isolated Vite/Chromium test runner; 44 local browser checks. CI adds dependency policy, browser suite and screenshots. Remote workflow/device/screen-reader verification remains pending.

### Continuation — local data and course/share completion

- Browser-only local GeoJSON import with bounded stream/CRS/geometry validation, safe replacement, explicit fit and attribution cleanup. No new runtime dependency; raw raster/Shapefile and population analysis remain unsupported.
- Bounded course files and share-token expansion; invalid coordinates, duplicate IDs and excessive fields reject without silent control loss.
- New player links omit planner-only notes. Backups retain them; old links cannot be revoked.
- Same-document/fresh player links, invalid-link recovery and planner course/area restoration; read-only guards cover all course mutation entry points.
- Separate keyboard/touch sheet resize control, independent content scrolling and immediate keyboard focus rings.
- Corrected ground triangle winding (previously invisible/unpickable from above), with shared indices, upward-normal/raycast and real ground-tap/delete tests; stale texture-failure guard.
- 262 DOM-free and 83 real Chromium checks passed, including actual clipboard share URL, private-draft isolation and JSON/DXF downloads. External services remain mocked and remote deployment/device testing is not claimed.

### Continuation — 2026-11-03 draft durability and import races

- Shared latest-request course-file hook for both pickers; older success/failure, intervening edits, mode changes, unmount and player links invalidate pending imports.
- Visible bilingual local-save failure with current JSON backup and retry; no false saved claim while storage is blocked/full.
- In-memory planner snapshot preserves unsaved private course, scene and area through player links; public-mode retries still never persist the public course.
- Typed saved scene/area validation, named empty-draft and own-backup round-trips, restored map selection after reload. Unreadable original data is preserved and downloadable; replacement requires confirmation, and failed writes keep recovery data.
- 281 DOM-free / 113 Chromium checks passed across three widths; 27 mocked-network screenshots. See `docs/STATUS.md` for completed/partial/unfinished work, single-page memory limits and the still-open manual-edit/export input-budget mismatch. No deployment or new runtime dependencies.

### Continuation — 2026-11-03 bounded editing and lossless backups

- Unified normal edit/add/move/replace/undo/redo limits with JSON backup/reimport: 1,000,000 UTF-8 bytes including envelope, 2,000 total points, 4,000 UTF-16 units per text field; strict canonical schema and atomic rejection preserve course/selection/history/storage.
- Pretty JSON falls back to compact formatting near the byte limit without removing data; normalized legacy imports must also fit a complete backup. Both JSON buttons use guarded serialization.
- Preserve explicit blank codes and empty metadata; keep missing legacy-code auto-numbering. Front and panel name limits now agree.
- Visible bilingual limit feedback; screenshot-driven focused-label scrolling and border-box field sizing fixes. Automatic map restoration no longer starts a zoom animation across remount; broader Leaflet lifecycle stress testing remains open after one observed asynchronous error.
- Final 325 DOM-free / 128 Chromium checks pass, including actual exact-byte download/reimport and all 80-point private fixture fields. 33 mocked-network screenshots; no new runtime dependency, live supplier/device certification or deployment. See `docs/course-budgets.md` and current `docs/STATUS.md`.

### Continuation — 2026-11-03 cooperative draft concurrency / Leaflet teardown

- Same-origin Web Locks plus exact raw-baseline checks serialize cooperating draft writers; per-save revision metadata remains backward compatible. Superseded waiting requests abort instead of retaining unbounded payload queues.
- External changes/deletion pause autosave without replacing RAM. Real current/raw downloads and explicit load/replace confirmations preserve both versions; replacement rechecks the approved version inside the lock. Unreadable external data cannot discard local data; loaded scene/area restores the front map and clears stale history.
- Pending writes remain visibly unsaved and downloadable. Player opening cancels queued writes and preserves the private snapshot; beforeunload is best-effort only. No-lock fallback visibly requires one editing tab; no atomic-write or cloud-sync claim.
- Reproduced the old `_leaflet_pos` error with an actual `_onZoomTransitionEnd` stack; installed Leaflet source confirms its 250ms callback can run after map-pane removal. Selection-map CSS zoom animation is disabled using the public option, keeping instant zoom without private patches or error suppression.
- 352 DOM-free / 161 Chromium checks pass; 27 new state cases plus 33 new browser checks with two real shared-storage pages, real locks, confirmations, pending backup, beforeunload cancellation and 24 zoom/player/remount cycles. 36 screenshots; no new runtime dependencies or deployment. See `docs/draft-concurrency.md` / `docs/STATUS.md`.


### Continuation — 2026-11-03 supported lint-toolchain migration

- ESLint 10.14.0 / @eslint/js 10.0.1 / TypeScript-ESLint 8.72.1 / Hooks 7.1.1 / Refresh 0.5.7 / globals 17.14.0; native flat `defineConfig`, matching Node engines and no forced/legacy peer resolution or runtime/compiler dependency.
- Fix eight new recommended-rule diagnostics without suppressing rules: committed import refs, guarded sheet/player adjustments, external-load subscription, derived area bounds, declarative camera distances, request-tagged ground textures and memoized/disposed hillshade.
- Add 13 actual ESLint config contract checks to `check`/CI. Clean npm ci / complete peer tree, 352 DOM-free and 161 Chromium checks pass; 36 screenshots, three-width panel review and no migration layout regression observed.
- Production audit remains 0, full remains 12 moderate: current supported upstream ranges still resolve minimatch 10.2.6, below the advisory's patched 11.0.1. Major migration is complete, advisory elimination is not. No audit-policy relaxation, incompatible override, remote CI or deployment.


### Continuation — 2026-11-03 responsive scene controls and short layouts

- Reproduce camera rail off-screen at 390×900 full sheet (Fit top -140px); replace with labelled native modeless camera palette, focus/Escape/outside dismissal and an explicit no-Popover fallback without dependencies.
- Fix missing desktop dimension publication and clear owned layout variables on unmount. Bound sheet stops against measured navigation/visual viewport; short headers scroll, short landscape uses a sidebar. TopNav includes notch padding once.
- Forward Emotion className in InfoPill so clamping/compact queries apply; bound long player headings/hints visually without changing stored names or untruncated source credit. Canvas excludes sidebar and frames narrow aspect ratios.
- 369 DOM-free / 13 lint contracts / 188 Chromium checks pass (+17 program / +27 browser), retaining all previous data/private-player/lock/1MB/DXF/Leaflet gates. Fifty current UI screenshots plus one pre-fix image; three-width and short/safe/fallback review. Viewport/safe-area/capability emulation is not physical-device or Safari/Firefox coverage.
- No new runtime dependency or deployment. Production audit0 / full12moderate remains an explicit upstream limitation. See `docs/responsive-scene.md` and `docs/STATUS.md`.


### Continuation — 2026-11-03 OSM courtyards through scenes and CAD

- Both real Overpass collectors share typed member-geometry normalization instead of ignoring relations. Assemble exact/reversed outer/inner fragments and disjoint outer components; preserve source tags, component keys and way/relation identity; suppress duplicate tagged outer ways.
- Carry holes through map Shape/Path, metric conversion and merged UTM geometry. Flat/gabled roofs and map bottom caps exclude courtyards; inner walls face into voids independently of winding. Net area and terrain-base samples include inner boundaries; invalid geometry cannot inflate drawn counts.
- Conservative shared topology validation rejects incomplete/null/open/self-crossing/touching/nested/over-budget objects atomically, with bilingual visible skipped-object counts and no solid fallback. Source complexity budgets: 2,048 coordinate entries / 65 assembled rings. Parts/nested islands/relations and complete LoD2 remain unsupported.
- 460 DOM-free / 13 lint-contract / 200 Chromium checks pass (+91/+12). Real two-mode UI loads and actual DXF downloads parse independently with courtyard net areas intact; 56 synthetic-network screenshots, three-width courtyard/390px warning review. No new dependency, push/deployment, real-provider/device or independent CAD desktop certification. Production audit0/full12moderate exception remains. See `docs/building-courtyards.md` / `docs/STATUS.md`.


### Continuation — 2026-11-03 courtyard islands and strict ring hierarchy

- Support alternating outer/inner way rings inside one multipolygon: nearest containing parent, one component per outer, only immediate inner children. Preserve islands and their own courtyards in both scenes and existing mesh/CAD exports. Reject boundary crossings/touches, orphan inners and direct same-role nesting atomically; nested OSM relation members/building parts remain unsupported.
- Correct relation source-coordinate budgeting to count raw entries before deduplication, including cross-member duplicates, with exact 2,048/2,049 tests. No budget relaxation or added dependency.
- 610 DOM-free / 13 lint-contract / 212 Chromium PASS (+150/+12). Four-ring independent winding × flat/gabled geometry/raycast/cap checks; actual two-mode CAD downloads validate both net area and sampled occupied/empty regions. 62 synthetic-network PNGs; three-width island and narrow status review. Production audit0/full12moderate unchanged; no push/deployment, physical device, live-provider or independent CAD desktop claims. See `docs/building-islands.md`.


### Continuation — 2026-11-03 single-plane skillion roofs

- Inspect pinned MIT OSM2World skillion/direction/axis sources and tests; preserve attribution. Shared model now supports directed single-pitch roofs through both scenes and existing CAD export, including concavity/courtyards/islands and walls meeting the plane. Full-run angle for skillion, half-span for gabled; finite numeric/16-point compass bearings.
- Missing/invalid direction with positive rise remains an explicit total-height flat fallback with separate bilingual component counts in both loaders/settings. Preserve intentional zero roof height/angle without a false warning; no guessed downhill face or new dependency.
- 663 DOM-free /13 lint-contract /224 Chromium PASS (+53/+12). Actual two-mode DXF downloads validate every skillion triangle’s plane, net area, sampled voids and explicit flat fallback. 68 synthetic-network PNGs; three-width tilt/narrow warnings inspected. No upstream direction snapping/parts/full LoD2 or physical/live-provider/CAD-desktop/reference-product certification. Production audit0/full12moderate remains; no push/deployment. See `docs/skillion-roofs.md`.


### Continuation — 2026-11-03 elevated building bases

- Source-inspected OSM2World LevelAndHeightData/test/BuildingPart and retained MIT provenance. Shared `min_height` precedence / eaves-per-level `building:min_level` offsets raise walls/map undersides without translating roof-inclusive tops; no guessed positive level offset when total levels are absent.
- Validate with actual scene projections and reject invalid/roof-overlapping intervals for whole relations, including malformed JSON metadata. Still claim tagged outer ways before rejection so no ground-filled fallback reappears; broaden bilingual skipped-object diagnostics. UTM remains open-bottom with minimum sampled terrain datum, not per-point slope clearance/columns/full parts.
- 762 program /13 lint-contract /242 Chromium PASS (+99/+18), preserving prior224 browser checks. Actual two-mode CAD downloads confirm5m explicit/4m level-derived bottoms, roof planes, voids and cap policy. 74 synthetic-network PNGs; three-width/narrow warning inspection. No new dependency, push/deployment or physical/live-provider/independent-CAD/external-reference certification; production0/full12moderate exception retained. See `docs/building-elevation.md`.


### Continuation — 2026-11-03 consistent export hierarchy visibility

- Inspect pinned Three r173 Object3D/OBJ/STL/GLTFExporter source. Prune hidden Object3D subtrees and respect external ancestors for all five formats, including direct APIs. Retain world transforms, allowlist/group deduplication (including marked scene root) and shared resource ownership; hidden-only models fail preflight, not false-success empty files.
- Clarify that Terrain off flattens Ground instead of removing it; no terrain-toggle visibility bug is claimed. Add bilingual scene/export-scope copy, distinguishing model geometry from screen capture and DXF from imagery/labels/GIS overlays.
- 812 program /13 lint-contract /278 Chromium PASS (+50/+36): 32 hierarchy visibility combinations, actual scene Buildings off/on downloads and direct/collected × five-format browser downloads/readback confirm one visible world-space cube. 77 synthetic-network PNGs; three-width scope/hint reviewed. No new dependency, push/deployment or physical/live-provider/CAD-desktop/external-reference certification. Production0/full12moderate remains; see `docs/export-visibility.md`.


### Continuation — 2026-11-03 bounded pyramidal roofs

- Read pinned MIT OSM2World PyramidalRoof/area-centroid/HeightfieldRoof/Roof source and preserve attribution. Add centroid-to-edge fans for convex hole-free footprints with tagged roof height/levels, eaves-only walls and existing total/min-height policy; no bbox apex or guessed roof:angle-only support.
- Concave/hole/missing-rise roofs retain validated footprint/holes as total-height flat fallbacks, with separate bilingual projected-parser/collector component warnings. Explicit zero rise stays intentionally flat without spurious warning; no upstream full triangulation/parts/LoD2 claim.
- 925 program /13 lint-contract /296 Chromium PASS (+113/+18). Actual two-mode CAD downloads verify four centroid8m/eaves5m faces, courtyard net area/voids and actual angle-only flat fallback. 83 synthetic-network PNGs; three-width tilt/narrow warnings inspected. No new dependency, push/deployment or physical/live-provider/CAD-desktop/external-reference certification; production0/full12moderate remains. See `docs/pyramidal-roofs.md`.


### Continuation — production CSP and built-dist browser gate (2026-11-03)

- Enforced CSP HTTP header in static hosting config; Vite preview derives identical global response headers. Dev/HMR remains separate. Self-only scripts, no script inline/eval/data/blob exceptions; explicit inline-style support for Emotion/Leaflet, precise public-provider origins, documented Arena preview framing exception. No backend/proxy/report endpoint/dependency added.
- Added 41 configuration/provider contracts and 27 independent built-production native-browser checks at390/768/1440; actual GIS/GPX/course/player flows, CAD/GLB/STL Blob downloads and native script/handler/eval/base/unlisted-fetch blocking. Positive flows have zero CSP violations/pageerrors. Existing296 dev checks fully retained and rerun.
- Local966/13/296dev+27production PASS,92 mock-network screenshots. CI dual-stage runner configured with15-minute timeout, not remotely run. No push/deploy/live-provider/physical-browser/CAD-app/reference-comparison certification. Production audit0/full12moderate unchanged; GPX768px hint occlusion observed and deferred. See `docs/content-security-policy.md` / `docs/STATUS.md`.


### Continuation — GPX model settings layout and native disclosure (2026-11-03)

- Reproduced768px fixed-hint/settings collision; moved GPX help into the named scrolling region rather than hiding it on phones. Preserve legacy map hint. Added labelled native44px ranges/value text, full-title wrapping, footer/safe-inset clearance and a viewport-percentage cap after full-load resize exposed delayed dvh updates.
- Translated native show/hide settings with Enter/Space, aria-expanded/controls, focus and parameter retention; new GPX reopens settings. Collapsed card exposes canvas centre; expanded card remains an overlay, not a redesigned camera viewport.
- Added21 mock-network Chromium checks: three widths, four short resizes, synthetic insets, long title/missing-elevation branch, native keyboard/disclosure and actual4.5mm changed-base STL download/readback. Production CSP GPX check strengthened, policy unchanged.
- Local966/13/317dev+27production PASS;109PNG artifacts, final three widths and mobile collapsed screenshot opened. Build18files1526.2kB/gzip470.0 below2929.7 budget. Prod audit0/full12moderate unchanged. No dependencies/proxy/backend/push/deploy/remote CI/device/live/CAD-app/reference-comparison claim. See `docs/gpx-model-layout.md` / `docs/STATUS.md`.


### Continuation — strict/bounded GPX import and elevation integrity (2026-11-03)

- Inspected Topografix GPX1.1 root/namespace/decimal/segment semantics. Added conservative single continuous segment OR single route support (including prefixed namespaces), full-point validation before decimation, strict numeric/range rejection, DTD guard, no-extent/antimeridian rejection and explicit bilingual alerts. Not full XSD compliance; multiple tracks/segments/routes now visibly reject instead of connecting gaps.
- Replaced50MiB File.text gate with10MB actual UTF-8 stream budget,50k source/3k endpoint-preserving model points,4k name bound and visible approximation notice. Cancellable latest-selection hook prevents old file success/error from hijacking a new selection/mode/player; new GPX still reopens settings.
- Constant/zero elevations correctly count as present. Any missing source elevation explicitly flattens the whole model, avoiding fabricated sea-level drops; provider null/non-finite/out-of-model data now fail/fallback rather than coerce to0. Existing user-triggered DEM lookup/privacy boundary remains; no service/proxy/backend added.
- Added66 program,+21 dev-browser,+3 production-CSP checks. Local1032/13/338dev+30production PASS,121mock PNGs; actual partial-elevation STL maxY9mm. Prior layout inset test setup now settles resize before changing synthetic insets, retaining all assertions; final full integrated run passed, no auto retries/pageerror filtering.
- Build18files1530.6kB/gzip471.8 under2929.7 budget; no new dependencies. Prod audit0/full12moderate unchanged. No commit/push/deploy/remoteCI/live-provider/device/CAD-print/reference-comparison certification. See `docs/gpx-import-safety.md` / `docs/STATUS.md`.

### Continuation — native map footer and recovered GIS/guidance (2026-11-03)

- Inspected actual disk baseline: previous collection/guidance increments were absent. Reimplemented bounded GeometryCollection/shared validation+bounds (8 levels/20k geometry objects, existing2MB/10k Features/150k positions) and normal-flow guidance below map with unique button description; all-child fit/holes/properties/atomic rejection preserved.
- Source-first Leaflet1.9.4 Control/Scale/CSS review and390px native reproduction: scale was covered by two-line credit. Use public scale position bottomright to share attribution's native stack; now5px gap, no observers/height guesses/private DOM or hidden credits. Metric scale updates on real zoom; sources/resize/removal retain readable controls.
- Fresh **1081/13/368 dev +36 production CSP PASS**, both browser stages in one isolated invocation (~611.6s), all actual GPX-baseline1032/338+30 retained.49 reconstructed program/+30 combined recovery-footer dev/+6 production, not added again to past chat totals.138 mock PNGs with native before/after and CJK fonts for full run; not live/device/external-reference/CAD acceptance.
- Build18files/1531.1kB/gzip472.1 under unchanged2929.7 cap; prod audit0/full12moderate. CI20min retains both full stages, no retry/skip. No app dependency/provider/CSP-origin/backend/export expansion or push/deploy/remote Actions. See `docs/map-footer-layout.md`.

### Continuation — bounded rectangular hipped roofs (2026-11-03)

- Read pinned OSM2World HippedRoof/AbstractHippedRoof/RoofWithRidge source and MIT LICENSE.txt; implement rectangle-only explicit-rise subset, source inset min(width/3,.4*length), two ridge ends, six roof triangles/eaves walls. Preserve roof-inclusive heights, raised bottoms, materials and original tags.
- Strict projected rectangle/axis tolerance1e-4 plus actual ridge containment; no bbox repair or tolerance relaxation. Holes/nonrectangle/missing rise/angle-only/unsupported direction retain total-height hole-aware flat fallback with separate component counts in both collectors/cache and three bilingual warning UIs. Intentionalzero stays quiet; conservative projection-specific fallback documented.
- **1172 program/13 lint/386 dev+39 production-CSP PASS**, +91/+18/+3 over footer baseline. Full isolated Chromium exit0/625059ms,142 mock PNGs; true two-mode metric R2010 downloads independently reread, native production roof faces/ridge checked under unchanged CSP. Build18files/1533.8kB/gzip473.0 under unchanged2929.7 cap; auditprod0/full12moderate.
- No new app dependency/provider/backend/proxy/CSP origin, push/deploy/remote CI. General polygons/LoD2, desktopCAD, live providers/device and external reference comparison remain incomplete. See `docs/hipped-roofs.md`.

### Continuation — explicit hipped ridge direction (2026-11-03)

- Reopened pinned RoofWithRidge source; support hipped roof:ridge:direction ALONG the ridge. Valid roof:direction > ridge direction > orientation; malformed/unaligned active tags still fail closed, valid higher tags ignore lower metadata. No upstream snapping/general roof port or true-north correction; other roofs unchanged.
- Added88program/18dev/3production checks: **1260/13/404dev+42production-CSP PASS**. Short-axis4m adapter CAD, two-mode native downloads and production2.2264m northward ridge prove actual geometry/precedence. Full isolated browser exit0/898315ms with148mock PNGs; no old cases removed/skipped.
- Clean npmci/npmls, check/audit/diff pass; build18files/1534.0kB/gzip473.0 under unchanged2929.7 cap; auditprod0/full12moderate. Temporary supplied-browser single-process launch issue fixed only in ignored launcher; final full run uses web security, no bypass/error filtering.
- Source/license/scope/status/user/security docs synchronized. No app dependency/provider/backend/proxy/CSP-origin/push/deploy change. See `docs/hipped-ridge-direction.md`; whole app/LoD2/live/device/reference/desktopCAD acceptance still incomplete.

### Continuation — hipped collinear boundary nodes (2026-11-03)

- Inspected pinned SimplePolygonXZ simplification and RoofWithRidge usage; independently identify four TRUE corners with strict forward/local-cross/full-chord checks, never source deletion or upstream broad tolerance port. Whole-side axis/inset fixes short-axis selection when long sides are subdivided.
- Preserve alln boundary nodes in n+2roof/2nwall triangles; n>4 valid nohole map hip caps project validated roof triangulation down with reversed winding to avoid new boundary T-junctions. Other/4node/hole caps and UTM open underside unchanged; dent/bend/backtrack/trapezoid/cumulative curve still reject four-slope construction.
- **1342program/13lint/422dev+45production-CSP PASS**, +82/+18/+3 over1260/404+42. Full isolated browser exit0/863999ms,154mock PNGs; real two-mode DXF node/ridge/area and native production8eaves/10roof checks. Build18files/1535.1kB/gzip473.5 under original2929.7 cap; auditprod0/full12moderate.
- Synchronized provenance/scope/user/security/status docs; no new app dependency/provider/backend/proxy/origin, push/deploy or remote CI. FullLoD2/desktopCAD/external-reference/live/device acceptance still incomplete. See `docs/hipped-collinear-nodes.md`.

### Continuation — raw DXF ownership and independent CAD gate (2026-11-03)

- Found upstream dxf-writer1.18.4 metadata defects hidden by loader repairs: entity owner pointed toBLOCK notBLOCK_RECORD, block ownersnull, plot-style hardcoded1. Exact-version/SHA256-guarded postinstall patch now links record ownership and uses null390; serialization still belongs to dxf-writer, not a handwritten encoder/output rewrite.
-13patch contracts incheck; directbuild/dev guard missing/drifted patch. Clean npmci/postinstall/npmls passed. Test-only Python3.11/ezdxf1.4.5 gate checks raw references BEFORE loading, then0errors/0fixes audit and exact-coordinate roundtrip.14application fixtures,9corruption controls and51actual browser downloads PASS.
- Existing1342program/13lint/422dev+45production-CSP freshly pass with all cases retained. Full browser+CAD chain exit0/899269ms;154mock PNGs/51DXFs. Build18files/1535.2kB/gzip473.5 under unchanged2929.7cap; JS auditprod0/full12moderate.
- CI adds separate CAD job consuming the successful browser artifact, original20min browser budget unchanged; remoteActions not run. No new app dependency/provider/backend/proxy/CSP origin, commit/push/deploy or desktop-CAD/full-LoD2 certification. See `docs/cad-conformance.md`.


### Continuation — DEM response integrity and explicit unavailable terrain

- Rejected incomplete/type-invalid/nonfinite/out-of-bounds elevation grids instead of fabricating sea-level cells; existing GPX bounds shared without changing GPX behaviour. Primary failure discards whole grid before backup; valid0/negative heights preserved.
- Backup requires exact result count. Both providers fail → visible bilingual error/null field/no source, with native retry and explicit flat-reference warning in processing and scene settings. Old grid/source cleared before retry; explicit flat helper no longer claims Open-Meteo.
- 1400 program /13 lint /13 writer-patch /437 dev +48 production-CSP pass;14 independent CAD fixtures/9negative controls/57actual downloads, six new absoluteZ50/0 terrain files.169mock PNGs; three widths inspected. No new dependency/provider/origin/backend/proxy/deployment; live accuracy/device/reference/desktopCAD/remoteCI gaps retained. See `docs/terrain-elevation-integrity.md`.


### Continuation — in-scene per-layer recovery

- Added native3D Scene actions for unavailable/partially failed building, road and terrain layers, with failed/total cell status, idle-not-loaded and layer-specific bilingual44px targets. Existing error text was already present; no false claim that all failures formerly showed0.
- Reuses per-part retry/loading/freshness/cache without leaving the course or modifying private controls/notes/settings/other data. Busy actions ignore repeated Enter/Space; terrain slider now has translated name, multiplier and44px height.
- 1427program/13lint/13patch/455dev+66production-CSP PASS;14independent fixtures/9negative/63actual DXF downloads, six new minZ50/roofZ62 recovery files.181mock PNGs; no new dependency/provider/origin/backend/proxy/deployment. See `docs/scene-data-recovery.md`.
