import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import { Leaf, Cloud, Gauge, AlertTriangle, FileText, CalendarRange, Route, RefreshCw } from 'lucide-react';
import { clientApi } from '@/lib/api';
import { notify } from '@/lib/notify';
import { LoadingButton } from '@/components/shared/LoadingButton';
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

function fmt(n: number | null | undefined, digits = 1): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function violationLabel(type?: string): string {
  const t = String(type || '').toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    speeding: 'Speeding',
    overspeeding: 'Overspeeding',
    harsh_braking: 'Harsh braking',
    harsh_acceleration: 'Harsh acceleration',
    harsh_cornering: 'Harsh cornering',
    idling: 'Excessive idling',
    unauthorized: 'Unauthorized driving',
    fatigue: 'Fatigue',
    camera: 'Camera / video',
    video: 'Camera / video',
    eco_violation: 'Eco-driving',
  };
  return map[t] || String(type || 'Other').replace(/_/g, ' ');
}

export default function Emissions() {
  const defaults = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [applied, setApplied] = useState(defaults);

  const range = { from: applied.from, to: applied.to };
  const { data: metrics, isLoading, refetch: refetchMetrics, isFetching: fetchingMetrics } =
    useEmissionsMetrics(true, range);
  const { data: byVehicle, refetch: refetchByVehicle, isFetching: fetchingByVehicle, isLoading: loadingVehicles } =
    useEmissionsByVehicle(range);
  const { data: byType, refetch: refetchByType, isFetching: fetchingByType } = useEmissionsByType(range);
  const { data: violations, refetch: refetchViolations, isLoading: loadingViolations } = useEcoViolations(range);

  const syncViolations = useMutation({
    mutationFn: () => clientApi.syncEmissionsViolations(),
    onSuccess: (data) => {
      notify.success('Violations synced', `${data.eco} driving events imported from fleet telematics`);
      void refetchViolations();
    },
    onError: (e) => notify.error('Sync failed', (e as Error).message),
  });

  const vehicleRows = safeArray(byVehicle) as Array<{
    vehicle?: string;
    fuelUsed?: number;
    mileage?: number;
    co2Kg?: number;
    co2PerKm?: number;
    source?: string;
  }>;

  const typeChart = (safeArray(byType) as Array<{ violationType?: string; count?: number }>).map((r) => ({
    name: violationLabel(r.violationType),
    count: Number(r.count) || 0,
  }));

  const chartVehicles = vehicleRows.slice(0, 12).map((r) => ({
    vehicle: String(r.vehicle || '—').slice(0, 18),
    co2Kg: Number(r.co2Kg) || 0,
    fuelUsed: Number(r.fuelUsed) || 0,
  }));

  const applyRange = () => setApplied({ from, to });

  return (
    <AppLayout title="Emissions" subtitle="CO₂ from fuel use, eco-driving compliance, and violation mix">
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
              Diesel factor {metrics?.emissionFactor ?? 2.68} kg CO₂ / L · {applied.from} → {applied.to}
              {metrics?.source ? ` · source: ${metrics.source === 'fuel_transactions' ? 'fuel reports' : 'trip summaries'}` : ''}
            </p>
          </div>

          <div className="stat-strip-4">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            ) : (
              <>
                <MetricCard title="CO₂ Emissions" value={`${fmt(metrics?.co2Kg, 0)} kg`} icon={Cloud} variant="primary" size="xxs" />
                <MetricCard title="Fuel Used" value={`${fmt(metrics?.totalFuelLiters)} L`} icon={Leaf} variant="success" size="xxs" />
                <MetricCard title="Distance" value={`${fmt(metrics?.totalMileageKm, 0)} km`} icon={Route} variant="info" size="xxs" />
                <MetricCard title="CO₂ / km" value={`${fmt(metrics?.co2PerKm, 2)} kg`} icon={Gauge} variant="warning" size="xxs" />
              </>
            )}
          </div>
          <div className="stat-strip-4">
            <MetricCard title="Eco violations" value={metrics?.violationCount ?? 0} icon={AlertTriangle} variant="destructive" size="xxs" />
            <MetricCard title="Vehicles in range" value={vehicleRows.length} icon={Leaf} variant="primary" size="xxs" />
            <MetricCard
              title="Avg fuel / 100 km"
              value={
                metrics?.totalMileageKm
                  ? `${fmt(((metrics.totalFuelLiters || 0) / metrics.totalMileageKm) * 100, 1)} L`
                  : '—'
              }
              icon={Gauge}
              variant="info"
              size="xxs"
            />
            <MetricCard
              title="Compliance"
              value={metrics?.complianceStatus || '—'}
              icon={Cloud}
              variant={
                metrics?.complianceStatus === 'poor'
                  ? 'destructive'
                  : metrics?.complianceStatus === 'moderate'
                    ? 'warning'
                    : 'success'
              }
              size="xxs"
            />
          </div>

          {metrics?.complianceStatus && (
            <div className="fleet-card flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Compliance status:</span>
              <Badge className={complianceColors[metrics.complianceStatus] || ''}>
                {metrics.complianceStatus}
              </Badge>
              <span className="text-xs text-muted-foreground">
                CO₂ intensity and eco-driving violation count for this date range. Fuel and distance use the same data source so CO₂/km stays consistent.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="fleet-card">
              <h3 className="font-semibold mb-4">CO₂ by vehicle</h3>
              <div className="h-56">
                {loadingVehicles ? (
                  <Skeleton className="h-full" />
                ) : chartVehicles.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartVehicles}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="vehicle" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={48} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="co2Kg" fill={CHART.brandAccent} name="CO₂ (kg)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    No fuel or trip data in this date range
                  </p>
                )}
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
                          `${String(name).slice(0, 14)} ${Math.round((percent || 0) * 100)}%`
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
                    No eco-driving violations in this date range
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="fleet-card">
            <h3 className="font-semibold mb-1">Fleet emissions detail</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Per-vehicle fuel, distance, and CO₂. Totals should match the KPI cards above.
            </p>
            {loadingVehicles ? (
              <Skeleton className="h-48" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Fuel (L)</TableHead>
                    <TableHead className="text-right">Mileage (km)</TableHead>
                    <TableHead className="text-right">CO₂ (kg)</TableHead>
                    <TableHead className="text-right">CO₂ / km</TableHead>
                    <TableHead className="text-right">L / 100 km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleRows.map((row) => {
                    const fuel = Number(row.fuelUsed) || 0;
                    const km = Number(row.mileage) || 0;
                    return (
                      <TableRow key={row.vehicle}>
                        <TableCell className="font-medium">{row.vehicle || '—'}</TableCell>
                        <TableCell className="text-right">{fmt(fuel)}</TableCell>
                        <TableCell className="text-right">{fmt(km, 0)}</TableCell>
                        <TableCell className="text-right">{fmt(row.co2Kg, 0)}</TableCell>
                        <TableCell className="text-right">{fmt(row.co2PerKm, 2)}</TableCell>
                        <TableCell className="text-right">{km > 0 ? fmt((fuel / km) * 100) : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {vehicleRows.length > 0 && (
                    <TableRow className="font-semibold">
                      <TableCell>Fleet total</TableCell>
                      <TableCell className="text-right">
                        {fmt(vehicleRows.reduce((s, r) => s + (Number(r.fuelUsed) || 0), 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(vehicleRows.reduce((s, r) => s + (Number(r.mileage) || 0), 0), 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(vehicleRows.reduce((s, r) => s + (Number(r.co2Kg) || 0), 0), 0)}
                      </TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                    </TableRow>
                  )}
                  {!vehicleRows.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No fuel or trip data in this range. Open Fuel module to confirm consumption reports are syncing.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="fleet-card">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-semibold mb-1">Eco-driving violations</h3>
                <p className="text-xs text-muted-foreground">
                  Harsh events, speeding, and other eco criteria from fleet reports and unit notifications.
                </p>
              </div>
              <LoadingButton
                size="sm"
                variant="outline"
                loading={syncViolations.isPending}
                onClick={() => syncViolations.mutate()}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Sync violations
              </LoadingButton>
            </div>
            {loadingViolations ? (
              <Skeleton className="h-48" />
            ) : (
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
                  }>).slice(0, 80).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>{v.unitName || '—'}</TableCell>
                      <TableCell className="text-sm">{violationLabel(v.violationType)}</TableCell>
                      <TableCell><Badge variant="outline">{v.severity || '—'}</Badge></TableCell>
                      <TableCell>{v.driverName || '—'}</TableCell>
                      <TableCell className="text-right">{v.value != null ? fmt(v.value) : '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!safeArray(violations).length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No eco-driving violations in this range. They appear after eco-driving reports sync from fleet telematics.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
        <TabsContent value="reports" className="mt-0">
          <GenericModuleReports
            moduleLabel="Emissions"
            title="Emissions executive"
            blurb="CO₂, fuel use, mileage, and eco violations for the fleet."
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
              { label: 'Distance (km)', value: metrics?.totalMileageKm ?? 0 },
              { label: 'Fuel (L)', value: metrics?.totalFuelLiters ?? 0 },
              { label: 'Violations', value: metrics?.violationCount ?? 0 },
            ]}
            columns={[
              { key: 'unit', label: 'Asset' },
              { key: 'fuel', label: 'Fuel (L)', align: 'right' },
              { key: 'km', label: 'km', align: 'right' },
              { key: 'co2', label: 'CO₂ (kg)', align: 'right' },
            ]}
            rows={vehicleRows.map((v) => ({
              unit: v.vehicle || '—',
              fuel: v.fuelUsed ?? 0,
              km: v.mileage ?? 0,
              co2: v.co2Kg ?? 0,
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
                title: 'Fuel vs distance',
                subtitle: 'Standing bars — fuel used alongside kilometres',
                metrics: [
                  { key: 'fuel', label: 'Fuel (L)', color: '#0d9488' },
                  { key: 'km', label: 'km', color: '#d97706' },
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
