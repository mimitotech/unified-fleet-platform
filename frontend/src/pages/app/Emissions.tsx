import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useEmissionsMetrics, useEmissionsByVehicle, useEcoViolations } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Leaf, Cloud, Gauge, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART } from '@/lib/chartColors';
import { safeArray } from '@/lib/safeArray';

const complianceColors: Record<string, string> = {
  good: 'bg-success/15 text-success',
  moderate: 'bg-warning/15 text-warning',
  poor: 'bg-destructive/15 text-destructive',
};

export default function Emissions() {
  const { data: metrics, isLoading } = useEmissionsMetrics();
  const { data: byVehicle } = useEmissionsByVehicle();
  const { data: violations } = useEcoViolations();

  return (
    <AppLayout title="Emissions" subtitle="CO₂ tracking and eco-driving compliance">
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
                {safeArray(violations).slice(0, 8).map((v) => (
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
    </AppLayout>
  );
}
