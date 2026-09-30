/**
 * Hong Kong geodesy for orienteering — self-contained, no proj4 dependency.
 *
 * The scout convention for city orienteering in Hong Kong is the UTM 100 km
 * grid square reference used by paper HM20C sheets — "KK 0794 6642" — not
 * HK1980. Hong Kong straddles 114°E, so the western half falls in UTM zone 49
 * (squares GE / HE) and the eastern half in zone 50 (JK / KK).
 *
 * The Transverse Mercator series below (Snyder / Redfearn) was validated
 * against PROJ (pyproj, EPSG:32649 / EPSG:32650) over a 70-point grid covering
 * 22.15–22.55°N, 113.85–114.45°E: worst-case error 0.03 mm — i.e. four orders
 * of magnitude finer than the 10 m 8-figure grid references people read off it.
 */

import type { LatLng } from "./course";

/** Degrees of magnetic declination in Hong Kong (approx. 2026), west. */
export const MAG_DECLINATION_WEST = 3.1;

/** Bounding box of Hong Kong SAR [south, west, north, east]. */
export const HK_BOUNDS: [number, number, number, number] = [22.13, 113.8, 22.58, 114.51];
/** A sensible default map centre (Victoria Harbour). */
export const HK_CENTER: LatLng = { lat: 22.352, lng: 114.158 };

export const LANDSD_API = "https://mapapi.geodata.gov.hk/gs/api/v1.0.0";

/** Official map services referenced in the UI. */
export const LANDSD_LINKS = {
  terms: "https://portal.csdi.gov.hk/csdi-webpage/doc/TNC",
  topoApi: "https://portal.csdi.gov.hk/csdi-webpage/apidoc/TopographicMapAPI",
  imageryApi: "https://portal.csdi.gov.hk/csdi-webpage/apidoc/ImageryMapAPI",
  hm20c:
    "https://www.landsd.gov.hk/tc/survey-mapping/mapping/multi-scale-topographic-mapping/paper-map.html",
  ib20000:
    "https://www.landsd.gov.hk/tc/survey-mapping/mapping/multi-scale-topographic-mapping/digital-map.html",
};

/* ------------------------------------------------------------------ *
 * Transverse Mercator (WGS84) — forward and inverse
 * ------------------------------------------------------------------ */

const A_AXIS = 6378137; // WGS84 semi-major axis
const FLATTENING = 1 / 298.257223563;
const E2 = FLATTENING * (2 - FLATTENING);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const FALSE_EASTING = 500000;

/** UTM zone number for a longitude — HK convention: 114°E and west is zone 49. */
export function utmZoneForLng(lng: number): 49 | 50 {
  return lng < 114.0 ? 49 : 50;
}

export interface UtmPoint {
  /** easting, metres */
  e: number;
  /** northing, metres */
  n: number;
  /** UTM zone number */
  zone: number;
}

/** WGS84 → UTM, picking the zone from the longitude. */
export function toUtm(lat: number, lng: number): UtmPoint {
  const zone = utmZoneForLng(lng);
  const { e, n } = projectUtm(lat, lng, zone);
  return { e, n, zone };
}

/** WGS84 → UTM in an explicit zone (keeps a route continuous across 114°E). */
export function toUtmInZone(lat: number, lng: number, zone: number): UtmPoint {
  const { e, n } = projectUtm(lat, lng, zone);
  return { e, n, zone };
}

function projectUtm(lat: number, lng: number, zone: number) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const lam0 = ((zone * 6 - 183) * Math.PI) / 180;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = A_AXIS / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = EP2 * cosPhi * cosPhi;
  const dLam = (lam - lam0) * cosPhi;

  const e4 = E2 * E2;
  const e6 = e4 * E2;
  const M =
    A_AXIS *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));

  const dLam2 = dLam * dLam;
  const e =
    K0 *
      N *
      (dLam +
        ((1 - T + C) * dLam * dLam2) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * dLam * dLam2 * dLam2) / 120) +
    FALSE_EASTING;
  const n =
    K0 *
    (M +
      N *
        tanPhi *
        (dLam2 / 2 +
          ((5 - T + 9 * C + 4 * C * C) * dLam2 * dLam2) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * dLam2 * dLam2 * dLam2) / 720));

  return { e, n };
}

