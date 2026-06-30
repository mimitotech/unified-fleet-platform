import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useWorkshopKpis, useInspections, useMaintenanceLogs, useBreakdowns } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wrench, ClipboardCheck, AlertOctagon, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

export default function Workshop() {
  const { data: kpis, isLoading } = useWorkshopKpis();
  const { data: inspections } = useInspections();
  const { data: maintenance } = useMaintenanceLogs();
  const { data: breakdowns } = useBreakdowns();

  return (
    <AppLayout title="Workshop" subtitle="Maintenance, inspections and breakdowns">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)
          ) : (
            <>
              <MetricCard title="Pending Jobs" value={kpis?.pendingMaintenance ?? 0} icon={Wrench} variant="primary" />
              <MetricCard title="Completed (Month)" value={kpis?.completedThisMonth ?? 0} icon={ClipboardCheck} variant="success" />
              <MetricCard title="Open Breakdowns" value={kpis?.openBreakdowns ?? 0} icon={AlertOctagon} variant="destructive" />
              <MetricCard title="Total Cost" value={`${((kpis?.totalMaintenanceCost ?? 0) / 1000).toFixed(0)}k`} icon={DollarSign} variant="info" />
            </>
          )}
        </div>

        <Tabs defaultValue="maintenance">
          <TabsList>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="inspections">Inspections</TabsTrigger>
            <TabsTrigger value="breakdowns">Breakdowns</TabsTrigger>
          </TabsList>

          <TabsContent value="maintenance" className="fleet-card mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Mechanic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(maintenance as Array<Record<string, unknown>>)?.map((m) => (
                  <TableRow key={m.id as string}>
                    <TableCell className="font-medium">{m.vehicleName as string}</TableCell>
                    <TableCell><Badge variant="outline">{m.maintenanceType as string}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{m.description as string}</TableCell>
                    <TableCell>{m.mechanicName as string}</TableCell>
                    <TableCell><Badge>{m.status as string}</Badge></TableCell>
                    <TableCell>{Number(m.totalCost).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="inspections" className="fleet-card mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inspector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inspections as Array<Record<string, unknown>>)?.map((i) => (
                  <TableRow key={i.id as string}>
                    <TableCell>{i.vehicleName as string}</TableCell>
                    <TableCell>{i.inspectionType as string}</TableCell>
                    <TableCell>{format(new Date(i.inspectionDate as string), 'dd MMM yyyy')}</TableCell>
                    <TableCell><Badge variant={i.overallStatus === 'pass' ? 'default' : 'destructive'}>{i.overallStatus as string}</Badge></TableCell>
                    <TableCell>{(i.inspectorName as string) || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="breakdowns" className="fleet-card mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(breakdowns as Array<Record<string, unknown>>)?.map((b) => (
                  <TableRow key={b.id as string}>
                    <TableCell>{b.vehicleName as string}</TableCell>
                    <TableCell className="max-w-sm truncate">{b.description as string}</TableCell>
                    <TableCell><Badge variant={b.severity === 'critical' ? 'destructive' : 'outline'}>{b.severity as string}</Badge></TableCell>
                    <TableCell>{format(new Date(b.breakdownTime as string), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{Number(b.totalCost).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
