/**
 * Place search via OpenStreetMap Nominatim (keyless, CORS enabled).
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * max. 1 request per second, no search-as-you-type, cache results.
 * -> searches only run on explicit submit, are throttled and cached here.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_LIMIT = 30;

export interface PlaceResult {
  name: string;
  lat: number;
  lon: number;
  /** [[south, west], [north, east]] */
  bounds?: [[number, number], [number, number]];
}

let lastRequestAt = 0;
const cache = new Map<string, PlaceResult[]>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toResult(item: any): PlaceResult | null {
  const lat = parseFloat(item?.lat);
  const lon = parseFloat(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const bb = Array.isArray(item.boundingbox) ? item.boundingbox.map(parseFloat) : [];
  const bounds: PlaceResult["bounds"] =
    bb.length === 4 && bb.every(Number.isFinite)
      ? [
          [Math.min(bb[0], bb[1]), Math.min(bb[2], bb[3])],
          [Math.max(bb[0], bb[1]), Math.max(bb[2], bb[3])],
        ]
      : undefined;
  return { name: String(item.display_name || `${lat}, ${lon}`), lat, lon, bounds };
}

export async function searchPlaces(
  query: string,
  opts: { lang: "en" | "zh"; viewbox?: [number, number, number, number] }
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];

  const viewKey = opts.viewbox ? opts.viewbox.map((n) => n.toFixed(1)).join(",") : "";
  const key = `${opts.lang}|${viewKey}|${q.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "5",
    "accept-language": opts.lang === "zh" ? "zh-HK,zh-TW,zh,en" : "en",
  });
  // Prefer (but don't restrict to) what is currently on screen
  if (opts.viewbox) params.set("viewbox", opts.viewbox.join(","));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let data: any;
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(data)) throw new Error("unexpected Nominatim response");

  const results = data.map(toResult).filter((r): r is PlaceResult => r !== null);
  cache.set(key, results);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return results;
}
