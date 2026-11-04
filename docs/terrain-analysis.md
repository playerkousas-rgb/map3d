# Terrain analysis (Task 1)

> 2026-11-03 follow-up: the DEM input now rejects incomplete/invalid grids rather than zero-filling, falls back whole-grid and explicitly labels unmeasured flat ground. See [provider sources,1400/437+48 verification and actual CAD height readback](terrain-elevation-integrity.md). Original Task1 scope/evidence below is historical; shading/contour algorithms and coarse-grid limits are unchanged.

## Source inspection

Inspected GeoLibre `main` at commit
[`56a79c8f376ed28ec1ac36d6cd0700efd453173b`](https://github.com/opengeos/GeoLibre/tree/56a79c8f376ed28ec1ac36d6cd0700efd453173b).
The requested `src/lib/whitebox.ts` does not exist at that revision (GitHub returns 404).
Actual relevant files:

- [`packages/processing/src/raster-client.ts`](https://github.com/opengeos/GeoLibre/blob/56a79c8f376ed28ec1ac36d6cd0700efd453173b/packages/processing/src/raster-client.ts#L362-L407): browser `hillshade()` uses Horn 3×3 gradients and the ESRI/GDAL slope/aspect formula; defaults **azimuth 315°, altitude 45°, z-factor 1**. Geographic raster cell dimensions are converted to metres, with a cosine-of-latitude longitude correction.
- [`apps/geolibre-desktop/public/whitebox-catalog-snapshot.json`](https://github.com/opengeos/GeoLibre/blob/56a79c8f376ed28ec1ac36d6cd0700efd453173b/apps/geolibre-desktop/public/whitebox-catalog-snapshot.json): Whitebox `hillshade` defaults are **315° / 30° / 1**, distinct from the browser implementation. `contours_from_raster` defaults to interval 10 m, base 0, smoothing filter size 9, deflection tolerance 10.
- [`backend/geolibre_server/geolibre_server/app/whitebox.py`](https://github.com/opengeos/GeoLibre/blob/56a79c8f376ed28ec1ac36d6cd0700efd453173b/backend/geolibre_server/geolibre_server/app/whitebox.py): Python Whitebox sidecar, not evidence of a browser WASM implementation at this revision.
- [`docs/tutorials/terrain-analysis.md`](https://github.com/opengeos/GeoLibre/blob/56a79c8f376ed28ec1ac36d6cd0700efd453173b/docs/tutorials/terrain-analysis.md): explicitly documents browser hillshade/slope/aspect, sidecar contours, and multiply blending of relief and map layers.

See `THIRD_PARTY_NOTICES.md` for the upstream MIT notice.

## map3d implementation

`src/utils/terrain.ts` exposes:

- `hillshadeValues(field, options)`: DOM-free Horn shading, clamped 0–255, with the requested 315° / 45° defaults. Raster dimensions are converted from degrees to metres. The upward-normal/sun dot product is algebraically equivalent to slope/aspect shading. map3d rows run **south to north**, so row derivatives represent northward rise, unlike north-first GeoTIFF rasters. Edges use clamped neighbours, matching GeoLibre.
- `createHillshadeTexture(field, options)`: canvas-backed grayscale `CanvasTexture`. Canvas top is north; the texture has independent geographic UVs (`uv1`), with texel-centre alignment so map tile extents and Mercator UVs do not stretch or invert the relief.
- `buildContourGeometry(field, projection, options)`: constant-height intersections with the exact 48×48 ground triangles, rendered by `THREE.LineSegments`. Default interval 10 m, base 0. Triangle intersections avoid ambiguous saddle cells. Flat plateaus do not emit arbitrary lines. Parameter checks reject malformed fields, invalid intervals and excessive level counts.

`Ground.tsx` multiplies the hillshade over the existing map (or plain ground), without changing map download/fallback status. It renders brown contours slightly above the mesh. Geometry/texture resources are disposed when changed or unmounted. Overlays do not intercept course editing pointer events. Hillshade/contour toggles are in scene settings, with English and Traditional Chinese labels; persisted settings from earlier versions acquire the new defaults. Disabling terrain suppresses both overlays. Vertical exaggeration affects rendered contour height and the hillshade's z-factor, not the elevation interval.

### Intentional differences and limits

- This is not Whitebox WASM and does not implement Whitebox's smoothing or deflection filter. Contours follow the scene mesh, not a smoothed GIS vector output.
- It uses the existing coarse 5×5 to 10×10 elevation request. A denser rendered mesh is interpolation, **not extra DEM detail**; 10 m contour spacing must not be interpreted as 10 m positional/vertical accuracy.
- Hillshade is shaded relief, not a separately classified slope-angle layer.
- Overlay textures/lines are display layers, not added export entities.
- No TopoExport/building/DXF/data-source changes are included in Task 1.

## Verification and visual comparison status

Run `npm run verify` and `npm run check`. The verification harness covers flat terrain, sun elevation, azimuth wrapping, cardinal slope orientation, an analytic Horn reference, zero z-factor, malformed inputs, flat plateaus, real-elevation contour intervals, mesh alignment, saddle cells, and safety limits.

A browser screenshot comparison against GeoLibre/TopoExport has **not** been performed: the initial Task 1 environment had no `browser.open`/browser automation tool or installed browser executable. Later v0.1.0 work enabled temporary local Chromium testing (see `APP_AUDIT.md`), but still did not perform an external-product screenshot comparison. Source inspection used GitHub file retrieval/API, not a claimed visit to either live application. TopoExport is outside Task 1. Do not treat passing geometry tests as visual equivalence.

For a manual comparison, use the same DEM, extent, 315° azimuth, 45° altitude, z-factor 1 and 10 m interval in both applications, choose plain ground, disable buildings/roads/grid, and compare a north-up overhead view. Check northwest-facing slopes are brighter and north/south features are not inverted. Whitebox smoothing must be disabled or accounted for; stock Whitebox altitude 30° will not match the browser's 45° output.
