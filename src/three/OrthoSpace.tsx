/**
 * The orienteering 3D scene.
 *
 * One canvas that holds: the official-map ground (with terrain), the city mass,
 * the course markers and the course line — plus the touch camera. It is the
 * mobile-first counterpart of the map3d building view: everything is in true
 * metres, and the camera, marker sizes and controls are tuned for a thumb on a
 * phone held in one hand.
 *
 * Data loading is split so a failure in one service never blanks the scene:
 * buildings, roads and terrain each land independently.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCourseStore } from "@/state/courseStore";
import { useSceneStore } from "@/state/sceneStore";
import { useViewStore } from "@/state/viewStore";
import { createProjection } from "@/utils/projection";
import { fetchBuildings, fetchRoads, SceneBuilding, SceneRoad } from "@/utils/sceneData";
import { fieldRange, fetchHeightField, heightAt, HeightField } from "@/utils/terrain";
import { Ground } from "./Ground";
import { CourseLayer } from "./CourseLayer";
import { buildBuildingsGeometry, buildRoadsGeometry } from "./orthoGeometry";
import { ExportListener } from "./ExportListener";
import { orderedControls, type CourseControl, type LatLng } from "@/utils/course";

/** Movement under this many CSS pixels still counts as a tap, not an orbit. */
const TAP_SLOP_PX = 9;

export function OrthoSpace() {
  const area = useCourseStore((state) => state.area);
  const buildingsOn = useCourseStore((state) => state.scene.showBuildings);
  const roadsOn = useCourseStore((state) => state.scene.showRoads);
  const showTerrain = useCourseStore((state) => state.scene.showTerrain);
  const exaggeration = useCourseStore((state) => state.scene.terrainExaggeration);
  const layer = useCourseStore((state) => state.scene.groundLayer);
  const showGrid = useCourseStore((state) => state.scene.showGrid);

  if (!area) return null;

  return (
    <Canvas
      camera={{ fov: 55, near: 1, far: 40000, position: [0, 800, 1200] }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#cfe3f5");
      }}
    >
      <Scene
        area={area}
        buildingsOn={buildingsOn}
        roadsOn={roadsOn}
        showTerrain={showTerrain}
        exaggeration={showTerrain ? exaggeration : 0}
        layer={layer}
        showGrid={showGrid}
      />
    </Canvas>
  );
}

interface SceneProps {
  area: [LatLng, LatLng];
  buildingsOn: boolean;
  roadsOn: boolean;
  showTerrain: boolean;
  exaggeration: number;
  layer: "hm20c" | "imagery" | "countryside" | "plain";
  showGrid: boolean;
}

