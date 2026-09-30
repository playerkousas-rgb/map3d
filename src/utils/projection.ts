/**
 * Local metric projection for the 3D scenes.
 *
 * Everything in the orienteering scene is in **true metres** (1 scene unit =
 * 1 m): the ground, the buildings, the roads and the controls. Positions come
 * from the same UTM projection the grid references use, so a checkpoint that
 * reads "KK 0794 6642" in the panel is drawn at exactly that spot, and a leg
 * measured on screen matches the leg distance on the sheet.
 *
 * Scene axes: +X = east, −Z = north, +Y = up.
 */

import { fromUtm, toUtmInZone, utmZoneForLng } from "./hkgeo";
import type { LatLng } from "./course";

export interface LocalProjection {
  /** UTM zone the scene is projected in */
  zone: number;
  refLat: number;
  refLng: number;
  /** scene extent in metres */
  widthM: number;
  depthM: number;
  /** scene centre sits at the origin */
  toScene: (lat: number, lng: number) => { x: number; z: number };
  toLatLng: (x: number, z: number) => LatLng;
  /** scene units per degree of longitude / latitude at the centre */
  mPerDegLng: number;
  mPerDegLat: number;
}

/**
 * Build a projection centred on the middle of `area`. All points are projected
 * into one UTM zone so a scene that straddles 114°E stays continuous.
 */
export function createProjection(area: [LatLng, LatLng]): LocalProjection {
  const refLat = (area[0].lat + area[1].lat) / 2;
  const refLng = (area[0].lng + area[1].lng) / 2;
  const zone = utmZoneForLng(refLng);
  const origin = toUtmInZone(refLat, refLng, zone);

  const toScene = (lat: number, lng: number) => {
    const p = toUtmInZone(lat, lng, zone);
    return { x: p.e - origin.e, z: -(p.n - origin.n) };
  };

  const toLatLng = (x: number, z: number): LatLng => fromUtm(origin.e + x, origin.n - z, zone);

  const ne = toScene(area[1].lat, area[1].lng);
  const sw = toScene(area[0].lat, area[0].lng);

  return {
    zone,
    refLat,
    refLng,
    widthM: Math.abs(ne.x - sw.x),
    depthM: Math.abs(ne.z - sw.z),
    toScene,
    toLatLng,
    mPerDegLng: Math.abs(ne.x - sw.x) / Math.max(Math.abs(area[1].lng - area[0].lng), 1e-9),
    mPerDegLat: Math.abs(ne.z - sw.z) / Math.max(Math.abs(area[1].lat - area[0].lat), 1e-9),
  };
}
