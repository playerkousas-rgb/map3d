# Product scope and coordinate contract

**Positioning:** a bilingual, mobile-first, browser-only app for 3D map exploration, printable GPX miniatures and locally saved city-orienteering courses.

## Included

- Public OSM building/road data, metric terrain/course scene and GPX print-model generation.
- Local course drafts, course JSON backup/import and URL-contained read-only player sharing.
- GLB/glTF/OBJ/STL/DXF downloads, with visible errors and source limitations.
- Browser-direct 2D GIS references, central catalogue and active-source attribution.

## Not introduced

Accounts/admin, GAS/Supabase backend, private data APIs, server-side GIS processing, automatic bulk raster/Shapefile conversion, offline map packs, guaranteed survey/navigation accuracy, certified LoD2/BIM or watertight-solid certification. WorldPop/HydroRIVERS remain bulk-download references. Externally prepared small WGS84 GeoJSON vectors can now be imported locally, without raster/statistical analysis or native Shapefile decoding.

## Units and axes (do not conflate)

| Context | Units / axes |
|---|---|
| Orienteering scene | 1 unit = 1 m, local UTM; +X east, -Z north, +Y up |
| Legacy map scene | Horizontal coordinates use 51000 units/degree; render compression retained. Roof dimensions resolved in approximate metric coordinates; `dxfHorizontalScale=111320/51000` restores horizontal CAD scale. |
| GPX miniature | 160-unit target span, interpreted as millimetres; not a geographically full-scale model. `dxfUnitScale=0.001` converts every axis to CAD metres. STL retains the existing slicer-oriented mm interpretation. |
| DXF | AC1024 (R2010), INSUNITS=6 (metres), X east, Y north, Z up; local surface coordinates, no embedded CRS |
| OSM height | Explicit roof-inclusive `height` wins; `building:levels` excludes roof levels. 2.2 m/storey is a map3d estimate, not an OSM standard. |
| Course JSON | Complete backup ≤1,000,000 UTF-8 bytes; ≤2,000 total points; text ≤4,000 UTF-16 units. Normal edit/import/export boundaries share this contract; see `docs/course-budgets.md`. |
| GIS overlays | WGS84 GeoJSON or tiled EPSG:3857; planning display only, not additional 3D/export input |

External services can be unavailable or incomplete. A successfully drawn/interpolated scene does not prove accurate source data. Always check official maps and real ground conditions before a navigation event.

## Input / sharing contract

Local GeoJSON: FeatureCollection root; point/line/polygon/Multi* and bounded mixed/nested GeometryCollection, ≤2,000,000 bytes / 10,000 features / 150,000 positions / 20,000 Geometry objects / 8 collection levels globally, no upload or persistence. Bounds include every child, not supplied bbox; malformed/empty-only local replacements retain the old layer. No bare-geometry root/flattening/topology repair. See `docs/map-footer-layout.md`. Course import: ≤1,000,000 UTF-8 bytes / 2,000 controls / 4,000 characters per text field, reject invalid files atomically. Player URLs: ≤64,000 token characters / 1,000,000 decoded bytes and a finite non-degenerate area within latitude ±85° / longitude ±180°. These are browser safety budgets, not static-host request limits.

New player URLs exclude planner-only notes, while course JSON backups preserve them. Neither URL fragments nor read-only mode provide authentication/encryption; all payload data is readable by a link's recipients. Older links may already contain notes and cannot be revoked by updating the app. See `docs/local-data-and-sharing.md`.

## Rectangular hipped continuation — 2026-11-03

`roof:shape=hipped` now supports exactly four-corner, hole-free, projected rectangles with explicit height/levels, source-derived min(width/3,.4*length) inset, six roof triangles and preserved roof-inclusive/raised-bottom heights. Unsupported topology/directions/rise remain visibly counted hole-aware total-height flat fallbacks; explicitzero does not warn. Strict1e-4 projected orthogonality and actual ridge containment can conservatively reject the same footprint in one projection but not the other. No arbitrary polygon/angle-only/full-LoD2 claim. **1172 program/13 lint/386 dev+39 production-CSP PASS**. See [source and exact scope](docs/hipped-roofs.md); desktop CAD, live providers, reference comparison and deployment remain outstanding.

## Explicit hipped ridge direction — 2026-11-03

Hipped rectangles additionally accept roof:ridge:direction along the ridge, with valid roof:direction first and orientation last. Malformed/unaligned active direction remains visibly flat, not snapped or silently retried. Projection/scene-axis bearings are not a new true-north guarantee; other roof types unchanged. **1260 program/13 lint/404 dev+42 production-CSP PASS**, native short-axis CAD checks included. Details: [direction subset and precedence](docs/hipped-ridge-direction.md). Previous hipped milestone counts above are historical.

## Hipped collinear boundary nodes — 2026-11-03

Four TRUE corners may now contain additional bounded near-collinear edge nodes; source nodes/coordinates and budgets are preserved. Whole sides select axis/inset; n nodes produce n+2roof/2nwall triangles. New n>4 nohole map caps project the validated roof triangulation downward to preserve wall boundary subdivisions; existing hole-aware/other caps and UTM open bottom remain. No generic shape repair, curvature simplification or loosened rectangle guard. **1342program/13lint/422dev+45production-CSP PASS**. See [source, strict limits and actual CAD evidence](docs/hipped-collinear-nodes.md); prior milestone counts above are historical.

## Independent CAD structure follow-up — 2026-11-03

Existing dxf-writer is now exact1.18.4 with a reviewed, hash-guarded install patch for BLOCK_RECORD ownership and null plot-style references; no new serializer or application dependency. Existing1342program/13lint/422dev+45production cases freshly pass, plus13patch contracts and independent14CAD fixtures/9negative controls/51actual browser downloads. Raw references checked BEFORE the independent reader can repair them; audit0errors/0fixes and coordinate-preserving roundtrip. This narrows the CAD-conformance gap, **not** desktop vendor acceptance or full-LoD2/solid certification. See `docs/cad-conformance.md`; Python is test-only, no backend introduced.


## Complete DEM response integrity — 2026-11-03

Orienteering terrain now requires an exact complete numeric grid in the APP's existing shared−12000..10000m safety bounds; genuine0/negative heights remain valid. Any bad primary cell triggers whole-grid backup, not mixed/zero-filled interpolation. Both fail → null field/error/no provider success, bilingual unmeasured-flat warning and native retry. Explicit flat fallback cannot claim a DEM source. Existing grid/timeout/datasets/exports/units unchanged, no vertical-datum/accuracy or live-provider guarantee. **1400program/13lint/13writer-patch/437dev+48production-CSP PASS**, independent14fixtures/9negative/57actual DXFs including sixZ50/0 ground downloads. Prior milestone counts are historical. See `docs/terrain-elevation-integrity.md`; rest of APP remains partial.


## In-scene data recovery — 2026-11-03

The planner can retry unavailable or partial building/road/terrain layers inside3D, with explicitfailed/total cells, busy duplicate gating and bilingual44px controls. Reuses per-part replacement/cache, preserving course/notes/settings/area and unrelated layers. No force-refresh/failed-cell-only scheduler/double-buffered replacement promise. Geometry rejections/draw ceiling are separate.1427program/455dev+66production and14fixtures/9negative/63actual CAD downloads pass, including six recovered minZ50/roofZ62 exports. Existing units/source/privacy/CSP policies unchanged; remaining live/device/desktopCAD/fullLoD2/reference/remoteCI/deployment gaps remain. See `docs/scene-data-recovery.md`.
