import { useLayoutEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { applyTenantBranding, loadBrandingCache } from '@/lib/tenantBrandingCache';
import { applyFaviconFromTenant } from '@/lib/favicon';
import { getTenantSlug } from '@/lib/api';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const slug = getTenantSlug();
  const { data: tenant, isSuccess } = useTenant();

  useLayoutEffect(() => {
    if (isSuccess && tenant) {
      applyTenantBranding(tenant);
      return;
    }
    if (slug) {
      const cached = loadBrandingCache(slug);
      if (cached) applyTenantBranding(cached);
    }
  }, [tenant, isSuccess, slug]);

  useLayoutEffect(() => {
    const name = tenant?.name || (slug ? loadBrandingCache(slug)?.name : undefined);
    if (name) document.title = `${name} — Fleet Management`;
    applyFaviconFromTenant(tenant?.faviconUrl || loadBrandingCache(slug || undefined)?.faviconUrl);
  }, [tenant?.name, tenant?.faviconUrl, slug]);

  return <>{children}</>;
}
