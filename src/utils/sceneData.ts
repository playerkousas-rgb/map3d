/**
 * Scene data for the orienteering 3D view: real building footprints, road
 * centrelines and terrain heights for the area a planner selected.
 *
 * This is the shared, typed fetching layer — the 3D components only deal with
 * metres and lat/lng, never with Overpass payloads. Geometry is deliberately
 * kept in true metres (1 scene unit = 1 m) so distances, bearings and the
 * orienteering grid references agree with the ground.
 */

import { normalizeBBox, overpassQuery, LatLngLike } from "./overpass";
import type { LatLng } from "./course";

export interface SceneBuilding {
  id: number;
  /** real-world height in metres (OSM `height`, else `building:levels`, else 10 m) */
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

/** Real height of a building from its OSM tags — levels are worth 2.2 m each. */
export function buildingHeightM(tags: Record<string, string> | undefined): number {
  const levels = parseFloat(tags?.["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return levels * 2.2;
  const height = parseFloat(String(tags?.height ?? "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(height) && height > 0) return Math.min(height, 400);
  return 10;
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

/** Fetch building footprints for the selected area. */
export async function fetchBuildings(area: [LatLngLike, LatLngLike]): Promise<SceneBuilding[]> {
  const { south, west, north, east } = normalizeBBox(area[0], area[1]);
  const query =
    `[out:json][timeout:25];(` +
    `way["building"](${south},${west},${north},${east});` +
    `relation["building"](${south},${west},${north},${east});` +
    `);out body geom;`;
  const elements = await overpassQuery(query);
  const out: SceneBuilding[] = [];
  for (const element of elements) {
    const geometry = element.geometry;
    if (!Array.isArray(geometry) || geometry.length < 3) continue;
    out.push({
      id: element.id ?? out.length,
      heightM: buildingHeightM(element.tags),
      tags: element.tags ?? {},
      ring: geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon })),
    });
  }
  return out;
}

/** Fetch road centrelines (everything a walker can use, motorway down to steps). */
export async function fetchRoads(area: [LatLngLike, LatLngLike]): Promise<SceneRoad[]> {
  const { south, west, north, east } = normalizeBBox(area[0], area[1]);
  const query =
    `[out:json][timeout:25];(` +
    `way["highway"](${south},${west},${north},${east});` +
    `);out body geom;`;
  const elements = await overpassQuery(query);
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
}
