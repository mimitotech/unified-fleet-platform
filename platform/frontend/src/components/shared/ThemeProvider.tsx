import { useLayoutEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';
import {
  applyTenantBranding,
  loadBrandingCache,
  resetToPlatformBranding,
} from '@/lib/tenantBrandingCache';
import { applyFaviconFromTenant } from '@/lib/favicon';
import { getTenantSlug, getToken } from '@/lib/api';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const slug = getTenantSlug();
  const token = getToken();
  const { data: tenant, isSuccess } = useTenant();
  const canApplyClientTheme = Boolean(token && slug);

  useLayoutEffect(() => {
    if (!canApplyClientTheme) {
      resetToPlatformBranding();
      return;
    }
    if (isSuccess && tenant) {
      applyTenantBranding(tenant);
      return;
    }
    const cached = loadBrandingCache(slug);
    if (cached) applyTenantBranding(cached);
  }, [tenant, isSuccess, slug, canApplyClientTheme]);

  useLayoutEffect(() => {
    if (!canApplyClientTheme) return;
    const name = tenant?.name || (slug ? loadBrandingCache(slug)?.name : undefined);
    if (name) document.title = `${name} — Fleet Management`;
    applyFaviconFromTenant(tenant?.faviconUrl || loadBrandingCache(slug || undefined)?.faviconUrl);
  }, [tenant?.name, tenant?.faviconUrl, slug, canApplyClientTheme]);

  return <>{children}</>;
}
