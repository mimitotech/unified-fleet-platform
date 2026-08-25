import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import {
  useCreateDriver,
  useDeleteDriver,
  useDrivers,
  useDriverStats,
  useUpdateDriver,
  invalidateDriverQueries,
} from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { DriversModuleReports } from '@/components/reports/moduleReportPanels';
import {
  clientApi,
  type Driver,
  type DriverPenaltyConfig,
  type DriverPerformanceRow,
} from '@/lib/api';
import { notify } from '@/lib/notify';
import { safeArray } from '@/lib/safeArray';
import { CHART, ALERT_SEVERITY } from '@/lib/chartColors';
import {
  Users, UserCheck, Car, Coffee, FileText, Plus, Pencil, RefreshCw, Settings2,
  MoreHorizontal, Trash2, Eye, Award,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const statusColors: Record<string, string> = {
  available: 'bg-success/15 text-success',
  driving: 'bg-info/15 text-info',
  'off-duty': 'bg-muted text-muted-foreground',
};

const gradeColors: Record<string, string> = {
  good: 'bg-success/15 text-success',
  bad: 'bg-warning/15 text-warning',
  ugly: 'bg-destructive/15 text-destructive',
};

const emptyForm = {
  name: '',
  licenseNumber: '',
  permitClass: '',
  licenseExpiryDate: '',
  phone: '',
  email: '',
  status: 'available',
  assignedAssetId: '',
  assignedAssetName: '',
  assignedAssetPlate: '',
  fuelCardNumber: '',
  hireDate: '',
};

function licenseState(expiryRaw?: string | null): { label: string; className: string } | null {
  if (!expiryRaw) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(`${expiryRaw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return null;
  const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: `Expired ${Math.abs(days)}d`, className: 'bg-destructive/15 text-destructive' };
  if (days <= 30) return { label: `Expires in ${days}d`, className: 'bg-warning/15 text-warning' };
  return { label: 'Valid', className: 'bg-success/15 text-success' };
}

function downloadDriversCsv(rows: Driver[]) {
  const headers = [
    'Name',
    'LicenseNumber',
    'PermitClass',
    'LicenseExpiryDate',
    'LicenseStatus',
    'Phone',
    'Email',
    'Status',
    'FuelCardNumber',
    'AssignedVehicle',
    'SafetyScore',
    'Grade',
    'Violations',
  ];
  const csvRows = rows.map((d) => {
    const ls = d.licenseExpiryDate ? licenseState(d.licenseExpiryDate)?.label || '' : 'No expiry date';
    return [
      d.name || '',
      d.licenseNumber || '',
      d.permitClass || '',
      d.licenseExpiryDate ? String(d.licenseExpiryDate).slice(0, 10) : '',
      ls,
      d.phone || '',
      d.email || '',
      d.status || '',
      d.fuelCardNumber || '',
      d.assignedAssetPlate || d.assignedAssetName || '',
      d.safetyScore != null ? String(d.safetyScore) : '',
      d.grade || '',
      d.violationsCount != null ? String(d.violationsCount) : '',
    ];
  });
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...csvRows].map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `drivers-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Drivers() {
  const qc = useQueryClient();
  const { data: drivers, isLoading } = useDrivers();
  const { data: stats } = useDriverStats();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const autoScoredRef = useRef(false);

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ['driverPerformance'],
    queryFn: () => clientApi.getDriverPerformance(),
  });
  const { data: penaltyConfig } = useQuery({
    queryKey: ['driverPenalties'],
    queryFn: () => clientApi.getDriverPenaltyConfig(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [penaltyDraft, setPenaltyDraft] = useState<DriverPenaltyConfig | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: driverDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['driverDetail', selectedDriverId],
    queryFn: () => clientApi.getDriver(selectedDriverId, 30),
    enabled: Boolean(selectedDriverId) && detailOpen,
  });

  const { data: violations } = useQuery({
    queryKey: ['driverViolations', selectedDriverId],
    queryFn: () => clientApi.getDriverViolations(selectedDriverId, 80, 30),
    enabled: Boolean(selectedDriverId),
  });
  const { data: fleetViolations } = useQuery({
    queryKey: ['driverViolationsFeed'],
    queryFn: () => clientApi.getDriverViolationsFeed(80, 30),
  });

  const recompute = useMutation({
    mutationFn: () => clientApi.recomputeDriverScores(30),
    onSuccess: (data) => {
      notify.success('Scores updated', `${data.drivers} drivers scored from eco / camera violations`);
      invalidateDriverQueries(qc);
    },
    onError: (e) => notify.error('Score update failed', (e as Error).message),
  });

  const recomputeOne = useMutation({
    mutationFn: (id: string) => clientApi.recomputeDriverScore(id, 30),
    onSuccess: (data) => {
      notify.success('Driver scored', `Score ${data.score} · ${data.grade}`);
      invalidateDriverQueries(qc);
      qc.invalidateQueries({ queryKey: ['driverDetail', data.driverId] });
    },
    onError: (e) => notify.error('Score failed', (e as Error).message),
  });

  const savePenalties = useMutation({
    mutationFn: (cfg: DriverPenaltyConfig) =>
      clientApi.saveDriverPenaltyConfig({
        baseScore: cfg.baseScore,
        penalties: cfg.penalties,
        goodMin: cfg.goodMin,
        badMin: cfg.badMin,
      }),
    onSuccess: (data) => {
      const count = (data as { recompute?: { drivers?: number } }).recompute?.drivers;
      notify.success(
        'Penalty rules saved',
        count != null ? `${count} driver scores recalculated` : undefined
      );
      invalidateDriverQueries(qc);
    },
    onError: (e) => notify.error('Could not save penalties', (e as Error).message),
  });

  useEffect(() => {
    if (autoScoredRef.current || isLoading || !drivers?.length) return;
    const hasScore =
      drivers.some((d) => d.safetyScore != null) ||
      safeArray(performance).length > 0;
    if (!hasScore && !recompute.isPending) {
      autoScoredRef.current = true;
      recompute.mutate();
    }
  }, [drivers, isLoading, performance, recompute]);

  const latestScores = useMemo(() => {
    const rows = safeArray(performance) as DriverPerformanceRow[];
    const byDriver = new Map<string, DriverPerformanceRow>();
    for (const row of rows) {
      const prev = byDriver.get(row.driverId);
      if (!prev || String(row.snapshotDate) > String(prev.snapshotDate)) {
        byDriver.set(row.driverId, row);
      }
    }
    return [...byDriver.values()].sort((a, b) => a.safetyScore - b.safetyScore);
  }, [performance]);

  const scoreByDriver = useMemo(() => {
    const m = new Map<string, DriverPerformanceRow>();
    for (const r of latestScores) m.set(r.driverId, r);
    for (const d of safeArray(drivers) as Driver[]) {
      if (!m.has(d.id) && d.safetyScore != null) {
        m.set(d.id, {
          id: '',
          driverId: d.id,
          driverName: d.name,
          snapshotDate: d.snapshotDate || '',
          safetyScore: d.safetyScore,
          grade: d.grade,
          penaltyPoints: d.penaltyPoints,
          violationsCount: d.violationsCount || 0,
          tripsCount: d.tripsCount || 0,
          totalDistance: d.totalDistance || 0,
          assignedAssetPlate: d.assignedAssetPlate,
          assignedAssetName: d.assignedAssetName,
        });
      }
    }
    return m;
  }, [latestScores, drivers]);

  const rosterScores = useMemo(() => {
    const fromPerf = latestScores;
    if (fromPerf.length) return fromPerf;
    return (safeArray(drivers) as Driver[])
      .filter((d) => d.safetyScore != null)
      .map((d) => ({
        id: '',
        driverId: d.id,
        driverName: d.name,
        snapshotDate: d.snapshotDate || '',
        safetyScore: d.safetyScore!,
        grade: d.grade,
        penaltyPoints: d.penaltyPoints,
        violationsCount: d.violationsCount || 0,
        tripsCount: d.tripsCount || 0,
        totalDistance: d.totalDistance || 0,
      }))
      .sort((a, b) => a.safetyScore - b.safetyScore);
  }, [latestScores, drivers]);

  const gradeCounts = useMemo(() => {
    if (stats?.gradeGood != null || stats?.gradeBad != null || stats?.gradeUgly != null) {
      return {
        good: stats.gradeGood ?? 0,
        bad: stats.gradeBad ?? 0,
        ugly: stats.gradeUgly ?? 0,
      };
    }
    const c = { good: 0, bad: 0, ugly: 0 };
    for (const r of rosterScores) {
      const g = String(r.grade || '').toLowerCase();
      if (g === 'good' || g === 'bad' || g === 'ugly') c[g] += 1;
    }
    return c;
  }, [stats, rosterScores]);

  const chartData = rosterScores.slice(0, 12).map((r) => ({
    name: r.driverName?.split(/\s+/)[0] || 'Driver',
    score: Number(r.safetyScore) || 0,
    grade: r.grade || 'bad',
  }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openDetail = (d: Driver) => {
    setSelectedDriverId(d.id);
    setDetailOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditing(d);
    setForm({
      name: d.name || '',
      licenseNumber: d.licenseNumber || '',
      permitClass: d.permitClass || '',
      licenseExpiryDate: d.licenseExpiryDate ? String(d.licenseExpiryDate).slice(0, 10) : '',
      phone: d.phone || '',
      email: d.email || '',
      status: d.status || 'available',
      assignedAssetId: d.assignedAssetId || '',
      assignedAssetName: d.assignedAssetName || '',
      assignedAssetPlate: d.assignedAssetPlate || '',
      fuelCardNumber: d.fuelCardNumber || '',
      hireDate: d.hireDate ? String(d.hireDate).slice(0, 10) : '',
    });
    setOpen(true);
  };

  const confirmDelete = (d: Driver) => {
    if (!window.confirm(`Remove ${d.name} from the roster? This cannot be undone.`)) return;
    deleteDriver.mutate(d.id, {
      onSuccess: () => {
        notify.success('Driver removed');
        if (selectedDriverId === d.id) {
          setDetailOpen(false);
          setSelectedDriverId('');
        }
      },
      onError: (e) => notify.error('Delete failed', (e as Error).message),
    });
  };

  const submit = () => {
    if (!form.name.trim() || !form.licenseNumber.trim()) {
      notify.error('Name and license are required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      licenseNumber: form.licenseNumber.trim(),
      permitClass: form.permitClass.trim() || null,
      licenseExpiryDate: form.licenseExpiryDate || null,
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      status: form.status,
      assignedAssetId: form.assignedAssetId || null,
      assignedAssetName: form.assignedAssetName || null,
      assignedAssetPlate: form.assignedAssetPlate || null,
      fuelCardNumber: form.fuelCardNumber.trim() || null,
      hireDate: form.hireDate || null,
    } as Partial<Driver> & {
      assignedAssetName?: string | null;
      assignedAssetPlate?: string | null;
    };

    if (editing) {
      updateDriver.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            notify.success('Driver updated');
            setOpen(false);
          },
          onError: (e) => notify.error('Update failed', (e as Error).message),
        }
      );
    } else {
      createDriver.mutate(payload, {
        onSuccess: () => {
          notify.success('Driver added');
          setOpen(false);
        },
        onError: (e) => notify.error('Create failed', (e as Error).message),
      });
    }
  };

  const cfg = penaltyDraft || penaltyConfig;

  return (
    <AppLayout title="Drivers" subtitle="Roster, eco penalties, and Good / Bad / Ugly scoring">
      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="scores">Scores</TabsTrigger>
          <TabsTrigger value="penalties" className="gap-1">
            <Settings2 className="h-3.5 w-3.5" />
            Penalties
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-6 mt-0">
          <div className="stat-strip-4">
            <MetricCard title="Total Drivers" value={stats?.total ?? 0} icon={Users} variant="primary" size="xxs" />
            <MetricCard title="Available" value={stats?.available ?? 0} icon={UserCheck} variant="success" size="xxs" />
            <MetricCard title="Expiring in 7d" value={stats?.expiring7dLicenses ?? 0} icon={Car} variant="warning" size="xxs" />
            <MetricCard
              title="Expired"
              value={stats?.expiredLicenses || 0}
              icon={Coffee}
              variant="destructive"
              size="xxs"
            />
          </div>
          <div className="stat-strip-4">
            <MetricCard title="Driving now" value={stats?.driving ?? 0} icon={Car} variant="info" size="xxs" />
            <MetricCard title="Expiring in 30d" value={stats?.expiringLicenses ?? 0} icon={UserCheck} variant="warning" size="xxs" />
            <MetricCard title="No expiry set" value={stats?.noExpiryLicenses ?? 0} icon={Users} variant="default" size="xxs" />
            <MetricCard title="At risk total" value={(stats?.expiredLicenses || 0) + (stats?.expiringLicenses || 0)} icon={Coffee} variant="primary" size="xxs" />
          </div>

          <div className="fleet-card branded-panel">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="font-semibold text-primary">Driver Roster</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadDriversCsv(drivers || [])}>
                  Export CSV
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Add driver
                </Button>
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Permit class</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Fuel card</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned vehicle</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers?.map((d) => (
                    <TableRow key={d.id}>
                      {(() => {
                        const state = licenseState(d.licenseExpiryDate);
                        return (
                          <>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.licenseNumber}</TableCell>
                      <TableCell>{d.permitClass || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs">{d.licenseExpiryDate ? String(d.licenseExpiryDate).slice(0, 10) : '—'}</span>
                          {state ? (
                            <Badge className={state.className}>
                              {state.label}
                            </Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground">No expiry date</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {scoreByDriver.get(d.id)?.safetyScore != null
                          ? scoreByDriver.get(d.id)!.safetyScore
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {scoreByDriver.get(d.id)?.grade ? (
                          <Badge className={gradeColors[String(scoreByDriver.get(d.id)!.grade || '').toLowerCase()] || ''}>
                            {scoreByDriver.get(d.id)!.grade}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{d.phone || '—'}</TableCell>
                      <TableCell>{d.fuelCardNumber || '—'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[d.status] || ''}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>{d.assignedAssetPlate || d.assignedAssetName || '—'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(d)}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> View profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(d)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => recomputeOne.mutate(d.id)}
                              disabled={recomputeOne.isPending}
                            >
                              <Award className="h-3.5 w-3.5 mr-2" /> Recompute score
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => confirmDelete(d)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                          </>
                        );
                      })()}
                    </TableRow>
                  ))}
                  {!drivers?.length && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No drivers yet — add a driver or sync from Wialon
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scores" className="space-y-6 mt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="stat-strip-4 flex-1 min-w-[240px]">
              <MetricCard title="Good" value={gradeCounts.good} icon={UserCheck} variant="success" size="xxs" />
              <MetricCard title="Bad" value={gradeCounts.bad} icon={Car} variant="warning" size="xxs" />
              <MetricCard title="Ugly" value={gradeCounts.ugly} icon={Coffee} variant="destructive" size="xxs" />
              <MetricCard title="Scored" value={stats?.scored ?? rosterScores.length} icon={Users} variant="primary" size="xxs" />
            </div>
            <LoadingButton
              size="sm"
              variant="outline"
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Recompute from violations
            </LoadingButton>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="fleet-card">
              <h3 className="font-semibold mb-4">Safety score (lower = more penalties)</h3>
              <div className="h-56">
                {perfLoading ? (
                  <Skeleton className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="score" name="Score" radius={[3, 3, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={
                              entry.grade === 'good'
                                ? CHART.success
                                : entry.grade === 'ugly'
                                  ? CHART.failed
                                  : ALERT_SEVERITY.warning
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="fleet-card">
              <h3 className="font-semibold mb-4">Driver grades</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Violations</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rosterScores.map((r) => (
                    <TableRow key={r.driverId}>
                      <TableCell className="font-medium">{r.driverName}</TableCell>
                      <TableCell>{r.safetyScore}</TableCell>
                      <TableCell>
                        <Badge className={gradeColors[String(r.grade || '').toLowerCase()] || ''}>
                          {r.grade || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.violationsCount}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDriverId(r.driverId);
                            setDetailOpen(true);
                          }}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rosterScores.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No scores yet — click Recompute after eco-driving data is synced
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="fleet-card">
            <h3 className="font-semibold mb-1">Eco-driving and violation alerts (30 days)</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Combined Wialon eco-driving events and camera / speeding / fatigue alerts used for driver scoring.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(safeArray(fleetViolations) as Array<{
                  id: string;
                  occurredAt?: string;
                  driverName?: string;
                  unitName?: string;
                  violationType?: string;
                  source?: string;
                  severity?: string;
                }>).slice(0, 40).map((v) => (
                  <TableRow key={`${v.source}-${v.id}`}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>{v.driverName || '—'}</TableCell>
                    <TableCell>{v.unitName || '—'}</TableCell>
                    <TableCell>{String(v.violationType || '').replace(/_/g, ' ')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{v.source === 'alert' ? 'Camera / alert' : 'Eco-driving'}</Badge>
                    </TableCell>
                    <TableCell><Badge variant="outline">{v.severity || '—'}</Badge></TableCell>
                  </TableRow>
                ))}
                {!safeArray(fleetViolations).length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No eco-driving or camera alerts in the last 30 days. Click Recompute after Wialon reports sync.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {selectedDriverId && (
            <div className="fleet-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">
                  Violations — {latestScores.find((r) => r.driverId === selectedDriverId)?.driverName || 'Driver'}
                </h3>
                <Button size="sm" variant="ghost" onClick={() => setSelectedDriverId('')}>
                  Close
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Vehicle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(safeArray(violations) as Array<{
                    id: string;
                    occurredAt?: string;
                    violationType: string;
                    severity?: string;
                    unitName?: string;
                    source?: string;
                  }>).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-xs">
                        {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>{String(v.violationType || '').replace(/_/g, ' ')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{v.source === 'alert' ? 'Camera / alert' : 'Eco-driving'}</Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline">{v.severity || '—'}</Badge></TableCell>
                      <TableCell>{v.unitName || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!safeArray(violations).length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No linked eco-driving or camera/alert violations for this driver in the last 30 days
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="penalties" className="space-y-4 mt-0">
          <div className="fleet-card space-y-4">
            <div>
              <h3 className="font-semibold text-primary">Configurable penalty system</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Eco-driving (speeding, harsh events), unauthorized moves, fatigue, and camera/video
                violations reduce a driver&apos;s starting score. Grades: Good / Bad / Ugly.
              </p>
            </div>
            {cfg ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Base score</Label>
                    <Input
                      type="number"
                      value={cfg.baseScore}
                      onChange={(e) =>
                        setPenaltyDraft({ ...cfg, baseScore: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Good minimum</Label>
                    <Input
                      type="number"
                      value={cfg.goodMin}
                      onChange={(e) =>
                        setPenaltyDraft({ ...cfg, goodMin: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <Label>Bad minimum (below = Ugly)</Label>
                    <Input
                      type="number"
                      value={cfg.badMin}
                      onChange={(e) =>
                        setPenaltyDraft({ ...cfg, badMin: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(cfg.penalties).map(([key, pts]) => (
                    <div key={key}>
                      <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
                      <Input
                        type="number"
                        value={pts}
                        onChange={(e) =>
                          setPenaltyDraft({
                            ...cfg,
                            penalties: {
                              ...cfg.penalties,
                              [key]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <LoadingButton
                  loading={savePenalties.isPending}
                  onClick={() => cfg && savePenalties.mutate(cfg)}
                >
                  Save &amp; recalculate scores
                </LoadingButton>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPenaltyDraft(null);
                    qc.invalidateQueries({ queryKey: ['driverPenalties'] });
                  }}
                >
                  Reset to saved
                </Button>
              </>
            ) : (
              <Skeleton className="h-32" />
            )}
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <DriversModuleReports />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit driver' : 'Add driver'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>License number</Label>
              <Input
                value={form.licenseNumber}
                onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Permit class</Label>
                <Input
                  value={form.permitClass}
                  onChange={(e) => setForm((f) => ({ ...f, permitClass: e.target.value }))}
                  placeholder="e.g. B, CM, CE"
                />
              </div>
              <div>
                <Label>License expiry</Label>
                <Input
                  type="date"
                  value={form.licenseExpiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, licenseExpiryDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="driving">Driving</SelectItem>
                    <SelectItem value="off-duty">Off duty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label>Fuel card number</Label>
              <Input
                value={form.fuelCardNumber}
                onChange={(e) => setForm((f) => ({ ...f, fuelCardNumber: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Assigned vehicle</Label>
              <FleetUnitSelect
                value={form.assignedAssetId || undefined}
                onValueChange={(id, unit) =>
                  setForm((f) => ({
                    ...f,
                    assignedAssetId: id || '',
                    assignedAssetName: unit?.name || '',
                    assignedAssetPlate: unit?.plate || '',
                  }))
                }
              />
              {form.assignedAssetId && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 mt-1 text-xs"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      assignedAssetId: '',
                      assignedAssetName: '',
                      assignedAssetPlate: '',
                    }))
                  }
                >
                  Clear vehicle assignment
                </Button>
              )}
            </div>
            <div>
              <Label>Hire date</Label>
              <Input
                type="date"
                value={form.hireDate}
                onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <LoadingButton
              loading={createDriver.isPending || updateDriver.isPending}
              onClick={submit}
            >
              {editing ? 'Save' : 'Add driver'}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{driverDetail?.name || 'Driver profile'}</SheetTitle>
            <SheetDescription>
              License, vehicle assignment, safety score, and linked violations
            </SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <Skeleton className="h-64 mt-4" />
          ) : driverDetail ? (
            <div className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">License</p>
                  <p className="font-medium">{driverDetail.licenseNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge className={statusColors[driverDetail.status] || ''}>{driverDetail.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Phone</p>
                  <p>{driverDetail.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Vehicle</p>
                  <p>{driverDetail.assignedAssetPlate || driverDetail.assignedAssetName || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Safety score</p>
                  <p className="font-semibold text-lg">
                    {driverDetail.safetyScore ?? driverDetail.projectedScore ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Grade</p>
                  {(driverDetail.grade || driverDetail.projectedGrade) ? (
                    <Badge
                      className={
                        gradeColors[
                          String(driverDetail.grade || driverDetail.projectedGrade).toLowerCase()
                        ] || ''
                      }
                    >
                      {driverDetail.grade || driverDetail.projectedGrade}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              {driverDetail.violationBreakdown &&
                Object.keys(driverDetail.violationBreakdown).length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Penalty breakdown (30 days)</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(driverDetail.violationBreakdown).map(([k, n]) => (
                        <div key={k} className="flex justify-between border rounded px-2 py-1">
                          <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                          <span className="font-medium">{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div className="flex flex-wrap gap-2">
                <LoadingButton
                  size="sm"
                  loading={recomputeOne.isPending}
                  onClick={() => recomputeOne.mutate(driverDetail.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Recompute score
                </LoadingButton>
                <Button size="sm" variant="outline" onClick={() => openEdit(driverDetail)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => confirmDelete(driverDetail)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2">Violations (30 days)</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(safeArray(violations) as Array<{
                      id: string;
                      occurredAt?: string;
                      violationType: string;
                      source?: string;
                    }>).slice(0, 15).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs">
                          {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>{String(v.violationType || '').replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {v.source === 'alert' ? 'Camera / alert' : 'Eco-driving'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!safeArray(violations).length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-4 text-xs">
                          No violations linked — assign a vehicle or sync Wialon eco-driving data
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
