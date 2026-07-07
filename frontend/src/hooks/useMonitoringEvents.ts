import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useAlerts } from '@/hooks/useAlerts';
import { safeArray } from '@/lib/safeArray';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';

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

export function useMonitoringEvents(limit = 80) {
  const alertsQ = useAlerts(limit);
  const ecoQ = useQuery({
    queryKey: ['ecoViolations'],
    queryFn: () => clientApi.getEcoViolations(),
    refetchInterval: pollWhenVisible(LIVE_POLL.alerts),
    staleTime: 30_000,
  });
  const videoQ = useQuery({
    queryKey: ['surveillanceViolations'],
    queryFn: () => clientApi.getSurveillanceViolations(),
    refetchInterval: pollWhenVisible(LIVE_POLL.video),
    staleTime: 30_000,
  });

  const events = useMemo<MonitoringEventRow[]>(() => {
    const rows: MonitoringEventRow[] = [];

    for (const a of safeArray<{ id?: string; title?: string; severity?: string; occurredAt?: string; type?: string }>(
      alertsQ.data
    )) {
      rows.push({
        id: String(a.id || `alert-${rows.length}`),
        title: a.title || a.type || 'Alert',
        severity: a.severity,
        category: 'alert',
        occurredAt: a.occurredAt,
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
      rows.push({
        id: String(v.id || `eco-${rows.length}`),
        title: v.violationType || v.type || 'Eco violation',
        severity: v.severity,
        category: 'eco',
        occurredAt: v.occurredAt,
        unitName: v.unitName,
        driverName: v.driverName,
        source: 'eco',
      });
    }

    for (const v of safeArray<Record<string, unknown>>(videoQ.data)) {
      rows.push({
        id: String(v.id || `video-${rows.length}`),
        title: String(v.title || v.violationType || v.type || 'Video event'),
        severity: String(v.severity || ''),
        category: 'video',
        occurredAt: v.occurredAt as string | undefined,
        unitName: v.unitName as string | undefined,
        driverName: v.driverName as string | undefined,
        videoUrl: v.videoUrl as string | undefined,
        source: String(v.source || 'video'),
      });
    }

    return rows
      .sort((a, b) => {
        const at = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
        const bt = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
        return bt - at;
      })
      .slice(0, limit);
  }, [alertsQ.data, ecoQ.data, videoQ.data, limit]);

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
