import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { safeArray } from '@/lib/safeArray';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import type { FleetUnit } from '@/lib/fleetUnits';

export type MonitoringEventRow = {
  id: string;
  title: string;
  severity?: string;
  category: 'alert' | 'eco' | 'video';
  occurredAt?: string;
  unitName?: string;
  unitId?: string;
  driverName?: string;
  videoUrl?: string;
  source?: string;
  type?: string;
};

function normalizeName(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function resolveUnitFromAssetId(
  assetId: string | undefined | null,
  units: FleetUnit[],
): FleetUnit | undefined {
  if (!assetId) return undefined;
  const id = String(assetId).trim();
  if (!id) return undefined;
  return units.find(
    (u) =>
      String(u.id) === id ||
      String(u.wialonId ?? '') === id ||
      String((u as { assetId?: string }).assetId ?? '') === id,
  );
}

export function useMonitoringEvents(limit = 80, enabled = true, units: FleetUnit[] = []) {
  const autoSyncedRef = useRef(false);

  const eventsQ = useQuery({
    queryKey: ['monitoringEvents', limit],
    queryFn: () => clientApi.getMonitoringEvents(limit, 30),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.alerts) : false,
    staleTime: 30_000,
  });

  const syncViolations = useMutation({
    mutationFn: () => clientApi.syncMonitoringViolations(),
    onSuccess: () => {
      void eventsQ.refetch();
    },
  });

  useEffect(() => {
    if (autoSyncedRef.current || !enabled || eventsQ.isLoading) return;
    if (safeArray(eventsQ.data).length === 0 && !syncViolations.isPending) {
      autoSyncedRef.current = true;
      syncViolations.mutate();
    }
  }, [enabled, eventsQ.data, eventsQ.isLoading, syncViolations]);

  const unitNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      const n = normalizeName(u.name);
      if (n) set.add(n);
      const w = normalizeName(String(u.wialonId ?? ''));
      if (w) set.add(w);
    }
    return set;
  }, [units]);

  const unitIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      if (u.wialonId != null) set.add(String(u.wialonId));
      set.add(String(u.id));
    }
    return set;
  }, [units]);

  const events = useMemo<MonitoringEventRow[]>(() => {
    const rows = safeArray(eventsQ.data).map((raw) => {
      const r = raw as {
        id: string;
        title: string;
        severity?: string;
        category?: string;
        occurredAt?: string;
        unitName?: string;
        unitId?: string;
        assetId?: string;
        driverName?: string;
        videoUrl?: string;
        source?: string;
        type?: string;
        violationType?: string;
      };
      const matched = resolveUnitFromAssetId(r.assetId || r.unitId, units);
      const category =
        r.category === 'video' || r.videoUrl
          ? 'video'
          : r.category === 'eco' || r.source === 'eco'
            ? 'eco'
            : 'alert';
      return {
        id: String(r.id),
        title: r.title || r.violationType || r.type || 'Event',
        severity: r.severity,
        category,
        occurredAt: r.occurredAt,
        unitName: matched?.name || r.unitName,
        unitId: r.unitId || (matched ? String(matched.wialonId ?? matched.id) : undefined),
        driverName: r.driverName,
        videoUrl: r.videoUrl,
        source: r.source,
        type: r.violationType || r.type,
      } satisfies MonitoringEventRow;
    });

    const scoped =
      unitNameSet.size === 0 && unitIdSet.size === 0
        ? rows
        : rows.filter((r) => {
            if (r.unitId && unitIdSet.has(String(r.unitId))) return true;
            if (!r.unitName) return r.category === 'alert';
            return unitNameSet.has(normalizeName(r.unitName));
          });

    return scoped
      .sort((a, b) => {
        const at = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
        const bt = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
        return bt - at;
      })
      .slice(0, limit);
  }, [eventsQ.data, limit, units, unitNameSet, unitIdSet]);

  return {
    events,
    isLoading: eventsQ.isLoading || syncViolations.isPending,
    isError: eventsQ.isError,
    isSyncing: syncViolations.isPending,
    refetch: () => {
      void eventsQ.refetch();
    },
    syncViolations: () => syncViolations.mutate(),
  };
}
