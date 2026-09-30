/**
 * Terrain heightfield for the orienteering 3D view.
 *
 * A coarse regular grid of ground heights is fetched from the same keyless,
 * CORS-enabled services the GPX side already uses (Open-Meteo's Copernicus DEM,
 * falling back to OpenTopoData's SRTM), then sampled bilinearly. 100 heights per
 * request keeps this to a single small call for a typical course area; the DEM
 * behind it is 30–90 m resolution, so a denser grid would only add noise.
 */

import { normalizeBBox, LatLngLike } from "./overpass";
import type { LatLng } from "./course";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation";
const OPEN_TOPO_DATA_URL = "https://api.opentopodata.org/v1/srtm30m";
const MAX_POINTS_PER_REQUEST = 100;
const REQUEST_TIMEOUT_MS = 20_000;

export type TerrainSource = "Open-Meteo (Copernicus DEM)" | "OpenTopoData (SRTM)";

export interface HeightField {
  south: number;
  west: number;
  north: number;
  east: number;
  /** grid points along the east–west axis */
  cols: number;
  /** grid points along the south–north axis */
  rows: number;
  /** row-major heights in metres, row 0 = south edge, col 0 = west edge */
  heights: number[];
  source: TerrainSource;
}

/** A flat field, used before the real heights arrive so the scene still renders. */
export function flatHeightField(area: [LatLngLike, LatLngLike] | null): HeightField {
  const b = area
    ? normalizeBBox(area[0], area[1])
    : { south: 22.3, west: 114.16, north: 22.31, east: 114.18 };
  return {
    ...b,
    cols: 2,
    rows: 2,
    heights: [0, 0, 0, 0],
    source: "Open-Meteo (Copernicus DEM)",
  };
}

const coord = (n: number) => n.toFixed(5);
const finiteOr0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

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

function gridSizeFor(area: [LatLngLike, LatLngLike]): number {
  const { south, north, west, east } = normalizeBBox(area[0], area[1]);
  const latMid = ((south + north) / 2) * (Math.PI / 180);
  const heightM = Math.abs(north - south) * 110574;
  const widthM = Math.abs(east - west) * 111320 * Math.cos(latMid);
  const maxSideM = Math.max(widthM, heightM);
  // Target ~250 m between samples, but never more than one 10×10 request.
  return Math.max(5, Math.min(10, Math.ceil(maxSideM / 250)));
}

async function fromOpenMeteo(points: LatLng[]): Promise<number[]> {
  const params = new URLSearchParams({
    latitude: points.map((p) => coord(p.lat)).join(","),
    longitude: points.map((p) => coord(p.lng)).join(","),
  });
  const data = await getJson(`${OPEN_METEO_URL}?${params}`);
  if (!Array.isArray(data?.elevation) || data.elevation.length !== points.length) {
    throw new Error("unexpected Open-Meteo response");
  }
  return data.elevation.map(finiteOr0);
}

async function fromOpenTopoData(points: LatLng[]): Promise<number[]> {
  const params = new URLSearchParams({
    locations: points.map((p) => `${coord(p.lat)},${coord(p.lng)}`).join("|"),
  });
  const data = await getJson(`${OPEN_TOPO_DATA_URL}?${params}`);
  if (data?.status !== "OK" || !Array.isArray(data.results)) {
    throw new Error("unexpected OpenTopoData response");
  }
  return data.results.map((r: any) => finiteOr0(r?.elevation));
}

/**
 * Fetch a height grid covering `area`. The grid is sampled south→north,
 * west→east, so `heights[row * cols + col]` lines up with the bbox.
 */
export async function fetchHeightField(area: [LatLngLike, LatLngLike]): Promise<HeightField> {
  const { south, west, north, east } = normalizeBBox(area[0], area[1]);
  const n = gridSizeFor(area);
  const cols = n;
  const rows = n;
  const total = cols * rows;
  if (total > MAX_POINTS_PER_REQUEST) {
    // Only reachable if the grid grows past 10×10 — keep the request legal anyway.
    throw new Error("terrain grid too large");
  }

  const points: LatLng[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      points.push({
        lat: south + ((north - south) * row) / (rows - 1),
        lng: west + ((east - west) * col) / (cols - 1),
      });
    }
  }

  let source: TerrainSource = "Open-Meteo (Copernicus DEM)";
  let heights: number[];
  try {
    heights = await fromOpenMeteo(points);
  } catch (err) {
    console.warn("[map3d] Open-Meteo terrain failed, trying OpenTopoData…", err);
    source = "OpenTopoData (SRTM)";
    heights = await fromOpenTopoData(points);
  }

  return { south, west, north, east, cols, rows, heights, source };
}

/**
 * Bilinear ground height at a coordinate, in metres. Returns 0 outside the grid
 * so a scene with partial data still renders sensibly.
 */
export function heightAt(field: HeightField | null, at: LatLng): number {
  if (!field || field.heights.length < 4) return 0;
  const { south, west, north, east, cols, rows, heights } = field;
  const spanLat = north - south || 1e-9;
  const spanLng = east - west || 1e-9;
  const fy = Math.min(Math.max((at.lat - south) / spanLat, 0), 1) * (rows - 1);
  const fx = Math.min(Math.max((at.lng - west) / spanLng, 0), 1) * (cols - 1);
  const y0 = Math.floor(fy);
  const x0 = Math.floor(fx);
  const y1 = Math.min(y0 + 1, rows - 1);
  const x1 = Math.min(x0 + 1, cols - 1);
  const ty = fy - y0;
  const tx = fx - x0;
  const at_ = (row: number, col: number) => heights[row * cols + col] ?? 0;
  const top = at_(y0, x0) * (1 - tx) + at_(y0, x1) * tx;
  const bottom = at_(y1, x0) * (1 - tx) + at_(y1, x1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Min / max / span of a field, for the elevation readout. */
export function fieldRange(field: HeightField | null): { min: number; max: number } {
  if (!field || field.heights.length === 0) return { min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const h of field.heights) {
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { min, max };
}
