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

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Latitude/longitude bounds enclosing a radius, so a distance query can be
 * narrowed in SQL (on the `(lat, lng)` index) before exact distances are
 * computed. The box over-selects at the corners — callers still filter by
 * true distance — but it turns an unbounded scan into a bounded one.
 */
export function boundingBox(
  center: { lat: number; lng: number },
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;

  // Longitude degrees shrink towards the poles. Guard the cosine so a point
  // near a pole cannot divide by ~0 and produce an infinite span.
  const cos = Math.max(Math.cos(toRad(center.lat)), 0.01);
  const lngDelta = radiusKm / (KM_PER_DEGREE_LAT * cos);

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}
