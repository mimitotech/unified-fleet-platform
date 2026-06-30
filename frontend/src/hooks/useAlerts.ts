import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';

export function useAlerts(limit = 50) {
  return useQuery({
    queryKey: ['alerts', limit],
    queryFn: () => clientApi.getAlerts(limit),
    refetchInterval: 60000,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientApi.acknowledgeAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
