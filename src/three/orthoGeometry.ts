/**
 * Geometry builders for the orienteering scene.
 *
 * Mobile is the target, so buildings are **merged into two meshes** (walls +
 * roofs) with per-building colour baked into vertex colours, instead of one
 * React mesh per building. A 3 km city area holds thousands of buildings; that
 * is the difference between ~10 draw calls and ~8,000 on a phone.
 *
 * Everything is built in true metres and lifted to the terrain, so the massing
 * matches the ground the tiles are drawn on.
 *
 * **Nothing is capped for the sake of speed.** The old 6,000-item cut-off
 * silently threw away most of a real city, which is exactly the "the buildings
 * and roads never load" symptom. What is left is a single high safety ceiling
 * (40,000 — roughly a 9 km dense-city box, far past any course area) that
 * exists so a pathological selection cannot lock up a phone, and it announces
 * itself in the console instead of quietly hiding geometry.
 *
 * These functions are pure (three.js only, no DOM), which keeps them testable
 * outside the browser.
 */

import * as THREE from "three";
import type { LocalProjection } from "@/utils/projection";
import type { LatLng } from "@/utils/course";

/** Safety ceiling only — no course area comes anywhere near this. */
export const MAX_BUILDINGS = 40_000;
export const MAX_ROADS = 40_000;

/** Wall tones for buildings without an OSM colour — soft, city-like, HK-ish. */
const WALL_PALETTE = [
  "#e8dcc8",
  "#dcc9ae",
  "#f0e6d6",
  "#d9cfc0",
  "#cfd5d8",
  "#e5d4bc",
  "#d8d0c4",
  "#eae7e0",
  "#c9d2cc",
  "#e8d9c0",
  "#ddd2c2",
  "#e6e8ea",
];

function paletteColor(id: number): THREE.Color {
  return new THREE.Color(WALL_PALETTE[Math.abs(Math.trunc(id)) % WALL_PALETTE.length]);
}

export interface BuildingInput {
  id: number;
  ring: LatLng[];
  heightM: number;
}

export interface BuildingsGeometry {
  walls: THREE.BufferGeometry | null;
  roofs: THREE.BufferGeometry | null;
  count: number;
}

type HeightLookup = (at: LatLng) => number;

/**
 * Extrude every footprint into walls + flat roofs.
 *
 * Walls are built edge by edge (two triangles per edge, hard normals) and roofs
 * from an ear-clipped triangulation of the ring. Faces are wound so their
 * normals point outwards, whatever the winding of the source polygon.
 */
export function buildBuildingsGeometry(
  buildings: BuildingInput[],
  projection: LocalProjection,
  groundHeight: HeightLookup,
  options: { maxBuildings?: number; minAreaM2?: number } = {},
): BuildingsGeometry {
  const maxBuildings = Math.min(options.maxBuildings ?? MAX_BUILDINGS, MAX_BUILDINGS);
  const minAreaM2 = options.minAreaM2 ?? 12;

  const wallPos: number[] = [];
  const wallNorm: number[] = [];
  const wallCol: number[] = [];
  const roofPos: number[] = [];
  const roofNorm: number[] = [];
  const roofCol: number[] = [];

  let count = 0;

  for (const building of buildings) {
    if (count >= maxBuildings) break;
    const ring = dedupeRing(building.ring);
    if (ring.length < 3) continue;

    // Scene coordinates (x east, z south) with the ring's terrain floor.
    const plan = ring.map((p) => projection.toScene(p.lat, p.lng));
    const area = Math.abs(signedArea(plan));
    if (area < minAreaM2) continue;

    let baseHeight = Infinity;
    for (const p of ring) baseHeight = Math.min(baseHeight, groundHeight(p));
    if (!Number.isFinite(baseHeight)) baseHeight = 0;
    const topHeight = baseHeight + Math.max(building.heightM, 2);

    const wall = paletteColor(building.id);
    const roof = wall.clone().multiplyScalar(0.88);

    // Roof — ear clipping over the footprint, on the flat top.
    const contour = plan.map((p) => new THREE.Vector2(p.x, -p.z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [ia, ib, ic] of faces) {
      const a = contour[ia];
      const b = contour[ib];
      const c = contour[ic];
      pushTriangle(
        roofPos,
        roofNorm,
        roofCol,
        [a.x, topHeight, -a.y],
        [b.x, topHeight, -b.y],
        [c.x, topHeight, -c.y],
        [0, 1, 0],
        roof,
      );
    }

    // Walls — one quad per ring edge, normal pointing away from the centroid.
    const centroid = plan.reduce(
      (acc, p) => ({ x: acc.x + p.x / plan.length, z: acc.z + p.z / plan.length }),
      { x: 0, z: 0 },
    );
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const q = plan[(i + 1) % plan.length];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;

      // Candidate outward normal: perpendicular to the edge, flipped when it
      // points at the centroid instead of away from it.
      let nx = -dz / len;
      let nz = dx / len;
      const midX = (p.x + q.x) / 2;
      const midZ = (p.z + q.z) / 2;
      if (nx * (midX - centroid.x) + nz * (midZ - centroid.z) < 0) {
        nx = -nx;
        nz = -nz;
      }

      const bottomP = [p.x, baseHeight, p.z];
      const bottomQ = [q.x, baseHeight, q.z];
      const topQ = [q.x, topHeight, q.z];
      const topP = [p.x, topHeight, p.z];
      const normal = [nx, 0, nz];

      // Winding chosen so the cross product of the first triangle matches the
      // outward normal — this keeps the faces visible from outside the model.
      const winding = outwardWinding(bottomP, bottomQ, topQ, normal);
      if (winding) {
        pushTriangle(wallPos, wallNorm, wallCol, bottomP, bottomQ, topQ, normal, wall);
        pushTriangle(wallPos, wallNorm, wallCol, bottomP, topQ, topP, normal, wall);
      } else {
        pushTriangle(wallPos, wallNorm, wallCol, bottomQ, bottomP, topQ, normal, wall);
        pushTriangle(wallPos, wallNorm, wallCol, topQ, bottomP, topP, normal, wall);
      }
    }

    count++;
  }

  if (count >= maxBuildings && buildings.length > count) {
    console.warn(
      `[map3d] safety ceiling hit: drew ${count} of ${buildings.length} buildings ` +
        `(limit ${maxBuildings}) — select a smaller area to see the rest.`,
    );
  }

  return {
    walls: wallPos.length ? makeGeometry(wallPos, wallNorm, wallCol) : null,
    roofs: roofPos.length ? makeGeometry(roofPos, roofNorm, roofCol) : null,
    count,
  };
}