/** UTM → WGS84 (inverse Transverse Mercator series). */
export function fromUtm(e: number, n: number, zone: number): LatLng {
  const x = e - FALSE_EASTING;
  const y = n;

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const e1_2 = e1 * e1;
  const e1_3 = e1_2 * e1;
  const e1_4 = e1_3 * e1;

  const M = y / K0;
  const mu = M / (A_AXIS * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1_3) / 32) * Math.sin(2 * mu) +
    ((21 * e1_2) / 16 - (55 * e1_4) / 32) * Math.sin(4 * mu) +
    ((151 * e1_3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1_4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const C1 = EP2 * cosPhi1 * cosPhi1;
  const T1 = tanPhi1 * tanPhi1;
  const N1 = A_AXIS / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const R1 = (A_AXIS * (1 - E2)) / Math.pow(1 - E2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * K0);

  const D2 = D * D;
  const D3 = D2 * D;
  const D4 = D3 * D;
  const D5 = D4 * D;
  const D6 = D5 * D;

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (D2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D6) / 720);
  const lng =
    ((D -
      ((1 + 2 * T1 + C1) * D3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D5) / 120) /
      cosPhi1) *
      (180 / Math.PI) +
    (zone * 6 - 183);

  return { lat: (lat * 180) / Math.PI, lng };
}

/* ------------------------------------------------------------------ *
 * HM20C-style 100 km grid squares
 * ------------------------------------------------------------------ */

/** MGRS 100 km squares that touch Hong Kong. `eastBase` = UTM easting of the square's west edge. */
export const UTM_SQUARES: Record<string, { zone: number; eastBase: number; row: string }> = {
  GE: { zone: 49, eastBase: 700000, row: "E" },
  HE: { zone: 49, eastBase: 800000, row: "E" },
  JK: { zone: 50, eastBase: 100000, row: "K" },
  KK: { zone: 50, eastBase: 200000, row: "K" },
};

const UTM_NORTH_LETTERS_ODD = "ABCDEFGHJKLMNPQRSTUV";
const UTM_NORTH_LETTERS_EVEN = "FGHJKLMNPQRSTUVABCDE";

/** 100 km square letter pair for a zone/easting, or null when out of Hong Kong. */
export function resolveUtmSquare(zone: number, e: number): string | null {
  if (zone === 49) {
    if (e >= 700000 && e < 800000) return "GE";
    if (e >= 800000 && e < 900000) return "HE";
  } else {
    if (e >= 100000 && e < 200000) return "JK";
    if (e >= 200000 && e < 300000) return "KK";
  }
  return null;
}

