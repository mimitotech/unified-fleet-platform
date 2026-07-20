import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useAlerts, type ClientAlert } from '@/hooks/useAlerts';
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
  driverName?: string;
  videoUrl?: string;
  source?: string;
  type?: string;
};

function normalizeName(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function resolveUnitName(
  blob: string,
  units: FleetUnit[],
  explicit?: string | null,
): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  const hay = blob.toLowerCase();
  if (!hay || !units.length) return undefined;
  // Prefer longest name match so "GEN 1" does not steal "GEN 10".
  const ranked = [...units].sort((a, b) => b.name.length - a.name.length);
  for (const u of ranked) {
    const name = normalizeName(u.name);
    const plate = normalizeName(u.plate);
    if (name && hay.includes(name)) return u.name;
    if (plate && plate.length >= 3 && hay.includes(plate)) return u.name;
  }
  return undefined;
}

function alertTimestamp(a: ClientAlert): string | undefined {
  const raw = (a as ClientAlert & { occurredAt?: string }).occurredAt || a.timestamp;
  return raw || undefined;
}

export function useMonitoringEvents(limit = 80, enabled = true, units: FleetUnit[] = []) {
  const alertsQ = useAlerts(limit, enabled);
  const ecoQ = useQuery({
    queryKey: ['ecoViolations'],
    queryFn: () => clientApi.getEcoViolations(),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.alerts) : false,
    staleTime: 30_000,
  });
  const videoQ = useQuery({
    queryKey: ['surveillanceViolations'],
    queryFn: () => clientApi.getSurveillanceViolations(),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.video) : false,
    staleTime: 30_000,
  });

  const unitNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      const n = normalizeName(u.name);
      if (n) set.add(n);
    }
    return set;
  }, [units]);

  const events = useMemo<MonitoringEventRow[]>(() => {
    const rows: MonitoringEventRow[] = [];

    for (const a of safeArray<ClientAlert>(alertsQ.data)) {
      const title = a.title || a.type || 'Alert';
      const unitName = resolveUnitName(`${title} ${a.description || ''}`, units);
      rows.push({
        id: String(a.id || `alert-${rows.length}`),
        title,
        severity: a.severity,
        category: 'alert',
        occurredAt: alertTimestamp(a),
        unitName,
        type: a.type,
        source: 'alerts',
      });
    }

    for (const v of safeArray<{
      id?: string;
      violationType?: string;
      type?: string;
      severity?: string;
      occurredAt?: string;
      unitName?: string;
      driverName?: string;
    }>(ecoQ.data)) {
      const title = v.violationType || v.type || 'Eco violation';
      rows.push({
        id: String(v.id || `eco-${rows.length}`),
        title,
        severity: v.severity,
        category: 'eco',
        occurredAt: v.occurredAt,
        unitName: resolveUnitName(`${title} ${v.unitName || ''}`, units, v.unitName),
        driverName: v.driverName,
        source: 'eco',
      });
    }

    for (const v of safeArray<Record<string, unknown>>(videoQ.data)) {
      const title = String(v.title || v.violationType || v.type || 'Video event');
      const explicit = typeof v.unitName === 'string' ? v.unitName : undefined;
      rows.push({
        id: String(v.id || `video-${rows.length}`),
        title,
        severity: String(v.severity || ''),
        category: 'video',
        occurredAt: v.occurredAt as string | undefined,
        unitName: resolveUnitName(`${title} ${explicit || ''}`, units, explicit),
        driverName: v.driverName as string | undefined,
        videoUrl: v.videoUrl as string | undefined,
        source: String(v.source || 'video'),
      });
    }

    const scoped =
      unitNameSet.size === 0
        ? rows
        : rows.filter((r) => {
            // Keep rows that match a fleet unit, or alerts without a parseable unit
            // (system notices) so the Events tab stays useful.
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
  }, [alertsQ.data, ecoQ.data, videoQ.data, limit, units, unitNameSet]);

  return {
    events,
    isLoading: alertsQ.isLoading || ecoQ.isLoading || videoQ.isLoading,
    isError: alertsQ.isError || ecoQ.isError || videoQ.isError,
    refetch: () => {
      void alertsQ.refetch();
      void ecoQ.refetch();
      void videoQ.refetch();
    },
  };
}
