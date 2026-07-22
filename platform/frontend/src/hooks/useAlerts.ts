import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';
import { notify } from '@/lib/notify';

export type ClientAlert = {
  id: string;
  title: string;
  description?: string;
  severity: string;
  sourceType: string;
  timestamp: string;
  acknowledged?: boolean;
  type?: string;
  assetId?: string;
};

function normalizeAlert(raw: Record<string, unknown>): ClientAlert {
  return {
    id: String(raw.id),
    title: String(raw.title || ''),
    description: raw.description != null ? String(raw.description) : undefined,
    severity: String(raw.severity || 'warning'),
    sourceType: String(raw.sourceType || raw.source_type || ''),
    timestamp:
      typeof raw.timestamp === 'string'
        ? raw.timestamp
        : raw.timestamp instanceof Date
          ? raw.timestamp.toISOString()
          : String(raw.occurred_at || raw.timestamp || new Date().toISOString()),
    acknowledged: Boolean(raw.acknowledged),
    type: raw.type != null ? String(raw.type) : undefined,
    assetId: raw.assetId != null ? String(raw.assetId) : raw.asset_id != null ? String(raw.asset_id) : undefined,
  };
}

/** Mark matching alerts as acknowledged in every cached alerts query (bell + page). */
function markAcknowledgedInCache(qc: QueryClient, ids: string[] | 'all') {
  const idSet = ids === 'all' ? null : new Set(ids);
  qc.setQueriesData({ queryKey: ['alerts'] }, (old: unknown) => {
    const list = safeArray(old) as Array<Record<string, unknown>>;
    if (!list.length) return old;
    return list.map((a) => {
      const id = String(a.id);
      if (idSet && !idSet.has(id)) return a;
      return { ...a, acknowledged: true };
    });
  });
}

export function useAlerts(
  limit = 50,
  enabled = true,
  opts?: { from?: string; to?: string },
) {
  const seenIds = useRef<Set<string> | null>(null);
  const primed = useRef(false);
  const from = opts?.from;
  const to = opts?.to;
  // Period dashboards need the full window — don't silently truncate to a small slice.
  const fetchLimit = from || to ? Math.max(limit, 2000) : Math.max(limit, 300);
  const keepLimit = from || to ? Math.max(limit, 2000) : limit;

  const query = useQuery({
    queryKey: ['alerts', getTenantSlug() || 'default', from || 'all', to || 'all', keepLimit],
    queryFn: async () => {
      const raw = await clientApi.getAlerts(fetchLimit, { from, to });
      return safeArray(raw).map((a) => normalizeAlert(a as Record<string, unknown>));
    },
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.alerts) : false,
    staleTime: 3_000,
    select: (data) => data.slice(0, keepLimit),
  });

  useEffect(() => {
    const list = query.data;
    if (!list) return;

    if (!primed.current) {
      seenIds.current = new Set(list.map((a) => a.id));
      primed.current = true;
      return;
    }

    const seen = seenIds.current ?? new Set<string>();
    const fresh = list.filter((a) => !a.acknowledged && !seen.has(a.id));
    for (const a of list) seen.add(a.id);
    seenIds.current = seen;

    for (const alert of fresh.slice(0, 5)) {
      const isCritical = alert.severity === 'critical' || alert.severity === 'emergency';
      if (isCritical) {
        notify.error(alert.title, alert.description || 'New fleet alert');
      } else {
        notify.info(alert.title, alert.description || 'New fleet alert');
      }
    }
  }, [query.data]);

  return query;
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientApi.acknowledgeAlert(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['alerts'] });
      const snapshots = qc.getQueriesData({ queryKey: ['alerts'] });
      markAcknowledgedInCache(qc, [id]);
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      for (const [key, data] of ctx?.snapshots || []) {
        qc.setQueryData(key, data);
      }
      notify.error('Could not acknowledge alert');
    },
    onSuccess: () => {
      notify.success('Alert acknowledged');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useBulkAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => clientApi.acknowledgeAlertsBulk(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['alerts'] });
      const snapshots = qc.getQueriesData({ queryKey: ['alerts'] });
      markAcknowledgedInCache(qc, ids?.length ? ids : 'all');
      return { snapshots };
    },
    onError: (_err, _ids, ctx) => {
      for (const [key, data] of ctx?.snapshots || []) {
        qc.setQueryData(key, data);
      }
      notify.error('Could not acknowledge alerts');
    },
    onSuccess: (res) => {
      const n = (res as { acknowledged?: number })?.acknowledged ?? 0;
      notify.success('Alerts acknowledged', `${n} alert${n === 1 ? '' : 's'} marked as read`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
