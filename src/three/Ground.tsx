/**
 * The orienteering ground: official HK map tiles draped over a terrain mesh,
 * one custom geometry so the whole model costs a single draw call.
 *
 * The mesh is generated in true metres straight from the projection, with each
 * vertex lifted to its terrain height (times the exaggeration the user set).
 * The same height lookup is used for buildings, roads and control markers, so
 * everything stands on the same surface.
 *
 * If the official layer cannot be textured — offline, or the API refusing a
 * cross-origin canvas — the mesh keeps rendering with a paper-like colour
 * instead of showing nothing.
 */

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { buildContourGeometry, buildTerrainIndices, createHillshadeTexture, heightAt, HeightField } from "@/utils/terrain";
import { LocalProjection } from "@/utils/projection";
import {
  buildTileMosaic,
  chooseZoom,
  GroundLayerId,
  mercatorY,
  tileXToLng,
  tileYToLat,
} from "@/utils/tiles";
import type { LatLng } from "@/utils/course";
import { fromUtm, gridRefs } from "@/utils/hkgeo";
import { useSceneStore } from "@/state/sceneStore";

/** Grid resolution of the terrain mesh (vertices per side minus one). */
const SEGMENTS = 48;
/** Ground colour when no map layer could be textured. */
const PLAIN_COLOR = "#e8e4d8";
/** How far the grid overlay floats above the terrain, in metres. */
const GRID_LIFT = 0.6;
/** Samples per grid line — enough to hug the hills without costing triangles. */
const GRID_STEPS = 32;

export interface GroundProps {
  area: [LatLng, LatLng];
  projection: LocalProjection;
  field: HeightField | null;
  exaggeration: number;
  layer: GroundLayerId;
  showGrid: boolean;
  showContours: boolean;
  showHillshade: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
}

