/** Conservative, DOM-free polygon validation. Touching/nested holes are rejected. */
export interface PlanPoint { x: number; z: number }
export interface Footprint { outer: PlanPoint[]; holes: PlanPoint[][] }
export const MAX_FOOTPRINT_VERTICES = 2048;
export const MAX_FOOTPRINT_RINGS = 65;

export function signedPlanArea(ring: PlanPoint[]): number {
  const origin = ring[0];
  if (!origin) return 0;
  return ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + (a.x - origin.x) * (b.z - origin.z) - (b.x - origin.x) * (a.z - origin.z);
  }, 0) / 2;
}

export function pointInRing(p: PlanPoint, ring: PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function tolerance(rings: PlanPoint[][]) {
  const points = rings.flat();
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1e-12);
  return { length: span * 1e-10, area: span * span * 1e-12 };
}

function intersects(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint, eps: ReturnType<typeof tolerance>): boolean {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - eps.length || Math.max(c.x, d.x) < Math.min(a.x, b.x) - eps.length ||
      Math.max(a.z, b.z) < Math.min(c.z, d.z) - eps.length || Math.max(c.z, d.z) < Math.min(a.z, b.z) - eps.length) return false;
  const cross = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const sign = (value: number) => Math.abs(value) <= eps.area ? 0 : Math.sign(value);
  return sign(cross(a, b, c)) * sign(cross(a, b, d)) <= 0 && sign(cross(c, d, a)) * sign(cross(c, d, b)) <= 0;
}

export function ringsIntersect(a: PlanPoint[], b: PlanPoint[]): boolean {
  const eps = tolerance([a, b]);
  return a.some((p, i) => b.some((q, j) => intersects(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length], eps)));
}

/** Copies inputs; removes only exact repeated adjacent/closing points, not invented edges. */
export function normalizeFootprint(outer: PlanPoint[], holes: PlanPoint[][] = []): Footprint | null {
  const source = [outer, ...holes];
  if (source.length > MAX_FOOTPRINT_RINGS || source.reduce((n, r) => n + r.length, 0) > MAX_FOOTPRINT_VERTICES) return null;
  if (!source.every(r => r.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.z)))) return null;
  const same = (a: PlanPoint, b: PlanPoint) => a.x === b.x && a.z === b.z;
  const rings = source.map(ring => {
    const clean = ring.filter((p, i) => !i || !same(p, ring[i - 1])).map(p => ({ ...p }));
    if (clean.length > 1 && same(clean[0], clean[clean.length - 1])) clean.pop();
    return clean;
  });
  const eps = tolerance(rings);
  for (const ring of rings) {
    if (ring.length < 3 || Math.abs(signedPlanArea(ring)) <= eps.area) return null;
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 1; j < ring.length; j++) {
        if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
        if (intersects(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length], eps)) return null;
      }
    }
  }
  for (let i = 1; i < rings.length; i++) {
    if (ringsIntersect(rings[0], rings[i]) || !pointInRing(rings[i][0], rings[0])) return null;
    for (let j = 1; j < i; j++) {
      if (ringsIntersect(rings[i], rings[j]) || pointInRing(rings[i][0], rings[j]) || pointInRing(rings[j][0], rings[i])) return null;
    }
  }
  return { outer: rings[0], holes: rings.slice(1) };
}

/**
 * A strict containment forest for OSM multipolygons, not nested OSM relations.
 * Roles must alternate outer → inner → outer. Each outer becomes a separate
 * footprint with only its immediate inner children, so islands never fill the
 * surrounding courtyard. Touching/crossing boundaries remain unsupported.
 */
export function normalizeMultipolygon(outers: PlanPoint[][], inners: PlanPoint[][]): Footprint[] | null {
  const source = [...outers, ...inners];
  if (!outers.length || source.length > MAX_FOOTPRINT_RINGS ||
      source.reduce((n, r) => n + r.length, 0) > MAX_FOOTPRINT_VERTICES) return null;
  const clean = source.map(ring => normalizeFootprint(ring));
  if (clean.some(p => !p)) return null;
  const rings = clean.map(p => p!.outer);
  const areas = rings.map(r => Math.abs(signedPlanArea(r)));
  const parents = rings.map(() => -1);
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      if (ringsIntersect(rings[i], rings[j])) return null;
    }
    for (let j = 0; j < rings.length; j++) {
      if (i === j || !pointInRing(rings[i][0], rings[j])) continue;
      if (areas[j] <= areas[i]) return null;
      if (parents[i] === -1 || areas[j] < areas[parents[i]]) parents[i] = j;
    }
  }
  for (let i = 0; i < rings.length; i++) {
    const outer = i < outers.length, parent = parents[i];
    if (parent === -1 ? !outer : outer === (parent < outers.length)) return null;
  }
  return rings.slice(0, outers.length).map((outer, i) => ({
    outer, holes: rings.filter((_, j) => parents[j] === i),
  }));
}
