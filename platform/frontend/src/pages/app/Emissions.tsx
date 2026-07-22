import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useEmissionsMetrics, useEmissionsByVehicle, useEcoViolations } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Leaf, Cloud, Gauge, AlertTriangle, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART } from '@/lib/chartColors';
import { safeArray } from '@/lib/safeArray';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericModuleReports } from '@/components/reports/moduleReportPanels';

const complianceColors: Record<string, string> = {
  good: 'bg-success/15 text-success',
  moderate: 'bg-warning/15 text-warning',
  poor: 'bg-destructive/15 text-destructive',
};

export default function Emissions() {
  const { data: metrics, isLoading, refetch: refetchMetrics, isFetching: fetchingMetrics } = useEmissionsMetrics();
  const { data: byVehicle, refetch: refetchByVehicle, isFetching: fetchingByVehicle } = useEmissionsByVehicle();
  const { data: violations } = useEcoViolations();

  return (
    <AppLayout title="Emissions" subtitle="CO₂ tracking and eco-driving compliance">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><FileText className="h-3.5 w-3.5" />Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0 space-y-6">
      <div className="space-y-6">
        <div className="stat-strip-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : (
            <>
              <MetricCard title="CO₂ Emissions" value={`${metrics?.co2Kg ?? 0} kg`} icon={Cloud} variant="primary" size="xxs" />
              <MetricCard title="CO₂ / km" value={`${metrics?.co2PerKm ?? 0} kg`} icon={Gauge} variant="info" size="xxs" />
              <MetricCard title="Fuel Used" value={`${metrics?.totalFuelLiters ?? 0} L`} icon={Leaf} variant="success" size="xxs" />
              <MetricCard title="Violations" value={metrics?.violationCount ?? 0} icon={AlertTriangle} variant="destructive" size="xxs" />
            </>
          )}
        </div>

        {metrics?.complianceStatus && (
          <div className="fleet-card flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Compliance status:</span>
            <Badge className={complianceColors[metrics.complianceStatus] || ''}>
              {metrics.complianceStatus}
            </Badge>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="fleet-card">
            <h3 className="font-semibold mb-4">Emissions by Vehicle</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(byVehicle as Array<{ vehicle: string; co2Kg: number }>) || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="vehicle" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="co2Kg" fill={CHART.brandAccent} name="CO₂ (kg)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="fleet-card">
            <h3 className="font-semibold mb-4">Eco-Driving Violations</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Driver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(safeArray(violations) as Array<{
                  id: string;
                  unitName?: string;
                  violationType: string;
                  severity?: string;
                  driverName?: string;
                }>).slice(0, 8).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.unitName}</TableCell>
                    <TableCell className="text-sm">{v.violationType.replace(/_/g, ' ')}</TableCell>
                    <TableCell><Badge variant="outline">{v.severity}</Badge></TableCell>
                    <TableCell>{v.driverName || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
        </TabsContent>
        <TabsContent value="reports" className="mt-0">
          <GenericModuleReports
            moduleLabel="Emissions"
            title="Emissions executive"
            blurb="CO₂, fuel use, and eco violations for the fleet."
            onRun={async () => {
              await Promise.all([refetchMetrics(), refetchByVehicle()]);
            }}
            running={fetchingMetrics || fetchingByVehicle}
            kpis={[
              { label: 'CO₂ (kg)', value: metrics?.co2Kg ?? 0 },
              { label: 'CO₂ / km', value: metrics?.co2PerKm ?? 0 },
              { label: 'Fuel (L)', value: metrics?.totalFuelLiters ?? 0 },
              { label: 'Violations', value: metrics?.violationCount ?? 0 },
            ]}
            columns={[
              { key: 'unit', label: 'Asset' },
              { key: 'co2', label: 'CO₂', align: 'right' },
              { key: 'fuel', label: 'Fuel', align: 'right' },
            ]}
            rows={(safeArray(byVehicle) as Array<{ vehicle?: string; co2Kg?: number; fuelUsed?: number }>).map((v) => ({
              unit: v.vehicle || '—',
              co2: v.co2Kg ?? 0,
              fuel: v.fuelUsed ?? 0,
            }))}
            charts={{
              heading: 'Asset performance · emissions analytics',
              categoryKey: 'unit',
              bar: {
                title: 'CO₂ by asset',
                subtitle: 'Standing bars — carbon load per unit',
                metrics: [{ key: 'co2', label: 'CO₂ (kg)', color: CHART.brand }],
                topN: 8,
              },
              secondary: {
                type: 'bars',
                title: 'Fuel vs CO₂',
                subtitle: 'Standing bars — fuel used alongside emissions',
                metrics: [
                  { key: 'fuel', label: 'Fuel (L)', color: '#0d9488' },
                  { key: 'co2', label: 'CO₂ (kg)', color: '#d97706' },
                ],
                topN: 8,
              },
            }}
          />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
