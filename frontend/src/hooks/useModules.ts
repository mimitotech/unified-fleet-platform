import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { DEFAULT_MODULES } from '@/lib/constants/modules';

export function useModules() {
  const q = useQuery({
    queryKey: ['modules'],
    queryFn: () => clientApi.getModules(),
    retry: 1,
  });
  return {
    ...q,
    modules: q.data?.length ? q.data : DEFAULT_MODULES,
  };
}
