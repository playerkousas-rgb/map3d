# Task 2: OSM gabled/skillion/bounded pyramidal and rectangular hipped roofs and DXF

## References actually inspected

- <https://app.topoexport.com/> lists **Buildings with Roofs** and **DXF**. The supplied <https://topoexport.com/docs> returns 404. No TopoExport implementation source was found or copied; neither its internal roof algorithm nor its DXF version/encoding was verified. R2010 and 3DFACE below are map3d requirements supplied by the user, not a claim about TopoExport internals.
- <https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings>: `height` includes the roof; `building:levels` excludes roof levels; façade height is total height minus `roof:height`. The ridge defaults to the longest side, with `roof:orientation=across` rotating it; numeric `roof:direction` is the main sloping face's compass direction.
- The supplied <https://github.com/bjnortier/dxf-writer> returns 404. npm `dxf-writer@1.18.4` declares <https://github.com/ognjen-petrovic/js-dxf>, which redirects to <https://github.com/tarikjabiri/js-dxf> (source revision `34608442ed783de547b4224b6f98dee1996f9800`). Its `src/Drawing.js`, `src/Face.js`, `index.d.ts`, and MIT license were inspected. `drawFace()` writes `3DFACE`; its default document version is AC1021, so map3d explicitly overrides it to **AC1024 (R2010)** through the library's `header()` API.

## Implementation

The requested `src/utils/builders/buildingBuilder.ts` did not previously exist. It now provides a DOM-free shared builder used by both `Space.tsx` (individual coloured buildings) and `orthoGeometry.ts` (merged walls/roofs in the orienteering scene).

### Roofs and heights

- `roof:shape=gabled` produces two sloping roof planes plus filled gable-end walls. `roof:shape=skillion` now produces one directed roof plane when a valid downhill direction exists; missing direction has an explicit flat-fallback warning. See [source/model/tests](skillion-roofs.md).
- For gabled roofs, footprint triangles are clipped at the central ridge before lifting. This preserves rotated and concave simple footprints rather than drawing a roof across their bounding box.
- For bounded pyramidal and rectangular hipped roofs, only explicit roof:height/roof:levels supply rise; no angle/default estimate. Hipped uses two ridge ends and n+2 roof triangles for n boundary nodes (six when n=4) in strict projected rectangles; unsupported inputs keep counted hole-aware flat fallbacks ([source, projection caveat and CAD tests](hipped-roofs.md)).
- Gabled/skillion roof height precedence: `roof:height`, `roof:levels`, numeric `roof:angle`, then an explicit fallback estimate of `min(3 m, roof span / 4)`.
- Explicit `height` takes priority over floor-count estimates and remains roof-inclusive. Without explicit height, `building:levels × 2.2 m` supplies façade height and roof height is added. The 2.2 m storey estimate is inherited from map3d, **not prescribed by OSM or verified from TopoExport**.
- `roof:orientation=across` and numeric or 16-point compass `roof:direction` are supported. Skillion angle uses the full run; gabled uses half the span. Explicit zero roof height/angle stays flat. Roof height is constrained to leave at least 2 m of façade; total height retains a 400 m safety cap.
- Metres and explicit feet are parsed without discarding unit information. Ambiguous lists and invalid numeric tags fall back rather than being concatenated into invented dimensions.
- Unknown roof shapes retain flat roofs. Existing map-mode material slots and bottom caps are retained. The merged orienteering meshes keep their pre-existing open-bottom surface representation.

### DXF export

- Runtime dependency: **dxf-writer**, not a handwritten DXF serializer.
- `src/utils/dxf.ts` visits mesh triangles (indexed/non-indexed, including instance transforms), applies world transforms, and calls `Drawing.drawFace()`. A triangular 3DFACE repeats vertex 3 as vertex 4.
- Header: `$ACADVER=AC1024`, `$INSUNITS=6` (metres).
- CAD axes: **X=east, Y=north, Z=up**, mapped from Three.js `(x, y, z)` to `(x, -z, y)`.
- The old map-mode view uses a compressed horizontal scale of 51000 units per degree. Its meshes carry DXF metadata to reverse this compression; roof-angle/height calculations use metric footprints before compressing them for display. This view remains an approximate local equirectangular projection. The orienteering view uses its existing metric UTM projection.
- `collectExportGroup()` now preserves ancestor world transforms and avoids collecting nested exportable objects twice. This also corrects the common collection path for existing export formats.
- The main export menu and the orienteering course panel now expose **DXF · R2010**. Existing export formats remain available. DXF uses the existing exportable meshes; display-only hillshade and contour overlays are not included.

## Courtyard continuation — 2026-11-03

Both real Overpass collectors now share multipolygon member normalization; both scenes retain holes through roofs, inner walls and the map-mode bottom cap. Invalid/open/ambiguous/unsupported topology is reported instead of filled. Multiple disjoint outer components and reversed fragments are supported within documented safety budgets. See [source, supported subset, real UI/CAD tests and limitations](building-courtyards.md). This does not complete LoD2. Subsequent strict ring-containment support preserves islands and their own holes; see [current topology/verification](building-islands.md). Current full gates: **925 DOM-free / 13 lint-contract / 296 Chromium checks**.

## Initial verification (historical)

