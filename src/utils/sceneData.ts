import { buildingDimensions, needsSkillionDirectionFallback } from "./builders/buildingBuilder";
/**
 * Scene data for the orienteering 3D view: real building footprints, road
 * centrelines and terrain heights for the area a planner selected.
 *
 * This is the shared, typed fetching layer — the 3D components only deal with
 * metres and lat/lng, never with Overpass payloads. Geometry is deliberately
 * kept in true metres (1 scene unit = 1 m) so distances, bearings and the
 * orienteering grid references agree with the ground.
 *
 * ## Why the area is fetched in cells
 *
 * A single Overpass query over a big box is the one thing that reliably makes
 * a city fail to load: the mirror runs out of time or memory server-side, the
 * response is flagged incomplete or dropped, and the user gets "buildings
 * unavailable" for an area that plainly has buildings.
 *
 * Measured in dense Hong Kong (see `utils/measure.ts`), a ~1.2 km box answers
 * in a couple of seconds while a 5.5 km box already takes ~20 s and an 11 km
 * box times out. So the box is cut into a grid of cells of roughly that size
 * and the cells are fetched with a small amount of concurrency. Every cell
 * that answers is handed to the caller immediately, so the city fills in while
 * the rest is still loading, and a cell that fails only costs that cell.
 *
 * There is deliberately **no fetch/response size cap**: data travels directly
 * from Overpass, not through the hosting provider. Provider limits and device
 * safety govern the result. Footprint topology/complexity rejection is reported
 * in progress, unlike the removed hard cut-off after a few thousand items.
 */

import { BBox, LatLngLike, normalizeBBox, overpassQuery } from "./overpass";
import type { LatLng } from "./course";
import { createProjection } from "./projection";
import { parseOsmBuildings, type OsmBuildingFootprint } from "./osmBuildings";

export interface SceneBuilding {
  id: number;
  key?: string;
  holes?: LatLng[][];
  /** real-world height in metres (OSM `height`, else estimated storeys + roof, else 10 m) */
  heightM: number;
  /** lowest terrain height across the footprint, filled in by the scene */
  tags: Record<string, string>;
  /** footprint ring, closed implicitly */
  ring: LatLng[];
}

export interface SceneRoad {
  id: number;
  widthM: number;
  tags: Record<string, string>;
  path: LatLng[];
}

/** Progress of a multi-cell fetch, reported as each cell lands. */
export interface CellProgress {
  /** Valid skillion components displayed flat because the downhill direction is missing/invalid. */
  flatSkillionRoofs?: number;
  /** Unsupported pyramidal roof components preserved as explicitly reported flat roofs. */
  flatPyramidalRoofs?: number;
  /** Hipped components outside the conservative rectangle/rise subset. */
  flatHippedRoofs?: number;
  /** Unsupported/incomplete building objects, never replaced with filled outers. */
  skippedBuildings?: number;
  /** how many cells are in this fetch (1 = the whole box fit in one query) */
  total: number;
  /** how many cells have been answered (or have failed) so far */
  done: number;
  /** cells that reported an error — the rest of the area still loaded */
  failed: number;
}

/** Validated map-mode footprint; unsupported objects are reported in progress. */
export type RawBuilding = OsmBuildingFootprint;

/** Total roof-inclusive height; explicit height wins over estimated storeys. */
export function buildingHeightM(tags: Record<string, string> | undefined): number {
  return buildingDimensions(tags).totalHeight;
}

/**
 * Carriageway width in metres. `width` and `lanes` win when tagged, otherwise
 * a sensible default per highway class — the same ladder the HKMAP planner uses
 * for its printed road casings.
 */
