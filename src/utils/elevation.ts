/**
 * Fill in missing GPX elevations from a global terrain model.
 *
 * Primary:  Open-Meteo Elevation API (Copernicus DEM GLO-90, keyless, CORS,
 *           up to 100 coordinates per request)
 * Fallback: OpenTopoData public API (SRTM 30 m, keyless, 100 locations and
 *           max. 1 request per second)
 *
 * Both services come from the curated list in playerkousas-rgb/api
 * (docs/world-scout.md). At most MAX_SAMPLES points are looked up; the rest
 * of the track is interpolated by distance, so a request stays small.
 */
import { GpxPoint, GpxTrack, computeGpxStats, haversine } from "./gpx";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation";
const OPEN_TOPO_DATA_URL = "https://api.opentopodata.org/v1/srtm30m";
const MAX_SAMPLES = 400; // <= 4 requests of 100 points
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;
const OPEN_TOPO_DATA_INTERVAL_MS = 1100; // public API: max 1 call / second

export type ElevationSource = "Open-Meteo (Copernicus DEM)" | "OpenTopoData (SRTM)";

export interface ElevationResult {
  track: GpxTrack;
  source: ElevationSource;
}

/** Evenly spaced indices (always including first and last). */
function sampleIndices(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < max; k++) {
    const i = Math.round((k * (count - 1)) / (max - 1));
    if (out[out.length - 1] !== i) out.push(i);
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const coord = (n: number) => n.toFixed(5);
const finiteOr0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function fromOpenMeteo(points: GpxPoint[]): Promise<number[]> {
  const out: number[] = [];
  for (const batch of chunk(points, BATCH_SIZE)) {
    const params = new URLSearchParams({
      latitude: batch.map((p) => coord(p.lat)).join(","),
      longitude: batch.map((p) => coord(p.lon)).join(","),
    });
    const data = await getJson(`${OPEN_METEO_URL}?${params}`);
    if (!Array.isArray(data?.elevation) || data.elevation.length !== batch.length) {
      throw new Error("unexpected Open-Meteo response");
    }
    out.push(...data.elevation.map(finiteOr0));
  }
  return out;
}

async function fromOpenTopoData(points: GpxPoint[]): Promise<number[]> {
  const out: number[] = [];
  const batches = chunk(points, BATCH_SIZE);
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await sleep(OPEN_TOPO_DATA_INTERVAL_MS);
    const params = new URLSearchParams({
      locations: batches[b].map((p) => `${coord(p.lat)},${coord(p.lon)}`).join("|"),
    });
    const data = await getJson(`${OPEN_TOPO_DATA_URL}?${params}`);
    if (
      data?.status !== "OK" ||
      !Array.isArray(data.results) ||
      data.results.length !== batches[b].length
    ) {
      throw new Error("unexpected OpenTopoData response");
    }
    out.push(...data.results.map((r: any) => finiteOr0(r?.elevation)));
  }
  return out;
}

/** Linear interpolation (by distance along the track) between sampled points. */
function interpolate(points: GpxPoint[], idx: number[], values: number[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]));
  }
  const out = new Array<number>(points.length).fill(values[0] ?? 0);
  for (let k = 0; k < idx.length; k++) out[idx[k]] = values[k];
  for (let k = 0; k < idx.length - 1; k++) {
    const i0 = idx[k];
    const i1 = idx[k + 1];
    const span = cumulative[i1] - cumulative[i0];
    for (let i = i0 + 1; i < i1; i++) {
      const f = span > 0 ? (cumulative[i] - cumulative[i0]) / span : (i - i0) / (i1 - i0);
      out[i] = values[k] + (values[k + 1] - values[k]) * f;
    }
  }
  return out;
}

export async function fillTrackElevation(track: GpxTrack): Promise<ElevationResult> {
  const idx = sampleIndices(track.points.length, MAX_SAMPLES);
  const samples = idx.map((i) => track.points[i]);

  let source: ElevationSource = "Open-Meteo (Copernicus DEM)";
  let values: number[];
  try {
    values = await fromOpenMeteo(samples);
  } catch (err) {
    console.warn("[map3d] Open-Meteo elevation failed, trying OpenTopoData…", err);
    source = "OpenTopoData (SRTM)";
    values = await fromOpenTopoData(samples);
  }

  const elevations = interpolate(track.points, idx, values);
  const points = track.points.map((p, i) => ({ ...p, ele: elevations[i] }));
  return { track: { points, stats: computeGpxStats(points, track.stats.name) }, source };
}