- `npm run verify`: **189/189 checks passed** after Tasks 1–2. New checks cover dimensions/units, rotated/reversed/concave footprints, roof area and normals, gable walls, bottom caps, merged-scene integration, and CAD round trips.
- `dxf-parser` is a **dev-only** independent reader. Tests verify version, units, one 3DFACE per triangle, repeated fourth vertex, coordinate mapping, nested transforms, legacy scale correction, indexed/instanced meshes, draw ranges and non-finite vertex rejection.
- Additional independent **ezdxf** read/audit on a capped gabled fixture: **AC1024, units 6, 20 3DFACE entities, 0 errors, 0 fixes**. ezdxf and the fixture were installed/generated only in ignored temporary storage, not added as application dependencies or committed data.
- `npm run check` covers lint, repository budget, verification, TypeScript and production build. Existing lint warnings and the existing three-stdlib/lottie eval warning remain.

## Scope and limits

This is a **partial LoD2-style roof implementation**, not complete Simple 3D Buildings or certified CityGML LoD2 support. It does not resolve building-part relations, nested OSM relations, complex roof-line networks, dormers or other roof types. Missing roof tags do not become imaginary gabled buildings. Material colours are not encoded as CAD face colours/layers. DXF is a local surface mesh, not a georeferenced CRS document, BIM semantic model or guaranteed watertight CAD solid.

No GeoLibre/TopoExport screenshot comparison is claimed. A temporary npm-delivered headless Chromium/Playwright setup was attempted for local visual verification, but Chromium could not launch because the sandbox lacks `libnspr4.so`. At that stage no screenshot was produced. Later v0.1.0 work resolved the temporary library setup and ran local browser tests/screenshots (see `APP_AUDIT.md`); this still does not provide an external-product comparison. The browser binary package remains outside project dependencies; playwright-core is now a dev-only test driver. Source/page retrieval and geometry/CAD tests do not establish visual equivalence with either external product.


## Elevated bases continuation

`min_height` (including explicit zero) overrides `building:min_level`; otherwise bottom=eavesHeight/buildingLevels×minLevel, requiring tagged levels for positive offsets. This raises walls and the map underside, NOT roof-inclusive top heights. Both collectors validate with their actual scene projections; invalid intervals reject whole relations with visible counts and no tagged-outer ground-fill. UTM remains open-bottom, using the minimum terrain datum, not per-point clearance/columns/closed-solid support. [Inspected source, tests and complete boundaries](building-elevation.md).


## Consistent export hierarchy visibility

All five model formats now consume pruned Object3D-visible snapshots; direct DXF also respects hidden ancestors/descendants. Exportable groups/root scenes own marked descendants exactly once. Terrain off remains flat exportable ground, not a deleted surface. This is not camera/frustum/material-opacity filtering or a screen capture. [Source inspection, actual format downloads and limits](export-visibility.md).


## Bounded pyramidal roofs

`roof:shape=pyramidal` now uses area-centroid apex/edge fans for convex hole-free footprints with explicit roof height/levels. Direction/orientation do not turn it into a gable; roof:angle-only inference is not implemented. Unsupported concave/hole/missing-rise roofs retain total-height flat geometry with holes and separate bilingual component diagnostics; explicit zero is intentional flatness. Eaves-only walls, raised bottoms and metric CAD policies remain. [Source, precise acceptance and limitations](pyramidal-roofs.md).

## Hipped explicit ridge follow-up

Rectangular hipped roofs now accept roof:ridge:direction ALONG the ridge, not the slope normal. Valid slope direction wins over ridge direction, then orientation; malformed active tags fail closed and directions must align with actual projected edges. Other roof types are unchanged. Both real geometry adapters and both browser downloads independently verify a short-axis ridge rather than merely accepting a tag. Latest1260program/404dev+42production-CSP checks pass. See [source, priorities, projection limits and native CAD evidence](hipped-ridge-direction.md).

## Hipped boundary-node follow-up

Extra collinear edge nodes no longer force a rectangular hip flat. Four true corners select whole-side axis/inset; all n original boundary nodes remain in n+2roof/2nwall triangles. Successful n>4 nohole map caps reuse the validated roof triangulation projected downward, retaining boundary splits rather than Earcut's possible collinear omissions. Four-node/other/hole caps and UTM open underside unchanged. Strict forward/full-chord bounds, original1e-4 rectangle gate and source budgets preserved.1342program/422dev+45production pass, with real CAD eaves nodes and closed-map fixture edge checks. See `hipped-collinear-nodes.md`.

## Independent CAD structure correction — 2026-11-03

A successful dxf-parser readback did not detect incorrect raw owners: upstream1.18.4 referenced BLOCK rather than BLOCK_RECORD, left block ownersnull, and hardcoded plot-style1. A reader could silently repair owners BEFORE audit. Exact-version/hash-guarded postinstall patch now fixes those metadata fields inside dxf-writer; it still serializes every entity/document. No handwritten encoder or output-string repair. New13patch contracts plus Python/ezdxf14fixtures/9negative controls and51actual browser DXF files pass raw ownership and coordinate-preserving roundtrip;1342program/422dev+45production freshly rerun. CI has a separate test-only CAD job/artifact handoff, not a backend. Desktop CAD remains unverified. See `cad-conformance.md`.
