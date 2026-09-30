/**
 * Official Hong Kong map tiles for the 3D ground.
 *
 * The orienteering ground is textured with the Lands Department Map API — the
 * same iB20000 / HM20C-series data the paper sheets come from — mosaicked into a
 * single canvas so the whole model is one draw call instead of dozens of quads.
 *
 * Two caveats are handled here rather than in the UI:
 *   • the API is loaded cross-origin, so every tile is requested with
 *     `crossOrigin="anonymous"`; if that fails (no CORS header / offline) the
 *     mosaic builder rejects and the scene falls back to a plain ground,
 *   • a mosaic is capped at 64 tiles, so the zoom level adapts to the area size
 *     instead of asking for thousands of images.
 *
 * Attribution is a licence requirement of the Lands Department API:
 * "Map from Lands Department" must stay visible wherever the tiles are shown.
 */

import { BBox } from "./overpass";

export type GroundLayerId = "hm20c" | "imagery" | "countryside" | "plain";

export interface GroundLayerInfo {
  id: GroundLayerId;
  /** official service the tiles come from */
  label: string;
  labelZh: string;
  maxZoom: number;
  attribution: string;
  /** Chinese-must-show note for the UI */
  official: boolean;
}

export const LANDSD_ATTRIBUTION =
  "Map from Lands Department · Aerial Photograph from Lands Department · © Scout System";
export const COUNTRYSIDE_ATTRIBUTION =
  "© OpenTopoMap (CC-BY-SA) © OpenStreetMap contributors · 郊遊圖參考 · © Scout System";

export const GROUND_LAYERS: Record<Exclude<GroundLayerId, "plain">, GroundLayerInfo> = {
  hm20c: {
    id: "hm20c",
    label: "HM20C / iB20000",
    labelZh: "HM20C / iB20000",
    maxZoom: 20,
    attribution: LANDSD_ATTRIBUTION,
    official: true,
  },
  imagery: {
    id: "imagery",
    label: "Aerial photograph",
    labelZh: "航空照片",
    maxZoom: 20,
    attribution: LANDSD_ATTRIBUTION,
    official: true,
  },
  countryside: {
    id: "countryside",
    label: "Countryside",
    labelZh: "郊遊圖",
    maxZoom: 17,
    attribution: COUNTRYSIDE_ATTRIBUTION,
    official: false,
  },
};

const LANDSD_API = "https://mapapi.geodata.gov.hk/gs/api/v1.0.0";

/** Tile URL template for a layer (Lands Department topographic / imagery, or OpenTopoMap). */
export function tileUrlFor(layer: GroundLayerId, z: number, x: number, y: number): string | null {
  switch (layer) {
    case "hm20c":
      return `${LANDSD_API}/xyz/basemap/WGS84/${z}/${x}/${y}.png`;
    case "imagery":
      return `${LANDSD_API}/xyz/imagery/WGS84/${z}/${x}/${y}.png`;
    case "countryside":
      return `https://${["a", "b", "c"][(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Web-Mercator tile maths
 * ------------------------------------------------------------------ */

export interface TileXY {
  x: number;
  y: number;
}

/** Mercator "world coordinate" (0…1) of a longitude. */
export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

/** Mercator "world coordinate" (0…1) of a latitude. */
export function latToTileY(lat: number, z: number): number {
  const clamped = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

/** Longitude of a (fractional) tile x coordinate. */
export function tileXToLng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

/** Latitude of a (fractional) tile y coordinate. */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Normalised Mercator y of a latitude — used to map the mosaic onto the ground. */
export function mercatorY(lat: number): number {
  const clamped = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

export interface TileRange {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
}

/** Inclusive tile range covering a bbox at a zoom level. */
export function tileRange(bbox: BBox, z: number): TileRange {
  const minX = Math.floor(lngToTileX(bbox.west, z));
  const maxX = Math.floor(lngToTileX(bbox.east, z));
  const minY = Math.floor(latToTileY(bbox.north, z));
  const maxY = Math.floor(latToTileY(bbox.south, z));
  return {
    z,
    minX,
    maxX,
    minY,
    maxY,
    count: (maxX - minX + 1) * (maxY - minY + 1),
  };
}

/**
 * Highest zoom whose tile range still fits in `maxTiles` — the mosaic stays
 * crisp for a small course area without exploding for a whole district.
 */
export function chooseZoom(bbox: BBox, maxTiles = 64, maxZoom = 20): TileRange {
  for (let z = Math.min(maxZoom, 20); z >= 1; z--) {
    const range = tileRange(bbox, z);
    if (range.count <= maxTiles) return range;
  }
  return tileRange(bbox, 1);
}

export interface TileMosaic {
  canvas: HTMLCanvasElement;
  /** geographic extent the canvas covers */
  bounds: { south: number; west: number; north: number; east: number };
  zoom: number;
  tiles: number;
}

function loadTile(url: string, timeoutMs = 12_000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required: the canvas is uploaded as a WebGL texture, so the image must be
    // CORS-clean. A tainted canvas would throw on texture upload.
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error("tile timeout"));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("tile failed"));
    };
    img.src = url;
  });
}

/**
 * Download every tile covering `bbox` and draw them into one canvas.
 * Resolves to null when the layer cannot be textured (offline, blocked CORS…)
 * so the caller can fall back to a plain ground instead of failing.
 */
export async function buildTileMosaic(
  bbox: BBox,
  layer: GroundLayerId,
  options: { maxTiles?: number; maxZoom?: number; tilePx?: number } = {},
): Promise<TileMosaic | null> {
  if (layer === "plain") return null;
  const maxZoom = options.maxZoom ?? GROUND_LAYERS[layer].maxZoom;
  const range = chooseZoom(bbox, options.maxTiles ?? 64, maxZoom);
  const tilePx = options.tilePx ?? 256;
  const cols = range.maxX - range.minX + 1;
  const rows = range.maxY - range.minY + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * tilePx;
  canvas.height = rows * tilePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const jobs: Promise<void>[] = [];
  let loaded = 0;
  for (let ty = range.minY; ty <= range.maxY; ty++) {
    for (let tx = range.minX; tx <= range.maxX; tx++) {
      const url = tileUrlFor(layer, range.z, tx, ty);
      if (!url) continue;
      jobs.push(
        loadTile(url).then((img) => {
          ctx.drawImage(img, (tx - range.minX) * tilePx, (ty - range.minY) * tilePx, tilePx, tilePx);
          loaded++;
        }),
      );
    }
  }

  // Every tile must arrive, otherwise the ground would show holes.
  try {
    await Promise.all(jobs);
  } catch (err) {
    console.warn(`[map3d] ground layer "${layer}" could not be textured:`, err);
    return null;
  }
  if (loaded === 0) return null;

  return {
    canvas,
    zoom: range.z,
    tiles: loaded,
    bounds: {
      north: tileYToLat(range.minY, range.z),
      south: tileYToLat(range.maxY + 1, range.z),
      west: tileXToLng(range.minX, range.z),
      east: tileXToLng(range.maxX + 1, range.z),
    },
  };
}
