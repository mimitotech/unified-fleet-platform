import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';
import { notify } from '@/lib/notify';

export function useAlerts(limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['alerts', getTenantSlug() || 'default'],
    queryFn: () => clientApi.getAlerts(100),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.alerts) : false,
    staleTime: 10_000,
    select: (data) => safeArray(data).slice(0, limit),
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientApi.acknowledgeAlert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      notify.success('Alert acknowledged');
    },
  });
}
