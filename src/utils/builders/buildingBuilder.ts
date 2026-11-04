import * as THREE from "three";
import { hippedOutline, rectangularHip } from "./hippedRoof";

export type BuildingTags = Record<string, string | undefined>;
export type { PlanPoint } from "./footprint";
import { normalizeFootprint, signedPlanArea, type Footprint, type PlanPoint } from "./footprint";

/** OSM lengths default to metres; support explicit feet rather than stripping units. */
export function parseBuildingLength(value: string | undefined, allowZero = false): number | undefined {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/i);
  if (!match) return undefined;
  const n = Number(match[1]) * (/^(ft|feet|')$/i.test(match[2] ?? "") ? 0.3048 : 1);
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : undefined;
}

const ROOF_COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Downhill bearing, clockwise from north. Numeric degrees or 16 compass points. */
export function parseRoofDirection(value: string | undefined): number | undefined {
  const text = value?.trim().toUpperCase();
  if (!text) return undefined;
  const index = ROOF_COMPASS_POINTS.indexOf(text);
  if (index !== -1) return index * 22.5;
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined;
  const degrees = Number(text);
  return Number.isFinite(degrees) ? degrees % 360 : undefined;
}

export function needsSkillionDirectionFallback(tags: BuildingTags): boolean {
  return tags["roof:shape"] === "skillion" && buildingDimensions(tags).roofHeight > 0 && parseRoofDirection(tags["roof:direction"]) === undefined;
}

/** Legacy capped estimate: undefined is missing/invalid, zero is deliberate. */
function levels(value: string | undefined): number | undefined {
  return value && /^\d+(\.\d+)?$/.test(value.trim()) ? Math.min(Number(value), 200) : undefined;
}

/** Explicit rise retains priority over geometry-derived hipped angles. */
function taggedRoofRise(tags: BuildingTags): number | undefined {
  const explicit = parseBuildingLength(tags["roof:height"], true);
  if (explicit !== undefined) return explicit;
  const text = tags["roof:levels"]?.trim();
  const value = text && /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(value) && value >= 0 && value <= 200 ? value * STOREY_HEIGHT_M : undefined;
}

/** Source: OSM2World RoofWithRidge.calculatePreliminaryHeight / Roof.parseRoofAngle.
 * Only use a validated finite ridge, never the default roofSpan or a guessed box.
 * Zero is deliberate flat even when no ridge can be constructed.
 */
function hippedAngleRise(tags: BuildingTags, ridgeDistance?: number): number | undefined {
  const text=tags["roof:angle"]?.trim();
  const angle=text && /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  if (!(angle>=0 && angle<90)) return undefined;
  if (angle===0) return 0;
  if (ridgeDistance===undefined || !Number.isFinite(ridgeDistance) || ridgeDistance<=0) return undefined;
  const rise=Math.tan(angle*Math.PI/180)*ridgeDistance;
  return Number.isFinite(rise) ? rise : undefined;
}

/** Area centroid, not vertex mean/bbox centre. Input has already passed footprint validation. */
function convexPyramidApex(plan: PlanPoint[]): PlanPoint | undefined {
  const origin = plan[0], area = signedPlanArea(plan), winding = Math.sign(area);
  const span = Math.max(...plan.map(p => Math.hypot(p.x - origin.x, p.z - origin.z)));
  const eps = span * span * 1e-12;
  if (!winding || Math.abs(area) <= eps) return undefined;
  let x = 0, z = 0;
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i], b = plan[(i + 1) % plan.length], c = plan[(i + 2) % plan.length];
    if (winding * ((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < -eps) return undefined;
    const ax = a.x - origin.x, az = a.z - origin.z, bx = b.x - origin.x, bz = b.z - origin.z;
    const factor = ax * bz - bx * az;
    x += (ax + bx) * factor; z += (az + bz) * factor;
  }
  return { x: origin.x + x / (6 * area), z: origin.z + z / (6 * area) };
}

/** Existing map3d storey estimate retained; not an OSM-mandated conversion. */
export const STOREY_HEIGHT_M = 2.2;

export function buildingDimensions(tags: BuildingTags = {}, fallbackHeight = 10, roofSpan = 12, hipRidgeDistance?: number) {
  const gabled = tags["roof:shape"] === "gabled";
  const skillion = tags["roof:shape"] === "skillion";
  const angleValue = tags["roof:angle"]?.trim();
  const angle = angleValue && /^\d+(?:\.\d+)?$/.test(angleValue) ? Number(angleValue) : NaN;
  const roofLevels = levels(tags["roof:levels"]);
  const roofLevelRise = roofLevels === undefined ? undefined : roofLevels * STOREY_HEIGHT_M;
  let roofHeight = ["pyramidal", "hipped"].includes(tags["roof:shape"] ?? "") ? (taggedRoofRise(tags) ?? (tags["roof:shape"] === "hipped" ? hippedAngleRise(tags, hipRidgeDistance) : undefined) ?? 0) : gabled || skillion ? parseBuildingLength(tags["roof:height"], true) ??
    (roofLevelRise ??
      (angle >= 0 && angle < 85 ? Math.tan(angle * Math.PI / 180) * roofSpan / (skillion ? 1 : 2) : Math.min(3, roofSpan / 4))) : 0;
  const explicit = parseBuildingLength(tags.height);
  const floorHeight = (levels(tags["building:levels"]) ?? 0) * STOREY_HEIGHT_M;
  const totalHeight = Math.max(2, Math.min(400, explicit ?? (floorHeight ? floorHeight + roofHeight : (Number.isFinite(fallbackHeight) ? fallbackHeight : 10))));
  roofHeight = Math.max(0, Math.min(roofHeight, totalHeight - 2));
  return { totalHeight, roofHeight, eavesHeight: totalHeight - roofHeight };
}

/**
 * Resolve the roof AND the occupied vertical interval in metric plan coordinates.
 * min_height wins over building:min_level. A level offset needs tagged total
 * levels: use facadeHeight / levels, not an invented fixed storey height when
 * an explicit total height exists (OSM2World LevelAndHeightData reference).
 */
export function resolveBuildingProfile(plan: PlanPoint[], fallbackHeight: number, tags: BuildingTags = {}, holes: PlanPoint[][] = []) {
  if (plan.length < 3 || !plan.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))) return null;
  let axis = { x: 1, z: 0 }, longest = 0;
  const axisPlan = tags["roof:shape"] === "hipped" ? hippedOutline(plan) ?? plan : plan;
  for (let i = 0; i < axisPlan.length; i++) {
    const a = axisPlan[i], b = axisPlan[(i + 1) % axisPlan.length];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len > longest) { axis = { x: dx / len, z: dz / len }; longest = len; }
  }
  if (tags["roof:orientation"] === "across") axis = { x: -axis.z, z: axis.x };
  // roof:direction describes a main sloping face, i.e. perpendicular to the ridge.
  const direction = parseRoofDirection(tags["roof:direction"]);
  if (direction !== undefined) {
    const rad = direction * Math.PI / 180;
    axis = { x: Math.cos(rad), z: Math.sin(rad) };
  }
  // Inspected RoofWithRidge precedence: slope direction, then ridge direction,
  // then orientation. Ridge bearings run ALONG the ridge; +z here is south.
  // Restrict the new tag to our bounded hipped subset; other roofs stay unchanged.
  const ridgeDirection = parseRoofDirection(tags["roof:ridge:direction"]);
  if (tags["roof:shape"] === "hipped" && direction === undefined && ridgeDirection !== undefined) {
    const rad = ridgeDirection * Math.PI / 180;
    axis = { x: Math.sin(rad), z: -Math.cos(rad) };
  }
  const cross = (p: PlanPoint) => -axis.z * p.x + axis.x * p.z;
  const distances = plan.map(cross);
  const min = Math.min(...distances), max = Math.max(...distances), middle = (min + max) / 2;
  const half = (max - min) / 2;
  const hipped = tags["roof:shape"] === "hipped";
  // Malformed active direction tags fail closed rather than silently guessing.
  // A valid higher-priority direction ignores lower-priority metadata, as upstream.
  const validHipTags = (tags["roof:direction"] === undefined || direction !== undefined) &&
    (direction !== undefined || tags["roof:ridge:direction"] === undefined || ridgeDirection !== undefined) &&
    (direction !== undefined || ridgeDirection !== undefined || tags["roof:orientation"] === undefined || ["along", "across"].includes(tags["roof:orientation"]));
  const hipPlan = hipped && !holes.length && validHipTags ? rectangularHip(plan, axis) : undefined;
  const dimensions = buildingDimensions(tags, fallbackHeight, half * 2, hipPlan?.maxDistanceToRidge);
  const { roofHeight, totalHeight, eavesHeight } = dimensions;
  const skillion = tags["roof:shape"] === "skillion";
  const pyramidal = tags["roof:shape"] === "pyramidal";
  const pyramidApex = pyramidal && roofHeight > 0 && !holes.length ? convexPyramidApex(plan) : undefined;
  const flatPyramidalRoof = pyramidal && (taggedRoofRise(tags) === undefined || (roofHeight > 0 && !pyramidApex));
  const hip = roofHeight > 0 ? hipPlan : undefined;
  const knownHipRise = taggedRoofRise(tags) ?? hippedAngleRise(tags, hipPlan?.maxDistanceToRidge);
  const flatHippedRoof = hipped && (knownHipRise === undefined || (roofHeight > 0 && !hip));
  const splitRidge = !skillion && !pyramidal && !hipped && roofHeight > 0;
  const y = (p: PlanPoint) => {
    if (hipped) return hip ? eavesHeight + roofHeight * hip.fraction(p) : totalHeight;
    if (pyramidal) {
      if (!pyramidApex) return totalHeight;
      let fraction = 1;
      for (let i = 0; i < plan.length; i++) {
        const a = plan[i], b = plan[(i + 1) % plan.length];
        const edgeCross = (q: PlanPoint) => (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
        fraction = Math.min(fraction, edgeCross(p) / edgeCross(pyramidApex));
      }
      return eavesHeight + roofHeight * Math.max(0, fraction);
    }
    // cross is minus the downhill projection. Never guess a directed slope.
    if (skillion && direction === undefined) return totalHeight;
    const fraction = half > 0 ? skillion ? (cross(p) - min) / (max - min) : 1 - Math.abs(cross(p) - middle) / half : 0;
    return eavesHeight + roofHeight * Math.max(0, Math.min(1, fraction));
  };
  let minHeightM = 0;
  if (tags.min_height !== undefined) {
    const parsed = parseBuildingLength(tags.min_height, true);
    if (parsed === undefined) return null;
    minHeightM = parsed;
  } else if (tags["building:min_level"] !== undefined) {
    const value = tags["building:min_level"]!.trim();
    if (!/^\d+$/.test(value)) return null;
    const minLevel = Number(value);
    if (!Number.isSafeInteger(minLevel) || minLevel > 200) return null;
    if (minLevel > 0) {
      const levelValue = tags["building:levels"]?.trim();
      const totalLevels = levelValue && /^\d+(?:\.\d+)?$/.test(levelValue) ? Number(levelValue) : 0;
      if (!Number.isFinite(totalLevels) || totalLevels <= 0 || totalLevels > 200 || minLevel > totalLevels) return null;
      minHeightM = eavesHeight / totalLevels * minLevel;
    }
  }
  if (!Number.isFinite(minHeightM) || minHeightM >= totalHeight || minHeightM > eavesHeight + 1e-7) return null;
  minHeightM = Math.min(minHeightM, eavesHeight); // numerical noise only, never upstream's 0.1m repair
  return { ...dimensions, minHeightM, cross, middle, splitRidge, pyramidApex, flatPyramidalRoof, hip, flatHippedRoof, roofY: y };
}