export interface RoadInput {
  id: number;
  path: LatLng[];
  widthM: number;
}

/** Flat ribbons that hug the terrain — cheap, and they read clearly from above. */
export function buildRoadsGeometry(
  roads: RoadInput[],
  projection: LocalProjection,
  groundHeight: HeightLookup,
  options: { lift?: number; maxRoads?: number } = {},
): THREE.BufferGeometry | null {
  const lift = options.lift ?? 0.6;
  const maxRoads = Math.min(options.maxRoads ?? MAX_ROADS, MAX_ROADS);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const roadColor = new THREE.Color("#8d949e");
  const pathColor = new THREE.Color("#b6a38a");

  let used = 0;
  for (const road of roads) {
    if (used >= maxRoads) break;
    if (road.path.length < 2) continue;
    const isFootpath = road.widthM <= 2.6;
    const color = isFootpath ? pathColor : roadColor;
    const half = Math.max(road.widthM, 1.2) / 2;

    for (let i = 0; i < road.path.length - 1; i++) {
      const a = road.path[i];
      const b = road.path[i + 1];
      const pa = projection.toScene(a.lat, a.lng);
      const pb = projection.toScene(b.lat, b.lng);
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;

      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const ya = groundHeight(a) + lift;
      const yb = groundHeight(b) + lift;

      const v0 = [pa.x + nx, ya, pa.z + nz];
      const v1 = [pb.x + nx, yb, pb.z + nz];
      const v2 = [pb.x - nx, yb, pb.z - nz];
      const v3 = [pa.x - nx, ya, pa.z - nz];
      pushTriangle(positions, normals, colors, v0, v1, v2, [0, 1, 0], color);
      pushTriangle(positions, normals, colors, v0, v2, v3, [0, 1, 0], color);
    }
    used++;
  }

  if (used >= maxRoads && roads.length > used) {
    console.warn(
      `[map3d] safety ceiling hit: drew ${used} of ${roads.length} roads ` +
        `(limit ${maxRoads}) — select a smaller area to see the rest.`,
    );
  }

  if (!positions.length) return null;
  const geo = makeGeometry(positions, normals, colors);
  // How many roads made it in, so the scene can say so instead of the user
  // guessing why a corner of the map looks empty.
  geo.userData.roadsDrawn = used;
  return geo;
}

/**
 * The course line: a tube that follows the terrain between consecutive
 * controls, so it can be seen from above and survives export as real geometry.
 */
export function buildRouteGeometry(
  points: LatLng[],
  projection: LocalProjection,
  groundHeight: HeightLookup,
  options: { lift?: number; radius?: number; samplesPerLeg?: number } = {},
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const lift = options.lift ?? 1.2;
  const radius = options.radius ?? Math.max(1.2, 2.2);
  const samplesPerLeg = options.samplesPerLeg ?? 12;

  const path: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const steps = i === points.length - 2 ? samplesPerLeg : samplesPerLeg - 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / samplesPerLeg;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lng = a.lng + (b.lng - a.lng) * t;
      const { x, z } = projection.toScene(lat, lng);
      path.push(new THREE.Vector3(x, groundHeight({ lat, lng }) + lift, z));
    }
  }
  if (path.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(path, false, "catmullrom", 0.2);
  return new THREE.TubeGeometry(curve, Math.min(path.length * 3, 900), radius, 6, false);
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function makeGeometry(positions: number[], normals: number[], colors: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function pushTriangle(
  positions: number[],
  normals: number[],
  colors: number[],
  a: number[],
  b: number[],
  c: number[],
  normal: number[],
  color: THREE.Color,
) {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < 3; i++) normals.push(normal[0], normal[1], normal[2]);
  for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
}

/** Does (a, b, c) wind so that its normal matches `normal`? */
function outwardWinding(a: number[], b: number[], c: number[], normal: number[]): boolean {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return cx * normal[0] + cy * normal[1] + cz * normal[2] >= 0;
}

/** Twice the signed area of a plan polygon (positive = counter-clockwise in x/z). */
function signedArea(points: { x: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Drop a duplicated closing vertex and any repeated points. */
function dedupeRing(ring: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const point of ring) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.lat - point.lat) < 1e-9 && Math.abs(last.lng - point.lng) < 1e-9) {
      continue;
    }
    out.push(point);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 1 &&
    first &&
    last &&
    Math.abs(first.lat - last.lat) < 1e-9 &&
    Math.abs(first.lng - last.lng) < 1e-9
  ) {
    out.pop();
  }
  return out;
}
