import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useDrivers, useDriverStats } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, UserCheck, Car, Coffee, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DriversModuleReports } from '@/components/reports/moduleReportPanels';

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
      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="space-y-6 mt-0">
        <div className="stat-strip-4">
          <MetricCard title="Total Drivers" value={stats?.total ?? 0} icon={Users} variant="primary" size="xxs" />
          <MetricCard title="Available" value={stats?.available ?? 0} icon={UserCheck} variant="success" size="xxs" />
          <MetricCard title="Driving" value={stats?.driving ?? 0} icon={Car} variant="info" size="xxs" />
          <MetricCard title="Off Duty" value={stats?.offDuty ?? 0} icon={Coffee} variant="default" size="xxs" />
        </div>

        <div className="fleet-card branded-panel">
          <h3 className="font-semibold mb-4 text-primary">Driver Roster</h3>
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
        </TabsContent>
        <TabsContent value="reports" className="mt-0">
          <DriversModuleReports />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
