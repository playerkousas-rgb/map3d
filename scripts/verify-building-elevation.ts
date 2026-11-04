import * as THREE from "three";
import DxfParser, { type I3DfaceEntity } from "dxf-parser";
import { resolveBuildingProfile, buildBuildingSurfaces, buildingSurfaceGeometry } from "../src/utils/builders/buildingBuilder";
import { parseOsmBuildings } from "../src/utils/osmBuildings";
import { createProjection } from "../src/utils/projection";
import { mapBuildingShape, mapBuildingGeometry } from "../src/three/mapBuildingGeometry";
import { buildBuildingsGeometry } from "../src/three/orthoGeometry";
import { fetchBuildingElements, fetchBuildings, type CellProgress } from "../src/utils/sceneData";

import { objectToDxf } from "../src/utils/dxf";

export async function verifyBuildingElevation(ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void) {
  console.log("\n[Elevation] ground-relative min_height / level offset → mesh and CAD underside");
  const outer = [{ x: -20, z: -10 }, { x: 20, z: -10 }, { x: 20, z: 10 }, { x: -20, z: 10 }];
  const hole = [{ x: -4, z: -3 }, { x: 4, z: -3 }, { x: 4, z: 3 }, { x: -4, z: 3 }];
  const tags = { building: "yes", height: "15", "roof:shape": "gabled", "roof:height": "3", "roof:direction": "E", min_height: "5" };
  close(resolveBuildingProfile(outer, 10, tags)!.minHeightM, 5, 0, "explicit min_height is a ground-relative bottom, not a roof/terrain translation");
  close(resolveBuildingProfile(outer, 10, { ...tags, min_height: "10 ft" })!.minHeightM, 3.048, 1e-9, "clearance accepts explicit feet without discarding units");
  close(resolveBuildingProfile(outer, 10, { height: "12.5", "building:levels": "5", "building:min_level": "2" })!.minHeightM, 5, 1e-9,
    "source-referenced 12.5m / 5 levels × min_level2 gives 5m, not a hardcoded 4.4m");
  close(resolveBuildingProfile(outer, 10, { ...tags, min_height: undefined, "building:levels": "5", "building:min_level": "2" })!.minHeightM, 4.8, 1e-9,
    "level-derived bottom uses facade height excluding the roof");
  close(resolveBuildingProfile(outer, 10, { ...tags, min_height: "4", "building:levels": "5", "building:min_level": "2" })!.minHeightM, 4, 0,
    "explicit min_height takes precedence over min_level");
  for (const min_height of ["0", "0 m", "0 ft"]) close(resolveBuildingProfile(outer, 10, { ...tags, min_height, "building:min_level": "bad" })!.minHeightM, 0, 0,
    "explicit zero clearance remains zero and overrides an unused malformed lower-priority level tag");
  close(resolveBuildingProfile(outer, 10, { height: "15", "building:min_level": "0" })!.minHeightM, 0, 0, "min_level0 needs no invented total-level count");
  close(resolveBuildingProfile(outer, 10, { "building:levels": "5", "building:min_level": "2" })!.minHeightM, 4.4, 1e-9,
    "without explicit height, min_level shares the existing tagged-level height estimate");
  close(resolveBuildingProfile(outer, 10, { height: "15", min_level: "2" })!.minHeightM, 0, 0,
    "indoor min_level numbering is NOT building:min_level and must not create an undercroft");
  const invalid: [string, Record<string, string | undefined>][] = [
    ...["", "bad", "-1", "NaN", "Infinity", "3;5", "1e2", "9".repeat(400)].map(v => [`min_height=${v.slice(0, 12)}`, { ...tags, min_height: v }] as [string, Record<string, string>]),
    ["bottom equals total height", { ...tags, min_height: "15" }],
    ["bottom exceeds eaves", { ...tags, min_height: "13" }],
    ["bottom exceeds total height", { ...tags, min_height: "20" }],
    ["positive min_level needs total levels", { height: "15", "building:min_level": "2" }],
    ["negative min_level", { height: "15", "building:levels": "5", "building:min_level": "-1" }],
    ["fractional min_level", { height: "15", "building:levels": "5", "building:min_level": "1.5" }],
    ["min_level exceeds total levels", { height: "15", "building:levels": "5", "building:min_level": "6" }],
    ["unbounded min_level", { height: "400", "building:levels": "200", "building:min_level": "201" }],
    ["zero total levels", { height: "15", "building:levels": "0", "building:min_level": "1" }],
    ["malformed total levels", { height: "15", "building:levels": "5;8", "building:min_level": "1" }],
  ];
  for (const [label, bad] of invalid) {
    const surfaces = buildBuildingSurfaces(outer, 0, 10, bad, [hole]);
    const capped = buildingSurfaceGeometry(surfaces, outer);
    ok(resolveBuildingProfile(outer, 10, bad) === null && !surfaces.roofs.length && !surfaces.walls.length && !capped.getAttribute("position").count,
      `${label}: reject occupied interval atomically; no walls/cap filled to ground`);
    capped.dispose();
  }
  const roofOnly = buildBuildingSurfaces(outer, 0, 10, { ...tags, min_height: "12" }, [hole]);
  ok(roofOnly.bottomY === 12 && [...roofOnly.roofs, ...roofOnly.walls].every(Number.isFinite), "roof-only volume at eaves remains finite without forcing clearance downward");

  for (const roof of ["flat", "gabled", "skillion"]) for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) {
    const ring = reverseOuter ? [...outer].reverse() : outer, holes = [reverseHole ? [...hole].reverse() : hole];
    const before = JSON.stringify({ ring, holes });
    const surfaces = buildBuildingSurfaces(ring, 7, 15, { ...tags, "roof:shape": roof }, holes);
    const capped = buildingSurfaceGeometry(surfaces, ring, 999); // legacy caller cannot override the validated bottom.
    capped.computeBoundingBox();
    close(capped.boundingBox!.min.y, 12, 1e-5, `${roof}/${reverseOuter}/${reverseHole}: walls AND cap start at ground7 + clearance5`);
    close(capped.boundingBox!.max.y, 22, 1e-5, "roof maximum stays ground7 + total15, not total plus clearance");
    const positions = capped.getAttribute("position"), normals = capped.getAttribute("normal");
    const bottomStart = surfaces.roofs.length / 3, bottomEnd = capped.groups[1].start;
    ok(bottomEnd > bottomStart && Array.from({ length: bottomEnd - bottomStart }, (_, i) => bottomStart + i).every(i => positions.getY(i) === 12 && normals.getY(i) === -1),
      "bottom cap is downward, at the validated underside, and retains holes");
    const mesh = new THREE.Mesh(capped, new THREE.MeshBasicMaterial()); mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(-30, 10, 0), new THREE.Vector3(1, 0, 0));
    const below = ray.intersectObject(mesh).length === 0;
    ray.set(new THREE.Vector3(-30, 13, 0), new THREE.Vector3(1, 0, 0));
    const above = ray.intersectObject(mesh).length > 0;
    ray.set(new THREE.Vector3(10, 11, 0), new THREE.Vector3(0, 1, 0));
    const underside = ray.intersectObject(mesh)[0]?.point.y === 12;
    ray.set(new THREE.Vector3(0, 11, 0), new THREE.Vector3(0, 1, 0));
    ok(below && above && underside && ray.intersectObject(mesh).length === 0 && before === JSON.stringify({ ring, holes }),
      "real rays pass under the volume, hit its wall/underside above clearance, and still pass through the courtyard; inputs unchanged");
    capped.dispose(); (mesh.material as THREE.Material).dispose();
  }
  const projection = createProjection([{ lat: 22.3, lng: 114.16 }, { lat: 22.31, lng: 114.17 }]);
  const geo = (ring: typeof outer) => ring.map(p => projection.toLatLng(p.x, p.z));
  const osm = (ring: typeof outer) => { const ps = geo(ring).map(p => ({ lat: p.lat, lon: p.lng })); return [...ps, ps[0]]; };
  const relation = { type: "relation", id: 99, tags: { ...tags, type: "multipolygon" }, members: [
    { type: "way", ref: 1, role: "outer", geometry: osm(outer) }, { type: "way", ref: 2, role: "inner", geometry: osm(hole) },
  ] };
  const project = (p: { lat: number; lng: number }) => projection.toScene(p.lat, p.lng);
  const parsed = parseOsmBuildings([relation], project);
  ok(parsed.buildings.length === 1 && !parsed.issues.length && parsed.buildings[0].tags.min_height === "5", "actual multipolygon parser retains clearance and holes with scene projection validation");
  const outerWay = { type: "way", id: 1, tags: { building: "yes" }, geometry: osm(outer) };
  for (const value of ["bad", "13", 5, null]) {
    const rejected = parseOsmBuildings([outerWay, { ...relation, tags: { ...relation.tags, min_height: value } }], project);
    ok(!rejected.buildings.length && rejected.issues.length === 1, "invalid vertical relation (including non-string tags) never falls back to its ground-filled tagged outer way");
  }
  ok(parseOsmBuildings([{ ...relation, tags: { ...relation.tags, "building:min_level": 2 } }], project).buildings.length === 1,
    "valid explicit min_height overrides even a non-string unused lower-priority level tag");
  const angleTags = { building: "yes", height: "15", "roof:shape": "gabled", "roof:direction": "E", "roof:angle": "15", min_height: "10" };
  const large = { type: "way", id: 700, tags: angleTags, geometry: osm(outer) };
  ok(parseOsmBuildings([large], project).issues.length === 1, "vertical validation uses actual full footprint span, not the default 12m height estimate");
  const small = outer.map(p => ({ x: p.x / 5 + 60, z: p.z / 5 }));
  const multi = { ...relation, tags: { ...angleTags, type: "multipolygon" }, members: [
    { type: "way", ref: 3, role: "outer", geometry: osm(small) }, { type: "way", ref: 4, role: "outer", geometry: osm(outer) },
  ] };
  ok(!parseOsmBuildings([multi], project).buildings.length, "one roof-overlapping component rejects the whole relation, not just the large component");
  const b = parsed.buildings[0];
  const merged = buildBuildingsGeometry([{ id: b.id, tags: b.tags, ring: b.geometry, holes: b.holes, heightM: 15 }], projection, () => 7);
  merged.walls!.computeBoundingBox(); merged.roofs!.computeBoundingBox();
  close(merged.walls!.boundingBox!.min.y, 12, 1e-5, "actual merged UTM walls preserve clearance above sampled terrain");
  close(merged.roofs!.boundingBox!.max.y, 22, 1e-5, "actual merged UTM roof retains roof-inclusive top");
  const sloping = buildBuildingsGeometry([{ id: b.id, tags: b.tags, ring: b.geometry, holes: b.holes, heightM: 15 }], projection,
    p => b.holes.some(h => h.some(v => v.lat === p.lat && v.lng === p.lng)) ? -2 : 7);
  sloping.walls!.computeBoundingBox(); sloping.roofs!.computeBoundingBox();
  close(sloping.walls!.boundingBox!.min.y, 3, 1e-5, "clearance retains the minimum terrain datum across outer AND hole vertices, not an assumed ground zero");
  close(sloping.roofs!.boundingBox!.max.y, 13, 1e-5, "sloped-terrain roof shares that existing datum; no false per-point clearance promise");
  sloping.walls!.dispose(); sloping.roofs!.dispose();
  const rejectedMerged = buildBuildingsGeometry([{ id: 3, tags: { ...tags, min_height: "13" }, ring: b.geometry, holes: b.holes, heightM: 15 }], projection, () => 7);
  ok(rejectedMerged.count === 0 && !rejectedMerged.walls, "direct invalid-height scene input does not inflate drawn count");
  const factor = 111320 / 51000;
  const shape = mapBuildingShape(b, (lat, lng) => { const p = project({ lat, lng }); return new THREE.Vector2(p.x / factor, -p.z / factor); });
  const map = new THREE.Mesh(mapBuildingGeometry(shape, 51000, 15, tags)); map.userData.dxfHorizontalScale = factor;
  const ortho = new THREE.Group(); ortho.add(new THREE.Mesh(merged.walls!), new THREE.Mesh(merged.roofs!));
  for (const [label, object, bottom, top, hasCap] of [["map", map, 5, 15, true], ["orienteering", ortho, 12, 22, false]] as const) {
    const dxf = new DxfParser().parseSync(objectToDxf(object))!;
    const faces = dxf.entities as I3DfaceEntity[], points = faces.flatMap(f => f.vertices.slice(0, 3));
    close(Math.min(...points.map(p => p.z)), bottom, 1e-5, `${label}: independent CAD reader confirms minimum Z at actual underside`);
    close(Math.max(...points.map(p => p.z)), top, 1e-5, `${label}: CAD maximum Z is unchanged by clearance`);
    const down = faces.filter(f => { const [a, b, c] = f.vertices; return (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) < -1e-5; });
    ok(dxf.header.$ACADVER === "AC1024" && dxf.header.$INSUNITS === 6 && (hasCap ? down.length > 0 && down.every(f => f.vertices.slice(0, 3).every(p => p.z === bottom)) : !down.length),
      `${label}: metric R2010 retains elevated map cap / original open-bottom orienteering policy`);
  }
  map.geometry.dispose(); (map.material as THREE.Material).dispose();
  ortho.children.forEach(child => { const mesh = child as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ elements: [relation, large] }), { headers: { "content-type": "application/json" } });
  try {
    const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [{ lat: 22.303456, lng: 114.163456 }, { lat: 22.304456, lng: 114.164456 }];
    const progress: CellProgress[] = [];
    const scene = await fetchBuildings(area, (_, p) => progress.push(p));
    const raw = await fetchBuildingElements(area, (_, p) => progress.push(p));
    ok(scene.length === 1 && raw.length === 1 && scene[0].tags.min_height === "5" && raw[0].holes.length === 1,
      "both actual fetch collectors preserve clearance and reject angle/clearance collision using their real scene projections");
    ok(progress.length >= 2 && progress.every(p => p.skippedBuildings === 1), "invalid occupied interval is visibly counted in both collectors, including cached transport responses");
  } finally { globalThis.fetch = originalFetch; }
}
