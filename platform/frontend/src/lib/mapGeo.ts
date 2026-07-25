/** Geo helpers for monitoring map trails and marker motion. */

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidMapCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // Null Island / unset trackers
  if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return false;
  return true;
}

/** @deprecated alias — use isValidMapCoord */
export const isValidLatLng = isValidMapCoord;

function asPair(
  raw: [number, number] | { lat: number; lng: number },
): [number, number] | null {
  const lat = Array.isArray(raw) ? raw[0] : raw.lat;
  const lng = Array.isArray(raw) ? raw[1] : raw.lng;
  return isValidMapCoord(lat, lng) ? [lat, lng] : null;
}

/**
 * Drop spike outliers then keep a contiguous recent path.
 * Teleports start a fresh segment (no continent-spanning blue lines).
 */
export function sanitizeTrackPositions(
  positions: Array<[number, number] | { lat: number; lng: number }>,
  opts?: {
    maxJumpMeters?: number;
    maxPoints?: number;
  },
): [number, number][] {
  const segments = splitTrackSegments(positions, opts?.maxJumpMeters ?? 2_500);
  const last = segments[segments.length - 1] || [];
  const maxPoints = opts?.maxPoints ?? 400;
  return last.length > maxPoints ? last.slice(-maxPoints) : last;
}

/** Split a path into contiguous segments at GPS teleports. */
export function splitTrackSegments(
  positions: Array<[number, number] | { lat: number; lng: number }>,
  maxJumpMeters = 2_500,
): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  for (const raw of positions) {
    const pair = asPair(raw);
    if (!pair) continue;
    if (!current.length) {
      current.push(pair);
      continue;
    }
    const prev = current[current.length - 1];
    const dist = haversineMeters(prev[0], prev[1], pair[0], pair[1]);
    if (dist < 0.8) continue;
    if (dist > maxJumpMeters) {
      if (current.length > 1) segments.push(current);
      current = [pair];
    } else {
      current.push(pair);
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/** Prefer the most recent contiguous segment for fitBounds / display focus. */
export function recentTrackWindow(
  positions: [number, number][],
  maxPoints = 48,
): [number, number][] {
  if (positions.length <= maxPoints) return positions;
  return positions.slice(-maxPoints);
}
