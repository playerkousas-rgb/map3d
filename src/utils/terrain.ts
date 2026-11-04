/**
 * Terrain heightfield for the orienteering 3D view.
 *
 * A coarse regular grid of ground heights is fetched from the same keyless,
 * CORS-enabled services the GPX side already uses (Open-Meteo's Copernicus DEM,
 * falling back to OpenTopoData's SRTM), then sampled bilinearly. 100 heights per
 * request keeps this to a single small call for a typical course area; the DEM
 * behind it is 30–90 m resolution, so a denser grid would only add noise.
 */

import * as THREE from "three";
import type { LocalProjection } from "./projection";
import { normalizeBBox, LatLngLike } from "./overpass";
import type { LatLng } from "./course";
import { isElevationM } from "./elevationValue";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation";
const OPEN_TOPO_DATA_URL = "https://api.opentopodata.org/v1/srtm30m";
const MAX_POINTS_PER_REQUEST = 100;
const REQUEST_TIMEOUT_MS = 20_000;

export type TerrainSource = "Open-Meteo (Copernicus DEM)" | "OpenTopoData (SRTM)" | "Flat reference (unmeasured)";

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
    source: "Flat reference (unmeasured)",
  };
}

const coord = (n: number) => n.toFixed(5);
const requireElevation = (value: unknown): number => {
  if (!isElevationM(value)) throw new Error("Missing/invalid terrain elevation response");
  return value;
};

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
  if (data?.error === true || !Array.isArray(data?.elevation) || data.elevation.length !== points.length) {
    throw new Error("unexpected Open-Meteo response");
  }
  return Array.from(data.elevation, requireElevation);
}

async function fromOpenTopoData(points: LatLng[]): Promise<number[]> {
  const params = new URLSearchParams({
    locations: points.map((p) => `${coord(p.lat)},${coord(p.lng)}`).join("|"),
  });
  const data = await getJson(`${OPEN_TOPO_DATA_URL}?${params}`);
  if (data?.status !== "OK" || !Array.isArray(data.results) || data.results.length !== points.length) {
    throw new Error("unexpected OpenTopoData response");
  }
  return Array.from(data.results, (r: any) => requireElevation(r?.elevation));
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


/** GeoLibre browser hillshade adaptation; see docs/terrain-analysis.md and THIRD_PARTY_NOTICES.md. */
export interface HillshadeOptions {
  azimuth?: number;
  altitude?: number;
  zFactor?: number;
}

function validateField(field: HeightField) {
  if (!Number.isInteger(field.cols) || !Number.isInteger(field.rows) ||
      field.cols < 2 || field.rows < 2 || field.heights.length !== field.cols * field.rows ||
      !field.heights.every(Number.isFinite) ||
      ![field.south, field.north, field.west, field.east].every(Number.isFinite) ||
      field.north <= field.south || field.east <= field.west) {
    throw new Error("Invalid terrain heightfield");
  }
}

/** Horn 3×3 gradients in metres. Output keeps the field's SOUTH-first row order.
 * Unlike GeoLibre's north-first raster, positive row gradient here means north.
 * Dotting the upward surface normal with the sun is equivalent to its
 * slope/aspect formula, without the raster row/aspect sign ambiguity.
 */
export function hillshadeValues(field: HeightField, options: HillshadeOptions = {}): Uint8ClampedArray {
  validateField(field);
  const { azimuth = 315, altitude = 45, zFactor = 1 } = options;
  if (![azimuth, altitude, zFactor].every(Number.isFinite) || altitude < 0 || altitude > 90 || zFactor < 0) {
    throw new Error("Invalid hillshade parameters");
  }
  const rad = Math.PI / 180;
  const dx = (field.east - field.west) * 111320 *
    Math.max(1e-4, Math.cos((field.north + field.south) / 2 * rad)) / (field.cols - 1);
  const dy = (field.north - field.south) * 111320 / (field.rows - 1);
  const sunE = Math.sin(azimuth * rad) * Math.cos(altitude * rad);
  const sunN = Math.cos(azimuth * rad) * Math.cos(altitude * rad);
  const sunUp = Math.sin(altitude * rad);
  const out = new Uint8ClampedArray(field.heights.length);
  const at = (r: number, c: number) => field.heights[
    Math.max(0, Math.min(field.rows - 1, r)) * field.cols + Math.max(0, Math.min(field.cols - 1, c))
  ];
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      const e = (at(r - 1, c + 1) + 2 * at(r, c + 1) + at(r + 1, c + 1) -
        at(r - 1, c - 1) - 2 * at(r, c - 1) - at(r + 1, c - 1)) * zFactor / (8 * dx);
      const n = (at(r + 1, c - 1) + 2 * at(r + 1, c) + at(r + 1, c + 1) -
        at(r - 1, c - 1) - 2 * at(r - 1, c) - at(r - 1, c + 1)) * zFactor / (8 * dy);
      out[r * field.cols + c] = Math.round(255 * Math.max(0,
        Math.min(1, (-e * sunE - n * sunN + sunUp) / Math.hypot(e, n, 1))));
    }
  }
  return out;
}

