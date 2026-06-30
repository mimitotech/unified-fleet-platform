import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { ThemeProvider } from '@/components/shared/ThemeProvider';

export function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}

export function AdminShell() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (user?.role !== 'platform_admin') return <Navigate to="/app/dashboard" replace />;
  return <Outlet />;
}
