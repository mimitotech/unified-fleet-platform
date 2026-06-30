import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';

export function useTenant() {
  return useQuery({
    queryKey: ['tenant'],
    queryFn: () => clientApi.getTenant(),
    retry: 1,
  });
}
