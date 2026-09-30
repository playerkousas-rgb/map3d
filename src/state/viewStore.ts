/**
 * Bridge between the DOM controls (buttons under the canvas) and the 3D camera.
 *
 * On a phone the camera needs on-screen buttons — pinch alone is fiddly with
 * one hand. The buttons live in the normal DOM overlay, so they dispatch an
 * imperative command here and the camera rig inside the canvas reacts to it.
 */

import { create } from "zustand";

export type ViewCommandKind = "reset" | "top" | "tilt" | "zoomIn" | "zoomOut";

export interface ViewCommand {
  kind: ViewCommandKind;
  /** bumped on every request so repeated presses of the same button register */
  nonce: number;
}

interface ViewStore {
  command: ViewCommand | null;
  /** camera azimuth in degrees, 0 = looking north — drives the compass */
  azimuth: number;
  request: (kind: ViewCommandKind) => void;
  setAzimuth: (azimuth: number) => void;
}

let nonce = 0;

export const useViewStore = create<ViewStore>((set) => ({
  command: null,
  azimuth: 0,
  request: (kind) => set({ command: { kind, nonce: ++nonce } }),
  setAzimuth: (azimuth) => set({ azimuth }),
}));
