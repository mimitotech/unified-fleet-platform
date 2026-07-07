import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';

export function useWialonUnitTrack(
  unitId: number | null,
  enabled: boolean,
  minutes = 90,
  live = false
) {
  return useQuery({
    queryKey: ['wialon-unit-track', unitId, minutes, live ? 'live' : 'static'],
    queryFn: () => {
      const to = Date.now();
      const from = to - minutes * 60_000;
      return clientApi.getWialonUnitTrack(unitId!, from, to);
    },
    enabled: enabled && unitId != null,
    staleTime: live ? LIVE_POLL.unitTrack : 15_000,
    refetchInterval: enabled ? pollWhenVisible(live ? LIVE_POLL.unitTrack : 30_000) : false,
    select: (data) =>
      safeArray(data?.points)
        .filter((p) => p.lat != null && p.lng != null && !(p.lat === 0 && p.lng === 0))
        .map((p) => [p.lat, p.lng] as [number, number]),
  });
}
