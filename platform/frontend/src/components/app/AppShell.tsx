import { Navigate, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { preloadFleetUnitIcons } from '@/lib/fleetIconCache';
import { clientApi } from '@/lib/api';
import { snapshotToUnits } from '@/lib/fleetUnits';
import { ThemeProvider } from '@/components/shared/ThemeProvider';
import { FleetProvider } from '@/contexts/FleetContext';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { AppBootLoader } from '@/components/shared/AppBootLoader';
import { SidebarProvider } from '@/providers/SidebarContext';
import { canAccessAdminPanel } from '@/lib/systemRoles';
import { needsTermsAcceptance } from '@/lib/authRedirect';

export function AppShell() {
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      void import('@/components/app/UnifiedMap');
      void clientApi.getFleetSnapshot().then((snap) => {
        const units = snapshotToUnits(snap);
        if (units.length) preloadFleetUnitIcons(units);
      }).catch(() => undefined);
    }
  }, [isAuthenticated]);

  if (isLoading) return <AppBootLoader />;
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (needsTermsAcceptance(user)) {
    return <Navigate to={`/auth/terms?next=${encodeURIComponent('/app/dashboard')}`} replace />;
  }
  return (
    <ErrorBoundary fallbackTitle="Application error">
      <SidebarProvider>
        <ThemeProvider>
          <FleetProvider>
            <Outlet />
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