/**
 * Simple-3D-Buildings gabled, single-plane skillion and bounded pyramidal/rectangular hipped roofs, in scene axes (+x east, -z north, +y up).
 * Gabled triangles are clipped at a central ridge; skillion uses one plane. Works for concave simple rings too, without a bounding-box roof
 * spilling outside the actual footprint. Courtyards remain open; building parts are not handled.
 * This is our implementation of documented OSM tags, not TopoExport source.
 */
export function buildBuildingSurfaces(
  input: PlanPoint[], base: number, fallbackHeight: number, tags: BuildingTags = {}, holes: PlanPoint[][] = [],
): { walls: number[]; roofs: number[]; totalHeight: number; roofHeight: number; footprint?: Footprint; bottomY?: number; capFromRoof?: boolean } {
  const footprint = normalizeFootprint(input, holes);
  if (!footprint || !Number.isFinite(base)) return { walls: [], roofs: [], totalHeight: 0, roofHeight: 0 };
  const profile = resolveBuildingProfile(footprint.outer, fallbackHeight, tags, footprint.holes);
  if (!profile) return { walls: [], roofs: [], totalHeight: 0, roofHeight: 0 };
  const plan = footprint.outer;
  const { cross, middle, splitRidge, totalHeight, roofHeight } = profile;
  const bottomY = base + profile.minHeightM;
  const y = (p: PlanPoint) => base + (profile.pyramidApex || profile.hip ? profile.eavesHeight : profile.roofY(p));
  const walls: number[] = [], roofs: number[] = [];
  type Vertex = [number, number, number];
  const push = (out: number[], a: Vertex, b: Vertex, c: Vertex, normal: THREE.Vector3) => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const face = ab.cross(ac);
    if (face.lengthSq() < 1e-14) return;
    if (face.dot(normal) < 0) out.push(...a, ...c, ...b);
    else out.push(...a, ...b, ...c);
  };
  const cut = (a: PlanPoint, b: PlanPoint): PlanPoint => {
    const t = (middle - cross(a)) / (cross(b) - cross(a));
    return { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
  };
  const clip = (polygon: PlanPoint[], side: number) => {
    const out: PlanPoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = (cross(a) - middle) * side, db = (cross(b) - middle) * side;
      if (da >= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) out.push(cut(a, b));
    }
    return out;
  };
  const allPoints = [plan, ...footprint.holes].flat();
  const faces = THREE.ShapeUtils.triangulateShape(plan.map(p => new THREE.Vector2(p.x, p.z)),
    footprint.holes.map(r => r.map(p => new THREE.Vector2(p.x, p.z))));
  if (profile.pyramidApex) {
    const apex: Vertex = [profile.pyramidApex.x, base + totalHeight, profile.pyramidApex.z];
    for (let i = 0; i < plan.length; i++) {
      const a = plan[i], b = plan[(i + 1) % plan.length];
      push(roofs, [a.x, y(a), a.z], [b.x, y(b), b.z], apex, new THREE.Vector3(0, 1, 0));
    }
  }
  if (profile.hip) {
    const { ridge, faces: hipFaces } = profile.hip;
    const vertex = (p: PlanPoint): Vertex => [p.x, base + (ridge.includes(p) ? totalHeight : profile.eavesHeight), p.z];
    for (const poly of hipFaces) for (let i = 1; i < poly.length - 1; i++) {
      push(roofs, vertex(poly[0]), vertex(poly[i]), vertex(poly[i + 1]), new THREE.Vector3(0, 1, 0));
    }
  }
  for (const face of profile.pyramidApex || profile.hip ? [] : faces) {
    const triangle = face.map(i => allPoints[i]);
    for (const poly of splitRidge ? [clip(triangle, 1), clip(triangle, -1)] : [triangle]) {
      for (let i = 1; i < poly.length - 1; i++) {
        const v = [poly[0], poly[i], poly[i + 1]].map(p => [p.x, y(p), p.z] as Vertex);
        push(roofs, v[0], v[1], v[2], new THREE.Vector3(0, 1, 0));
      }
    }
  }
  for (const [index, ring] of [plan, ...footprint.holes].entries()) {
    const area = signedPlanArea(ring) * (index === 0 ? 1 : -1);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      // Signed area handles concavity; invert it on holes to face the courtyard.
      const normal = new THREE.Vector3(area > 0 ? dz : -dz, 0, area > 0 ? -dx : dx);
      const split = splitRidge && (cross(a) - middle) * (cross(b) - middle) < 0 ? [a, cut(a, b), b] : [a, b];
      for (let j = 1; j < split.length; j++) {
        const p = split[j - 1], q = split[j];
        const bp: Vertex = [p.x, bottomY, p.z], bq: Vertex = [q.x, bottomY, q.z];
        const tp: Vertex = [p.x, y(p), p.z], tq: Vertex = [q.x, y(q), q.z];
        push(walls, bp, bq, tq, normal);
        push(walls, bp, tq, tp, normal);
      }
    }
  }
  return { walls, roofs, totalHeight, roofHeight, footprint, bottomY, capFromRoof: !!profile.hip && plan.length > 4 };
}