export function roadWidthM(tags: Record<string, string> | undefined): number {
  const width = parseFloat(String(tags?.width ?? "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(width) && width > 0) return Math.min(Math.max(width, 0.6), 40);
  const lanes = parseFloat(tags?.lanes ?? "");
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(lanes * 3.2, 30);
  switch (tags?.highway) {
    case "motorway":
    case "trunk":
      return 18;
    case "primary":
      return 14;
    case "secondary":
      return 11;
    case "tertiary":
      return 8;
    case "residential":
    case "unclassified":
    case "living_street":
    case "service":
      return 6;
    case "pedestrian":
      return 5;
    case "footway":
    case "path":
    case "steps":
      return 2;
    case "cycleway":
      return 2.5;
    default:
      return 4;
  }
}

/* ------------------------------------------------------------------ *
 * Cell planning
 * ------------------------------------------------------------------ */

/** Side length a single cell aims for, in metres. */
export const CELL_TARGET_M = 1200;
/**
 * Never cut a box into more than this per axis. It bounds the number of
 * requests a single "get the 3D scene" can make (5×5 = 25 worst case); past
 * that the cells simply get larger, which is slower but still works.
 */
export const CELL_MAX_PER_AXIS = 5;
/**
 * Cells in flight at once, per data kind. Overpass asks clients not to flood
 * an instance, so this stays small — a phone gains nothing from ten
 * simultaneous queries. Buildings and roads are fetched as two independent
 * streams, so the real ceiling in flight is twice this.
 */
export const CELL_CONCURRENCY = 2;

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320;

/**
 * Cut a bbox into a grid of cells, each about `targetM` across (never more
 * than `maxPerAxis` per axis). A small box is returned untouched, so the
 * common "one quick query" case is byte-for-byte what it always was.
 */
export function planCells(
  bbox: BBox,
  targetM: number = CELL_TARGET_M,
  maxPerAxis: number = CELL_MAX_PER_AXIS,
): BBox[] {
  const latMid = ((bbox.south + bbox.north) / 2) * (Math.PI / 180);
  const widthM = (bbox.east - bbox.west) * M_PER_DEG_LNG * Math.cos(latMid);
  const heightM = (bbox.north - bbox.south) * M_PER_DEG_LAT;
  const cols = Math.min(maxPerAxis, Math.max(1, Math.ceil(widthM / targetM)));
  const rows = Math.min(maxPerAxis, Math.max(1, Math.ceil(heightM / targetM)));
  if (cols === 1 && rows === 1) return [bbox];

  const cells: BBox[] = [];
  const dLat = (bbox.north - bbox.south) / rows;
  const dLng = (bbox.east - bbox.west) / cols;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        south: bbox.south + dLat * row,
        north: bbox.south + dLat * (row + 1),
        west: bbox.west + dLng * col,
        east: bbox.west + dLng * (col + 1),
      });
    }
  }
  return cells;
}

/** Stable identity of an OSM element — cells overlap on their shared edge. */
function elementKey(element: any): string | null {
  const id = element?.id;
  if (id === undefined || id === null) return null;
  return `${element.type ?? "way"}:${id}`;
}

/**
 * Run `buildQuery` over every cell of `bbox` and return the merged elements.
 *
 * Elements are de-duplicated across cell borders, `onProgress` fires after
 * each cell so the caller can show the city arriving, and the promise only
 * rejects when *every* cell failed (a partial area is always worth keeping).
 */
export async function fetchCells(
  bbox: BBox,
  buildQuery: (cell: BBox) => string,
  onProgress?: (elements: any[], progress: CellProgress) => void,
): Promise<any[]> {
  const cells = planCells(bbox);
  const found = new Map<string, any>();
  const progress: CellProgress = { total: cells.length, done: 0, failed: 0 };
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= cells.length) return;
      const cell = cells[index];
      try {
        for (const element of await overpassQuery(buildQuery(cell))) {
          const key = elementKey(element);
          if (key === null) {
            // No id (should not happen) — keep it, keyed by its position.
            found.set(`anon:${found.size}`, element);
            continue;
          }
          if (!found.has(key)) found.set(key, element);
        }
      } catch (err) {
        progress.failed++;
        console.warn("[map3d] Overpass cell failed:", err);
      }
      progress.done++;
      onProgress?.([...found.values()], { ...progress });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CELL_CONCURRENCY, cells.length) }, () => worker()),
  );

  if (found.size === 0 && progress.failed > 0) {
    throw new Error(`every one of the ${cells.length} area cells failed`);
  }
  return [...found.values()];
}

/* ------------------------------------------------------------------ *
 * Buildings & roads
 * ------------------------------------------------------------------ */

