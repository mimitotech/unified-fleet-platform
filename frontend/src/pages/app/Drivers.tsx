import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useDrivers, useDriverStats } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, UserCheck, Car, Coffee } from 'lucide-react';

const statusColors: Record<string, string> = {
  available: 'bg-success/15 text-success',
  driving: 'bg-info/15 text-info',
  'off-duty': 'bg-muted text-muted-foreground',
};

export default function Drivers() {
  const { data: drivers, isLoading } = useDrivers();
  const { data: stats } = useDriverStats();

  return (
    <AppLayout title="Drivers" subtitle="Driver management and performance">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard title="Total Drivers" value={stats?.total ?? 0} icon={Users} variant="primary" />
          <MetricCard title="Available" value={stats?.available ?? 0} icon={UserCheck} variant="success" />
          <MetricCard title="Driving" value={stats?.driving ?? 0} icon={Car} variant="info" />
          <MetricCard title="Off Duty" value={stats?.offDuty ?? 0} icon={Coffee} variant="default" />
        </div>

        <div className="fleet-card">
          <h3 className="font-semibold mb-4">Driver Roster</h3>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned Vehicle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.licenseNumber}</TableCell>
                    <TableCell>{d.phone}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[d.status] || ''}>{d.status}</Badge>
                    </TableCell>
                    <TableCell>{d.assignedAssetPlate || d.assignedAssetName || '—'}</TableCell>
                  </TableRow>
                ))}
                {!drivers?.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No drivers yet
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
