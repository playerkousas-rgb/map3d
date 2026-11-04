# Third-party notices

## Model-camera reference (Three.js r173)

Model-camera bounds were checked against Three.js r173 `src/math/Box3.js`,
resolved via GitHub to `ee97ad2f948a0feb9c2446247e8cb88741bb2305`:
https://github.com/mrdoob/three.js/blob/ee97ad2f948a0feb9c2446247e8cb88741bb2305/src/math/Box3.js
The existing runtime provides world matrices, cached bounding boxes and bounding
spheres. map3d derives its own both-FOV framing distance; this is not an upstream
fit API or a new dependency. Existing Three.js MIT licensing is unchanged; see
`docs/model-camera-controls.md` for implementation/proof and limits.

## GeoLibre

The Horn hillshade implementation in `src/utils/terrain.ts` is adapted from
GeoLibre `packages/processing/src/raster-client.ts` at commit
`56a79c8f376ed28ec1ac36d6cd0700efd453173b`.
Source: https://github.com/opengeos/GeoLibre

MIT License

Copyright (c) 2026 Qiusheng Wu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## dxf-writer 1.18.4

Runtime dependency used for DXF entity/document serialization.
Source: https://github.com/tarikjabiri/js-dxf (npm repository URL redirects here),
reviewed revision34608442ed783de547b4224b6f98dee1996f9800.
map3d now applies a minimal hash-guarded MIT-source patch at install time to
Drawing.js/Layer.js: link BLOCK/ENDBLK/3DFACE owners to BLOCK_RECORD and use null
plot-style handle0. The library still performs all entity/document serialization;
no hand-written replacement or DXF text rewriting is used. Exact original/patched
hashes, scope and reproduction: `docs/cad-conformance.md`. Original notice retained.

MIT License

Copyright (c) 2017 Ognjen Petrovic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Public GIS services and datasets

The selection map requests external services directly; these data are not copied
into this repository. Attribution and source/terms links are configured in
`src/config/dataSources.ts` and shown in the GIS panel/Leaflet control.

- OpenStreetMap data: © OpenStreetMap contributors; ODbL and tile usage policy apply.
  https://www.openstreetmap.org/copyright
- Hong Kong maps/imagery: © Hong Kong SAR Government / Lands Department;
  the Map API terms apply: https://portal.csdi.gov.hk/csdi-webpage/doc/TNC
- OpenTopoMap: © OpenStreetMap contributors, SRTM; cartography © OpenTopoMap
  (CC-BY-SA). https://opentopomap.org/about
- NASA GIBS imagery: NASA EOSDIS GIBS; individual product/attribution requirements
  apply. https://nasa-gibs.github.io/gibs-api-docs/
- Natural Earth: public domain. Runtime URLs are pinned to revision
  `ca96624a56bd078437bca8184e78163e5039ad19` of
  https://github.com/nvkelso/natural-earth-vector.
  https://www.naturalearthdata.com/about/terms-of-use/
- WorldPop: download reference only; check the individual dataset licence.
  https://hub.worldpop.org/
- HydroRIVERS: download reference only; HydroSHEDS licence and citation requirements
  (including Lehner & Grill, 2013) apply. https://www.hydrosheds.org/products/hydrorivers

These links do not grant permission to redistribute third-party data. See
`docs/data-sources.md` for the exact protocol/evidence and integration limits.

## Shared standards reference and local artwork

`playerkousas-rgb/readme` revision
`206cb0c24d028651d804ec19942dc9791b499fdd` was read for project guidance.
No licence was advertised by the repository API at inspection time. Its starter
scripts/templates were not copied into the product. The repo-health script was
run from temporary reference storage only; map3d's runtime and release validator
are local implementations.

The nine PNG/ICO release assets are original programmatically drawn map3d artwork
(© SCOUT SYSTEM), generated by `scripts/generate-icons.py`, with copyright metadata.
They are not upstream, stock or AI-generated image downloads.

## OSM2World — roof and building elevation references

The single-plane roof implementation and validation fixtures were informed by
`SkillionRoof.java`, `SkillionRoofTest.java`, `Roof.java`, `ValueParseUtil.java`
and `VectorXZ.java` from https://github.com/tordanik/OSM2World at
`1d31c252cbef964b489a55e5fb8242ee253375b1`.
map3d uses its own bounded footprint triangulation and does not port the Java
runtime or upstream direction-snapping heuristic. Axes differ (+Z north there,
-Z north here). The reference's trapezoid/angle expectations are adapted in tests.

The min_height / building:min_level precedence and facade-height/level ratio
were also informed by `LevelAndHeightData.java`, `LevelAndHeightDataTest.java`
and `BuildingPart.java` at the same revision. The 12.5m/5levels/min2=5m test
expectation is adapted. map3d does not port missing-level inference, upstream
inconsistent-clearance clamping, the Java runtime or full building parts.
The zero-roof-level follow-up rechecked LevelAndHeightData at this revision:
unknown/null and deliberate0 are distinct. map3d preserves its own existing
height>levels>angle priority rather than porting the entire upstream precedence;
see docs/zero-roof-levels.md.