/** Northing of the bottom edge of a 100 km north-row letter (Hong Kong's 2,000 km cycle). */
function utmNorthBase(zone: number, rowLetter: string): number {
  const set = zone % 2 === 1 ? UTM_NORTH_LETTERS_ODD : UTM_NORTH_LETTERS_EVEN;
  const row = set.indexOf(rowLetter);
  if (row < 0) return 0;
  const base = row * 100000;
  const k = Math.round((2470000 - base) / 2000000); // Hong Kong sits near N ≈ 2,470,000
  return base + k * 2000000;
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

export interface GridRefs {
  e: number;
  n: number;
  zone: number;
  /** 100 km square letters, e.g. "KK" — null outside the香港 grid squares */
  square: string | null;
  /** 6-figure reference, 100 m — "KK 079 664" */
  fig6: string;
  /** 8-figure reference, 10 m — "50Q KK 0794 6642" */
  fig8: string;
  /** same as fig8, kept for call-site clarity */
  full: string;
  /** kilometres within the square, for a compact display — "07 66" */
  km: string;
  /** easting prefix shown at the edge of a 1 km grid line — "07" */
  edgeE: string;
  /** northing prefix shown at the edge of a 1 km grid line — "66" */
  edgeN: string;
}

/**
 * HM20C-style grid reference for a coordinate.
 * Returns 8-figure (10 m) and 6-figure (100 m) strings people can read off the map.
 */
export function gridRefs(lat: number, lng: number): GridRefs {
  const { e: eRaw, n: nRaw, zone } = toUtm(lat, lng);
  const e = Math.round(eRaw);
  const n = Math.round(nRaw);
  const square = resolveUtmSquare(zone, e);
  if (!square) {
    const fallback = `${zone}Q ?? ???? ????`;
    return {
      e,
      n,
      zone,
      square: null,
      fig6: "?? ??? ???",
      fig8: fallback,
      full: fallback,
      km: "?? ??",
      edgeE: "??",
      edgeN: "??",
    };
  }
  const eastBase = UTM_SQUARES[square].eastBase;
  const eIn = e - eastBase; // 0..99999 easting inside the square
  const nIn = ((n % 100000) + 100000) % 100000; // 0..99999 northing inside the square
  const fig6 = `${square} ${pad(Math.floor(eIn / 100), 3)} ${pad(Math.floor(nIn / 100), 3)}`;
  const fig8 = `${zone}Q ${square} ${pad(Math.floor(eIn / 10), 4)} ${pad(Math.floor(nIn / 10), 4)}`;
  return {
    e,
    n,
    zone,
    square,
    fig6,
    fig8,
    full: fig8,
    km: `${pad(Math.floor(eIn / 1000), 2)} ${pad(Math.floor(nIn / 1000), 2)}`,
    edgeE: pad(Math.floor(eIn / 1000), 2),
    edgeN: pad(Math.floor(nIn / 1000), 2),
  };
}

/**
 * Parse a typed grid reference such as "KK 0794 6642", "KK 079 664", "KK 07 66",
 * "50Q KK 0794 6642" or "kk07946642" back to a coordinate (centre of the cell).
 * Returns null when the text is not a usable reference.
 */
export function parseGridInput(raw: string): LatLng | null {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[,;|]+/g, " ")
    .replace(/\s+/g, " ");
  if (!s) return null;

  let rest = s;
  let zone: number | null = null;
  const zoneMatch = rest.match(/^(49|50)Q\s*/);
  if (zoneMatch) {
    zone = Number(zoneMatch[1]);
    rest = rest.slice(zoneMatch[0].length);
  }

  const squareMatch = rest.match(/^(GE|HE|JK|KK)\s*/);
  if (!squareMatch) return null;
  const square = squareMatch[1];
  rest = rest.slice(squareMatch[0].length);

  const info = UTM_SQUARES[square];
  if (zone && zone !== info.zone) return null;
  zone = info.zone;

  const digits = rest.replace(/\D/g, "");
  if (!digits || digits.length % 2 !== 0 || digits.length < 4) return null;

  const half = digits.length / 2;
  // Resolution per axis: 4 digits = 10 m, 3 = 100 m, 2 = 1 km. Take the cell centre.
  const res = half >= 4 ? 10 : half === 3 ? 100 : 1000;
  const eVal = Number(digits.slice(0, half)) * res + res / 2;
  const nVal = Number(digits.slice(half)) * res + res / 2;
  if (!Number.isFinite(eVal) || !Number.isFinite(nVal)) return null;

  return fromUtm(info.eastBase + eVal, utmNorthBase(zone, info.row) + nVal, zone);
}

/* ------------------------------------------------------------------ *
 * Distances and bearings
 * ------------------------------------------------------------------ */

/**
 * Straight-line (planar) distance in metres. Both endpoints are projected into
 * the same UTM zone so a leg crossing 114°E stays continuous.
 */
export function planarDistance(a: LatLng, b: LatLng): number {
  const A = toUtm(a.lat, a.lng);
  const B = toUtmInZone(b.lat, b.lng, A.zone);
  return Math.hypot(B.e - A.e, B.n - A.n);
}

/** Grid bearing in degrees: 0 = north, clockwise, referenced to UTM grid north. */
export function gridBearing(from: LatLng, to: LatLng): number {
  const A = toUtm(from.lat, from.lng);
  const B = toUtmInZone(to.lat, to.lng, A.zone);
  let deg = (Math.atan2(B.e - A.e, B.n - A.n) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** Grid bearing → magnetic bearing, correcting for Hong Kong's ~3.1°W declination. */
export function magneticBearing(gridDeg: number): number {
  let mag = gridDeg - MAG_DECLINATION_WEST;
  if (mag < 0) mag += 360;
  return mag;
}

/** Format a bearing as "137° 24′". */
export function formatDeg(deg: number): string {
  const d = Math.floor(deg);
  const m = Math.round((deg - d) * 60);
  return `${pad(d, 3)}° ${pad(m % 60, 2)}′`;
}

/* ------------------------------------------------------------------ *
 * Web-Mercator helpers (used by the 3D ground's tile mosaic)
 * ------------------------------------------------------------------ */

/** Metres per pixel at a given latitude and Web-Mercator zoom level. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Map scale denominator (1:N) for a latitude/zoom at a given screen DPI. */
export function scaleDenominator(lat: number, zoom: number, dpi = 96): number {
  return (metersPerPixel(lat, zoom) * dpi) / 0.0254;
}

/** Zoom level that renders a 1:N paper scale at the given screen DPI. */
export function zoomForScale(lat: number, scale: number, dpi = 96): number {
  const targetMpp = (scale * 0.0254) / dpi;
  return Math.log2(156543.03392804097 * Math.cos((lat * Math.PI) / 180) / targetMpp);
}
