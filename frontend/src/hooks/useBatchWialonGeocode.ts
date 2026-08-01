import { useQueries } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { stableGeocodeCoord } from '@/hooks/useWialonGeocode';

export type GeocodePoint = {
  key: string;
  lat: number;
  lng: number;
};

/**
 * Batch reverse-geocode with React Query cache (shared with useWialonGeocode).
 * Caps concurrency via query enablement — callers should pass unique points only.
 */
export function useBatchWialonGeocode(
  points: GeocodePoint[],
  enabled = true,
): Map<string, string> {
  // Deduplicate by stable coord key so fleet reports don't spam identical lookups.
  const unique = (() => {
    const seen = new Map<string, GeocodePoint>();
    for (const p of points) {
      const la = stableGeocodeCoord(p.lat);
      const ln = stableGeocodeCoord(p.lng);
      if (la == null || ln == null) continue;
      const coordKey = `${la},${ln}`;
      if (!seen.has(coordKey)) seen.set(coordKey, { key: p.key, lat: la, lng: ln });
    }
    return [...seen.entries()].map(([coordKey, p]) => ({ ...p, coordKey }));
  })();

  // Soft cap — geocode remaining points on subsequent renders as cache fills.
  const capped = unique.slice(0, 40);

  const results = useQueries({
    queries: capped.map((p) => ({
      queryKey: ['wialon-geocode', p.lat, p.lng, 'static'] as const,
      queryFn: () => clientApi.getWialonGeocode(p.lat, p.lng),
      enabled: enabled && Number.isFinite(p.lat) && Number.isFinite(p.lng),
      staleTime: 10 * 60_000,
      gcTime: 30 * 60_000,
    })),
  });

  const byCoord = new Map<string, string>();
  capped.forEach((p, i) => {
    const address = results[i]?.data?.geocode?.address;
    if (address) byCoord.set(p.coordKey, address);
  });

  const out = new Map<string, string>();
  for (const p of points) {
    const la = stableGeocodeCoord(p.lat);
    const ln = stableGeocodeCoord(p.lng);
    if (la == null || ln == null) continue;
    const address = byCoord.get(`${la},${ln}`);
    if (address) out.set(p.key, address);
  }
  return out;
}
