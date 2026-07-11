import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { pollWhenVisible } from '@/lib/liveRefresh';
import { useMonitoringEvents } from '@/hooks/useMonitoringEvents';
import { getLiveReport } from '@/lib/reportCatalog';
import { reportPresetRange, type ReportDatePreset } from '@/lib/reportUtils';

export type LiveReportTableData = {
  rows: Record<string, unknown>[];
  fetchedAt?: string;
  count?: number;
};

function filterByUnit(rows: Record<string, unknown>[], unitId: number | null | undefined) {
  if (unitId == null) return rows;
  return rows.filter((r) => Number(r.unitId) === unitId);
}

export function useLiveReportData(
  reportId: string | null,
  opts: {
    unitId?: number | null;
    datePreset?: ReportDatePreset;
    enabled?: boolean;
  }
) {
  const def = reportId ? getLiveReport(reportId) : undefined;
  const enabled = Boolean(opts.enabled !== false && def && reportId);
  const range = reportPresetRange(opts.datePreset ?? 'last7');
  const unitId = opts.unitId ?? null;

  const fleetStatusQ = useQuery({
    queryKey: ['live-report', 'fleet-status'],
    queryFn: () => clientApi.getLiveReportFleetStatus(),
    enabled: enabled && (reportId === 'fleet-status' || reportId === 'fleet-positions' || reportId === 'unit-detail'),
    refetchInterval: pollWhenVisible(def?.pollMs ?? 10_000),
    staleTime: 5_000,
  });

  const fleetFuelQ = useQuery({
    queryKey: ['live-report', 'fleet-fuel'],
    queryFn: () => clientApi.getLiveReportFleetFuel(),
    enabled: enabled && reportId === 'fleet-fuel',
    refetchInterval: pollWhenVisible(def?.pollMs ?? 10_000),
    staleTime: 5_000,
  });

  const tripsQ = useQuery({
    queryKey: ['live-report', 'trips', range.from, range.to, unitId],
    queryFn: () =>
      clientApi.getLiveReportTrips(range.from * 1000, range.to * 1000, unitId ?? undefined),
    enabled: enabled && reportId === 'trip-history',
    refetchInterval: pollWhenVisible(def?.pollMs ?? 15_000),
    staleTime: 10_000,
  });

  const sensorsQ = useQuery({
    queryKey: ['live-report', 'unit-sensors', unitId],
    queryFn: () => clientApi.getLiveReportUnitSensors(unitId!),
    enabled: enabled && reportId === 'unit-sensors' && unitId != null,
    refetchInterval: pollWhenVisible(def?.pollMs ?? 10_000),
    staleTime: 5_000,
  });

  const eventsQ = useMonitoringEvents(100, enabled && reportId === 'events');

  const data = useMemo((): LiveReportTableData => {
    if (!reportId || !def) return { rows: [] };

    if (reportId === 'fleet-status') {
      const rows = filterByUnit(fleetStatusQ.data?.rows ?? [], unitId);
      return { rows, fetchedAt: fleetStatusQ.data?.fetchedAt, count: rows.length };
    }
    if (reportId === 'fleet-positions') {
      const rows = filterByUnit(fleetStatusQ.data?.rows ?? [], unitId);
      return { rows, fetchedAt: fleetStatusQ.data?.fetchedAt, count: rows.length };
    }
    if (reportId === 'unit-detail') {
      const rows = filterByUnit(fleetStatusQ.data?.rows ?? [], unitId);
      return { rows, fetchedAt: fleetStatusQ.data?.fetchedAt, count: rows.length };
    }
    if (reportId === 'fleet-fuel') {
      const rows = filterByUnit(fleetFuelQ.data?.rows ?? [], unitId);
      return { rows, fetchedAt: fleetFuelQ.data?.fetchedAt, count: rows.length };
    }
    if (reportId === 'trip-history') {
      return {
        rows: tripsQ.data?.rows ?? [],
        fetchedAt: tripsQ.data?.fetchedAt,
        count: tripsQ.data?.count,
      };
    }
    if (reportId === 'unit-sensors') {
      return {
        rows: sensorsQ.data?.rows ?? [],
        fetchedAt: sensorsQ.data?.fetchedAt,
        count: sensorsQ.data?.count,
      };
    }
    if (reportId === 'events') {
      const rows = eventsQ.events.map((e) => ({
        occurredAt: e.occurredAt,
        category: e.category,
        title: e.title,
        unitName: e.unitName ?? '',
        driverName: e.driverName ?? '',
        severity: e.severity ?? '',
      }));
      return { rows, fetchedAt: new Date().toISOString(), count: rows.length };
    }
    return { rows: [] };
  }, [reportId, def, unitId, fleetStatusQ.data, fleetFuelQ.data, tripsQ.data, sensorsQ.data, eventsQ.events]);

  const isLoading =
    (reportId === 'fleet-status' || reportId === 'fleet-positions' || reportId === 'unit-detail') &&
    fleetStatusQ.isLoading &&
    !fleetStatusQ.data
      ? true
      : reportId === 'fleet-fuel' && fleetFuelQ.isLoading && !fleetFuelQ.data
        ? true
        : reportId === 'trip-history' && tripsQ.isLoading && !tripsQ.data
          ? true
          : reportId === 'unit-sensors' && sensorsQ.isLoading && !sensorsQ.data
            ? true
            : reportId === 'events' && eventsQ.isLoading && !eventsQ.events.length;

  const isFetching =
    fleetStatusQ.isFetching ||
    fleetFuelQ.isFetching ||
    tripsQ.isFetching ||
    sensorsQ.isFetching ||
    eventsQ.isLoading;

  const isError =
    fleetStatusQ.isError || fleetFuelQ.isError || tripsQ.isError || sensorsQ.isError || eventsQ.isError;

  const refetch = () => {
    void fleetStatusQ.refetch();
    void fleetFuelQ.refetch();
    void tripsQ.refetch();
    void sensorsQ.refetch();
    void eventsQ.refetch();
  };

  return { data, def, isLoading, isFetching, isError, refetch };
}
