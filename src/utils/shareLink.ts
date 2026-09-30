/**
 * Player share links.
 *
 * A finished course is handed to players as a URL: the area and the course
 * are packed into the fragment (`#play=…`), so nothing is uploaded anywhere —
 * the site stays a static page and the link works for as long as the site
 * does. The fragment is never sent to the server either.
 *
 * Payload → JSON → deflate (when the browser has CompressionStream) →
 * base64url. A 20-control course is roughly 1–1.5 k characters, well inside
 * what every messenger and browser accepts.
 */

import { Course, LatLng, parseCourseJson } from "./course";

export const PLAY_PARAM = "play";

interface SharePayload {
  /** [south-west, north-east] corners of the 3D scene */
  a: [LatLng, LatLng];
  c: Course;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, Uint8Array>) {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

/** Round coordinates to ~1 cm so the link stays short. */
function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

export async function encodeShare(area: [LatLng, LatLng], course: Course): Promise<string> {
  const payload: SharePayload = {
    a: [
      { lat: round(area[0].lat), lng: round(area[0].lng) },
      { lat: round(area[1].lat), lng: round(area[1].lng) },
    ],
    c: {
      ...course,
      controls: course.controls.map((c) => ({ ...c, lat: round(c.lat), lng: round(c.lng) })),
    },
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== "undefined") {
    try {
      const deflated = await pipe(json, new CompressionStream("deflate-raw"));
      return "z" + toBase64Url(deflated);
    } catch {
      /* fall through to the plain encoding */
    }
  }
  return "j" + toBase64Url(json);
}

export async function decodeShare(text: string): Promise<{ area: [LatLng, LatLng]; course: Course }> {
  const kind = text[0];
  const body = fromBase64Url(text.slice(1));
  let json: Uint8Array;
  if (kind === "z") {
    if (typeof DecompressionStream === "undefined") throw new Error("UNSUPPORTED_BROWSER");
    json = await pipe(body, new DecompressionStream("deflate-raw"));
  } else if (kind === "j") {
    json = body;
  } else {
    throw new Error("INVALID_LINK");
  }
  const data = JSON.parse(new TextDecoder().decode(json));
  const a = data?.a;
  if (
    !Array.isArray(a) ||
    a.length !== 2 ||
    !a.every((p: any) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
  ) {
    throw new Error("INVALID_LINK");
  }
  // Run the course through the same validator as file imports.
  const course = parseCourseJson(JSON.stringify({ app: "map3d-orienteering", version: 1, course: data.c }));
  return { area: [{ lat: a[0].lat, lng: a[0].lng }, { lat: a[1].lat, lng: a[1].lng }], course };
}

/** Build the full URL players open. */
export async function buildShareUrl(area: [LatLng, LatLng], course: Course): Promise<string> {
  const token = await encodeShare(area, course);
  const url = new URL(window.location.href);
  url.hash = `${PLAY_PARAM}=${token}`;
  return url.toString();
}

/** The share token in the current URL, if any. */
export function readShareToken(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get(PLAY_PARAM);
}

export function clearShareToken() {
  if (typeof window === "undefined") return;
  if (!window.location.hash) return;
  history.replaceState(null, "", window.location.pathname + window.location.search);
}
