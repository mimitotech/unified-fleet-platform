import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import {
  useEmissionsMetrics,
  useEmissionsByVehicle,
  useEmissionsByType,
  useEcoViolations,
} from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Leaf, Cloud, Gauge, AlertTriangle, FileText, CalendarRange } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { CHART } from '@/lib/chartColors';
import { safeArray } from '@/lib/safeArray';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericModuleReports } from '@/components/reports/moduleReportPanels';

const complianceColors: Record<string, string> = {
  good: 'bg-success/15 text-success',
  moderate: 'bg-warning/15 text-warning',
  poor: 'bg-destructive/15 text-destructive',
};

const PIE_COLORS = [CHART.brand, CHART.brandAccent, '#0d9488', '#d97706', '#dc2626', '#6366f1', '#0891b2'];

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function Emissions() {
  const defaults = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [applied, setApplied] = useState(defaults);

  const range = { from: applied.from, to: applied.to };
  const { data: metrics, isLoading, refetch: refetchMetrics, isFetching: fetchingMetrics } =
    useEmissionsMetrics(true, range);
  const { data: byVehicle, refetch: refetchByVehicle, isFetching: fetchingByVehicle } =
    useEmissionsByVehicle(range);
  const { data: byType, refetch: refetchByType, isFetching: fetchingByType } = useEmissionsByType(range);
  const { data: violations, refetch: refetchViolations } = useEcoViolations(range);

  const typeChart = (safeArray(byType) as Array<{ violationType?: string; count?: number }>).map((r) => ({
    name: String(r.violationType || 'other').replace(/_/g, ' '),
    count: Number(r.count) || 0,
  }));

  const applyRange = () => setApplied({ from, to });

  return (
    <AppLayout title="Emissions" subtitle="CO₂ tracking, eco-driving compliance, and violation mix">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="fleet-card flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <CalendarRange className="h-3.5 w-3.5" /> From
              </Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <Button size="sm" onClick={applyRange}>
              Apply range
            </Button>
            <p className="text-xs text-muted-foreground ml-auto">
              Factor {metrics?.emissionFactor ?? 2.68} kg CO₂ / L · {applied.from} → {applied.to}
            </p>
          </div>

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
              <span className="text-xs text-muted-foreground">
                Combines CO₂ intensity with eco-driving violation pressure
              </span>
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
              <h3 className="font-semibold mb-4">Violations by type</h3>
              <div className="h-56">
                {typeChart.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeChart}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) =>
                          `${String(name).slice(0, 12)} ${Math.round((percent || 0) * 100)}%`
                        }
                      >
                        {typeChart.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    No eco violations in this date range
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="fleet-card">
            <h3 className="font-semibold mb-4">Eco-Driving Violations</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(safeArray(violations) as Array<{
                  id: string;
                  occurredAt?: string;
                  unitName?: string;
                  violationType: string;
                  severity?: string;
                  driverName?: string;
                  value?: number | null;
                }>).slice(0, 25).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>{v.unitName}</TableCell>
                    <TableCell className="text-sm">{String(v.violationType || '').replace(/_/g, ' ')}</TableCell>
                    <TableCell><Badge variant="outline">{v.severity}</Badge></TableCell>
                    <TableCell>{v.driverName || '—'}</TableCell>
                    <TableCell className="text-right">{v.value != null ? v.value : '—'}</TableCell>
                  </TableRow>
                ))}
                {!safeArray(violations).length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No violations in range — sync eco-driving reports from Wialon
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="fleet-card">
            <h3 className="font-semibold mb-4">Fleet emissions detail</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Fuel (L)</TableHead>
                  <TableHead className="text-right">Mileage (km)</TableHead>
                  <TableHead className="text-right">CO₂ (kg)</TableHead>
                  <TableHead className="text-right">CO₂ / km</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(safeArray(byVehicle) as Array<{
                  vehicle?: string;
                  fuelUsed?: number;
                  mileage?: number;
                  co2Kg?: number;
                  co2PerKm?: number;
                }>).map((row) => (
                  <TableRow key={row.vehicle}>
                    <TableCell className="font-medium">{row.vehicle || '—'}</TableCell>
                    <TableCell className="text-right">{row.fuelUsed ?? 0}</TableCell>
                    <TableCell className="text-right">{row.mileage ?? 0}</TableCell>
                    <TableCell className="text-right">{row.co2Kg ?? 0}</TableCell>
                    <TableCell className="text-right">{row.co2PerKm ?? 0}</TableCell>
                  </TableRow>
                ))}
                {!safeArray(byVehicle).length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No trip fuel data in this range
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="reports" className="mt-0">
          <GenericModuleReports
            moduleLabel="Emissions"
            title="Emissions executive"
            blurb="CO₂, fuel use, and eco violations for the fleet."
            onRun={async () => {
              await Promise.all([
                refetchMetrics(),
                refetchByVehicle(),
                refetchByType(),
                refetchViolations(),
              ]);
            }}
            running={fetchingMetrics || fetchingByVehicle || fetchingByType}
            kpis={[
              { label: 'CO₂ (kg)', value: metrics?.co2Kg ?? 0 },
              { label: 'CO₂ / km', value: metrics?.co2PerKm ?? 0 },
              { label: 'Fuel (L)', value: metrics?.totalFuelLiters ?? 0 },
              { label: 'Violations', value: metrics?.violationCount ?? 0 },
            ]}
            columns={[
              { key: 'unit', label: 'Asset' },
              { key: 'co2', label: 'CO₂ (kg)', align: 'right' },
              { key: 'fuel', label: 'Fuel (L)', align: 'right' },
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
