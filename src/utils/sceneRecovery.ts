import type { LoadState } from "@/state/sceneStore";

/** Network/cell recovery, not geometry rejection or the draw-count ceiling. */
export function canRetrySceneLayer(state: LoadState, failedCells = 0): boolean {
  return state === "error" || (state === "ready" && failedCells > 0);
}