/** Geometry groups match the existing map-mode material slots (roof 0, walls 1). */
export function buildingSurfaceGeometry(
  surfaces: ReturnType<typeof buildBuildingSurfaces>, bottomRing?: PlanPoint[], base = 0,
): THREE.BufferGeometry {
  // Map mode previously used a closed ExtrudeGeometry; retain its bottom cap.
  const bottom: number[] = [];
  if (bottomRing && surfaces.footprint && surfaces.roofs.length) {
    if(surfaces.capFromRoof && !surfaces.footprint.holes.length){
      // Earcut may omit collinear boundary nodes. Project this validated hip's
      // roof triangles down instead, retaining exactly the wall boundary edges
      // and avoiding new cap T-junctions. Four-node/other roofs stay unchanged.
      for(let i=0;i<surfaces.roofs.length;i+=9)for(const j of [0,6,3])
        bottom.push(surfaces.roofs[i+j],surfaces.bottomY ?? base,surfaces.roofs[i+j+2]);
    }else{
      // Derive the cap from the validated footprint, so a caller cannot accidentally fill its holes.
      const { outer, holes } = surfaces.footprint;
      const vector = (ring: PlanPoint[]) => ring.map(p => new THREE.Vector2(p.x, p.z));
      const points = [outer, ...holes].flat().map(p => new THREE.Vector2(p.x, p.z));
      const faces = THREE.ShapeUtils.triangulateShape(vector(outer), holes.map(vector));
      for (const ids of faces) {
        const [a, b, c] = ids.map(i => points[i]);
        const crossY = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
        for (const p of crossY > 0 ? [a, c, b] : [a, b, c]) bottom.push(p.x, surfaces.bottomY ?? base, p.y);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([...surfaces.roofs, ...bottom, ...surfaces.walls], 3));
  geometry.addGroup(0, (surfaces.roofs.length + bottom.length) / 3, 0);
  geometry.addGroup((surfaces.roofs.length + bottom.length) / 3, surfaces.walls.length / 3, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
