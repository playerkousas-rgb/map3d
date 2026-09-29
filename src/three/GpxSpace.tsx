import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GpxPoint } from "@/utils/gpx";
import { ExportListener } from "./ExportListener";
import { SafeEnvironment } from "./SafeEnvironment";

export interface GpxModelSettings {
  /** vertical exaggeration multiplier for elevation */
  exaggeration: number;
  /** track ribbon width in model units (mm when printed 1:1) */
  trackWidth: number;
  /** base plate thickness in model units */
  baseHeight: number;
}

const MODEL_SIZE = 160; // max horizontal dimension of generated model

/**
 * Build a printable GPX track model:
 * - a rounded-corner base plate
 * - the track as connected solid boxes whose top follows the elevation
 *   profile, extruded all the way down to the base (no floating parts,
 *   so the STL prints without supports)
 */
function useGpxGeometry(points: GpxPoint[], settings: GpxModelSettings) {
  return useMemo(() => {
    if (points.length < 2) return null;

    // --- project lat/lon to local meters ---
    let minLat = Infinity,
      maxLat = -Infinity,
      minLon = Infinity,
      maxLon = -Infinity,
      minEle = Infinity;
    points.forEach((p) => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
      minEle = Math.min(minEle, p.ele);
    });
    const refLat = (minLat + maxLat) / 2;
    const refLon = (minLon + maxLon) / 2;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((refLat * Math.PI) / 180);

    const projected = points.map((p) => ({
      x: (p.lon - refLon) * mPerDegLon,
      z: -(p.lat - refLat) * mPerDegLat,
      ele: p.ele - minEle,
    }));

    // --- fit into MODEL_SIZE ---
    const spanX = (maxLon - minLon) * mPerDegLon;
    const spanZ = (maxLat - minLat) * mPerDegLat;
    const span = Math.max(spanX, spanZ, 1);
    const s = MODEL_SIZE / span;

    const { exaggeration, trackWidth, baseHeight } = settings;
    const minTrackHeight = 2;

    const scaled = projected.map((p) => ({
      x: p.x * s,
      z: p.z * s,
      h: minTrackHeight + p.ele * s * exaggeration,
    }));

    // --- track segments (solid from base top to elevation) ---
    const parts: THREE.BufferGeometry[] = [];

    for (let i = 0; i < scaled.length - 1; i++) {
      const a = scaled[i];
      const b = scaled[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.05) continue;

      const h = Math.max((a.h + b.h) / 2, minTrackHeight);
      const seg = new THREE.BoxGeometry(length + trackWidth * 0.4, h, trackWidth);
      const angle = Math.atan2(dz, dx);
      seg.rotateY(-angle);
      seg.translate((a.x + b.x) / 2, baseHeight + h / 2, (a.z + b.z) / 2);
      parts.push(seg);
    }

    // joint cylinders to smooth corners
    for (let i = 0; i < scaled.length; i++) {
      const p = scaled[i];
      const h = Math.max(p.h, minTrackHeight);
      const joint = new THREE.CylinderGeometry(trackWidth / 2, trackWidth / 2, h, 12);
      joint.translate(p.x, baseHeight + h / 2, p.z);
      parts.push(joint);
    }

    const track = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());

    // --- base plate ---
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    scaled.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    });
    const pad = trackWidth * 2 + 6;
    const baseW = maxX - minX + pad * 2;
    const baseD = maxZ - minZ + pad * 2;

    const baseShape = new THREE.Shape();
    const r = Math.min(8, baseW / 4, baseD / 4);
    const x0 = minX - pad;
    const z0 = minZ - pad;
    baseShape.moveTo(x0 + r, z0);
    baseShape.lineTo(x0 + baseW - r, z0);
    baseShape.quadraticCurveTo(x0 + baseW, z0, x0 + baseW, z0 + r);
    baseShape.lineTo(x0 + baseW, z0 + baseD - r);
    baseShape.quadraticCurveTo(x0 + baseW, z0 + baseD, x0 + baseW - r, z0 + baseD);
    baseShape.lineTo(x0 + r, z0 + baseD);
    baseShape.quadraticCurveTo(x0, z0 + baseD, x0, z0 + baseD - r);
    baseShape.lineTo(x0, z0 + r);
    baseShape.quadraticCurveTo(x0, z0, x0 + r, z0);

    const base = new THREE.ExtrudeGeometry(baseShape, {
      depth: baseHeight,
      bevelEnabled: false,
    });
    base.rotateX(Math.PI / 2);
    base.translate(0, baseHeight, 0);

    // start / end markers
    const start = scaled[0];
    const end = scaled[scaled.length - 1];
    const startMarker = new THREE.CylinderGeometry(trackWidth * 1.2, trackWidth * 1.5, 3, 16);
    startMarker.translate(start.x, baseHeight + Math.max(start.h, minTrackHeight) + 1.5, start.z);
    const endMarker = new THREE.CylinderGeometry(trackWidth * 1.2, trackWidth * 1.5, 3, 16);
    endMarker.translate(end.x, baseHeight + Math.max(end.h, minTrackHeight) + 1.5, end.z);

    return { track, base, startMarker, endMarker, size: Math.max(baseW, baseD) };
  }, [points, settings]);
}

export function GpxSpace({
  points,
  settings,
}: {
  points: GpxPoint[];
  settings: GpxModelSettings;
}) {
  const geo = useGpxGeometry(points, settings);
  if (!geo) return null;

  const camDist = geo.size * 0.9;

  return (
    <Canvas camera={{ fov: 55, near: 0.1, far: 5000, position: [camDist, camDist * 0.8, camDist] }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[80, 150, 80]} intensity={1.4} />
      <directionalLight position={[-60, 60, -60]} intensity={0.4} color="#aab8ff" />

      <mesh geometry={geo.base} userData={{ exportable: true }}>
        <meshStandardMaterial color="#e8e4da" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh geometry={geo.track} userData={{ exportable: true }}>
        <meshStandardMaterial color="#e05d38" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh geometry={geo.startMarker} userData={{ exportable: true }}>
        <meshStandardMaterial color="#2fa860" roughness={0.6} />
      </mesh>
      <mesh geometry={geo.endMarker} userData={{ exportable: true }}>
        <meshStandardMaterial color="#3565d4" roughness={0.6} />
      </mesh>

      <OrbitControls />
      <ExportListener />
      <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
      <SafeEnvironment preset="city" />
    </Canvas>
  );
}
