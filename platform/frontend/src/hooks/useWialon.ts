import { useQuery } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';

export type WialonContext = Awaited<ReturnType<typeof clientApi.getWialonContext>>;

const tierLabel: Record<string, string> = {
  mother: 'Mother account',
  dealer: 'Dealer account',
  admin: 'Client admin',
  user: 'End user',
};

function tenantScope() {
  return getTenantSlug() || 'default';
}

export function useWialonContext() {
  const query = useQuery({
    queryKey: ['wialon-context', tenantScope()],
    queryFn: () => clientApi.getWialonContext(),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  const ctx = query.data;
  const connected = Boolean(ctx?.configured && ctx?.connected);
  const scopedAccountId = (ctx?.sessionMeta as { scopedAccountId?: number } | undefined)?.scopedAccountId;
  const tier = scopedAccountId
    ? 'admin'
    : ctx?.accountTier || (ctx?.sessionMeta?.accountTier as string | undefined);
  const tierName = tier ? tierLabel[tier] || tier : undefined;

  return {
    ...query,
    ctx,
    connected,
    configured: Boolean(ctx?.configured),
    tier,
    tierName,
    counts: ctx?.counts || (ctx?.sessionMeta?.counts as WialonContext['counts']),
  };
}

export function useWialonRoutes(enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-routes', tenantScope()],
    queryFn: () => clientApi.getWialonRoutes(),
    enabled,
    staleTime: 60_000,
  });
}

export function useWialonReportTemplates(enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-report-templates', tenantScope()],
    queryFn: () => clientApi.getWialonReportTemplates(),
    enabled,
    staleTime: LIVE_POLL.reports,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.reports) : false,
  });
}

export function useWialonNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-notifications', tenantScope()],
    queryFn: () => clientApi.getWialonNotifications(),
    enabled,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useWialonChildAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ['wialon-child-accounts', tenantScope()],
    queryFn: () => clientApi.getWialonChildAccounts(),
    enabled,
    staleTime: 60_000,
  });
}
