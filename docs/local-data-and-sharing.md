# Local GIS import and course/share completion

As built on 2026-11-02. No new runtime dependency, backend or data proxy.

## Local GeoJSON: a usable preprocessing path

The GIS disclosure now accepts **one temporary local `.geojson` / `.json` FeatureCollection**, with point, line and polygon variants plus bounded mixed/nested GeometryCollection inside Features ([current source/limits/revalidation](map-footer-layout.md)). It is parsed in the browser, never uploaded, and rendered in purple on the selection map. Points use local CircleMarkers rather than CDN marker icons. Only an explicit **Zoom to local layer** changes the map view; import itself does not move the map or change the selected rectangle.

- File and streamed byte limit: **2,000,000 bytes**; **10,000 features** / **150,000 positions** / **20,000 geometry objects** globally, at most **8 collection levels**. Preserve properties/holes/grouping, all-child bounds ignore bbox. Bare GeometryCollection roots remain unsupported.
- Coordinates must be finite WGS84 **[longitude, latitude]**, with optional finite altitude. Projected CRS declarations are rejected even when their numeric coordinates happen to look like degrees. Explicit CRS84 / EPSG:4326 names remain compatible.
- Empty/non-drawable collections, unsupported geometry, malformed UTF-8/JSON and invalid rings fail visibly. No automatic repair, silent truncation, ZIP/Shapefile decoding or raster parsing is claimed.
- A failed replacement leaves the previous valid layer intact. New files cancel old reads; cancellation releases a stalled stream. Remove cleans both geometry and attribution.
- The filename is escaped React text; remote feature properties are never interpreted as HTML/popups. Origin labels are an **unverified user choice**, not provenance certification. Provider terms remain the user's responsibility.
- The layer is not stored in localStorage, course JSON, player URLs, 3D models or model exports. Leaving map selection, page reload or restoring a saved course area can discard it. Keep the original source file.

### HydroRIVERS preparation

