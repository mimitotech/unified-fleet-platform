import { useQuery } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { applyTenantBranding, loadBrandingCache, saveBrandingCache } from '@/lib/tenantBrandingCache';

export function useTenant() {
  const slug = getTenantSlug();

  return useQuery({
    queryKey: ['tenant', slug || 'none'],
    queryFn: async () => {
      const tenant = await clientApi.getTenant();
      saveBrandingCache(tenant);
      applyTenantBranding(tenant);
      return tenant;
    },
    enabled: Boolean(slug),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchInterval: 60_000,
    placeholderData: () => (slug ? loadBrandingCache(slug) ?? undefined : undefined),
  });
}
