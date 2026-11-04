import * as THREE from "three";
import DxfParser, { type I3DfaceEntity } from "dxf-parser";
import { parseOsmBuildings } from "../src/utils/osmBuildings";
import { normalizeFootprint, MAX_FOOTPRINT_VERTICES, type PlanPoint } from "../src/utils/builders/footprint";
import { buildBuildingSurfaces, buildingSurfaceGeometry } from "../src/utils/builders/buildingBuilder";
import { buildBuildingsGeometry } from "../src/three/orthoGeometry";
import { mapBuildingShape, mapBuildingGeometry } from "../src/three/mapBuildingGeometry";
import { createProjection } from "../src/utils/projection";
import { fetchBuildings, fetchBuildingElements, type CellProgress } from "../src/utils/sceneData";
import { objectToDxf } from "../src/utils/dxf";

export async function verifyBuildingHoles(ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void) {
  console.log("\n[Courtyards] OSM members → both scene builders → dxf-writer → independent parser");
  const outer = [{ x: -20, z: -15 }, { x: 20, z: -15 }, { x: 20, z: 15 }, { x: -20, z: 15 }];
  const hole = [{ x: -6, z: -4 }, { x: 6, z: -4 }, { x: 6, z: 4 }, { x: -6, z: 4 }];
  const tags = { building: "yes", type: "multipolygon", height: "15", "roof:shape": "gabled", "roof:height": "3" };
  const projection = createProjection([{ lat: 22.3, lng: 114.16 }, { lat: 22.31, lng: 114.17 }]);
  const toOsm = (ring: PlanPoint[]) => ring.map(p => { const geo = projection.toLatLng(p.x, p.z); return { lat: geo.lat, lon: geo.lng }; });
  const closed = <T,>(ring: T[]) => [...ring, ring[0]];
  const o = toOsm(outer), h = toOsm(hole);
  const member = (ref: number, role: string, geometry: unknown) => ({ type: "way", ref, role, geometry });
  const relation = { type: "relation", id: 123, tags, members: [
    member(1, "outer", [o[0], o[1], o[2]]), member(2, "outer", [o[0], o[3], o[2]]),
    member(3, "inner", [h[2], h[1], h[0]]), member(4, "inner", [h[2], h[3], h[0]]),
  ] };
  const snapshot = JSON.stringify(relation);
  const parsed = parseOsmBuildings([relation]);
  ok(parsed.buildings.length === 1 && !parsed.issues.length && parsed.buildings[0].holes.length === 1,
    "reversed outer/inner member fragments assemble into one courtyard building");
  ok(JSON.stringify(relation) === snapshot, "normalizer never reverses/mutates provider member arrays");
  const a = parsed.buildings[0];
  ok(a.id === -123 && a.key === "relation/123/0" && a.tags.height === "15", "relation identity cannot collide with way ids; roof tags survive");
  const taggedOuter = { type: "way", id: 1, tags: { building: "yes" }, geometry: closed(o) };
  const sameIdWay = { ...taggedOuter, id: 123, geometry: closed(toOsm(outer.map(p => ({ x: p.x + 80, z: p.z })))) };
  const duplicates = parseOsmBuildings([taggedOuter, relation, relation, sameIdWay]);
  ok(duplicates.buildings.length === 2 && duplicates.buildings.some(b => b.id === 123) && !duplicates.issues.length,
    "tagged outer member does not duplicate/fill its courtyard; way/relation numeric ids remain distinct");
  const multi = { ...relation, members: [...relation.members, member(8, "outer", sameIdWay.geometry)] };
  const multiple = parseOsmBuildings([multi]);
  ok(multiple.buildings.length === 2 && new Set(multiple.buildings.map(b => b.key)).size === 2 && multiple.buildings[1].holes.length === 0,
    "disjoint outer components remain separate and holes attach only to their containing outer");
  const legacyRole = parseOsmBuildings([{ ...relation, members: relation.members.map(m => ({ ...m, role: m.role === "outer" ? "" : m.role })) }]);
  ok(legacyRole.buildings.length === 1, "legacy empty outer roles retain holes");
  const invalids: [string, unknown][] = [
    ["missing member geometry", { ...relation, members: [...relation.members.slice(0, 3), member(4, "inner", undefined)] }],
    ["null geometry point emitted by Overpass", { ...relation, members: [member(1, "outer", [...closed(o).slice(0, 2), null, ...closed(o).slice(2)])] }],
    ["open inner chain", { ...relation, members: relation.members.slice(0, 3) }],
    ["branched member chain", { ...relation, members: [...relation.members, member(5, "outer", [o[2], { lat: o[2].lat + 0.001, lon: o[2].lon }])] }],
    ["duplicate member reference", { ...relation, members: [...relation.members, relation.members[0]] }],
    ["nested relation member", { ...relation, members: [{ type: "relation", ref: 4, role: "outer" }] }],
    ["unknown boundary role", { ...relation, members: [member(1, "outline", closed(o))] }],
    ["hole outside outer", { ...relation, members: [member(1, "outer", closed(o)), member(4, "inner", sameIdWay.geometry)] }],
    ["touching outer boundary", { ...relation, members: [member(1, "outer", closed(o)), member(4, "inner", closed([o[0], ...h.slice(1)]))] }],
    ["nested outer island", { ...relation, members: [member(1, "outer", closed(o)), member(4, "outer", closed(h))] }],
    ["unsupported relation type", { ...relation, tags: { ...tags, type: "building" } }],
    ["open standalone way", { ...taggedOuter, geometry: o }],
    ["non-finite coordinate", { ...taggedOuter, geometry: [{ lat: NaN, lon: 114 }, ...closed(o)] }],
    ["antimeridian footprint", { ...taggedOuter, geometry: [{ lat: 0, lon: -179 }, { lat: 0, lon: 179 }, { lat: 1, lon: 179 }, { lat: 0, lon: -179 }] }],
  ];
  for (const [label, input] of invalids) {
    const result = parseOsmBuildings([input]);
    ok(!result.buildings.length && result.issues.length === 1, `${label}: rejected with an object diagnostic, not a solid fallback`);
  }
  const broken = invalids[0][1];
  ok(parseOsmBuildings([taggedOuter, broken]).buildings.length === 0, "invalid courtyard relation also suppresses its tagged outer way, rather than filling the missing hole");
  ok(!parseOsmBuildings([{ ...taggedOuter, tags: { building: "no" } }, null, { type: "node", id: 1 }]).buildings.length,
    "non-building/node/untyped objects cannot become fabricated footprints");
  const selfCrossing = [outer[0], outer[2], outer[1], outer[3]];
  const overlapHole = hole.map(p => ({ x: p.x + 2, z: p.z }));
  const innerNested = hole.map(p => ({ x: p.x / 2, z: p.z / 2 }));
  for (const [label, ring, holes] of [
    ["self-crossing outer", selfCrossing, []], ["self-crossing hole", outer, [selfCrossing.map(p => ({ x: p.x / 3, z: p.z / 3 }))]],
    ["overlapping holes", outer, [hole, overlapHole]], ["nested holes", outer, [hole, innerNested]],
    ["zero-area hole", outer, [[{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }]]],
    ["vertex safety budget", Array.from({ length: MAX_FOOTPRINT_VERTICES + 1 }, () => outer[0]), []],
  ] as [string, PlanPoint[], PlanPoint[][]][]) {
    const surfaces = buildBuildingSurfaces(ring, 0, 15, tags, holes);
    const geometry = buildingSurfaceGeometry(surfaces, ring);
    ok(!normalizeFootprint(ring, holes) && !surfaces.roofs.length && !surfaces.walls.length && geometry.getAttribute("position").count === 0,
      `${label}: shared builder and bottom cap reject invalid footprints atomically`);
    geometry.dispose();
  }
  const roofArea = (vertices: ArrayLike<number>) => {
    let area = 0;
    for (let i = 0; i < vertices.length; i += 9) area += Math.abs((vertices[i + 3] - vertices[i]) * (vertices[i + 8] - vertices[i + 2]) -
      (vertices[i + 6] - vertices[i]) * (vertices[i + 5] - vertices[i + 2])) / 2;
    return area;
  };
  for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) for (const gabled of [false, true]) {
    const ring = reverseOuter ? [...outer].reverse() : outer;
    const holes = [reverseHole ? [...hole].reverse() : hole];
    const before = JSON.stringify({ ring, holes });
    const surfaces = buildBuildingSurfaces(ring, 2, 15, gabled ? tags : { height: "15" }, holes);
    close(roofArea(surfaces.roofs), 1104, 1e-7, `roof net area excludes 96m² courtyard (${reverseOuter}/${reverseHole}/${gabled})`);
    const geometry = buildingSurfaceGeometry(surfaces, ring, 2);
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    let innerNormals = true, innerVertices = 0;
    const start = geometry.groups[1].start;
    for (let i = start; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      if (Math.abs(x) <= 6.00001 && Math.abs(z) <= 4.00001) {
        innerVertices++;
        innerNormals &&= x * normals.getX(i) + z * normals.getZ(i) < 0;
      }
    }
    ok(innerVertices > 0 && innerNormals, `inner walls face into courtyard independently of ring windings (${reverseOuter}/${reverseHole}/${gabled})`);
    const bottomStart = surfaces.roofs.length, bottomEnd = geometry.groups[1].start * 3;
    close(roofArea(Array.from(positions.array).slice(bottomStart, bottomEnd)), 1104, 1e-5, "bottom cap uses the same hole-aware triangulation");
    ok(Array.from({ length: (bottomEnd - bottomStart) / 3 }, (_, i) => normals.getY(bottomStart / 3 + i)).every(n => n === -1),
      "every bottom-cap normal points down, never into the roof");
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const hit = (x: number, z: number) => { ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(mesh).length > 0; };
    ok(!hit(0, 0) && !hit(3, 2) && !hit(-3, -2) && hit(12, 0), "vertical rays pass through courtyard roof AND cap but hit occupied footprint");
    ok(before === JSON.stringify({ ring, holes }), "hole triangulation never mutates caller contours");
    geometry.dispose(); (mesh.material as THREE.Material).dispose();
  }
  const secondHole = hole.map(p => ({ x: p.x / 3 + 12, z: p.z }));
  const twoHoles = buildBuildingSurfaces(outer, 0, 15, tags, [hole, [...secondHole].reverse()]);
  close(roofArea(twoHoles.roofs), 1072, 1e-7, "multiple courtyards with mixed windings remain separate voids");
  ok(!normalizeFootprint(outer, [[{ x: -20, z: -4 }, ...hole.slice(1)]]), "exact metric edge-touching hole is rejected");
  const b = { id: a.id, ring: a.geometry, holes: a.holes, heightM: 15, tags: a.tags };
  const merged = buildBuildingsGeometry([b], projection, at => Math.abs(at.lat - a.holes[0][0].lat) < 1e-12 ? -3 : 2);
  close(roofArea(merged.roofs!.getAttribute("position").array), 1104, 0.02, "parsed relation reaches merged UTM scene with net roof area intact");
  merged.walls!.computeBoundingBox();
  close(merged.walls!.boundingBox!.min.y, -3, 1e-5, "terrain base samples inner boundaries as well as the outer ring");
  const thin = buildBuildingsGeometry([{ ...b, holes: [outer.map(p => projection.toLatLng(p.x * 0.999, p.z * 0.999))] }], projection, () => 0);
  ok(thin.count === 0 && !thin.roofs, "minimum-area threshold uses occupied area, not outer bounding area");
  const invalidScene = buildBuildingsGeometry([{ ...b, holes: [selfCrossing.map(p => projection.toLatLng(p.x, p.z))] }], projection, () => 0, { minAreaM2: 0 });
  ok(invalidScene.count === 0 && !invalidScene.roofs && !invalidScene.walls, "invalid shared-builder output does not inflate drawn-building counts");

  const scale = 51000, factor = 111320 / scale;
  const shape = mapBuildingShape(a, (lat, lng) => {
    const p = projection.toScene(lat, lng);
    return new THREE.Vector2(p.x / factor, -p.z / factor);
  });
  const mapGeometry = mapBuildingGeometry(shape, scale, 15, a.tags);
  ok(shape.holes.length === 1, "map-mode Shape and Path carry provider holes, not just the outer points");
  const mapMesh = new THREE.Mesh(mapGeometry); mapMesh.userData.dxfHorizontalScale = factor;
  const mergedGroup = new THREE.Group(); mergedGroup.add(new THREE.Mesh(merged.roofs!), new THREE.Mesh(merged.walls!));
  for (const [label, object, bottomArea] of [["map", mapMesh, 1104], ["orienteering", mergedGroup, 0]] as const) {
    const dxf = new DxfParser().parseSync(objectToDxf(object))!;
    let upArea = 0, downArea = 0;
    for (const face of dxf.entities as I3DfaceEntity[]) {
      const [p, q, r] = face.vertices;
      const signed = ((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2;
      if (signed > 0) upArea += signed; else downArea -= signed;
    }
    ok(dxf.header.$ACADVER === "AC1024" && dxf.header.$INSUNITS === 6 && dxf.entities.every(f => f.type === "3DFACE"), `${label}: courtyard export remains dxf-writer R2010 metric 3DFACE`);
    close(upArea, 1104, 0.02, `${label}: independently parsed CAD roof area excludes courtyard after unit/axis conversion`);
    close(downArea, bottomArea, 0.02, `${label}: CAD bottom area respects scene cap policy and holes`);
  }
  merged.roofs?.dispose(); merged.walls?.dispose(); mapGeometry.dispose();

  const originalFetch = globalThis.fetch;
  let requests = 0;
  // Use a distinct broken id so the transport's type:id deduplication is exercised, not bypassed.
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ elements: [taggedOuter, relation, { ...(broken as object), id: 456 }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [{ lat: 22.304321, lng: 114.164321 }, { lat: 22.305321, lng: 114.165321 }];
    const progress: CellProgress[] = [];
    const scene = await fetchBuildings(area, (_, p) => progress.push(p));
    const raw = await fetchBuildingElements(area, (_, p) => progress.push(p));
    ok(requests === 1 && scene.length === 1 && raw.length === 1 && scene[0].holes!.length === 1 && raw[0].holes.length === 1,
      "actual cached Overpass fetch collectors both preserve relation holes and suppress duplicate tagged outer ways");
    ok(progress.length >= 2 && progress.every(p => p.skippedBuildings === 1), "both actual fetch progress callbacks expose rejected object counts, including cached responses");
  } finally { globalThis.fetch = originalFetch; }
}
