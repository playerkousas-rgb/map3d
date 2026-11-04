import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ViewCommand } from "@/state/viewStore";
import { modelBounds, applyModelCamera, type ModelOrbit } from "@/utils/modelCamera";

/** Local model camera only: never dispatch to the course/player camera store. */
export function ModelCameraRig({ command, revision }: { command: ViewCommand | null; revision?: unknown }) {
  const { camera, controls, scene, size } = useThree();
  // A newly mounted model must not replay the previous model's last zoom/top.
  const handled = useRef(command?.nonce);
  const apply = useCallback((kind: ViewCommand["kind"]) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const bounds = modelBounds(scene);
    applyModelCamera(camera, controls as unknown as ModelOrbit | undefined, bounds, size.width / Math.max(size.height, 1), kind);
  }, [camera, controls, scene, size.width, size.height]);
  // A changed model / actual canvas resize gets a fresh frame, not every render.
  useEffect(() => { apply("reset"); }, [apply, revision]);
  useEffect(() => {
    if (!command || command.nonce === handled.current) return;
    handled.current = command.nonce;
    apply(command.kind);
  }, [command, apply]);
  return null;
}
