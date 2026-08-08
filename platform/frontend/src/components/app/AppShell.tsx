import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { preloadFleetUnitIcons } from '@/lib/fleetIconCache';
import { clientApi, getTenantSlug, getToken, setAuth } from '@/lib/api';
import { snapshotToUnits } from '@/lib/fleetUnits';
import { ThemeProvider } from '@/components/shared/ThemeProvider';
import { FleetProvider } from '@/contexts/FleetContext';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { AppBootLoader } from '@/components/shared/AppBootLoader';
import { SidebarProvider } from '@/providers/SidebarContext';
import { canAccessAdminPanel, isSystemRole } from '@/lib/systemRoles';
import { needsTermsAcceptance } from '@/lib/authRedirect';
import {
  readTenantPreviewSlugFromLocation,
  syncTenantPreviewFromUrl,
} from '@/lib/adminTenantPreview';
import { resetFleetService } from '@/services/fleet';

/**
 * For platform staff, bind ?tenant= / ?as= into auth storage and drop cached
 * client queries so View Client always shows that client's dashboard/data.
 */
function useAdminTenantPreviewScope(): string {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const urlSlug =
    searchParams.get('tenant')?.trim() ||
    searchParams.get('as')?.trim() ||
    readTenantPreviewSlugFromLocation(location.search);
  const [scopeSlug, setScopeSlug] = useState(() => getTenantSlug() || 'none');

  useLayoutEffect(() => {
    if (!isSystemRole(user?.role)) {
      setScopeSlug(getTenantSlug() || 'none');
      return;
    }
    if (!urlSlug) {
      setScopeSlug(getTenantSlug() || 'none');
      return;
    }

    const token = getToken();
    const prev = getTenantSlug();
    syncTenantPreviewFromUrl(location.search);
    if (token) setAuth(token, urlSlug);

    if (prev !== urlSlug) {
      qc.clear();
      resetFleetService();
    }
    setScopeSlug(urlSlug);
  }, [urlSlug, user?.role, location.search, qc]);

  return scopeSlug;
}

export function AppShell() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const tenantScope = useAdminTenantPreviewScope();

  useEffect(() => {
    if (isAuthenticated) {
      void import('@/components/app/UnifiedMap');
      void clientApi.getFleetSnapshot().then((snap) => {
        const units = snapshotToUnits(snap);
        if (units.length) preloadFleetUnitIcons(units);
      }).catch(() => undefined);
    }
  }, [isAuthenticated, tenantScope]);

  if (isLoading) return <AppBootLoader />;
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (needsTermsAcceptance(user)) {
    return <Navigate to={`/auth/terms?next=${encodeURIComponent('/app/dashboard')}`} replace />;
  }
  return (
    <ErrorBoundary fallbackTitle="Application error">
      <SidebarProvider>
        <ThemeProvider>
          <FleetProvider key={tenantScope}>
            <Outlet key={tenantScope} />
          </FleetProvider>
        </ThemeProvider>
      </SidebarProvider>
    </ErrorBoundary>
  );
}

export function AdminShell() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <AppBootLoader label="Loading admin panel..." />;
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (needsTermsAcceptance(user)) {
    return <Navigate to={`/auth/terms?next=${encodeURIComponent('/admin/dashboard')}`} replace />;
  }
  if (!canAccessAdminPanel(user?.role)) return <Navigate to="/app/dashboard" replace />;
  return (
    <ErrorBoundary fallbackTitle="Admin panel error">
      <Outlet />
    </ErrorBoundary>
  );
}
