const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance in km.
 *
 * Computed in the application rather than in SQL: the catalog is small enough
 * that filtering happens on indexed columns and distance is applied to the
 * result. Move this into the query (PostGIS `geography` / `earthdistance`)
 * before the restaurant count makes a full scan expensive — see DATABASE.md.
 */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rounded to 100 m — the precision the UI actually shows ("0.4 km"). */
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
