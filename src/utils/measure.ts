/**
 * Selection-size measurement shown while the user is boxing an area.
 *
 * Thresholds are backed by live Overpass measurements in dense urban Hong
 * Kong (Central, 2026-09):
 *   1.1 km box →  702 buildings + 2,815 roads  → fetch in seconds
 *   2.2 km box → 2,123 buildings + 5,454 roads  → still comfortable
 *   5.5 km box → 7,797 buildings + 17,371 roads → ~20 s as ONE query, so it is
 *                                                     now split into cells
 *  11   km box → 22,717 buildings + 42,965 roads → far too much for one query
 *
 * The verdict is therefore about **time, not failure**: a big area still
 * loads in full, it just takes several smaller queries instead of one, and the
 * map says so while it happens. 1.5–3 km reads "slow", beyond 3 km "big".
 */

export interface AreaSize {
  /** east–west extent in metres */
  widthM: number;
  /** north–south extent in metres */
  heightM: number;
  /** planar area in m² */
  areaM2: number;
  /** longer of the two sides, in metres */
  maxSideM: number;
  /** "ok" = quick, "warn" = a few pieces, "big" = many pieces, slower */
  level: "ok" | "warn" | "big";
}

/** Side length beyond which the area is fetched as many pieces. */
export const BIG_SIDE_M = 3000;
/** Side length beyond which the fetch needs more than a couple of pieces. */
export const WARN_SIDE_M = 1500;

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320; // at the equator; scaled by cos(lat) below

export function measureArea(a: { lat: number; lng: number }, b: { lat: number; lng: number }): AreaSize {
  const latMid = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = Math.abs(a.lat - b.lat);
  const dLng = Math.abs(a.lng - b.lng);
  const heightM = dLat * M_PER_DEG_LAT;
  const widthM = dLng * M_PER_DEG_LNG * Math.cos(latMid);
  const maxSideM = Math.max(widthM, heightM);
  const level: AreaSize["level"] = maxSideM > BIG_SIDE_M ? "big" : maxSideM > WARN_SIDE_M ? "warn" : "ok";
  return { widthM, heightM, areaM2: widthM * heightM, maxSideM, level };
}

/** Format a length for display: "820 m" / "1.8 km". */
export function fmtLength(m: number): string {
  if (m >= 1000) {
    const km = m / 1000;
    return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} km`;
  }
  return `${Math.round(m / 10) * 10} m`;
}

/** Format an area for display: "9,500 m²" / "0.52 km²". */
export function fmtArea(m2: number): string {
  if (m2 < 10_000) return `${(Math.round(m2 / 100) * 100).toLocaleString("en-US")} m²`;
  const km2 = m2 / 1_000_000;
  return `${km2 >= 10 ? km2.toFixed(1) : km2.toFixed(2)} km²`;
}

/** One-line label like "820 m × 640 m · 0.52 km²". */
export function fmtSize(size: AreaSize): string {
  return `${fmtLength(size.widthM)} × ${fmtLength(size.heightM)} · ${fmtArea(size.areaM2)}`;
}
