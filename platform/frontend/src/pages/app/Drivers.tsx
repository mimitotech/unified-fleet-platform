import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import {
  useCreateDriver,
  useDrivers,
  useDriverStats,
  useUpdateDriver,
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
  phone: '',
  email: '',
  status: 'available',
  assignedAssetId: '',
  fuelCardNumber: '',
};

export default function Drivers() {
  const qc = useQueryClient();
  const { data: drivers, isLoading } = useDrivers();
  const { data: stats } = useDriverStats();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();

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

  const { data: violations } = useQuery({
    queryKey: ['driverViolations', selectedDriverId],
    queryFn: () => clientApi.getDriverViolations(selectedDriverId),
    enabled: Boolean(selectedDriverId),
  });

  const recompute = useMutation({
    mutationFn: () => clientApi.recomputeDriverScores(30),
    onSuccess: (data) => {
      notify.success('Scores updated', `${data.drivers} drivers scored from eco / camera violations`);
      qc.invalidateQueries({ queryKey: ['driverPerformance'] });
    },
    onError: (e) => notify.error('Score update failed', (e as Error).message),
  });

  const savePenalties = useMutation({
    mutationFn: (cfg: DriverPenaltyConfig) =>
      clientApi.saveDriverPenaltyConfig({
        baseScore: cfg.baseScore,
        penalties: cfg.penalties,
        goodMin: cfg.goodMin,
        badMin: cfg.badMin,
      }),
    onSuccess: () => {
      notify.success('Penalty rules saved');
      qc.invalidateQueries({ queryKey: ['driverPenalties'] });
    },
    onError: (e) => notify.error('Could not save penalties', (e as Error).message),
  });

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

  const gradeCounts = useMemo(() => {
    const c = { good: 0, bad: 0, ugly: 0 };
    for (const r of latestScores) {
      const g = String(r.grade || '').toLowerCase();
      if (g === 'good' || g === 'bad' || g === 'ugly') c[g] += 1;
    }
    return c;
  }, [latestScores]);

  const chartData = latestScores.slice(0, 12).map((r) => ({
    name: r.driverName?.split(/\s+/)[0] || 'Driver',
    score: Number(r.safetyScore) || 0,
    grade: r.grade || 'bad',
  }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditing(d);
    setForm({
      name: d.name || '',
      licenseNumber: d.licenseNumber || '',
      phone: d.phone || '',
      email: d.email || '',
      status: d.status || 'available',
      assignedAssetId: d.assignedAssetId || '',
      fuelCardNumber: d.fuelCardNumber || '',
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.name.trim() || !form.licenseNumber.trim()) {
      notify.error('Name and license are required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      licenseNumber: form.licenseNumber.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      status: form.status,
      assignedAssetId: form.assignedAssetId || null,
      fuelCardNumber: form.fuelCardNumber.trim() || null,
    } as Partial<Driver>;

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
            <MetricCard title="Driving" value={stats?.driving ?? 0} icon={Car} variant="info" size="xxs" />
            <MetricCard title="Off Duty" value={stats?.offDuty ?? 0} icon={Coffee} variant="default" size="xxs" />
          </div>

          <div className="fleet-card branded-panel">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="font-semibold text-primary">Driver Roster</h3>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Add driver
              </Button>
            </div>
            {isLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>License</TableHead>
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
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.licenseNumber}</TableCell>
                      <TableCell>{d.phone || '—'}</TableCell>
                      <TableCell>{d.fuelCardNumber || '—'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[d.status] || ''}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>{d.assignedAssetPlate || d.assignedAssetName || '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!drivers?.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
              <MetricCard title="Scored" value={latestScores.length} icon={Users} variant="primary" size="xxs" />
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
                  {latestScores.map((r) => (
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
                        <Button size="sm" variant="outline" onClick={() => setSelectedDriverId(r.driverId)}>
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!latestScores.length && (
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
                  }>).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-xs">
                        {v.occurredAt ? new Date(v.occurredAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>{String(v.violationType || '').replace(/_/g, ' ')}</TableCell>
                      <TableCell><Badge variant="outline">{v.severity || '—'}</Badge></TableCell>
                      <TableCell>{v.unitName || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!safeArray(violations).length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No linked violations for this driver in the current window
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
                  Save penalty rules
                </LoadingButton>
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
                onValueChange={(id) => setForm((f) => ({ ...f, assignedAssetId: id || '' }))}
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
    </AppLayout>
  );
}
