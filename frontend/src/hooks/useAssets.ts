import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { useWialonContext } from './useWialon';
import { useFleetSnapshot } from './useFleetSnapshot';

export interface AssetStatusEntry {
  assetId: string;
  asset?: { id: string; name: string; registrationPlate?: string };
  status?: {
    status: string;
    fuelLevel?: number;
    fuelFormatted?: string;
    fuelLiters?: number;
    location?: { speed?: number; latitude?: number; longitude?: number; course?: number; timestamp?: string | Date };
  };
  wialon?: {
    hwName?: string;
    hw?: number;
    motionState?: string;
    netconn?: boolean;
    wialonId?: number;
    iconUrl?: string;
    iconUgi?: number;
    course?: number;
    flds?: Array<{ id: number; name: string; value: string }>;
    sens?: Array<{ id: number; name: string; type: string }>;
    trip?: {
      state?: 0 | 1 | 2;
      currSpeed?: number;
      course?: number;
      ignitionOn?: boolean;
    };
    engineHours?: number;
    mileage?: number;
    fuelFormatted?: string;
    fuelLiters?: number;
  };
}

/** @deprecated Prefer useFleetSnapshot — shares single fleet cache */
export function useAssets() {
  const snap = useFleetSnapshot();
  const assets = useMemo(
    () =>
      (snap.units ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        registrationPlate: u.plate,
        hwName: u.hwName,
        hw: u.hw,
        sources: [{ type: 'wialon', id: u.id }],
      })),
    [snap.units]
  );
  return { ...snap, data: assets };
}

/** @deprecated Prefer useFleetSnapshot — shares single fleet cache */
export function useAssetStatuses() {
  const snap = useFleetSnapshot();
  return {
    ...snap,
    data: snap.statuses,
    dataUpdatedAt: snap.dataUpdatedAt,
  };
}

export function useDashboardKpis() {
  const { connected } = useWialonContext();
  const fleet = useFleetSnapshot();

  const kpiQuery = useQuery({
    queryKey: ['dashboardKpis', getTenantSlug() || 'default'],
    queryFn: () => clientApi.getKpis(),
    refetchInterval: pollWhenVisible(LIVE_POLL.kpis),
    staleTime: 15_000,
  });

  const data = useMemo(() => {
    const k = (kpiQuery.data || {}) as Record<string, unknown>;
    if (fleet.live && fleet.snapshot) {
      const c = fleet.counts;
      return {
        ...k,
        totalVehicles: c.total,
        moving: c.moving,
        idle: c.idle,
        stopped: c.stopped,
        offline: c.offline,
        activeVehicles: c.moving + c.idle + c.stopped,
        liveFromWialon: true,
        wialonFetchedAt: fleet.fetchedAt,
      };
    }
    return k;
  }, [kpiQuery.data, fleet.live, fleet.snapshot, fleet.counts, fleet.fetchedAt]);

  return {
    ...kpiQuery,
    data,
    isLoading: kpiQuery.isLoading && !kpiQuery.data && fleet.isLoading,
  };
}
