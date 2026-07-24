import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import type { FuelPeriod } from '@/lib/fuelTypes';
import { useWialonContext } from '@/hooks/useWialon';
import {
  resolveDashboardFuelPrice,
  saveFuelPrice,
} from '@/lib/dashboardWidgetPrefs';
import {
  fuelAnalyticsQueryKey,
  readFuelAnalyticsSnapshot,
  writeFuelAnalyticsSnapshot,
} from '@/lib/fuelAnalyticsSnapshot';
export { fuelAnalyticsQueryKey } from '@/lib/fuelAnalyticsSnapshot';

export function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function monthBounds(yyyyMm: string): { from: string; to: string } {
  const [y, m] = yyyyMm.split('-').map(Number);
  const from = `${yyyyMm}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${yyyyMm}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export function resolveReportDateRange(opts: {
  period: FuelPeriod;
  month: string;
  from?: string;
  to?: string;
}): { from: string; to: string } {
  if (opts.period === 'month') {
    return monthBounds(opts.month || currentMonthKey());
  }
  if (opts.period === 'custom' && opts.from && opts.to) {
    return { from: opts.from, to: opts.to };
  }
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (opts.period === 'year') {
    return { from: `${today.getUTCFullYear()}-01-01`, to };
  }
  if (opts.period === 'week') {
    const from = new Date(today.getTime() - 84 * 86400000);
    return { from: from.toISOString().slice(0, 10), to };
  }
  const from = new Date(today.getTime() - 29 * 86400000);
  return { from: from.toISOString().slice(0, 10), to };
}

export function monthOptions(count = 24): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const value = x.toISOString().slice(0, 7);
    const label = x.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    out.push({ value, label });
  }
  return out;
}

export function useFuelPrice() {
  return {
    get: (): number => resolveDashboardFuelPrice(),
    set: (price: number) => {
      saveFuelPrice(price);
    },
    storageKey: `mams_fuel_price_${getTenantSlug() || 'default'}`,
  };
}

export type FuelReportParams = {
  unitId: number | null;
  unitName?: string | null;
  period: FuelPeriod;
  month: string;
  from?: string;
  to?: string;
};

function fetchAnalytics(params: FuelReportParams) {
  return clientApi.getWialonFuelAnalytics({
    unitId: params.unitId,
    unitName: params.unitName ?? undefined,
    period: params.period,
    month: params.period === 'month' ? params.month : undefined,
    from: params.period === 'custom' ? params.from : undefined,
    to: params.period === 'custom' ? params.to : undefined,
  });
}

/** Auto-loads Wialon fuel analytics when the analytics tab is open. */
export function useFuelAnalytics(params: FuelReportParams, enabled = true) {
  const { connected } = useWialonContext();
  const queryKey = fuelAnalyticsQueryKey(params);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const data = await fetchAnalytics(params);
      writeFuelAnalyticsSnapshot(params, data);
      return data;
    },
    enabled: enabled && connected,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 1,
    placeholderData: (prev) => prev ?? readFuelAnalyticsSnapshot(params),
  });
}

export function useRefreshFuelAnalytics(qc: ReturnType<typeof useQueryClient>) {
  return async (params: FuelReportParams) => {
    const data = await clientApi.getWialonFuelAnalytics({
      unitId: params.unitId,
      unitName: params.unitName ?? undefined,
      period: params.period,
      month: params.period === 'month' ? params.month : undefined,
      from: params.period === 'custom' ? params.from : undefined,
      to: params.period === 'custom' ? params.to : undefined,
      refresh: true,
    });
    writeFuelAnalyticsSnapshot(params, data);
    qc.setQueryData(fuelAnalyticsQueryKey(params), data);
    return data;
  };
}
