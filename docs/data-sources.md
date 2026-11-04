# GIS catalogue: sources, protocol and limits

Catalogue inspected on2026-11-02; shared collection validator/footer refreshed2026-11-03. `src/config/dataSources.ts` is the single catalogue; `DataSources.tsx` renders controls and creates Leaflet layers. Existing 3D tile URLs also read this catalogue.

## Ten datasets, seven providers — not ten fully integrated providers

| Entry | Protocol/status | Evidence |
|---|---|---|
| OpenStreetMap | XYZ basemap | Existing selection-map service; [copyright/terms](https://www.openstreetmap.org/copyright) |
| Hong Kong basemap | XYZ basemap | Existing `tiles.ts` endpoint; [Map API terms](https://portal.csdi.gov.hk/csdi-webpage/doc/TNC) |
| Hong Kong aerial photography | XYZ basemap | Existing `tiles.ts` endpoint; same terms; not real-time imagery |
| OpenTopoMap | XYZ basemap | Existing `tiles.ts` endpoint; [terms](https://opentopomap.org/about) |
| NASA MODIS true colour | `L.tileLayer.wms`, EPSG:3857, WMS 1.1.1 | [Official GIBS access documentation](https://nasa-gibs.github.io/gibs-api-docs/access-basics/); [EPSG:3857 GetCapabilities](https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1). Layer `MODIS_Terra_CorrectedReflectance_TrueColor` and fixed date **2013-11-04** are used in NASA's [Leaflet source example](https://github.com/nasa-gibs/gibs-web-examples/blob/main/examples/leaflet/webmercator-epsg3857.js). This is explicitly historical imagery, with cloud/no-data and low-resolution limitations. |
| Natural Earth countries | `L.geoJSON` overlay, 1:110m | [Official downloads](https://www.naturalearthdata.com/downloads/); [`ne_110m_admin_0_countries.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_admin_0_countries.geojson) |
| Natural Earth rivers | `L.geoJSON` overlay, 1:110m | [`ne_110m_rivers_lake_centerlines.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_rivers_lake_centerlines.geojson) |
| Natural Earth lakes | `L.geoJSON` overlay, 1:110m | [`ne_110m_lakes.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_lakes.geojson) |
| WorldPop population | **Download reference only** | [Hub](https://hub.worldpop.org/); supplied [directory](https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/0_Mosaicked/) actually lists an approximately **829 MB TIFF** and **71 GB ZIP**, not a WMS endpoint. The app does not auto-download or render these. Individual dataset licences apply. |
| HydroSHEDS HydroRIVERS | **Download/preprocessing reference only** | [Official HydroRIVERS page](https://www.hydrosheds.org/products/hydrorivers) identifies the Asia Shapefile ZIP as approximately **91 MB**. A Shapefile ZIP cannot be passed directly to `L.geoJSON`. Clip/reproject/convert externally first; HydroSHEDS licence and required attribution apply. |

The Natural Earth URLs are pinned to inspected revision `ca96624a56bd078437bca8184e78163e5039ad19`, rather than moving `master`. Original files were retrieved through GitHub for validation in ignored temporary storage: **177 country, 13 river and 24 lake features** passed the same geometry validator used by the app. No source dataset is committed or bundled. Natural Earth data are public domain; the user-facing attribution remains visible.

## Loading and safety

- Browser → provider directly. No `/api` proxy, secret or platform-hosted dataset cache is introduced.
- One basemap at a time; independently selectable GeoJSON overlays. Unknown IDs and download-only entries fail closed.
- `L.tileLayer.wms` generates the projection/BBOX request; no hand-built WMS query serializer. XYZ and WMS native zoom limits are retained while allowing overscaling.
- `L.geoJSON` receives validated data only. GeoJSON fetches omit credentials, use CORS and are cancelled on removal/unmount, with a 25-second timeout. Response size is checked both against Content-Length and while streaming, capped at 2 MB; features at 10,000 and positions at 150,000. Shared validator/bounds now accepts mixed/nested GeometryCollection within Features, with global20,000 Geometry objects /8 collection levels; no flattening or trusting bbox ([implementation/tests](map-footer-layout.md)). Invalid/projected coordinates, malformed rings and unsupported geometries are rejected.
- Geometry properties are never injected as HTML. Reference paths are non-interactive so they do not block selecting the course area.
- Loading, loaded and failed/partially missing tile states are visible, with retry. Removing a layer removes its attribution before releasing event listeners. No false fallback-success state is reported.
- These are **2D planning references only**, not newly integrated 3D DEM/building/export data. Natural Earth is too coarse for street or orienteering navigation. An overlay need not show a feature inside a small Hong Kong selection.

## Verification boundaries

The automated browser suite (now368 dev +36 built-production CSP checks, broader than GIS alone) uses mocked imagery/GeoJSON to test loading, failure, retry, cleanup, attribution, WMS query construction, UI sizes and downloads. They do **not** prove live cross-origin access, service uptime, geographical coverage, imagery quality or supplier licence compliance for a specific reuse. Actual provider responses can still be blocked by CORS, offline conditions or service policy; the UI reports failure.

A [bounded local GeoJSON workflow](local-data-and-sharing.md) now displays externally clipped/converted vector files. This is not native TIFF/Shapefile decoding or WorldPop population analysis. Direct provider rendering still needs a suitable documented CORS-enabled web service. The original request for ten directly rendered GIS providers is therefore **not fully complete**; the delivered catalogue is ten dataset entries, eight browser-layer configurations plus two honest download references.

## OSM hipped interpretation refresh — 2026-11-03

Both browser-direct Overpass workflows now recognize bounded rectangular `roof:shape=hipped` with explicit rise; no endpoint, provider or server proxy added. Flat fallback is counted per valid component, separate from rejected objects and other roofs. Strict projected orthogonality can yield an extra fallback in one mode; no claim of identical support for every physical rectangle. Original source tags stay unchanged. See [source, policies and mock-network/CAD evidence](hipped-roofs.md). The catalogue remains10datasets/7providers/8browser configurations+2bulk references, not10rendered providers.

## Explicit hipped ridge tags — 2026-11-03

The existing OSM streams additionally interpret roof:ridge:direction for bounded hipped rectangles. No endpoint/provider/backend change; original tags preserved. Slope→ridge→orientation precedence, strict scene-projected edge alignment and conservative active-tag fallback are documented in [hipped-ridge-direction.md](hipped-ridge-direction.md). Mock-network checks are not live completeness/CORS evidence.

## Hipped collinear OSM nodes — 2026-11-03

Existing browser-direct streams now preserve valid straight-edge nodes of four-true-corner hipped rectangles. Whole-side geometry, not longest source segment, chooses default axis. No provider/endpoint/raw-tag/budget change, no node deletion before safety checks. Both actual collector/native download paths tested with mock data; not live coverage. See `hipped-collinear-nodes.md`.
