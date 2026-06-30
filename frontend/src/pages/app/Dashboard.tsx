import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { UnifiedMap } from '@/components/app/UnifiedMap';
import { useDashboardKpis, useAssetStatuses } from '@/hooks/useAssets';
import { useAlerts } from '@/hooks/useAlerts';
import {
  Activity, Truck, MapPin, AlertTriangle, Users, Route, Fuel, Wrench,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { data: kpis, isLoading } = useDashboardKpis();
  const { data: statuses } = useAssetStatuses();
  const { data: alerts } = useAlerts(5);

  if (isLoading) {
    return (
      <AppLayout title="Dashboard" subtitle="Fleet operations overview">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard" subtitle="Fleet operations overview">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Total Vehicles" value={kpis?.totalVehicles ?? 0} icon={Truck} variant="primary" />
          <MetricCard title="Active" value={kpis?.activeVehicles ?? 0} icon={Activity} variant="success" />
          <MetricCard title="Moving" value={kpis?.moving ?? 0} icon={MapPin} variant="info" />
          <MetricCard
            title="Critical Alerts"
            value={kpis?.criticalAlerts ?? 0}
            icon={AlertTriangle}
            variant="destructive"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Drivers Active" value={kpis?.activeDrivers ?? 0} icon={Users} variant="primary" />
          <MetricCard title="Routes In Progress" value={kpis?.activeRoutes ?? 0} icon={Route} variant="success" />
          <MetricCard title="Fuel (Month) L" value={kpis?.fuelConsumedMonth ?? 0} icon={Fuel} variant="info" />
          <MetricCard title="Pending Maintenance" value={kpis?.pendingMaintenance ?? 0} icon={Wrench} variant="default" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <UnifiedMap statuses={statuses as never[]} height="400px" />
          </div>
          <div className="fleet-card">
            <h3 className="font-semibold mb-4">Recent Alerts</h3>
            <div className="space-y-2">
              {(alerts as Array<{ title: string; severity: string }>)?.slice(0, 5).map((a, i) => (
                <div key={i} className="text-sm border-b border-border pb-2">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{a.severity}</span>
                </div>
              )) || <p className="text-muted-foreground text-sm">No alerts</p>}
            </div>
            <Link to="/app/alerts" className="block mt-4">
              <Button variant="outline" size="sm" className="w-full">View all alerts</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
