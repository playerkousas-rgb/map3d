import { DATA_SOURCES, getDataSource, normalizeSourceSelection } from "../src/config/dataSources";
import { fetchSourceGeoJson, validateGeoJson, GIS_LIMITS } from "../src/utils/gis";
import { useExportStore, safeExportFilename } from "../src/state/exportStore";

export async function verifyGisAndExports(ok: (condition: boolean, label: string) => void) {
  console.log("\n[8] GIS registry, bounded loading and export state");
  ok(DATA_SOURCES.length === 12 && new Set(DATA_SOURCES.map(s => s.id)).size === 12, "12 distinct dataset entries (10 rendered + 2 honest download references)");
  ok(DATA_SOURCES.every(s => s.url.startsWith("https://") && s.docs.startsWith("https://") && !!s.attribution && !!s.noteZh), "all datasets have HTTPS, provenance, attribution and limitations");
  ok(getDataSource("worldpop").kind === "download" && getDataSource("hydrorivers").kind === "download", "TIFF/Shapefile downloads are not misrepresented as web layers");
  ok(DATA_SOURCES.filter(s => s.kind === "geojson").every(s => /[a-f0-9]{40}/.test(s.url)), "Natural Earth data URLs are pinned to inspected source revision");
  ok(JSON.stringify(normalizeSourceSelection(["worldpop", "unknown", "ne-countries", "ne-countries", "hk-map", "osm"])) ===
    JSON.stringify(["hk-map", "ne-countries"]), "selection ignores unknown/download IDs, deduplicates overlays and chooses one basemap");
  ok(JSON.stringify(normalizeSourceSelection([])) === '["osm"]', "empty selection safely restores the default basemap");
  let unknownRejected = false;
  try { getDataSource("fake-wms"); } catch { unknownRejected = true; }
  ok(unknownRejected, "unregistered sources fail closed");
  const sample = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "test" }, geometry: { type: "Polygon",
    coordinates: [[[114, 22], [115, 22], [115, 23], [114, 22]]] } }] };
  ok(validateGeoJson(sample).features.length === 1, "valid geographic polygon accepted");
  const invalidCases: [string, unknown][] = [
    ["non-GeoJSON HTML", "<html>Error</html>"],
    ["missing features", { type: "FeatureCollection" }],
    ["excessive features", { type: "FeatureCollection", features: Array(GIS_LIMITS.maxFeatures + 1).fill(null) }],
    ["projected/out-of-range coordinates", { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [114000, 22000] } }] }],
    ["NaN coordinates", { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [NaN, 22] } }] }],
    ["unsupported geometry", { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Bad", coordinates: [] } }] }],
    ["unclosed polygon", { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] } }] }],
  ];
  for (const [label, value] of invalidCases) {
    let rejected = false;
    try { validateGeoJson(value); } catch { rejected = true; }
    ok(rejected, `rejects ${label}`);
  }
  const controller = new AbortController();
  let direct = false;
  const result = await fetchSourceGeoJson(getDataSource("ne-countries"), controller.signal, (async (url, options) => {
    direct = String(url) === getDataSource("ne-countries").url && options?.credentials === "omit" && options?.mode === "cors" && options?.signal === controller.signal;
    return new Response(JSON.stringify(sample));
  }) as typeof fetch);
  ok(direct && result.features.length === 1, "GeoJSON fetch is provider-direct, abortable, cookie-free and validated");
  for (const [label, response] of [
    ["HTTP errors", new Response("failed", { status: 503 })],
    ["oversized Content-Length", new Response("{}", { headers: { "content-length": String(GIS_LIMITS.maxBytes + 1) } })],
    ["oversized streamed body", new Response(new Uint8Array(GIS_LIMITS.maxBytes + 1))],
    ["invalid JSON", new Response("<ServiceException>no data</ServiceException>")],
  ] as const) {
    let rejected = false;
    try { await fetchSourceGeoJson(getDataSource("ne-countries"), controller.signal, (async () => response) as typeof fetch); } catch { rejected = true; }
    ok(rejected, `GIS fetch rejects ${label}`);
  }
  let downloaded = false;
  try { await fetchSourceGeoJson(getDataSource("worldpop"), controller.signal, (async () => { downloaded = true; return new Response(); }) as typeof fetch); } catch { /* expected */ }
  ok(!downloaded, "WorldPop bulk downloads cannot accidentally enter the GeoJSON loader");

  const store = useExportStore;
  store.setState({ status: "idle", requestId: 0 });
  ok(store.getState().requestExport("dxf", "../../a:test") && store.getState().filename === "a-test", "export request sanitizes filenames and enters queue");
  const id = store.getState().requestId;
  ok(!store.getState().requestExport("glb") && store.getState().requestId === id, "double tap does not queue a second export");
  ok(!store.getState().start(id - 1) && store.getState().start(id), "only the current queued request can start");
  store.getState().finish(id - 1, true);
  ok(store.getState().status === "running", "stale completion cannot overwrite the active export");
  store.getState().dismiss();
  ok(store.getState().status === "running", "running export cannot be dismissed into an accidental duplicate");
  store.getState().finish(id, false);
  ok(store.getState().status === "error", "encoder failure produces visible error state");
  ok(store.getState().requestExport("glb") && store.getState().requestId === id + 1, "failed export can be retried");
  store.getState().start(id + 1); store.getState().finish(id + 1, true);
  ok(store.getState().status === "success", "encoder success reports download requested, not file saved");
  store.getState().dismiss();
  ok(store.getState().status === "idle" && safeExportFilename("///") === "map3d", "completed feedback dismisses and empty filenames have a safe default");
  ok(!store.getState().requestExport("invalid" as "dxf"), "unsupported runtime export formats are rejected");
  store.setState({ status: "idle", requestId: 0, format: "glb", filename: "map3d" });
}
