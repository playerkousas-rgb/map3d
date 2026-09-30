/**
 * The course drawn in 3D: control markers that stand on the terrain and the
 * magenta course line between them.
 *
 * Marker size adapts to the scene — a 20 m disc is obvious across a 500 m park
 * and invisible across a 3 km district — and every marker carries an oversized
 * invisible hit volume so it can actually be tapped with a thumb.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { makeControlTexture, MARKER_COLORS } from "./labelTexture";
import { buildRouteGeometry } from "./orthoGeometry";
import type { LocalProjection } from "@/utils/projection";
import type { CourseControl, LatLng } from "@/utils/course";
import type { HeightField } from "@/utils/terrain";
import { heightAt } from "@/utils/terrain";

export interface CourseLayerProps {
  controls: CourseControl[];
  /** route order (start → controls → finish) */
  routePoints: LatLng[];
  projection: LocalProjection;
  field: HeightField | null;
  exaggeration: number;
  selectedId: string | null;
  showRoute: boolean;
  onMarkerDown: (control: CourseControl, event: ThreeEvent<PointerEvent>) => void;
  onMarkerMove?: (control: CourseControl, event: ThreeEvent<PointerEvent>) => void;
}

/** Marker size in metres, scaled to the scene so it stays readable on a phone. */
function markerScaleFor(projection: LocalProjection): number {
  const extent = Math.max(projection.widthM, projection.depthM);
  return Math.min(Math.max(extent / 55, 10), 55);
}

export function CourseLayer({
  controls,
  routePoints,
  projection,
  field,
  exaggeration,
  selectedId,
  showRoute,
  onMarkerDown,
  onMarkerMove,
}: CourseLayerProps) {
  const markerSize = markerScaleFor(projection);
  const poleHeight = markerSize * 0.9;

  const groundAt = useMemo(
    () => (at: LatLng) => heightAt(field, at) * exaggeration,
    [field, exaggeration],
  );

  const routeGeometry = useMemo(() => {
    if (!showRoute) return null;
    return buildRouteGeometry(routePoints, projection, groundAt, {
      radius: Math.max(markerSize * 0.07, 1),
      lift: Math.max(markerSize * 0.06, 1),
    });
  }, [routePoints, projection, groundAt, showRoute, markerSize]);

  useEffect(() => () => routeGeometry?.dispose(), [routeGeometry]);

  return (
    <group>
      {routeGeometry && (
        <mesh geometry={routeGeometry} userData={{ exportable: true }}>
          <meshStandardMaterial
            color="#c2185b"
            emissive="#7b1fa2"
            emissiveIntensity={0.25}
            roughness={0.55}
            metalness={0.05}
          />
        </mesh>
      )}

      {controls.map((control) => (
        <ControlMarker
          key={control.id}
          control={control}
          projection={projection}
          groundAt={groundAt}
          size={markerSize}
          poleHeight={poleHeight}
          selected={control.id === selectedId}
          onPointerDown={onMarkerDown}
          onPointerMove={onMarkerMove}
        />
      ))}
    </group>
  );
}

interface MarkerProps {
  control: CourseControl;
  projection: LocalProjection;
  groundAt: (at: LatLng) => number;
  size: number;
  poleHeight: number;
  selected: boolean;
  onPointerDown: (control: CourseControl, event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (control: CourseControl, event: ThreeEvent<PointerEvent>) => void;
}

function ControlMarker({
  control,
  projection,
  groundAt,
  size,
  poleHeight,
  selected,
  onPointerDown,
  onPointerMove,
}: MarkerProps) {
  const texture = useMemo(
    () => makeControlTexture(control.kind, control.code, selected),
    [control.kind, control.code, selected],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  const { x, z } = projection.toScene(control.lat, control.lng);
  const y = groundAt(control);

  return (
    <group position={[x, y, z]}>
      {/* ground ring — shows the exact spot the control refers to */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]} userData={{ exportable: true }}>
        <ringGeometry args={[size * 0.42, size * 0.55, 32]} />
        <meshBasicMaterial
          color={MARKER_COLORS[control.kind]}
          transparent
          opacity={selected ? 0.95 : 0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* pole */}
      <mesh position={[0, poleHeight / 2, 0]} userData={{ exportable: true }}>
        <cylinderGeometry args={[size * 0.035, size * 0.035, poleHeight, 6]} />
        <meshStandardMaterial color={MARKER_COLORS[control.kind]} roughness={0.6} />
      </mesh>

      {/* the numbered disc */}
      <sprite position={[0, poleHeight + size * 0.5, 0]} scale={[size, size, size]}>
        <spriteMaterial map={texture} transparent depthTest={false} />
      </sprite>

      {/* oversized invisible tap target, sized for a thumb */}
      <mesh
        position={[0, poleHeight / 2, 0]}
        visible={true}
        onPointerDown={(event) => onPointerDown(control, event)}
        onPointerMove={onPointerMove ? (event) => onPointerMove(control, event) : undefined}
      >
        <cylinderGeometry args={[size * 0.75, size * 0.75, poleHeight + size, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
