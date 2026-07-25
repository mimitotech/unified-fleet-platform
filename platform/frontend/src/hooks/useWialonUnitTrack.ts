import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';
import { isValidMapCoord, sanitizeTrackPositions, splitTrackSegments } from '@/lib/mapGeo';

export type UnitTrackData = {
  points: [number, number][];
  segments: [number, number][][];
};

export function useWialonUnitTrack(
  unitId: number | null,
  enabled: boolean,
  minutes = 90,
  live = false,
) {
  const query = useQuery({
    queryKey: ['wialon-unit-track', unitId, minutes, live ? 'live' : 'static'],
    queryFn: () => {
      const to = Date.now();
      const from = to - minutes * 60_000;
      return clientApi.getWialonUnitTrack(unitId!, from, to);
    },
    enabled: enabled && unitId != null,
    staleTime: live ? LIVE_POLL.unitTrack : 15_000,
    refetchInterval: enabled ? pollWhenVisible(live ? LIVE_POLL.unitTrack : 30_000) : false,
    select: (data): UnitTrackData => {
      const raw = safeArray<{ lat: number; lng: number }>(data?.points)
        .filter((p) => isValidMapCoord(p.lat, p.lng))
        .map((p) => [p.lat, p.lng] as [number, number]);
      const segments = splitTrackSegments(raw, 2_500);
      const points = sanitizeTrackPositions(raw, { maxJumpMeters: 2_500, maxPoints: 200 });
      return { points, segments };
    },
  });

  const empty = useMemo<UnitTrackData>(() => ({ points: [], segments: [] }), []);
  return {
    ...query,
    data: query.data ?? empty,
  };
}
