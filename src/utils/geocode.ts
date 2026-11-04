/** Browser-direct Nominatim JSONv2. Explicit submit only; no autocomplete.
 * Source contract and APP safety limits: docs/place-search-safety.md.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const GEOCODE_LIMITS = {
  minIntervalMs: 1100, timeoutMs: 15_000, maxBytes: 256_000,
  maxResults: 5, maxQueryChars: 1000, maxNameChars: 4096, cacheEntries: 30,
} as const;

export interface PlaceResult {
  name: string;
  lat: number;
  lon: number;
  /** [[south, west], [north, east]], never an invented/reordered bbox. */
  bounds?: [[number, number], [number, number]];
}
export interface PlaceSearchOptions {
  lang: "en" | "zh";
  viewbox?: [number, number, number, number];
  signal?: AbortSignal;
}

function decimal(value: unknown, min: number, max: number): number {
  const text = typeof value === "string" ? value.trim() : null;
  if (text !== null && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error("Invalid place coordinate");
  const n = text !== null ? Number(text) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error("Invalid place coordinate");
  return n;
}

/** Validate the complete response before publishing/caching any candidate. */
export function parsePlaceResults(data: unknown): PlaceResult[] {
  if (!Array.isArray(data) || data.length > GEOCODE_LIMITS.maxResults) throw new Error("Invalid place response");
  return Array.from(data, item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid place result");
    const lat = decimal(item.lat, -90, 90), lon = decimal(item.lon, -180, 180);
    if (item.display_name !== undefined && (typeof item.display_name !== "string" || item.display_name.length > GEOCODE_LIMITS.maxNameChars)) {
      throw new Error("Invalid place name");
    }
    let bounds: PlaceResult["bounds"];
    if (item.boundingbox !== undefined) {
      const b = item.boundingbox;
      if (!Array.isArray(b) || b.length !== 4) throw new Error("Invalid place bounds");
      const south = decimal(b[0], -90, 90), north = decimal(b[1], -90, 90);
      const west = decimal(b[2], -180, 180), east = decimal(b[3], -180, 180);
      if (south > north || west > east) throw new Error("Invalid place bounds order");
      // A zero-area bbox carries no useful fitting extent: use the valid point.
      if (south < north && west < east) bounds = [[south, west], [north, east]];
    }
    return { name: item.display_name?.trim() || `${lat}, ${lon}`, lat, lon, bounds };
  });
}

let lastRequestAt = 0;
let startQueue: Promise<void> = Promise.resolve();
const cache = new Map<string, PlaceResult[]>();

/** Abort promptly even while waiting behind an earlier queued start. */
function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, ms);
    signal.addEventListener("abort", aborted, { once: true });
  });
}
async function waitForStart(signal: AbortSignal, start: () => void): Promise<void> {
  const turn = startQueue.then(async () => {
    signal.throwIfAborted();
    const wait = lastRequestAt + GEOCODE_LIMITS.minIntervalMs - Date.now();
    if (wait > 0) await pause(wait, signal);
    signal.throwIfAborted();
    start();
    // Measure after the synchronous fetch start, not before an await that
    // could release other callers ahead of the actual network request.
    lastRequestAt = Date.now();
  });
  // A cancelled/failed caller cannot poison the queue for later searches.
  startQueue = turn.catch(() => {});
  await withAbort(turn, signal);
}

async function readResponse(res: Response, signal: AbortSignal): Promise<unknown> {
  if (!res.body) throw new Error("Empty place response");
  if (Number(res.headers.get("content-length")) > GEOCODE_LIMITS.maxBytes) {
    await res.body.cancel(); throw new Error("Place response too large");
  }
  const reader = res.body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > GEOCODE_LIMITS.maxBytes) throw new Error("Place response too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {}); throw error;
  } finally {
    signal.removeEventListener("abort", cancel); reader.releaseLock();
  }
  signal.throwIfAborted();
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(buffer));
}

export async function searchPlaces(query: string, opts: PlaceSearchOptions): Promise<PlaceResult[]> {
  opts.signal?.throwIfAborted();
  const q = query.trim();
  if (!q) return [];
  if (q.length > GEOCODE_LIMITS.maxQueryChars) throw new Error("Place query too long");
  // Leaflet can show wrapped world copies. An invalid optional bias is omitted,
  // not sent as NaN/out-of-range coordinates and not repaired into a false box.
  const b = opts.viewbox;
  const viewbox = Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) &&
    b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90 && b[0] < b[2] && b[1] < b[3] ? b : undefined;
  const key = JSON.stringify([opts.lang, viewbox ?? null, q.toLowerCase()]);
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }

  const controller = new AbortController();
  const aborted = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", aborted, {once: true});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const params = new URLSearchParams({q, format: "jsonv2", limit: String(GEOCODE_LIMITS.maxResults), "accept-language": opts.lang === "zh" ? "zh-HK,zh-TW,zh,en" : "en"});
    if (viewbox) params.set("viewbox", viewbox.join(","));
    let response: Promise<Response> | undefined;
    await waitForStart(controller.signal, () => {
      timer = setTimeout(() => controller.abort(new DOMException("Place search timed out", "TimeoutError")), GEOCODE_LIMITS.timeoutMs);
      response = fetch(`${NOMINATIM_URL}?${params}`, {signal: controller.signal, headers: {Accept: "application/json"}, credentials: "omit"}).then(res => {
        if (controller.signal.aborted) {
          void res.body?.cancel().catch(() => {});
          controller.signal.throwIfAborted();
        }
        return res;
      });
      // Cancellation can reject the queue wait before this response is awaited.
      // Observe its rejection immediately, while preserving it for the caller.
      void response.catch(() => {});
    });
    const res = await withAbort(response!, controller.signal);
    if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    const results = parsePlaceResults(await readResponse(res, controller.signal));
    controller.signal.throwIfAborted();
    cache.set(key, results);
    while (cache.size > GEOCODE_LIMITS.cacheEntries) cache.delete(cache.keys().next().value!);
    return results;
  } finally {
    clearTimeout(timer); opts.signal?.removeEventListener("abort", aborted);
  }
}
