import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { EyeOff } from 'lucide-react';
import { AppLayout } from '@/components/app/AppLayout';
import { useModuleAccess } from '@/hooks/useModules';
import { PageLoader } from '@/components/shared/PageLoader';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface ClientModulePageProps {
  moduleKey: string;
  children: ReactNode;
}

function ModuleRestricted({ label }: { label: string }) {
  return (
    <AppLayout title={label} subtitle="Module enabled — data not visible">
      <div className="max-w-lg mx-auto mt-16 text-center fleet-card p-8">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <EyeOff className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">This module is not visible yet</h2>
        <p className="text-muted-foreground text-sm mb-6">
          {label} appears in your navigation because it is enabled for your organization, but your
          administrator has not made the data visible to users yet.
        </p>
        <Button asChild variant="outline">
          <Link to="/app/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </AppLayout>
  );
}

/** Guards client module routes: enabled modules always reachable; data gated by visibility & integration */
export function ClientModulePage({ moduleKey, children }: ClientModulePageProps) {
  const { mod, isLoading, isEnabled, canViewData } = useModuleAccess(moduleKey);

  if (isLoading) {
    return (
      <AppLayout title="Loading..." subtitle="">
        <PageLoader />
      </AppLayout>
    );
  }

  if (!isEnabled || !mod) {
    return <Navigate to="/app/dashboard" replace />;
  }

  if (!canViewData) {
    return <ModuleRestricted label={mod.label} />;
  }

  return <>{children}</>;
}
