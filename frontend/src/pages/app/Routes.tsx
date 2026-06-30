import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useRoutes, useRouteStats } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Route, Clock, Play, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-info/15 text-info' },
  'in-progress': { label: 'In Progress', className: 'bg-success/15 text-success' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/15 text-destructive' },
};

export default function RoutesPage() {
  const { data: routes, isLoading } = useRoutes();
  const { data: stats } = useRouteStats();

  return (
    <AppLayout title="Routes" subtitle="Route planning and tracking">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard title="Total Routes" value={stats?.total ?? 0} icon={Route} variant="primary" />
          <MetricCard title="In Progress" value={stats?.inProgress ?? 0} icon={Play} variant="success" />
          <MetricCard title="Scheduled" value={stats?.scheduled ?? 0} icon={Clock} variant="info" />
          <MetricCard title="Completed" value={stats?.completed ?? 0} icon={CheckCircle} variant="default" />
        </div>

        <div className="fleet-card">
          <h3 className="font-semibold mb-4">Active & Scheduled Routes</h3>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes?.map((r) => {
                  const cfg = statusConfig[r.status] || statusConfig.scheduled;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.assetPlate || r.assetName || '—'}</TableCell>
                      <TableCell>{r.driverName || '—'}</TableCell>
                      <TableCell><Badge className={cfg.className}>{cfg.label}</Badge></TableCell>
                      <TableCell>{r.distance} km</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(r.startTime), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!routes?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No routes yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