Re-opened the [official HydroRIVERS page](https://www.hydrosheds.org/products/hydrorivers); it still supplies a 91 MB Asia Shapefile ZIP and requires HydroSHEDS licence/citation compliance. The app does not download that ZIP. A desktop GIS workflow is:

1. Obtain the appropriate licensed source from its official download page.
2. Clip the river network to the planning area; simplify cautiously if needed, retaining the original dataset separately.
3. Export the clipped features as a WGS84 longitude/latitude GeoJSON FeatureCollection, within the limits above.
4. Choose **HydroRIVERS** as the source label, import the file, check its location and explicitly zoom to it if necessary.

This is an external preparation workflow, not a claim that QGIS/GDAL conversion was run in this sandbox or that any arbitrary uploaded file was verified as authentic HydroRIVERS.

### WorldPop limits

Re-opened the [WorldPop hub](https://hub.worldpop.org/). The supplied mosaic location remains a bulk raster/download catalogue, not a verified WMS endpoint. Raw TIFFs are **not supported** by this importer. A separately prepared small geographic vector layer can be displayed, but the app currently shows **geometry only**: no population aggregation, raster values, graduated-value colour scale, density/count conversions or statistical validation. Do not interpret a uniformly coloured imported polygon as a population result. Proper external aggregation must preserve dataset units/methodology and licence; this turn does not supply that analysis.

The catalogue is still **ten dataset entries / seven providers, eight web-layer configurations plus two bulk references**. Adding a local importer does not turn this into ten independently verified live services.

## Course file safety and player privacy

Course JSON remains compatible with the existing course/HKMAP wrappers, bare control arrays and ordinary numeric-string coordinates. Import now rejects invalid/out-of-range coordinates, non-finite scores, duplicate IDs, oversized fields or excessive control counts **as a whole**, instead of silently dropping invalid controls.

- Course import: **1,000,000 UTF-8 bytes**, **2,000 controls**, **4,000 characters per text field**. Both UI file pickers check file size before `file.text()`; parser checks also apply to programmatic/decoded inputs.
- Share token: **64,000 characters**, strict base64url prefix/body, and **1,000,000 bytes maximum decompressed JSON**. A valid compressed JSON expansion test verifies the actual output budget, not just a downstream parse failure.
- Shared area: finite non-degenerate rectangle, longitude within ±180°, latitude within ±85° for the Web-Mercator planning map. Plain `j` links and supported compressed `z` links retain their protocol.
- New player links remove **planner-only `note` values** without modifying the saved course. JSON backups deliberately retain those private notes. **Do not send the backup JSON as a public player file unless its contents have been reviewed.**
- **Older generated links may already contain notes.** Updating the app cannot revoke links or copies already received. Regenerate links after reviewing private data; assume any previously sent URL payload was readable by its recipients. A fragment is not encryption or access control.

Read-only store guards now cover new/reset/import/undo/redo and area changes as well as ordinary control edits. Player display preferences remain adjustable but are never persisted over the planner draft.

## Fragment navigation, area restoration and touch panel

The application now listens to `hashchange` as well as initial URLs. Clicking a copied `#play` link in an already open app no longer leaves it editing the old course. Decode generations discard stale results; invalid links clear the bad token and recover the planner draft. Processing waits for the current link/scene rather than immediately opening an old settled scene.

Leaving player mode restores the saved planner course **and its area rectangle**, remounting/fitting the selection map. This deliberately resets temporary selection-map layer controls; local GIS files are not part of the course backup.

The mobile bottom sheet has a separate native 44px resize button, no interactive controls nested inside a fake button. Click/Enter/Space cycle its stops; ↑/↓ and Home/End resize it. Dragging does not also trigger a click-cycle. Its content scrolls independently on mobile and desktop. External tool/selection snap changes now update the actual sheet transform and occupied-space CSS variables, not only React state. The keyboard focus ring is immediate rather than animated through an illegible intermediate width.

## Ground rendering/picking correction found by screenshots

The course screenshot exposed a real inherited geometry error: south-first rows / eastward columns with north = -Z were indexed in the downward-facing order. The ground was culled from above, while grid lines still rendered; imported courses and CAD serialization alone did not catch it.

`Ground` now uses a shared, bounded `buildTerrainIndices()` with upward winding. Two independent checks verify upward normals and an actual downward Three.js front-side raycast. Real Chromium tests now **verify that the actual click target is the canvas, tap the visible ground to add a checkpoint, wait for that new checkpoint’s editor, then delete it**, at all three widths. They compare every original control/edited field after deletion and in the shared payload, rather than relying on counts alone. The triangle diagonal, terrain interpolation, projection, metres and contour alignment are unchanged. Stale map-texture failures are also ignored instead of overwriting a newer texture/status.

## Evidence actually run

- `npm run verify`: **352/352** checks.
- `npm run check`: full lint/guard/regressions/release/TypeScript/build passed. Existing i18n Fast Refresh warning and upstream lottie eval warning remain.
- Isolated real Chromium: **161 checks** across **390/768/1440 × 900**. External imagery/OSM/elevation responses remain mocked/aborted. No live service uptime claim.
- New UI flow uses the actual file picker → area drag → failed-service fallback → course editor → undo/redo → real ground tap/delete → actual course JSON and R2010 metre-unit DXF downloads → actual Share button/clipboard URL → same-document player navigation → fresh-page player load → exit/area restoration → invalid link recovery. Private draft JSON stays unchanged throughout player viewing.
- Local GIS checks render synthetic point/line features, reject a projected file and >2 MB file without replacing the valid layer, verify non-upload/HTML handling, explicit fit, remove/attribution cleanup and reimport.
- Re-fetched the three pinned Natural Earth originals through GitHub after adding CRS validation: **177 countries / 24 lakes / 13 rivers**, all accepted with explicit CRS84 metadata. This still does not prove live browser CORS availability.
- Previous-round screenshots: `/home/user/artifacts/map3d-v0.1.0-flows/`, `{local-gis,local-map,course,player,gis,gpx,export}-{390,768,1440}.png`. Newly changed local controls were opened at all three widths; course/player and rendered local-map screenshots were also inspected. Test fonts still lack some CJK glyphs.

Unverified: native mobile OS share sheets, VoiceOver/TalkBack, physical touch gestures, independent CAD desktop applications, external-product visual equivalence, live-provider coverage/CORS and production deployment. The principal browser course flow is now exercised, not every possible gesture/browser combination. CI is configured for the expanded suite; no remote Actions run or deployment was performed in this turn.


## Draft reliability follow-up — 2026-11-03

The latest 281/113 evidence includes stale-read protection in both course pickers, visible blocked/full-storage errors, real current/raw JSON downloads, retry, named empty drafts, saved selection restoration and explicit unreadable-draft replacement. A same-page player round-trip preserves unsaved private RAM data, area and scene; it cannot protect against closing/reloading the page when storage did not accept a write. Unreadable raw data remains untouched until confirmed replacement; a failed replacement retains the recovery bytes. See [status, exact evidence and remaining work](STATUS.md).

Latest screenshots: `/home/user/artifacts/map3d-v0.1.0-drafts/`, all seven previous view types plus `{draft-save-error,draft-recovery}-{390,768,1440}.png` (27 total). Existing source/geometry/share constraints above are unchanged. Own version-1 tagged JSON backups may contain an empty course; generic empty inputs are still rejected unless the internal draft-reader option explicitly allows them. Manual edit/export budgets remain a known gap and must not be mistaken for a guaranteed arbitrary-size backup round-trip.


## Bounded editing / backup follow-up — 2026-11-03

The previously open manual-edit/export budget mismatch is now addressed for normal application entry points. Complete backup UTF-8 bytes, point counts, text units and canonical schema validate before mutations; rejected candidates leave all course/history/storage data unchanged. Near-limit pretty backups fall back to compact JSON without data removal. Blank codes/metadata and all private fields round-trip. Both download paths reject invalid output safely. See [course contract](course-budgets.md) and [current 325/128 evidence / unfinished work](STATUS.md).

The earlier paragraphs describing the manual budget gap are historical, not the current implementation. Latest screenshots: `/home/user/artifacts/map3d-v0.1.0-budgets/` (33). Browser-provider/device/deployment limits and old-link privacy caveats remain unchanged.


## Cross-tab / lifecycle follow-up — 2026-11-03

The former multi-tab gap is now addressed for cooperating same-origin Web Locks writers, with explicit conflict recovery rather than automatic merge. Pending writes remain dirty/cancellable and downloadable; a dirty beforeunload prompt is best effort only. No-lock browsers require one editor tab, and other versions/devtools that bypass the lock are not atomically constrained. The earlier Leaflet error was reproduced with its zoom-transition stack and fixed by disabling selection-map CSS zoom animation via the public option. See [protocol/root-cause evidence](draft-concurrency.md).

Latest evidence is **352 unit / 161 Chromium checks**, including two real pages, 24 actual zoom/player/remount cycles and **36 screenshots** at `/home/user/artifacts/map3d-v0.1.0-tabs/`. Earlier unresolved concurrency/lifecycle comments are historical; cloud sync/automatic merge, other-browser/physical-device and live-provider/deployment limits remain open.
