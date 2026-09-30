/**
 * Canvas textures for course markers.
 *
 * Numbers are drawn into a canvas instead of using an SDF font: no extra
 * download, no font loading flash, it stays crisp at any zoom, and it survives
 * GLB / OBJ export as a real texture (unlike DOM overlays).
 */

import * as THREE from "three";
import type { ControlKind } from "@/utils/course";

/** Marker colours — the same magenta family the printed sheets use. */
export const MARKER_COLORS: Record<ControlKind, string> = {
  start: "#d81b60",
  control: "#c2185b",
  finish: "#7b1fa2",
};

const DPR = 2; // supersample so the disc stays sharp when the camera is close

/**
 * A control disc: white fill, thick coloured ring, the code in the middle.
 * `start` and `finish` additionally carry their triangle / double-circle glyph
 * so the shape reads even when the colour does not.
 */
export function makeControlTexture(
  kind: ControlKind,
  code: string,
  selected = false,
): THREE.CanvasTexture {
  const size = 128 * DPR;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const color = MARKER_COLORS[kind];

  if (selected) {
    ctx.beginPath();
    ctx.arc(c, c, c * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
  }

  // disc
  ctx.beginPath();
  ctx.arc(c, c, c * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // ring — thicker when selected
  ctx.beginPath();
  ctx.arc(c, c, c * 0.82, 0, Math.PI * 2);
  ctx.lineWidth = (selected ? 15 : 10) * DPR;
  ctx.strokeStyle = color;
  ctx.stroke();

  // the orienteering glyph: △ start, ○ control, ◎ finish
  if (kind === "finish") {
    ctx.beginPath();
    ctx.arc(c, c, c * 0.6, 0, Math.PI * 2);
    ctx.lineWidth = 5 * DPR;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // code
  const text = code || "";
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(size * (text.length > 2 ? 0.3 : 0.42))}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metric = ctx.measureText(text);
  if (metric.width > size * 1.1) {
    ctx.font = `700 ${Math.round((size * 1.1) / text.length)}px system-ui, -apple-system, sans-serif`;
  }
  ctx.fillText(text, c, kind === "control" ? c : c + size * 0.02);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** A small pill used for the distance of a leg / a place name in the scene. */
export function makePillTexture(text: string, background = "#ffffff", color = "#37474f") {
  const width = 256 * DPR;
  const height = 96 * DPR;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const r = height / 2;

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(width - r, 0);
  ctx.arc(width - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, height);
  ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = background;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 2 * DPR;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(height * 0.5)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