/** North at canvas top; UV (0,0) at south-west after CanvasTexture's Y flip. */
export function createHillshadeTexture(field: HeightField, options: HillshadeOptions = {}): THREE.CanvasTexture {
  const values = hillshadeValues(field, options);
  const canvas = document.createElement("canvas");
  canvas.width = field.cols;
  canvas.height = field.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  const pixels = ctx.createImageData(field.cols, field.rows);
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      const i = (r * field.cols + c) * 4;
      const v = values[(field.rows - 1 - r) * field.cols + c];
      pixels.data.set([v, v, v, 255], i);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.channel = 1; // independent of the map mosaic's Mercator UVs
  texture.colorSpace = THREE.NoColorSpace;
  // Grid values are at vertices, not pixel centres: align texel centres to bbox edges.
  texture.repeat.set((field.cols - 1) / field.cols, (field.rows - 1) / field.rows);
  texture.offset.set(0.5 / field.cols, 0.5 / field.rows);
  return texture;
}

export interface ContourOptions {
  interval?: number;
  base?: number;
  exaggeration?: number;
  lift?: number;
  /** Must match the ground mesh's triangulation resolution. */
  segments?: number;
}

/** Intersect constant elevations with the SAME triangles used by Ground.
 * This avoids ambiguous marching-square saddles and floating/chorded contours.
 * Levels are real metres; exaggeration affects only their rendered Y positions.
 */
export function buildContourGeometry(field: HeightField, projection: LocalProjection,
  options: ContourOptions = {}): THREE.BufferGeometry {
  validateField(field);
  const { interval = 10, base = 0, exaggeration = 1, lift = 0.35, segments = 48 } = options;
  if (![interval, base, exaggeration, lift, segments].every(Number.isFinite) || interval <= 0 ||
      exaggeration < 0 || !Number.isInteger(segments) || segments < 1 || segments > 256) {
    throw new Error("Invalid contour parameters");
  }
  const { min, max } = fieldRange(field);
  if ((max - min) / interval > 1000) throw new Error("Too many contour levels");
  const vertices: { x: number; z: number; h: number }[] = [];
  for (let r = 0; r <= segments; r++) {
    for (let c = 0; c <= segments; c++) {
      const lat = field.south + (field.north - field.south) * r / segments;
      const lng = field.west + (field.east - field.west) * c / segments;
      vertices.push({ ...projection.toScene(lat, lng), h: heightAt(field, { lat, lng }) });
    }
  }
  const positions: number[] = [];
  const triangle = (ids: number[]) => {
    const points = ids.map(i => vertices[i]);
    const low = Math.min(...points.map(p => p.h));
    const high = Math.max(...points.map(p => p.h));
    if (low === high) return; // plateaus have no unique isoline
    const first = Math.ceil((low - base) / interval);
    const last = Math.floor((high - base) / interval);
    for (let k = first; k <= last; k++) {
      const level = base + k * interval;
      const hits: { x: number; z: number }[] = [];
      for (let e = 0; e < 3; e++) {
        const a = points[e], b = points[(e + 1) % 3];
        // Half-open crossing rule handles exact vertices without double hits.
        if ((a.h <= level && b.h > level) || (b.h <= level && a.h > level)) {
          const t = (level - a.h) / (b.h - a.h);
          hits.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
        }
      }
      if (hits.length === 2 && Math.hypot(hits[0].x - hits[1].x, hits[0].z - hits[1].z) > 1e-7) {
        for (const p of hits) positions.push(p.x, level * exaggeration + lift, p.z);
      }
    }
  };
  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const a = r * (segments + 1) + c, b = a + 1, d = a + segments + 2, cc = d - 1;
      triangle([a, cc, b]);
      triangle([b, cc, d]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** South-first rows, eastward columns, scene north = -Z: wind faces UP.
 * Sharing this index generator with Ground keeps render/picking/CAD consistent.
 */
export function buildTerrainIndices(segments: number): number[] {
  if (!Number.isInteger(segments) || segments < 1 || segments > 512) throw new Error("Invalid terrain resolution");
  const indices: number[] = [];
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * (segments + 1) + col;
      const b = a + 1, c = a + segments + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return indices;
}