const bboxFilter = ({ south, west, north, east }: BBox) =>
  `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;

/** Every OSM building in one cell — ways and multipolygon relations alike. */
const buildingsQuery = (cell: BBox) =>
  `[out:json][timeout:40];(` +
  `way["building"](${bboxFilter(cell)});` +
  `relation["building"](${bboxFilter(cell)});` +
  `);out body geom;`;

/** Fetch building footprints for the selected area, cell by cell. */
export async function fetchBuildings(
  area: [LatLngLike, LatLngLike],
  onProgress?: (buildings: SceneBuilding[], progress: CellProgress) => void,
): Promise<SceneBuilding[]> {
  const projection = createProjection([{ lat: area[0].lat, lng: area[0].lng }, { lat: area[1].lat, lng: area[1].lng }]);
  const project = (p: LatLng) => projection.toScene(p.lat, p.lng);
  const collect = (elements: unknown[]) => {
    const parsed = parseOsmBuildings(elements, project);
    return { buildings: parsed.buildings.map(({ geometry, resolvedHeightM, ...b }) => ({ ...b, ring: geometry, heightM: resolvedHeightM ?? buildingHeightM(b.tags) })),
      skippedBuildings: parsed.issues.length, flatHippedRoofs: parsed.buildings.filter(b => b.flatHippedRoof).length, flatPyramidalRoofs: parsed.buildings.filter(b => b.flatPyramidalRoof).length, flatSkillionRoofs: parsed.buildings.filter(b => needsSkillionDirectionFallback(b.tags)).length };
  };
  const elements = await fetchCells(
    normalizeBBox(area[0], area[1]), buildingsQuery,
    onProgress ? (all, progress) => {
      const result = collect(all);
      onProgress(result.buildings, { ...progress, skippedBuildings: result.skippedBuildings, flatHippedRoofs: result.flatHippedRoofs, flatPyramidalRoofs: result.flatPyramidalRoofs, flatSkillionRoofs: result.flatSkillionRoofs });
    } : undefined,
  );
  return collect(elements).buildings;
}

/** Fetch road centrelines (everything a walker can use, motorway down to steps). */
export async function fetchRoads(
  area: [LatLngLike, LatLngLike],
  onProgress?: (roads: SceneRoad[], progress: CellProgress) => void,
): Promise<SceneRoad[]> {
  const collect = (elements: any[]) => {
    const out: SceneRoad[] = [];
    for (const element of elements) {
      const geometry = element.geometry;
      if (!Array.isArray(geometry) || geometry.length < 2) continue;
      out.push({
        id: element.id ?? out.length,
        widthM: roadWidthM(element.tags),
        tags: element.tags ?? {},
        path: geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon })),
      });
    }
    return out;
  };

  const elements = await fetchCells(
    normalizeBBox(area[0], area[1]),
    (cell) =>
      `[out:json][timeout:40];(` +
      `way["highway"](${bboxFilter(cell)});` +
      `);out body geom;`,
    onProgress ? (all, progress) => onProgress(collect(all), progress) : undefined,
  );
  return collect(elements);
}

/**
 * Raw building elements in the shape the map-mode 3D view wants
 * (`{ id, key, tags, geometry, holes }`). Invalid/unsupported topology is
 * reported through progress rather than filled. Uses the same cell planner.
 */
export async function fetchBuildingElements(
  area: [LatLngLike, LatLngLike],
  onProgress?: (buildings: RawBuilding[], progress: CellProgress) => void,
): Promise<RawBuilding[]> {
  const refLat = (area[0].lat + area[1].lat) / 2, refLng = (area[0].lng + area[1].lng) / 2;
  const project = (p: LatLng) => ({ x: (p.lng - refLng) * 111320 * Math.cos(refLat * Math.PI / 180), z: -(p.lat - refLat) * 111320 });
  const elements = await fetchCells(
    normalizeBBox(area[0], area[1]), buildingsQuery,
    onProgress ? (all, progress) => {
      const result = parseOsmBuildings(all, project);
      onProgress(result.buildings, { ...progress, skippedBuildings: result.issues.length, flatHippedRoofs: result.buildings.filter(b => b.flatHippedRoof).length, flatPyramidalRoofs: result.buildings.filter(b => b.flatPyramidalRoof).length, flatSkillionRoofs: result.buildings.filter(b => needsSkillionDirectionFallback(b.tags)).length });
    } : undefined,
  );
  return parseOsmBuildings(elements, project).buildings;
}
