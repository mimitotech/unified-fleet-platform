import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';

/** ~11 m precision — stable cache key while markers animate between polls. */
export function stableGeocodeCoord(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10_000) / 10_000;
}

export function useWialonGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined,
  enabled = true,
  live = false
) {
  const geoLat = stableGeocodeCoord(lat);
  const geoLng = stableGeocodeCoord(lng);
  const ok = enabled && geoLat != null && geoLng != null;

  return useQuery({
    queryKey: ['wialon-geocode', geoLat, geoLng, live ? 'live' : 'static'],
    queryFn: () => clientApi.getWialonGeocode(geoLat!, geoLng!),
    enabled: ok,
    staleTime: live ? 45_000 : 10 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    select: (data) => data.geocode,
  });
}
