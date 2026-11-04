import * as THREE from "three";
import DxfParser, { type I3DfaceEntity } from "dxf-parser";
import { buildBuildingSurfaces, buildingDimensions, buildingSurfaceGeometry, parseBuildingLength } from "../src/utils/builders/buildingBuilder";
import { buildingHeightM } from "../src/utils/sceneData";
import { buildBuildingsGeometry } from "../src/three/orthoGeometry";
import { createProjection } from "../src/utils/projection";
import { collectExportGroup } from "../src/utils/exporters";
import { objectToDxf } from "../src/utils/dxf";

export function verifyBuildingExports(
  ok: (condition: boolean, label: string) => void,
  close: (actual: number, expected: number, tolerance: number, label: string) => void,
) {
  console.log("\n[7] OSM gabled buildings and DXF R2010");
  const rectangle = [{ x: -10, z: -5 }, { x: 10, z: -5 }, { x: 10, z: 5 }, { x: -10, z: 5 }];
  const tags = { "roof:shape": "gabled", "roof:height": "3", height: "12", "building:levels": "2" };
  const built = buildBuildingSurfaces(rectangle, 7, 10, tags);
  close(built.totalHeight, 12, 0, "explicit height wins over building:levels");
  close(built.roofHeight, 3, 0, "explicit roof height is preserved");
  close(buildingHeightM(tags), 12, 0, "scene loading uses roof-inclusive explicit height");
  close(buildingHeightM({ "building:levels": "2", "roof:shape": "gabled", "roof:height": "3" }), 7.4, 1e-9,
    "roof height is added to levels, not counted as facade storeys");
  close(parseBuildingLength("30 ft")!, 9.144, 1e-9, "feet convert to metres");
  ok(parseBuildingLength("12;18") === undefined && parseBuildingLength("-4") === undefined,
    "ambiguous and negative OSM lengths do not turn into fabricated heights");
  close(buildingDimensions({ "roof:shape": "gabled", "roof:angle": "45" }, 20, 10).roofHeight, 5, 1e-9,
    "roof angle derives ridge height from metric roof span");
  close(buildingDimensions({ "roof:shape": "gabled", "roof:levels": "2" }, 20).roofHeight, 4.4, 1e-9,
    "roof levels supply a roof-height estimate");
  const ys = built.roofs.filter((_, i) => i % 3 === 1);
  close(Math.max(...ys), 19, 1e-9, "ridge is at ground + total height (not total + roof height)");
  close(Math.min(...ys), 16, 1e-9, "eaves are at ground + total minus roof height");
  const geometry = buildingSurfaceGeometry(built);
  const normals = geometry.getAttribute("normal");
  const roofVertices = built.roofs.length / 3;
  ok(Array.from({ length: roofVertices }, (_, i) => normals.getY(i)).every(y => y > 0 && y < 1),
    "all gabled roof normals point upwards and have non-flat slopes");
  ok(geometry.groups[0].materialIndex === 0 && geometry.groups[1].materialIndex === 1,
    "map-mode roof/wall material groups remain compatible");
  const positions = geometry.getAttribute("position");
  let outward = true, sealedGables = false;
  for (let i = roofVertices; i < positions.count; i++) {
    outward &&= positions.getX(i) * normals.getX(i) + positions.getZ(i) * normals.getZ(i) > 0;
    sealedGables ||= Math.abs(positions.getX(i)) === 10 && positions.getY(i) === 19;
  }
  ok(outward && sealedGables, "walls point outward and include ridge-height gable ends");
  const across = buildBuildingSurfaces(rectangle, 0, 12, { ...tags, "roof:orientation": "across" });
  ok(across.roofs.some((x, i) => i % 3 === 0 && Math.abs(x) < 1e-9 && across.roofs[i + 1] === 12),
    "roof:orientation=across rotates the ridge across the long axis");
  const directed = buildBuildingSurfaces(rectangle, 0, 12, { ...tags, "roof:direction": "90" });
  ok(directed.roofs.some((x, i) => i % 3 === 0 && Math.abs(x) < 1e-9 && directed.roofs[i + 1] === 12),
    "numeric roof:direction specifies the sloping-face compass direction");
  const rotated = rectangle.map(p => ({ x: (p.x - p.z) / Math.SQRT2, z: (p.x + p.z) / Math.SQRT2 }));
  const concave = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 10 }, { x: 0, z: 10 }];
  const projectedRoofArea = (roof: number[]) => {
    let sum = 0;
    for (let i = 0; i < roof.length; i += 9) {
      sum += Math.abs((roof[i + 3] - roof[i]) * (roof[i + 8] - roof[i + 2]) -
        (roof[i + 6] - roof[i]) * (roof[i + 5] - roof[i + 2])) / 2;
    }
    return sum;
  };
  for (const [name, ring, expectedArea] of [["rectangle", rectangle, 200], ["reversed ring", [...rectangle].reverse(), 200],
    ["rotated rectangle", rotated, 200], ["concave L footprint", concave, 125]] as const) {
    const result = buildBuildingSurfaces([...ring], 0, 12, tags);
    close(projectedRoofArea(result.roofs), expectedArea, 1e-7, `${name}: clipped roof covers footprint without overlap`);
    ok([...result.walls, ...result.roofs].every(Number.isFinite), `${name}: all surface coordinates are finite`);
  }
  const flat = buildBuildingSurfaces(rectangle, 0, 20, { "roof:shape": "unsupported" });
  ok(flat.roofs.every((value, i) => i % 3 !== 1 || value === 20), "unknown roof shapes retain flat-roof fallback");
  ok(buildBuildingSurfaces([{ x: 0, z: 0 }, { x: 1, z: 0 }], 0, 10, tags).roofs.length === 0,
    "degenerate footprint produces no building");
  const projection = createProjection([{ lat: 22.3, lng: 114.16 }, { lat: 22.31, lng: 114.17 }]);
  const ring = rectangle.map(p => projection.toLatLng(p.x, p.z));
  const merged = buildBuildingsGeometry([{ id: 1, ring, heightM: 12, tags }], projection, () => 7);
  merged.roofs!.computeBoundingBox();
  close(merged.roofs!.boundingBox!.max.y, 19, 1e-5, "orienteering merged geometry receives OSM roof tags");

  const capped = buildingSurfaceGeometry(built, rectangle, 7);
  const cappedNormals = capped.getAttribute("normal");
  const bottomStart = built.roofs.length / 3;
  ok(Array.from({ length: 6 }, (_, i) => cappedNormals.getY(bottomStart + i)).every(y => y === -1),
    "map-mode bottom cap is retained and faces downward");
  capped.dispose();

  const parser = new DxfParser();
  const parsed = parser.parseSync(objectToDxf(new THREE.Mesh(geometry)))!;
  ok(parsed.header.$ACADVER === "AC1024" && parsed.header.$INSUNITS === 6, "independent parser reads R2010 header and metre units");
  const faces = parsed.entities as I3DfaceEntity[];
  ok(faces.length === positions.count / 3 && faces.every(f => f.type === "3DFACE"),
    "DXF contains one 3DFACE per building triangle");
  ok(faces.every(f => JSON.stringify(f.vertices[2]) === JSON.stringify(f.vertices[3])),
    "triangular 3DFACE duplicates its third vertex as the fourth");
  close(Math.max(...faces.flatMap(f => f.vertices.slice(0, 4).map(p => p.z))), 19, 1e-6, "DXF Z is elevation, including the gabled ridge");

  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  parent.position.set(100, 20, -50);
  parent.rotation.y = Math.PI / 2;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, -1], 3)));
  mesh.userData.exportable = true;
  parent.add(mesh); scene.add(parent);
  const exported = collectExportGroup(scene);
  const transformed = (parser.parseSync(objectToDxf(exported))!.entities[0] as I3DfaceEntity).vertices;
  close(transformed[0].x, 100, 1e-9, "export collection preserves ancestor translation X");
  close(transformed[0].y, 50, 1e-9, "CAD Y maps to geographic north (negative scene Z)");
  close(transformed[0].z, 20, 1e-9, "export collection preserves ancestor elevation");
  close(transformed[1].y, 51, 1e-9, "ancestor rotation survives reparenting and DXF axis conversion");
  parent.userData.exportable = true;
  ok(collectExportGroup(scene).children.length === 1, "nested exportable objects are collected only once");
  mesh.userData.dxfHorizontalScale = 2;
  const corrected = (parser.parseSync(objectToDxf(mesh))!.entities[0] as I3DfaceEntity).vertices[0];
  close(corrected.x, 200, 1e-9, "legacy map horizontal scale is corrected for CAD");
  close(corrected.z, 20, 1e-9, "legacy scale correction does not change vertical metres");
  mesh.userData.dxfHorizontalScale = 1;
  mesh.userData.dxfUnitScale = 0.001;
  const miniature = (parser.parseSync(objectToDxf(mesh))!.entities[0] as I3DfaceEntity).vertices[0];
  close(miniature.z, 0.02, 1e-9, "GPX print-model millimetres convert to CAD metres on every axis");
  const indexed = mesh.geometry.clone().setIndex([0, 1, 2]);
  ok(parser.parseSync(objectToDxf(new THREE.Mesh(indexed)))!.entities.length === 1, "indexed mesh triangles export correctly");
  const instances = new THREE.InstancedMesh(indexed, new THREE.MeshBasicMaterial(), 2);
  instances.setMatrixAt(0, new THREE.Matrix4());
  instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0));
  const instanceFaces = parser.parseSync(objectToDxf(instances))!.entities as I3DfaceEntity[];
  ok(instanceFaces.length === 2 && instanceFaces[1].vertices[0].x === 4, "instanced meshes retain individual transforms");
  const restricted = indexed.clone();
  restricted.setDrawRange(0, 0);
  ok(parser.parseSync(objectToDxf(new THREE.Mesh(restricted)))!.entities.length === 0,
    "DXF respects mesh draw ranges");
  const invalid = indexed.clone();
  invalid.getAttribute("position").setX(0, NaN);
  let invalidRejected = false;
  try { objectToDxf(new THREE.Mesh(invalid)); } catch { invalidRejected = true; }
  ok(invalidRejected, "DXF rejects non-finite mesh vertices instead of emitting corrupt CAD data");
  invalid.dispose(); restricted.dispose();
  indexed.dispose(); mesh.geometry.dispose(); geometry.dispose(); merged.walls?.dispose(); merged.roofs?.dispose();
}
