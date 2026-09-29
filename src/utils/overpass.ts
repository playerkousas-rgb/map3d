/**
 * Resilient Overpass API client (buildings + roads).
 *
 * - Tries the main instance first (original behaviour) and automatically
 *   falls back to public mirrors on network errors, HTTP errors
 *   (429 / 406 / 5xx …), timeouts or non-JSON (HTML error page) responses.
 *   overpass-api.de itself asks clients to "use alternatives if possible"
 *   and to pause 30 s after a 429 — both are honoured here.
 * - Remembers the endpoint that worked last and tries it first next time.
 * - Always sends a normalised bbox (south <= north, west <= east). An
 *   inverted bbox is treated by Overpass as "wrap around the globe" and
 *   returns 100k+ elements.
 * - Caches a few recent successful responses so re-opening the 3D view does
 *   not download the same data again.
 */

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter", // main instance (FOSSGIS)
  "https://overpass.private.coffee/api/interpreter", // no rate limit (ex kumi.systems)
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter", // VK Maps, no limits
] as const;

export interface LatLngLike {
  lat: number;
  lng: number;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Build a valid Overpass bbox from any two opposite corners. */
export function normalizeBBox(a: LatLngLike, b: LatLngLike): BBox {
  return {
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
    west: Math.min(a.lng, b.lng),
    east: Math.max(a.lng, b.lng),
  };
}

/** Time allowed until response headers arrive (server timeout is 25 s + queueing). */
const HEADERS_TIMEOUT_MS = 45_000;
/** overpass-api.de policy: pause 30 s after HTTP 429 / 406. */
const BACKOFF_MS = 30_000;
const CACHE_LIMIT = 4;

const cooldownUntil = new Map<string, number>();
const cache = new Map<string, any[]>();
let preferred: string = OVERPASS_ENDPOINTS[0];

export class OverpassError extends Error {
  attempts: { endpoint: string; reason: string }[];

  constructor(attempts: { endpoint: string; reason: string }[]) {
    super(
      "All Overpass endpoints failed: " +
        attempts.map((a) => `${hostOf(a.endpoint)} → ${a.reason}`).join("; ")
    );
    this.name = "OverpassError";
    this.attempts = attempts;
  }
}

/** Server answered, but flagged the result as incomplete (e.g. query timed out). */
class PartialResultError extends Error {
  elements: any[];

  constructor(remark: string, elements: any[]) {
    super(remark);
    this.elements = elements;
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function endpointOrder(now: number): string[] {
  const ordered = [preferred, ...OVERPASS_ENDPOINTS.filter((e) => e !== preferred)];
  const ready = ordered.filter((e) => (cooldownUntil.get(e) ?? 0) <= now);
  const coolingDown = ordered.filter((e) => (cooldownUntil.get(e) ?? 0) > now);
  // endpoints that are backing off are still tried, but only as a last resort
  return [...ready, ...coolingDown];
}

async function requestOnce(endpoint: string, query: string): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS);
  let res: Response;
  try {
    // Same request shape as before: raw query body, "simple" content type
    // (no CORS preflight).
    res = await fetch(endpoint, {
      method: "POST",
      body: query,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
  } catch {
    throw new Error(controller.signal.aborted ? "timeout" : "network error");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429 || res.status === 406 || res.status >= 500) {
      cooldownUntil.set(endpoint, Date.now() + BACKOFF_MS);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error("invalid JSON");
  }
  if (!data || !Array.isArray(data.elements)) throw new Error("unexpected response");
  if (typeof data.remark === "string" && /runtime error/i.test(data.remark)) {
    throw new PartialResultError(data.remark, data.elements);
  }
  return data.elements;
}

/**
 * Run an Overpass QL query and return its `elements`.
 * Throws {@link OverpassError} only when every endpoint failed.
 */
export async function overpassQuery(query: string): Promise<any[]> {
  const cached = cache.get(query);
  if (cached) {
    cache.delete(query); // refresh LRU position
    cache.set(query, cached);
    return cached;
  }

  const attempts: { endpoint: string; reason: string }[] = [];
  let partial: any[] | null = null;

  for (const endpoint of endpointOrder(Date.now())) {
    try {
      const elements = await requestOnce(endpoint, query);
      preferred = endpoint;
      cache.set(query, elements);
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      return elements;
    } catch (err) {
      if (err instanceof PartialResultError && err.elements.length > (partial?.length ?? 0)) {
        partial = err.elements;
      }
      const reason = err instanceof Error ? err.message : String(err);
      attempts.push({ endpoint, reason });
      console.warn(`[map3d] Overpass ${hostOf(endpoint)} failed (${reason}), trying next endpoint…`);
    }
  }

  // Every endpoint reported a problem, but one returned incomplete data:
  // show it (this is what the app always did with partial results).
  if (partial && partial.length > 0) return partial;
  throw new OverpassError(attempts);
}
