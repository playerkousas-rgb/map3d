import { resolveBuildingProfile } from "./builders/buildingBuilder";
import type { LatLng } from "./course";
import { MAX_FOOTPRINT_RINGS, MAX_FOOTPRINT_VERTICES, normalizeMultipolygon } from "./builders/footprint";

export interface OsmBuildingFootprint {
  /** Positive OSM way id, negative relation id; components share their relation id. */
  id: number;
  /** Stable, collision-free identity, including the multipolygon component. */
  key: string;
  tags: Record<string, string>;
  /** Valid footprint rendered flat instead of an unsupported pyramidal roof. */
  flatPyramidalRoof?: boolean;
  /** Hipped shape preserved flat outside the explicit four-corner subset. */
  flatHippedRoof?: boolean;
  /** Geometry-resolved total for hipped roof:angle; not written into OSM tags. */
  resolvedHeightM?: number;
  geometry: LatLng[];
  holes: LatLng[][];
}
export interface BuildingParseResult {
  buildings: OsmBuildingFootprint[];
  /** Rejected OSM objects, not duplicate outer member ways. */
  issues: { key: string; reason: string }[];
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;
const plan = (ring: LatLng[]) => ring.map(p => ({ x: p.lng, z: p.lat }));
function coordinates(value: unknown): LatLng[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_FOOTPRINT_VERTICES) return null;
  const result: LatLng[] = [];
  for (const raw of value) {
    const p = record(raw);
    if (!p || typeof p.lat !== "number" || typeof p.lon !== "number" || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) ||
        Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
    const next = { lat: p.lat, lng: p.lon };
    if (!result.length || !same(next, result[result.length - 1])) result.push(next);
  }
  // This local footprint model does not unwrap the antimeridian.
  if (Math.max(...result.map(p => p.lng)) - Math.min(...result.map(p => p.lng)) > 180) return null;
  return result.length >= 2 ? result : null;
}

