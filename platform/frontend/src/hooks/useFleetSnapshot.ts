import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { preloadFleetUnitIcons } from '@/lib/fleetIconCache';
import { useWialonContext } from './useWialon';
import { useWialonFleetFuelLive } from './useWialonFuel';
import type { WialonFuelFleetUnit } from '@/lib/api';
import {
  snapshotToStatuses,
  snapshotToUnits,
  type FleetSnapshot,
  type FleetUnit,
} from '@/lib/fleetUnits';

export function fleetSnapshotQueryKey(connected: boolean) {
  return ['fleet-snapshot', getTenantSlug() || 'default', connected ? 'live' : 'db'] as const;
}

const emptyCounts = {
  total: 0,
  moving: 0,
  idle: 0,
  stopped: 0,
  offline: 0,
  withPosition: 0,
  byHwName: {} as Record<string, number>,
};

function mergeLiveFuel(units: FleetUnit[], liveById?: Map<number, WialonFuelFleetUnit>) {
  if (!liveById?.size) return units;
  return units.map((u) => {
    const wialonId = u.wialonId ?? (Number.isFinite(Number(u.id)) ? Number(u.id) : null);
    if (wialonId == null) return u;
    const live = liveById.get(wialonId);
    if (!live) return u;
    const liters = live.fuelLiters ?? live.fuel?.levelLiters;
    const formatted = live.fuelLive || live.fuel?.levelFormatted;
    return {
      ...u,
      fuelLiters: liters ?? u.fuelLiters,
      fuelFormatted: formatted || u.fuelFormatted,
      fuelLevel: live.fuelPercent ?? u.fuelLevel,
    };
  });
}

/** Single fleet data source for all dashboards — one poll, shared cache. */
export function useFleetSnapshot() {
  const { connected } = useWialonContext();
  const query = useQuery({
    queryKey: fleetSnapshotQueryKey(connected),
    queryFn: () => clientApi.getFleetSnapshot() as Promise<FleetSnapshot>,
    refetchInterval: pollWhenVisible(LIVE_POLL.fleet),
    staleTime: Math.floor(LIVE_POLL.fleet / 2),
    placeholderData: (prev) => prev,
    gcTime: 10 * 60_000,
  });

  const { data: liveFuel } = useWialonFleetFuelLive(connected);

  const snapshot = query.data;
  const units = useMemo(() => {
    const base = snapshotToUnits(snapshot);
    return mergeLiveFuel(base, liveFuel?.byUnitId);
  }, [snapshot, liveFuel?.byUnitId]);

  const statuses = useMemo(() => snapshotToStatuses(snapshot, units), [snapshot, units]);
  const counts = snapshot?.counts ?? emptyCounts;

  useEffect(() => {
    if (units.length) preloadFleetUnitIcons(units);
  }, [units]);

  const byStatus = useMemo(
    () => ({
      moving: counts.moving,
      idle: counts.idle,
      stopped: counts.stopped,
      offline: counts.offline,
    }),
    [counts.moving, counts.idle, counts.stopped, counts.offline]
  );

  return {
    ...query,
    snapshot,
    units,
    statuses,
    counts: { ...counts, byStatus, total: counts.total },
    live: Boolean(snapshot?.live),
    fetchedAt: snapshot?.fetchedAt,
    isLoading: query.isLoading && !snapshot,
  };
}

export type { FleetUnit, FleetSnapshot };