export function Ground({
  area,
  projection,
  field,
  exaggeration,
  layer,
  showGrid,
  showContours,
  showHillshade,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: GroundProps) {
  const setStatus = useSceneStore((state) => state.set);

  const south = Math.min(area[0].lat, area[1].lat);
  const north = Math.max(area[0].lat, area[1].lat);
  const west = Math.min(area[0].lng, area[1].lng);
  const east = Math.max(area[0].lng, area[1].lng);

  // The mosaic extent is decided synchronously (chooseZoom is deterministic) so
  // the UVs baked into the mesh and the tiles downloaded below always agree.
  const mosaicExtent = useMemo(() => {
    const range = chooseZoom({ south, west, north, east }, 64, layer === "plain" ? 19 : 20);
    return {
      south: tileYToLat(range.maxY + 1, range.z),
      north: tileYToLat(range.minY, range.z),
      west: tileXToLng(range.minX, range.z),
      east: tileXToLng(range.maxX + 1, range.z),
    };
  }, [south, west, north, east, layer]);

  const geometry = useMemo(() => {
    const count = (SEGMENTS + 1) * (SEGMENTS + 1);
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const indices = buildTerrainIndices(SEGMENTS);
    const reliefUvs = new Float32Array(count * 2);

    const spanLng = east - west;
    const spanLat = north - south;
    const vMin = mercatorY(mosaicExtent.south);
    const vSpan = mercatorY(mosaicExtent.north) - vMin || 1e-9;
    const uSpan = mosaicExtent.east - mosaicExtent.west || 1e-9;

    for (let row = 0; row <= SEGMENTS; row++) {
      for (let col = 0; col <= SEGMENTS; col++) {
        const lat = south + (spanLat * row) / SEGMENTS;
        const lng = west + (spanLng * col) / SEGMENTS;
        const { x, z } = projection.toScene(lat, lng);
        const i = row * (SEGMENTS + 1) + col;
        positions[i * 3] = x;
        positions[i * 3 + 1] = heightAt(field, { lat, lng }) * exaggeration;
        positions[i * 3 + 2] = z;
        reliefUvs[i * 2] = field ? (lng - field.west) / (field.east - field.west) : col / SEGMENTS;
        reliefUvs[i * 2 + 1] = field ? (lat - field.south) / (field.north - field.south) : row / SEGMENTS;
        // Mercator-aligned UVs so the tiles land on exactly the right blocks.
        uvs[i * 2] = (lng - mosaicExtent.west) / uSpan;
        uvs[i * 2 + 1] = (mercatorY(lat) - vMin) / vSpan;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute("uv1", new THREE.BufferAttribute(reliefUvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [south, west, north, east, projection, field, exaggeration, mosaicExtent]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Tag asynchronous results with their exact request. Changing bounds/layer
  // hides the old texture immediately, without a synchronous effect state reset.
  const textureRequest = useMemo(() => ({ south, west, north, east, layer }),
    [south, west, north, east, layer]);
  const [loadedTexture, setLoadedTexture] = useState<{
    request: typeof textureRequest; texture: THREE.CanvasTexture;
  } | null>(null);
  const texture = loadedTexture?.request === textureRequest ? loadedTexture.texture : null;

  // Load the official map layer; any failure falls back to the plain ground.
  useEffect(() => {
    setStatus({ groundTextured: false, groundFailed: false });
    if (textureRequest.layer === "plain") return;
    let stale = false;
    let created: THREE.CanvasTexture | null = null;
    buildTileMosaic(textureRequest, textureRequest.layer)
      .then((mosaic) => {
        if (stale) return;
        if (!mosaic) {
          setStatus({ groundTextured: false, groundFailed: true });
          return;
        }
        created = new THREE.CanvasTexture(mosaic.canvas);
        created.colorSpace = THREE.SRGBColorSpace;
        created.anisotropy = 4;
        created.needsUpdate = true;
        setLoadedTexture({ request: textureRequest, texture: created });
        setStatus({ groundTextured: true, groundFailed: false });
      })
      .catch(() => {
        if (stale) return;
        setStatus({ groundTextured: false, groundFailed: true });
      });
    return () => {
      stale = true;
      created?.dispose();
    };
  }, [textureRequest, setStatus]);

  const hillshade = useMemo(() => field && showHillshade && exaggeration !== 0
    ? createHillshadeTexture(field, { zFactor: exaggeration }) : null,
  [field, showHillshade, exaggeration]);
  useEffect(() => () => hillshade?.dispose(), [hillshade]);

  const contours = useMemo(() => field && showContours && exaggeration > 0
    ? buildContourGeometry(field, projection, { exaggeration, segments: SEGMENTS }) : null,
  [field, showContours, exaggeration, projection]);
  useEffect(() => () => contours?.dispose(), [contours]);

  /** UTM kilometre grid traced along the terrain — where "KK 07 66" comes from. */
  const gridGeometry = useMemo(() => {
    if (!showGrid) return null;

    const cornerRefs = [gridRefs(south, west), gridRefs(north, east)];
    if (cornerRefs.some((c) => c.square === null)) return null;
    if (cornerRefs[0].zone !== cornerRefs[1].zone) return null; // scene straddles two zones

    const zone = cornerRefs[0].zone;
    const eMin = Math.min(...cornerRefs.map((c) => c.e));
    const eMax = Math.max(...cornerRefs.map((c) => c.e));
    const nMin = Math.min(...cornerRefs.map((c) => c.n));
    const nMax = Math.max(...cornerRefs.map((c) => c.n));

    const positions: number[] = [];
    const sample = (e: number, n: number) => {
      const { lat, lng } = fromUtm(e, n, zone);
      const { x, z } = projection.toScene(lat, lng);
      return new THREE.Vector3(x, heightAt(field, { lat, lng }) * exaggeration + GRID_LIFT, z);
    };
    const pushLine = (points: THREE.Vector3[]) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    };

    for (let e = Math.ceil(eMin / 1000) * 1000; e <= eMax; e += 1000) {
      const points: THREE.Vector3[] = [];
      for (let s = 0; s <= GRID_STEPS; s++) {
        points.push(sample(e, nMin + ((nMax - nMin) * s) / GRID_STEPS));
      }
      pushLine(points);
    }
    for (let n = Math.ceil(nMin / 1000) * 1000; n <= nMax; n += 1000) {
      const points: THREE.Vector3[] = [];
      for (let s = 0; s <= GRID_STEPS; s++) {
        points.push(sample(eMin + ((eMax - eMin) * s) / GRID_STEPS, n));
      }
      pushLine(points);
    }

    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [showGrid, south, west, north, east, projection, field, exaggeration]);

  useEffect(() => () => gridGeometry?.dispose(), [gridGeometry]);

  return (
    <group>
      <mesh
        geometry={geometry}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        receiveShadow
        userData={{ exportable: true }}
      >
        <meshStandardMaterial
          color={texture ? "#ffffff" : PLAIN_COLOR}
          map={texture ?? undefined}
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      {hillshade && (
        <mesh geometry={geometry} raycast={() => {}} renderOrder={1}>
          <meshBasicMaterial map={hillshade} blending={THREE.MultiplyBlending}
            transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1}
            polygonOffsetUnits={-1} toneMapped={false} />
        </mesh>
      )}
      {contours && (
        <lineSegments geometry={contours} raycast={() => {}} renderOrder={2}>
          <lineBasicMaterial color="#79543a" transparent opacity={0.7} depthWrite={false} />
        </lineSegments>
      )}
      {gridGeometry && (
        <lineSegments geometry={gridGeometry}>
          <lineBasicMaterial color="#1a73e8" transparent opacity={0.5} />
        </lineSegments>
      )}
    </group>
  );
}
