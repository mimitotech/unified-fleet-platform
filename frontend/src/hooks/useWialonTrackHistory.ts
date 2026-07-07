import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';
import {
  buildStatusSegments,
  buildTripColoredSegments,
  mergeStopEvents,
  parkingStopsFromTrips,
  stopsFromPoints,
  type TrackPoint,
  type TrackStatusSegment,
  type TrackStopEvent,
} from '@/lib/trackAnalysis';

export type { TrackPoint, TrackStatusSegment, TrackStopEvent };

export function useWialonTrackHistory(unitId: number | null, enabled: boolean, minutes = 360, live = false) {
  const query = useQuery({
    queryKey: ['wialon-track-history', unitId, minutes, live ? 'live' : 'static'],
    enabled: enabled && unitId != null,
    staleTime: live ? LIVE_POLL.unitTrack : 20_000,
    refetchInterval: enabled && live ? pollWhenVisible(LIVE_POLL.unitTrack) : false,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const to = Date.now();
      const from = to - minutes * 60_000;
      const [track, tripsRes] = await Promise.all([
        clientApi.getWialonUnitTrack(unitId!, from, to),
        clientApi.getWialonUnitTrips(unitId!, from, to),
      ]);
      const points = safeArray<TrackPoint>(track.points).filter(
        (p) => p.lat != null && p.lng != null && !(p.lat === 0 && p.lng === 0)
      );
      const trips = safeArray<Record<string, unknown>>(tripsRes.trips);
      return { points, trips, from, to };
    },
  });

  const analysis = useMemo(() => {
    const points = query.data?.points ?? [];
    const trips = query.data?.trips ?? [];
    const statusSegments = buildStatusSegments(points);
    const tripSegments = buildTripColoredSegments(points, trips);
    const stops = mergeStopEvents(parkingStopsFromTrips(trips), stopsFromPoints(points));
    const route = points.map((p) => [p.lat, p.lng] as [number, number]);
    const start = points.length ? points[0] : null;
    const end = points.length ? points[points.length - 1] : null;
    return { points, statusSegments, tripSegments, stops, route, start, end };
  }, [query.data]);

  return {
    ...analysis,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    pointCount: analysis.points.length,
    stopCount: analysis.stops.length,
    refetch: query.refetch,
  };
}
