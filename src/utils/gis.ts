import type { FeatureCollection } from "geojson";
import type { DataSource } from "@/config/dataSources";

export const GIS_LIMITS = { maxBytes: 2_000_000, maxFeatures: 10_000, maxPositions: 150_000,
  maxGeometries: 20_000, maxCollectionDepth: 8, timeoutMs: 25_000 } as const;

/** One bounded walk for validation and bounds; never trust supplied bbox. */
function walkGeoJson(value: unknown, visit?: (position: number[]) => void): FeatureCollection {
  const root = value as any;
  const crs = (object: any) => {
    if (object.crs != null && !["urn:ogc:def:crs:OGC:1.3:CRS84", "urn:ogc:def:crs:EPSG::4326", "EPSG:4326", "OGC:CRS84"].includes(object.crs?.properties?.name)) {
      throw new Error("GeoJSON must be WGS84 longitude/latitude, not a projected CRS");
    }
  };
  if (root?.type !== "FeatureCollection" || !Array.isArray(root.features) || root.features.length > GIS_LIMITS.maxFeatures) {
    throw new Error("Invalid or oversized GeoJSON FeatureCollection");
  }
  crs(root);
  let positions = 0, geometries = 0;
  const position = (p: any) => {
    if (!Array.isArray(p) || p.length < 2 || p.length > 3 || !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90 || ++positions > GIS_LIMITS.maxPositions) throw new Error("Invalid geographic position");
    visit?.(p);
  };
  const array = (value: any) => {
    if (!Array.isArray(value)) throw new Error("Invalid geographic array");
    return value;
  };
  const line = (points: any, ring = false) => {
    if (!Array.isArray(points) || points.length < (ring ? 4 : 2)) throw new Error("Invalid geographic line/ring");
    points.forEach(position);
    const last = points[points.length - 1];
    if (ring && (points[0].length !== last.length || !points[0].every((n: number, i: number) => n === last[i]))) throw new Error("Unclosed polygon ring");
  };
  const polygon = (rings: any) => {
    if (!Array.isArray(rings) || !rings.length) throw new Error("Invalid polygon");
    rings.forEach((r: any) => line(r, true));
  };
  const geometry = (g: any, depth: number) => {
    if (!g || typeof g !== "object" || Array.isArray(g) || ++geometries > GIS_LIMITS.maxGeometries) throw new Error("Invalid or oversized geometry");
    crs(g);
    if (g.type === "GeometryCollection") {
      if (depth >= GIS_LIMITS.maxCollectionDepth || "coordinates" in g || "features" in g) throw new Error("Invalid or deep GeometryCollection");
      for (const child of array(g.geometries)) geometry(child, depth + 1);
      return;
    }
    if ("geometries" in g || "features" in g) throw new Error("Ambiguous geometry members");
    const coordinates = array(g.coordinates);
    switch (g.type) {
      case "Point": position(coordinates); break;
      case "MultiPoint": coordinates.forEach(position); break;
      case "LineString": line(coordinates); break;
      case "MultiLineString": coordinates.forEach((p: any) => line(p)); break;
      case "Polygon": polygon(coordinates); break;
      case "MultiPolygon": coordinates.forEach(polygon); break;
      default: throw new Error("Unsupported GeoJSON geometry");
    }
  };
  for (const feature of root.features) {
    if (feature?.type !== "Feature" || (feature.properties !== null &&
      (typeof feature.properties !== "object" || Array.isArray(feature.properties)))) throw new Error("Invalid GeoJSON feature");
    crs(feature);
    if (feature.geometry !== null) geometry(feature.geometry, 0);
  }
  return root;
}

/** FeatureCollection subset, including bounded mixed/nested GeometryCollection. */
export function validateGeoJson(value: unknown): FeatureCollection {
  return walkGeoJson(value);
}

/** Direct CORS request. Read incrementally so a missing/false Content-Length
 * cannot cause an unbounded download. Caller controls timeout/cancellation.
 */
export async function fetchSourceGeoJson(source: DataSource, signal: AbortSignal, request: typeof fetch = fetch): Promise<FeatureCollection> {
  if (source.kind !== "geojson") throw new Error("This source is not a GeoJSON layer");
  const response = await request(source.url, { signal, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`GIS HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > GIS_LIMITS.maxBytes) {
    await response.body?.cancel();
    throw new Error("GIS dataset exceeds size budget");
  }
  if (!response.body) throw new Error("GIS response has no readable body");
  return readGeoJsonStream(response.body, signal);
}

async function readGeoJsonStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<FeatureCollection> {
  signal.throwIfAborted();
  const reader = stream.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > GIS_LIMITS.maxBytes) throw new Error("GIS dataset exceeds size budget");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return validateGeoJson(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)));
}

/** Local files use the same bounded parser; no upload, URL or archive decoding. */
export async function readLocalGeoJson(file: Pick<File, "size" | "name" | "stream">, signal: AbortSignal) {
  if (!/\.(geojson|json)$/i.test(file.name)) throw new Error("Choose a GeoJSON or JSON file");
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > GIS_LIMITS.maxBytes) throw new Error("GIS file exceeds size budget");
  const data = await readGeoJsonStream(file.stream(), signal);
  const bounds = geoJsonBounds(data);
  if (!bounds) throw new Error("No drawable geographic features");
  return { data, bounds };
}

/** Bounds in Leaflet's latitude/longitude order; no DOM dependency. */
export function geoJsonBounds(data: FeatureCollection): [[number, number], [number, number]] | null {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  walkGeoJson(data, p => {
    west = Math.min(west, p[0]); east = Math.max(east, p[0]);
    south = Math.min(south, p[1]); north = Math.max(north, p[1]);
  });
  return Number.isFinite(west) ? [[south, west], [north, east]] : null;
}
