import type { FuelAnalyticsResult } from '@/lib/fuelTypes';
import { getTenantSlug } from '@/lib/api';
import type { FuelReportParams } from '@/hooks/useFuelAnalytics';

const SNAPSHOT_VERSION = 'v3';

export function fuelAnalyticsQueryKey(params: Pick<FuelReportParams, 'unitId' | 'period' | 'month' | 'from' | 'to'>) {
  return [
    'wialon-fuel-analytics',
    SNAPSHOT_VERSION,
    params.unitId,
    params.period,
    params.month,
    params.from,
    params.to,
  ] as const;
}

function snapshotStorageKey(params: FuelReportParams) {
  const slug = getTenantSlug() || 'default';
  return `mams_fuel_analytics_${SNAPSHOT_VERSION}_${slug}_${params.unitId ?? 'fleet'}_${params.period}_${params.month}_${params.from}_${params.to}`;
}

function isUsableSnapshot(data: FuelAnalyticsResult | undefined): data is FuelAnalyticsResult {
  if (!data?.kpis || !data.timeSeries) return false;
  if (data.source === 'none' && data.transactionCount === 0) return false;
  return true;
}

export function readFuelAnalyticsSnapshot(params: FuelReportParams): FuelAnalyticsResult | undefined {
  try {
    const raw = sessionStorage.getItem(snapshotStorageKey(params));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as FuelAnalyticsResult;
    return isUsableSnapshot(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeFuelAnalyticsSnapshot(params: FuelReportParams, data: FuelAnalyticsResult) {
  if (!isUsableSnapshot(data)) return;
  try {
    sessionStorage.setItem(snapshotStorageKey(params), JSON.stringify(data));
  } catch {
    /* quota */
  }
}
