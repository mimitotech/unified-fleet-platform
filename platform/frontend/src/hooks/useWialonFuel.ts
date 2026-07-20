import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi, type WialonFuelFleetUnit, type WialonFuelAssetsResponse } from '@/lib/api';
import type { WialonFuelReportData } from '@/lib/fuelTypes';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { useWialonContext } from '@/hooks/useWialon';

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function useWialonFleetFuelLive(enabled = true) {
  const { connected } = useWialonContext();
  return useQuery({
    queryKey: ['wialon-fuel-live'],
    queryFn: () => clientApi.getWialonFuelLive(),
    enabled: enabled && connected,
    staleTime: LIVE_POLL.fuel,
    refetchInterval: pollWhenVisible(LIVE_POLL.fuel),
    select: (data) => ({
      byUnitId: new Map((data?.units ?? []).map((u) => [u.unitId, u])),
      units: data?.units ?? [],
      fetchedAt: data?.fetchedAt,
    }),
  });
}

/** Live fuel from Wialon fuel LEVEL sensors — cached, keeps previous data while refreshing. */
export function useWialonFuelAssets(enabled = true) {
  const { connected } = useWialonContext();
  return useQuery({
    queryKey: ['wialon-fuel-assets'],
    queryFn: () => clientApi.getWialonFuelAssets(),
    enabled: enabled && connected,
    staleTime: LIVE_POLL.fuel,
    gcTime: 5 * 60_000,
    refetchInterval: pollWhenVisible(LIVE_POLL.fuel),
    placeholderData: (prev) => prev,
  });
}

export function useWialonFuelTransactions(fromDate?: string, toDate?: string, enabled = true) {
  const { connected } = useWialonContext();
  const range = defaultRange();
  const from = fromDate || range.from;
  const to = toDate || range.to;
  return useQuery({
    queryKey: ['wialon-fuel-transactions', from, to],
    queryFn: () => clientApi.getWialonFuelTransactions(from, to, false),
    enabled: enabled && connected && Boolean(from && to),
    staleTime: 5 * 60_000,
    select: (data): WialonFuelReportData => ({
      transactions: data.transactions ?? [],
      kpis: {
        totalFilled: Number(data.kpis?.totalFilled ?? 0),
        totalConsumed: Number(data.kpis?.totalConsumed ?? 0),
        totalMileage: Number(data.kpis?.totalMileage ?? 0),
        avgConsumption: Number(data.kpis?.avgConsumption ?? 0),
        theftEvents: Number(data.kpis?.theftEvents ?? 0),
        vehiclesTracked: Number(data.kpis?.vehiclesTracked ?? 0),
        consumptionCount: Number(data.kpis?.consumptionCount ?? 0),
        fillingCount: Number(data.kpis?.fillingCount ?? 0),
        theftCount: Number(data.kpis?.theftCount ?? 0),
      },
      trend: data.trend ?? [],
      source: data.source,
      needsRefresh: data.needsRefresh ?? false,
      fetchedAt: data.fetchedAt,
    }),
  });
}

export function useRefreshWialonFuelTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      clientApi.getWialonFuelTransactions(from, to, true),
    onSuccess: (data, { from, to }) => {
      qc.setQueryData(['wialon-fuel-transactions', from, to], {
        transactions: data.transactions,
        kpis: data.kpis,
        trend: data.trend,
        source: data.source,
        needsRefresh: data.needsRefresh ?? false,
        fetchedAt: data.fetchedAt,
      });
    },
  });
}

export function useWialonFuelOverview(fromDate?: string, toDate?: string, enabled = true) {
  const { connected } = useWialonContext();
  const range = defaultRange();
  const from = fromDate || range.from;
  const to = toDate || range.to;
  return useQuery({
    queryKey: ['wialon-fuel-overview', from, to],
    queryFn: () => clientApi.getWialonFuelOverview(from, to),
    enabled: enabled && connected,
    staleTime: 5 * 60_000,
  });
}

export function useWialonFuelTrend(fromDate?: string, toDate?: string, enabled = true) {
  const tx = useWialonFuelTransactions(fromDate, toDate, enabled);
  return {
    data: tx.data?.trend ?? [],
    isLoading: tx.isLoading,
    fetchedAt: tx.data?.fetchedAt,
  };
}

export function useWialonUnitFuelProfile(unitId: number | null, enabled: boolean) {
  const { connected } = useWialonContext();
  return useQuery({
    queryKey: ['wialon-fuel-profile', unitId],
    queryFn: () => clientApi.getWialonUnitFuelProfile(unitId!),
    enabled: enabled && connected && unitId != null,
    staleTime: 60_000,
  });
}

export function useWialonUnitFuelSettings(unitId: number | null, enabled: boolean) {
  const { connected } = useWialonContext();
  return useQuery({
    queryKey: ['wialon-fuel-settings', unitId],
    queryFn: () => clientApi.getWialonUnitFuelSettings(unitId!),
    enabled: enabled && connected && unitId != null,
    staleTime: 60_000,
    select: (data) => data.settings,
  });
}

export function useUpdateWialonFuelDetection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, params }: { unitId: number; params: Record<string, unknown> }) =>
      clientApi.updateWialonFuelDetection(unitId, params),
    onSuccess: (_, { unitId }) => {
      void qc.invalidateQueries({ queryKey: ['wialon-fuel-profile', unitId] });
      void qc.invalidateQueries({ queryKey: ['wialon-fuel-assets'] });
    },
  });
}

export type { WialonFuelFleetUnit, WialonFuelAssetsResponse };
export type { WialonFuelAssetRow, WialonFuelTransaction } from '@/lib/fuelTypes';