function Scene({ area, buildingsOn, roadsOn, exaggeration, layer, showGrid }: SceneProps) {
  const setStatus = useSceneStore((state) => state.set);
  const [buildings, setBuildings] = useState<SceneBuilding[]>([]);
  const [roads, setRoads] = useState<SceneRoad[]>([]);
  const [field, setField] = useState<HeightField | null>(null);

  const projection = useMemo(() => createProjection(area), [area]);

  // Reset the reported status whenever a new area is opened.
  useEffect(() => {
    setStatus({
      buildings: "loading",
      roads: "loading",
      terrain: "loading",
      buildingCount: 0,
      roadCount: 0,
      groundTextured: false,
    });
    setBuildings([]);
    setRoads([]);
    setField(null);
  }, [area, setStatus]);

  useEffect(() => {
    let stale = false;
    fetchBuildings(area)
      .then((result) => {
        if (stale) return;
        setBuildings(result);
        setStatus({ buildings: "ready", buildingCount: result.length });
      })
      .catch((err) => {
        if (stale) return;
        console.error("[map3d] buildings failed:", err);
        setStatus({ buildings: "error" });
      });
    return () => {
      stale = true;
    };
  }, [area, setStatus]);

  useEffect(() => {
    let stale = false;
    fetchRoads(area)
      .then((result) => {
        if (stale) return;
        setRoads(result);
        setStatus({ roads: "ready", roadCount: result.length });
      })
      .catch((err) => {
        if (stale) return;
        console.error("[map3d] roads failed:", err);
        setStatus({ roads: "error" });
      });
    return () => {
      stale = true;
    };
  }, [area, setStatus]);

  useEffect(() => {
    let stale = false;
    fetchHeightField(area)
      .then((result) => {
        if (stale) return;
        setField(result);
        const range = fieldRange(result);
        setStatus({
          terrain: "ready",
          terrainMin: Math.round(range.min),
          terrainMax: Math.round(range.max),
          terrainSource: result.source,
        });
      })
      .catch((err) => {
        if (stale) return;
        console.warn("[map3d] terrain failed:", err);
        setStatus({ terrain: "error" });
      });
    return () => {
      stale = true;
    };
  }, [area, setStatus]);

  const groundAt = useCallback(
    (at: LatLng) => heightAt(field, at) * exaggeration,
    [field, exaggeration],
  );

  const cityGeometry = useMemo(() => {
    if (!buildingsOn || buildings.length === 0) {
      return { walls: null, roofs: null, count: 0 };
    }
    return buildBuildingsGeometry(buildings, projection, groundAt);
  }, [buildings, buildingsOn, projection, groundAt]);

  const roadGeometry = useMemo(() => {
    if (!roadsOn || roads.length === 0) return null;
    return buildRoadsGeometry(roads, projection, groundAt);
  }, [roads, roadsOn, projection, groundAt]);

  useEffect(
    () => () => {
      cityGeometry.walls?.dispose();
      cityGeometry.roofs?.dispose();
    },
    [cityGeometry],
  );
  useEffect(() => () => roadGeometry?.dispose(), [roadGeometry]);

  // ---- interaction -------------------------------------------------------
  const tool = useCourseStore((state) => state.tool);
  const selectedId = useCourseStore((state) => state.selectedId);
  const select = useCourseStore((state) => state.select);
  const addControl = useCourseStore((state) => state.addControl);
  const moveControl = useCourseStore((state) => state.moveControl);
  const removeControl = useCourseStore((state) => state.removeControl);
  const controls = useCourseStore((state) => state.course.controls);
  const course = useCourseStore((state) => state.course);
  const routeVisible = useCourseStore((state) => state.scene.showRoute);
  const showRoute = routeVisible && controls.length > 1;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);

  const handleGroundDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    tapStart.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
  }, []);

  const handleGroundMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!draggingId) return;
      const at = projection.toLatLng(event.point.x, event.point.z);
      moveControl(draggingId, at);
    },
    [draggingId, projection, moveControl],
  );

  const handleGroundUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const start = tapStart.current;
      tapStart.current = null;
      if (draggingId) {
        setDraggingId(null);
        return;
      }
      if (!start) return;
      const moved = Math.hypot(event.nativeEvent.clientX - start.x, event.nativeEvent.clientY - start.y);
      // An orbit that happened to end over the ground must not drop a control.
      if (moved > TAP_SLOP_PX) return;
      if (tool === "view" || tool === "move" || tool === "delete") {
        select(null);
        return;
      }
      addControl(tool, projection.toLatLng(event.point.x, event.point.z));
    },
    [draggingId, tool, select, addControl, projection],
  );

  const handleMarkerDown = useCallback(
    (control: CourseControl, event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (tool === "delete") {
        removeControl(control.id);
        return;
      }
      select(control.id);
      if (tool === "move") setDraggingId(control.id);
    },
    [tool, select, removeControl],
  );

  const handleMarkerMove = useCallback(
    (control: CourseControl, event: ThreeEvent<PointerEvent>) => {
      if (draggingId !== control.id) return;
      const at = projection.toLatLng(event.point.x, event.point.z);
      moveControl(control.id, at);
    },
    [draggingId, projection, moveControl],
  );

  const routePoints = useMemo(
    () => orderedControls(course).map((c) => ({ lat: c.lat, lng: c.lng })),
    [course],
  );

  return (
    <>
      <hemisphereLight args={["#dfefff", "#cbc4b4", Math.PI * 0.9]} />
      <ambientLight intensity={Math.PI * 0.35} />
      <directionalLight position={[0.6, 1, 0.4]} intensity={Math.PI * 0.55} />

      <Ground
        area={area}
        projection={projection}
        field={field}
        exaggeration={exaggeration}
        layer={layer}
        showGrid={showGrid}
        onPointerDown={handleGroundDown}
        onPointerMove={handleGroundMove}
        onPointerUp={handleGroundUp}
      />

      {cityGeometry.walls && (
        <mesh geometry={cityGeometry.walls} userData={{ exportable: true }}>
          <meshStandardMaterial vertexColors roughness={0.82} metalness={0.04} />
        </mesh>
      )}
      {cityGeometry.roofs && (
        <mesh geometry={cityGeometry.roofs} userData={{ exportable: true }}>
          <meshStandardMaterial vertexColors roughness={0.7} metalness={0.06} />
        </mesh>
      )}

      {roadGeometry && (
        <mesh geometry={roadGeometry} userData={{ exportable: true }}>
          <meshBasicMaterial vertexColors transparent opacity={0.85} />
        </mesh>
      )}

      <CourseLayer
        controls={controls}
        routePoints={routePoints}
        projection={projection}
        field={field}
        exaggeration={exaggeration}
        selectedId={selectedId}
        showRoute={showRoute}
        onMarkerDown={handleMarkerDown}
        onMarkerMove={handleMarkerMove}
      />

      <CameraRig projection={projection} dragging={draggingId !== null} />
      {/* Turns the "Export 3D model" button in the course panel into a file. */}
      <ExportListener />
    </>
  );
}

