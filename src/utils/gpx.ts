/**
 * GPX track parser
 *
 * Parses <trkpt> (track points), falling back to <rtept> (route points),
 * and computes track statistics (distance / elevation gain / range).
 */

export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number; // meters (0 when missing)
}

export interface GpxStats {
  name: string;
  pointCount: number;
  distanceKm: number;
  elevationGain: number;
  minEle: number;
  maxEle: number;
  hasElevation: boolean;
}

export interface GpxTrack {
  points: GpxPoint[];
  stats: GpxStats;
}

const EARTH_RADIUS = 6371000;

/** Great-circle distance in meters. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

export function parseGpx(xmlText: string): GpxTrack {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid GPX/XML");
  }

  let pts = Array.from(doc.getElementsByTagName("trkpt"));
  if (pts.length === 0) pts = Array.from(doc.getElementsByTagName("rtept"));

  const points: GpxPoint[] = [];
  for (const el of pts) {
    const lat = parseFloat(el.getAttribute("lat") || "");
    const lon = parseFloat(el.getAttribute("lon") || "");
    if (isNaN(lat) || isNaN(lon)) continue;
    const eleEl = el.getElementsByTagName("ele")[0];
    const ele = eleEl ? parseFloat(eleEl.textContent || "0") || 0 : 0;
    points.push({ lat, lon, ele });
  }

  if (points.length < 2) {
    throw new Error("NO_POINTS");
  }

  // Downsample very dense tracks to keep the mesh light
  const MAX_POINTS = 3000;
  let sampled = points;
  if (points.length > MAX_POINTS) {
    const stride = Math.ceil(points.length / MAX_POINTS);
    sampled = points.filter((_, i) => i % stride === 0);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }
  }

  const nameEl =
    doc.querySelector("trk > name") ||
    doc.querySelector("rte > name") ||
    doc.querySelector("metadata > name");

  return {
    points: sampled,
    stats: computeGpxStats(sampled, nameEl?.textContent?.trim() || "GPX Track"),
  };
}

/** Distance / elevation statistics for a (already down-sampled) track. */
export function computeGpxStats(points: GpxPoint[], name: string): GpxStats {
  let distance = 0;
  let gain = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    minEle = Math.min(minEle, p.ele);
    maxEle = Math.max(maxEle, p.ele);
    if (i > 0) {
      distance += haversine(points[i - 1], p);
      const d = p.ele - points[i - 1].ele;
      if (d > 0) gain += d;
    }
  }

  return {
    name,
    pointCount: points.length,
    distanceKm: distance / 1000,
    elevationGain: Math.round(gain),
    minEle: minEle === Infinity ? 0 : Math.round(minEle),
    maxEle: maxEle === -Infinity ? 0 : Math.round(maxEle),
    hasElevation: maxEle > minEle,
  };
}
