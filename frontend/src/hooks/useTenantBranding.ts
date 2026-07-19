import { useMemo } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { resolveTenantBranding, type ResolvedTenantBranding } from '@/lib/tenantBranding';

export function useTenantBranding(): ResolvedTenantBranding {
  const { data: tenant } = useTenant();
  return useMemo(() => resolveTenantBranding(tenant), [tenant]);
}
