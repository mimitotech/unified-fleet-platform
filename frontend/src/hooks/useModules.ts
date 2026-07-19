import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { DEFAULT_MODULES, sortModules } from '@/lib/constants/modules';
import { safeArray } from '@/lib/safeArray';
import { useAuth } from '@/providers/AuthProvider';

function resolveModules(data: unknown, isError: boolean) {
  const list = safeArray(data);
  if (list.length > 0) return sortModules(list);
  if (isError) return sortModules(DEFAULT_MODULES);
  return sortModules(DEFAULT_MODULES);
}

export function useModules() {
  const q = useQuery({
    queryKey: ['modules'],
    queryFn: () => clientApi.getModules(),
    retry: 1,
    staleTime: 60_000,
  });

  const modules = resolveModules(q.data, q.isError);

  return { ...q, modules };
}

export function useModuleAccess(moduleKey: string) {
  const { modules, isLoading } = useModules();
  const { user } = useAuth();
  const mod = modules.find((m) => m.moduleKey === moduleKey);

  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin';
  const isEnabled = Boolean(mod?.isEnabled);
  const isVisible = mod?.isVisible !== false;
  const canViewData = isEnabled && (isVisible || isAdmin);
  const integrationReady = mod?.integrationReady !== false;

  return {
    mod,
    isLoading,
    isEnabled,
    isVisible,
    canViewData,
    integrationReady,
    isAdmin,
  };
}
