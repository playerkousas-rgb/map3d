/**
 * Player share links.
 *
 * A finished course is handed to players as a URL: the area and the course
 * are packed into the fragment (`#play=…`), so nothing is uploaded anywhere —
 * the site stays a static page and the link works for as long as the site
 * does. The fragment is never sent to the server either.
 *
 * Payload → JSON → deflate (when the browser has CompressionStream) →
 * base64url. Typical small courses fit ordinary messages, but service/browser
 * limits vary. Encoding and decompression have explicit safety budgets; planner
 * notes are omitted. Existing old links cannot be revoked or made private.
 */

import { Course, LatLng, parseCourseJson, COURSE_LIMITS } from "./course";

export const PLAY_PARAM = "play";
export const SHARE_LIMITS = { maxTokenChars: 64_000, maxJsonBytes: COURSE_LIMITS.maxBytes } as const;

function validateArea(area: unknown): asserts area is [LatLng, LatLng] {
  if (!Array.isArray(area) || area.length !== 2 || !area.every(p =>
    Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180) ||
    area[0].lat === area[1].lat || area[0].lng === area[1].lng) throw new Error("INVALID_LINK_AREA");
}

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
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SHARE_LIMITS.maxJsonBytes) throw new Error("SHARE_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

/** Round coordinates to ~1 cm so the link stays short. */
function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

export async function encodeShare(area: [LatLng, LatLng], course: Course): Promise<string> {
  validateArea(area);
  // Planner-only notes must never leave the device in a player URL.
  const publicCourse = parseCourseJson(JSON.stringify({ ...course,
    controls: course.controls.map(control => ({ ...control, note: "" })) }));
  const payload: SharePayload = {
    a: [
      { lat: round(area[0].lat), lng: round(area[0].lng) },
      { lat: round(area[1].lat), lng: round(area[1].lng) },
    ],
    c: {
      ...publicCourse,
      controls: publicCourse.controls.map((c) => ({ ...c, lat: round(c.lat), lng: round(c.lng) })),
    },
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (json.length > SHARE_LIMITS.maxJsonBytes) throw new Error("SHARE_TOO_LARGE");
  let token: string | undefined;
  if (typeof CompressionStream !== "undefined") {
    try {
      const deflated = await pipe(json, new CompressionStream("deflate-raw"));
      token = "z" + toBase64Url(deflated);
    } catch {
      /* fall through to the plain encoding */
    }
  }
  token ??= "j" + toBase64Url(json);
  if (token.length > SHARE_LIMITS.maxTokenChars) throw new Error("SHARE_TOO_LARGE");
  return token;
}

export async function decodeShare(text: string): Promise<{ area: [LatLng, LatLng]; course: Course }> {
  if (typeof text !== "string" || text.length > SHARE_LIMITS.maxTokenChars || !/^[jz][A-Za-z0-9_-]+$/.test(text)) throw new Error("INVALID_LINK");
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
  validateArea(a);
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
