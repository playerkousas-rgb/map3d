/**
 * Resilient Overpass API client (buildings + roads).
 *
 * Overpass is the only source of building / road geometry, and every instance
 * is a volunteer-run public service, so the client is built to never be the
 * reason a fetch fails:
 *
 * - Several public mirrors are tried in turn (network error, HTTP error,
 *   timeout, or an HTML error page instead of JSON), and the mirror that
 *   worked last is tried first next time.
 * - A mirror that just failed is put on a **cooldown** and skipped for the rest
 *   of the window, so a dead instance is paid for at most once instead of on
 *   every single query. 429 / 406 / 5xx get the 30 s pause overpass-api.de
 *   asks for; anything else (DNS, TLS, no route, garbage body) means the
 *   mirror is simply unreachable from here and gets a long one.
 * - A response that came back flagged as incomplete (query ran out of time or
 *   memory server-side) is used as-is instead of thrown away — a partial city
 *   beats no city.
 * - Successful responses are cached (LRU, keyed by the exact query) so
 *   re-opening a scene, or retrying, downloads nothing extra.
 *
 * Nothing here is size-limited on purpose: the payload is fetched **by the
 * browser, straight from Overpass** and never travels through the hosting
 * provider, so there is no request-body or response-size budget to design
 * around. Large areas are split into many small cells by `sceneData.planCells`
 * rather than truncated.
 */

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter", // main instance (FOSSGIS)
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter", // VK Maps, no limits
  "https://overpass.openstreetmap.fr/api/interpreter", // OSM France instance
  "https://overpass.private.coffee/api/interpreter", // ex kumi.systems
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
/**
 * Cooldown after an unreachable / broken answer. Long on purpose: a mirror we
 * cannot reach is not going to answer the next query 200 ms later either.
 */
const DEAD_MS = 10 * 60_000;
const CACHE_LIMIT = 16;

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

/** "runtime error: Query timed out", "out of memory", … — the data is usable. */
const INCOMPLETE_REMARK = /runtime error|timed? ?out|timeout|out of memory/i;

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
    // Nothing came back at all — offline, blocked, DNS failure, mirror down.
    // Skip this instance for a good while instead of retrying it every query.
    cooldownUntil.set(endpoint, Date.now() + DEAD_MS);
    throw new Error(controller.signal.aborted ? "timeout" : "unreachable");
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
    cooldownUntil.set(endpoint, Date.now() + DEAD_MS);
    throw new Error("invalid JSON");
  }
  if (!data || !Array.isArray(data.elements)) {
    cooldownUntil.set(endpoint, Date.now() + DEAD_MS);
    throw new Error("unexpected response");
  }
  if (typeof data.remark === "string" && INCOMPLETE_REMARK.test(data.remark)) {
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