/**
 * Camera behaviour: frames the scene when it opens, reacts to the on-screen
 * view buttons, and reports its heading so the compass can turn. OrbitControls
 * itself is tuned for touch — one finger orbits, two fingers pinch and pan.
 */
function CameraRig({
  projection,
  dragging,
}: {
  projection: ReturnType<typeof createProjection>;
  dragging: boolean;
}) {
  const { camera, controls } = useThree();
  const command = useViewStore((state) => state.command);
  const setAzimuth = useViewStore((state) => state.setAzimuth);
  const lastReport = useRef(0);

  const extent = Math.max(projection.widthM, projection.depthM, 200);

  const placeCamera = useCallback(
    (mode: "reset" | "top" | "tilt") => {
      const orbit = controls as unknown as
        | { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number }
        | null;
      const elevation = mode === "top" ? 88 : mode === "tilt" ? 18 : 42;
      const distance = mode === "top" ? extent * 0.95 : extent * 1.15;
      const rad = (elevation * Math.PI) / 180;
      const horizontal = Math.cos(rad) * distance;
      camera.position.set(0, Math.sin(rad) * distance, horizontal);
      camera.up.set(0, 1, 0);
      if (orbit) {
        orbit.target.set(0, 0, 0);
        orbit.update();
      }
      camera.lookAt(0, 0, 0);
    },
    [camera, controls, extent],
  );

  // Frame the scene once, and again whenever the area changes.
  useEffect(() => {
    placeCamera("reset");
  }, [placeCamera]);

  useEffect(() => {
    const orbit = controls as unknown as { minDistance: number; maxDistance: number } | null;
    if (!orbit) return;
    orbit.minDistance = extent * 0.05;
    orbit.maxDistance = extent * 6;
  }, [controls, extent]);

  useEffect(() => {
    if (!command) return;
    const orbit = controls as unknown as { object: THREE.Camera; target: THREE.Vector3; update: () => void } | null;
    switch (command.kind) {
      case "reset":
        placeCamera("reset");
        break;
      case "top":
        placeCamera("top");
        break;
      case "tilt":
        placeCamera("tilt");
        break;
      case "zoomIn":
      case "zoomOut": {
        const factor = command.kind === "zoomIn" ? 0.7 : 1.4;
        const target = orbit?.target ?? new THREE.Vector3();
        const offset = camera.position.clone().sub(target).multiplyScalar(factor);
        const distance = offset.length();
        offset.setLength(Math.min(Math.max(distance, extent * 0.03), extent * 6));
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        orbit?.update();
        break;
      }
    }
  }, [command, camera, controls, placeCamera, extent]);

  useFrame(() => {
    if (dragging) return;
    const now = performance.now();
    if (now - lastReport.current < 120) return;
    lastReport.current = now;
    const orbit = controls as unknown as { target: THREE.Vector3 } | null;
    const target = orbit?.target ?? new THREE.Vector3();
    const dx = camera.position.x - target.x;
    const dz = camera.position.z - target.z;
    const degrees = ((Math.atan2(-dx, dz) * 180) / Math.PI + 360) % 360;
    setAzimuth(Math.round(degrees));
  });

  return (
    <OrbitControls
      makeDefault
      enabled={!dragging}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.55}
      panSpeed={0.7}
      zoomSpeed={0.9}
      // One finger orbits, two fingers pinch-zoom and pan — the phone gestures
      // people already expect from a map.
      maxPolarAngle={Math.PI / 2.08}
      minPolarAngle={0.02}
    />
  );
}