/** Exact endpoint stitching only: reversed fragments work; branches/open chains do not. */
function assemble(fragments: LatLng[][]): LatLng[][] | null {
  const pending = fragments.map(r => [...r]);
  const rings: LatLng[][] = [];
  while (pending.length) {
    const ring = pending.shift()!;
    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const candidates = pending.flatMap((r, i) => {
        const start = same(end, r[0]), finish = same(end, r[r.length - 1]);
        return start || finish ? [{ i, reverse: finish && !start, ambiguous: start && finish }] : [];
      });
      if (candidates.length !== 1 || candidates[0].ambiguous) return null;
      const { i, reverse } = candidates[0];
      const next = pending.splice(i, 1)[0];
      if (reverse) next.reverse();
      ring.push(...next.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

/** Both 3D modes consume this same normalizer; never fall back to a filled outer. */
export function parseOsmBuildings(elements: unknown[], project?: (at: LatLng) => { x: number; z: number }): BuildingParseResult {
  const buildings: OsmBuildingFootprint[] = [], issues: BuildingParseResult["issues"] = [];
  const seen = new Set<string>(), claimedOuters = new Set<number>();
  const objects = elements.flatMap(raw => {
    const e = record(raw);
    if (!e || (e.type !== "way" && e.type !== "relation")) return [];
    const key = `${e.type}/${String(e.id)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const rawTags = record(e.tags);
    const tags = Object.fromEntries(Object.entries(rawTags ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    if (!tags.building || tags.building === "no") return [];
    const invalidVerticalTags = rawTags?.min_height !== undefined
      ? typeof rawTags.min_height !== "string"
      : rawTags?.["building:min_level"] !== undefined && typeof rawTags["building:min_level"] !== "string";
    return [{ e, tags, key, invalidVerticalTags }];
  });
  // Even a broken courtyard relation must not reappear as a solid tagged outer way.
  for (const { e, tags } of objects) {
    if (e.type === "relation" && tags.type === "multipolygon" && Array.isArray(e.members)) {
      for (const raw of e.members) {
        const m = record(raw);
        if (m?.type === "way" && (m.role === "outer" || m.role === "") && validId(m.ref)) claimedOuters.add(m.ref);
      }
    }
  }
  for (const { e, tags, key, invalidVerticalTags } of objects) {
    if (e.type === "way" && validId(e.id) && claimedOuters.has(e.id)) continue;
    const reject = (reason: string) => issues.push({ key, reason });
    if (!validId(e.id)) { reject("invalid-id"); continue; }
    if (invalidVerticalTags) { reject("invalid-vertical-tags"); continue; }
    let outers: LatLng[][], inners: LatLng[][];
    if (e.type === "way") {
      const ring = coordinates(e.geometry);
      if (!ring || !same(ring[0], ring[ring.length - 1])) { reject("open-or-missing-way"); continue; }
      outers = [ring]; inners = [];
    } else {
      if (tags.type !== "multipolygon" || !Array.isArray(e.members) || !e.members.length) { reject("unsupported-relation"); continue; }
      const outerParts: LatLng[][] = [], innerParts: LatLng[][] = [], refs = new Set<number>();
      let invalid = false, vertices = 0;
      for (const raw of e.members) {
        const m = record(raw);
        if (!m || m.type !== "way" || !validId(m.ref) || refs.has(m.ref) || !["outer", "inner", ""].includes(String(m.role))) { invalid = true; break; }
        refs.add(m.ref);
        if (!Array.isArray(m.geometry) || (vertices += m.geometry.length) > MAX_FOOTPRINT_VERTICES) { invalid = true; break; }
        const fragment = coordinates(m.geometry);
        if (!fragment) { invalid = true; break; }
        (m.role === "inner" ? innerParts : outerParts).push(fragment);
      }
      if (invalid) { reject("incomplete-or-unsupported-members"); continue; }
      const assembledOuter = assemble(outerParts), assembledInner = assemble(innerParts);
      if (!assembledOuter?.length || !assembledInner || assembledOuter.length + assembledInner.length > MAX_FOOTPRINT_RINGS) { reject("open-or-ambiguous-rings"); continue; }
      outers = assembledOuter; inners = assembledInner;
    }
    const normalized = normalizeMultipolygon(outers.map(plan), inners.map(plan));
    if (!normalized) { reject("invalid-or-unsupported-topology"); continue; }
    let profiles: (ReturnType<typeof resolveBuildingProfile>)[] | undefined;
    if (tags.min_height !== undefined || tags["building:min_level"] !== undefined || ["pyramidal", "hipped"].includes(tags["roof:shape"])) {
      // Actual fetch collectors supply the same projection as their scene.
      // Standalone callers use a local metric approximation, not degree spans.
      const origin = normalized[0].outer[0];
      const metric = project ?? ((p: LatLng) => ({ x: (p.lng - origin.x) * 111320 * Math.cos(origin.z * Math.PI / 180), z: -(p.lat - origin.z) * 111320 }));
      const projected = (ring: typeof normalized[number]["outer"]) => ring.map(v => metric({ lat: v.z, lng: v.x }));
      profiles = normalized.map(p => resolveBuildingProfile(projected(p.outer), 10, tags, p.holes.map(projected)));
      if (profiles.some(p => !p)) {
        reject("invalid-vertical-interval"); continue;
      }
    }
    for (let i = 0; i < normalized.length; i++) {
      const p = normalized[i];
      const geo = (ring: typeof p.outer) => ring.map(v => ({ lat: v.z, lng: v.x }));
      buildings.push({ ...(tags["roof:shape"] === "hipped" && tags["roof:angle"] !== undefined ? {resolvedHeightM: profiles?.[i]?.totalHeight} : {}), ...(profiles?.[i]?.flatHippedRoof ? { flatHippedRoof: true } : {}), ...(profiles?.[i]?.flatPyramidalRoof ? { flatPyramidalRoof: true } : {}), id: e.type === "relation" ? -e.id : e.id, key: `${key}/${i}`, tags,
        geometry: geo(p.outer), holes: p.holes.map(geo) });
    }
  }
  return { buildings, issues };
}
