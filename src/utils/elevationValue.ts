/** Conservative map3d safety bounds for GPX and DEM metres, not provider accuracy. */
export const ELEVATION_LIMITS = { minElevation: -12_000, maxElevation: 10_000 } as const;

export function isElevationM(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= ELEVATION_LIMITS.minElevation && value <= ELEVATION_LIMITS.maxElevation;
}