Pyramidal roof centroid/apex-to-edge semantics and area-centroid formula were
also informed by `PyramidalRoof.java`, `SimplePolygonXZ.java`,
`HeightfieldRoof.java` and `Roof.java` at the same revision. map3d adapts the
centroid with origin-relative coordinates and supports only convex hole-free
fans with tagged roof rise. Concave/hole/missing-rise roofs use an explicitly
reported flat fallback, not a port of upstream constrained triangulation.
The asymmetric-trapezoid fixtures are map3d tests, not upstream test copies.

Rectangular hipped ridge/cap semantics were also informed by `HippedRoof.java`,
`AbstractHippedRoof.java` and `RoofWithRidge.java` at the same pinned revision.
map3d independently implements a four-corner hole-free projected-rectangle
subset with per-end inset min(width/3,0.4*length), node-preserving roof triangles
and tagged rise. It now also adapts RoofWithRidge.calculatePreliminaryHeight
and Roof.parseRoofAngle: tan(angle) times maximum vertex distance to the finite
ridge segment, only for the validated rectangular subset. It does not port the
Java runtime, general heightfield/skeleton or general direction-snapping.
See docs/hipped-angle.md for priority, clamps and projection limitations. map3d now adapts the same file's
explicit ridge-bearing/precedence semantics for hipped rectangles only, with
strict edge alignment and fail-closed active tags, not upstream general snapping.
New fixtures are map3d's own tests; see `docs/hipped-ridge-direction.md`.

The collinear-node follow-up also inspected `SimplePolygonXZ.getSimplifiedPolygon`
and its use by `RoofWithRidge` at that revision. map3d uses independently written,
stricter forward/chord bounds to identify four true corners; it does not copy
upstream broad dot/area-loss tolerances or discard source mesh boundary nodes.
Whole-side axis selection and node-preserving roof/cap tests are map3d additions.
See `docs/hipped-collinear-nodes.md`.
MIT was freshly confirmed from upstream `LICENSE.txt` at that revision.
See `docs/hipped-roofs.md` for exact source links and limitations.

MIT License

Copyright 2010–2026 OSM2World contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## CSP documentation reference (no copied source code)

Production policy was reviewed against the [MDN Content-Security-Policy HTTP header reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy) on2026-11-03. Used for directive/header semantics, not copied as a blanket policy or vendored implementation. Actual origin permissions come from this repository's data source/endpoint source code. See `docs/content-security-policy.md` for explicit style/framing exceptions and local-only validation.


## GPX schema reference (no vendored schema/code)

Reviewed [Topografix GPX1.1 schema documentation](https://www.topografix.com/GPX/1/1/) on2026-11-03 for WGS84 metric coordinates, root/namespace, xs:decimal bounds and logically continuous trkseg semantics. Application implementation is an independently written conservative subset, not complete schema validation; no XSD/code was copied or bundled. Additional byte/point/elevation/model bounds are map3d policy, not represented as GPX standard requirements. See `docs/gpx-import-safety.md`.

## Leaflet controls and GeoJSON collection review (2026-11-03)

Reviewed existing MIT Leaflet1.9.4 `Control.js`, `Control.Scale.js`, `GeoJSON.js` and distributed CSS at [commit d15112c9e8ac339f0f74f563959d0423d291308d](https://github.com/Leaflet/Leaflet/tree/d15112c9e8ac339f0f74f563959d0423d291308d), plus [RFC7946 §3.1.6/3.1.8](https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.8). Used public native positioning/rendering behaviour; no vendored/copied/modified library code, RFC text or examples. Application budgets/validation are an independently written conservative subset, not RFC limits. NotoSansCJKtc-Regular from notofonts/noto-cjk was used only in ignored temporary test fontconfig, not bundled with the app. See `docs/map-footer-layout.md`.

## Independent CAD test tooling (not shipped)

ezdxf1.4.5, MIT, Copyright(c)2020 Manfred Moitzi; source [v1.4.5@84ae31976940f99e6d5f4d3b2e9131da02b574fe](https://github.com/mozman/ezdxf/tree/84ae31976940f99e6d5f4d3b2e9131da02b574fe), [license](https://github.com/mozman/ezdxf/blob/84ae31976940f99e6d5f4d3b2e9131da02b574fe/LICENSE). Installed with pinned supporting packages only for the separate Python CAD gate, not bundled, vendored or executed as an app/backend dependency. No ezdxf implementation source copied. See `scripts/cad-requirements.txt` and `docs/cad-conformance.md`.


## DEM response contract review — 2026-11-03

Reviewed OpenTopoData docs/api.md and opentopodata/api.py@2f365f8d9018aea7b3d70a762bc8c29515c9dd1b for NoData-null/status/input-order contracts, and Open-Meteo DemController.swift/openapi/elevation.yml@d36d80237263a83908447730b24b1f7440a3b8a8 for numeric-array/100-point API contracts. No upstream server implementation was copied, adapted, vendored or bundled; independent client-side validation uses the APP's existing GPX safety bounds. Existing DEM dataset/service attribution remains. Source links and exact limits: `docs/terrain-elevation-integrity.md`.
