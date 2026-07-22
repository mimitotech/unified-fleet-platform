import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';
import {
  buildStatusSegments,
  buildTripColoredSegments,
  preferTrackSegments,
  buildStateMarkers,
  buildDirectionMarkers,
  mergeStopEvents,
  parkingStopsFromTrips,
  stopsFromPoints,
  summarizeTrack,
  type TrackPoint,
  type TrackStatusSegment,
  type TrackStopEvent,
  type TrackStateMarker,
  type TrackDirectionMarker,
  type TrackColoredSegment,
} from '@/lib/trackAnalysis';

export type { TrackPoint, TrackStatusSegment, TrackStopEvent, TrackStateMarker, TrackDirectionMarker, TrackColoredSegment };

export type WialonTrackHistory = {
  points: TrackPoint[];
  trips: Array<Record<string, unknown>>;
  statusSegments: TrackStatusSegment[];
  tripSegments: TrackColoredSegment[];
  coloredSegments: TrackColoredSegment[];
  useTripColors: boolean;
  stops: TrackStopEvent[];
  route: [number, number][];
  stateMarkers: TrackStateMarker[];
  directionMarkers: TrackDirectionMarker[];
  summary: ReturnType<typeof summarizeTrack>;
  start: TrackPoint | null;
  end: TrackPoint | null;
  isLoading: boolean;
  isFetching: boolean;
  pointCount: number;
  stopCount: number;
  refetch: () => void;
};

export function useWialonTrackHistory(
  unitId: number | null,
  enabled: boolean,
  minutes = 360,
  live = false,
): WialonTrackHistory {
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
    const useTripColors = trips.length > 0 && tripSegments.some((s) => s.positions.length > 1);
    const coloredSegments = preferTrackSegments(points, trips, tripSegments, statusSegments);
    const stops = mergeStopEvents(parkingStopsFromTrips(trips), stopsFromPoints(points));
    const route = points.map((p) => [p.lat, p.lng] as [number, number]);
    const stateMarkers = buildStateMarkers(points);
    const directionMarkers = buildDirectionMarkers(points);
    const summary = summarizeTrack(points, stops);
    const start = points.length ? points[0] : null;
    const end = points.length ? points[points.length - 1] : null;
    return {
      points,
      trips,
      statusSegments,
      tripSegments,
      coloredSegments,
      useTripColors,
      stops,
      route,
      stateMarkers,
      directionMarkers,
      summary,
      start,
      end,
    };
  }, [query.data]);

  return {
    ...analysis,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    pointCount: analysis.summary.pointCount,
    stopCount: analysis.summary.stopCount,
    refetch: query.refetch,
  };
}
