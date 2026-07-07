import { useFleetSnapshot, type FleetUnit } from '@/hooks/useFleetSnapshot';

const emptyFleetCounts = {
  total: 0,
  moving: 0,
  idle: 0,
  stopped: 0,
  offline: 0,
  withPosition: 0,
  byHwName: {} as Record<string, number>,
  byStatus: { moving: 0, idle: 0, stopped: 0, offline: 0 },
};

/** Fleet units + counts — thin wrapper over unified snapshot cache. */
export function useFleetUnits() {
  const snap = useFleetSnapshot();
  return {
    units: snap.units ?? [],
    counts: snap.counts ?? emptyFleetCounts,
    statuses: snap.statuses ?? [],
    live: snap.live,
    isLoading: snap.isLoading,
    isError: snap.isError,
    refetch: snap.refetch,
    fetchedAt: snap.fetchedAt,
    dataUpdatedAt: snap.dataUpdatedAt,
    isFetching: snap.isFetching,
  };
}

export type { FleetUnit };
