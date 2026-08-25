import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import {
  useCreateRoute,
  useDrivers,
  useRoutes,
  useRouteStats,
  useTrips,
  useUpdateRoute,
} from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { clientApi, type RouteCheckpoint } from '@/lib/api';
import { Route, Clock, Play, CheckCircle, Plus, FileText, Trash2, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { WialonRoutesPanel } from '@/components/app/WialonLivePanels';
import type { FleetUnit } from '@/lib/fleetUnits';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericModuleReports } from '@/components/reports/moduleReportPanels';
import { safeArray } from '@/lib/safeArray';
import { CHART } from '@/lib/chartColors';

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-info/15 text-info' },
  'in-progress': { label: 'In Progress', className: 'bg-success/15 text-success' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/15 text-destructive' },
};

function emptyCheckpoint(): RouteCheckpoint {
  return {
    id: crypto.randomUUID(),
    name: '',
    arrivalTime: '',
    departureTime: '',
    address: '',
  };
}

function durationFromCheckpoints(checkpoints: RouteCheckpoint[]): number {
  const times: number[] = [];
  for (const cp of checkpoints) {
    for (const key of ['arrivalTime', 'departureTime'] as const) {
      const raw = cp[key];
      if (!raw) continue;
      const t = new Date(raw).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
  }
  if (times.length < 2) return 0;
  times.sort((a, b) => a - b);
  return Math.max(0, Math.round((times[times.length - 1] - times[0]) / 60000));
}

export default function RoutesPage() {
  const qc = useQueryClient();
  const { data: routes, isLoading } = useRoutes();
  const { data: stats } = useRouteStats();
  const { data: drivers } = useDrivers();
  const { data: trips } = useTrips(40);
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<FleetUnit | null>(null);
  const [checkpoints, setCheckpoints] = useState<RouteCheckpoint[]>([
    emptyCheckpoint(),
    emptyCheckpoint(),
  ]);
  const [form, setForm] = useState({
    name: '',
    driverId: '',
    distance: '0',
    estimatedDuration: '60',
    notes: '',
    startTime: new Date().toISOString().slice(0, 16),
  });

  const autoDuration = useMemo(() => durationFromCheckpoints(checkpoints), [checkpoints]);

  const fromTrip = useMutation({
    mutationFn: (tripId: string) => clientApi.createRouteFromTrip(tripId),
    onSuccess: () => {
      notify.success('Route created from trip history');
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['routeStats'] });
    },
    onError: (e) => notify.error('Could not create route', (e as Error).message),
  });

  const submit = () => {
    if (!form.name) {
      notify.error('Route name is required');
      return;
    }
    const driver = drivers?.find((d) => d.id === form.driverId);
    const cleaned = checkpoints
      .map((c) => ({
        ...c,
        name: c.name.trim() || 'Checkpoint',
        arrivalTime: c.arrivalTime || null,
        departureTime: c.departureTime || null,
      }))
      .filter((c) => c.name);
    const duration = Number(form.estimatedDuration) || autoDuration || 0;
    createRoute.mutate(
      {
        name: form.name,
        status: 'scheduled',
        assetId: unit?.id,
        assetName: unit?.name,
        assetPlate: unit?.plate,
        driverId: driver?.id,
        driverName: driver?.name,
        startTime: new Date(form.startTime).toISOString(),
        distance: Number(form.distance) || 0,
        estimatedDuration: duration,
        notes: form.notes || undefined,
        color: 'blue',
        waypoints: cleaned,
      },
      {
        onSuccess: () => {
          notify.success('Route planned');
          setOpen(false);
          setCheckpoints([emptyCheckpoint(), emptyCheckpoint()]);
        },
        onError: (e) => notify.error('Failed', e.message),
      }
    );
  };

  return (
    <AppLayout title="Routes" subtitle="Plan routes with checkpoints, or create from trip history">
      <Tabs defaultValue="routes" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-3.5 w-3.5" />
            From trips
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="routes" className="mt-0 space-y-6">
          <div className="space-y-6">
            <WialonRoutesPanel />
            <div className="stat-strip-4">
              <MetricCard title="Total Routes" value={stats?.total ?? 0} icon={Route} variant="primary" size="xxs" />
              <MetricCard title="In Progress" value={stats?.inProgress ?? 0} icon={Play} variant="success" size="xxs" />
              <MetricCard title="Scheduled" value={stats?.scheduled ?? 0} icon={Clock} variant="info" size="xxs" />
              <MetricCard title="Completed" value={stats?.completed ?? 0} icon={CheckCircle} variant="default" size="xxs" />
            </div>

            <div className="fleet-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Active & Scheduled Routes</h3>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => {
                        setUnit(null);
                        setCheckpoints([emptyCheckpoint(), emptyCheckpoint()]);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Plan route
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Plan route with checkpoints</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Route name</Label>
                        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Vehicle</Label>
                        <FleetUnitSelect value={unit?.id} onValueChange={(_, u) => setUnit(u || undefined)} />
                      </div>
                      <div>
                        <Label>Driver</Label>
                        <Select value={form.driverId} onValueChange={(v) => setForm((f) => ({ ...f, driverId: v }))}>
                          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                          <SelectContent>
                            {(drivers || []).map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Start</Label>
                          <Input
                            type="datetime-local"
                            value={form.startTime}
                            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Distance (km)</Label>
                          <Input
                            type="number"
                            value={form.distance}
                            onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">Checkpoints</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setCheckpoints((c) => [...c, emptyCheckpoint()])}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add point
                          </Button>
                        </div>
                        {checkpoints.map((cp, idx) => (
                          <div key={cp.id || idx} className="grid grid-cols-1 gap-2 rounded-md bg-muted/40 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <Input
                                placeholder={`Checkpoint ${idx + 1} name`}
                                value={cp.name}
                                onChange={(e) =>
                                  setCheckpoints((list) =>
                                    list.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row))
                                  )
                                }
                              />
                              {checkpoints.length > 1 && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setCheckpoints((list) => list.filter((_, i) => i !== idx))}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Arrival</Label>
                                <Input
                                  type="datetime-local"
                                  value={cp.arrivalTime || ''}
                                  onChange={(e) =>
                                    setCheckpoints((list) =>
                                      list.map((row, i) =>
                                        i === idx ? { ...row, arrivalTime: e.target.value } : row
                                      )
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Departure</Label>
                                <Input
                                  type="datetime-local"
                                  value={cp.departureTime || ''}
                                  onChange={(e) =>
                                    setCheckpoints((list) =>
                                      list.map((row, i) =>
                                        i === idx ? { ...row, departureTime: e.target.value } : row
                                      )
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                          Auto duration from checkpoint times:{' '}
                          <span className="font-semibold text-foreground">{autoDuration || 0} min</span>
                        </p>
                      </div>

                      <div>
                        <Label>Est. duration (min)</Label>
                        <Input
                          type="number"
                          value={form.estimatedDuration}
                          onChange={(e) => setForm((f) => ({ ...f, estimatedDuration: e.target.value }))}
                          placeholder={String(autoDuration || 60)}
                        />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                      </div>
                    </div>
                    <DialogFooter>
                      <LoadingButton loading={createRoute.isPending} onClick={submit}>
                        Create route
                      </LoadingButton>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
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
                      <TableHead>Checkpoints</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes?.map((r) => {
                      const cfg = statusConfig[r.status] || statusConfig.scheduled;
                      const points = Array.isArray(r.waypoints) ? r.waypoints : [];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.assetPlate || r.assetName || '—'}</TableCell>
                          <TableCell>{r.driverName || '—'}</TableCell>
                          <TableCell><Badge className={cfg.className}>{cfg.label}</Badge></TableCell>
                          <TableCell>{points.length || '—'}</TableCell>
                          <TableCell>{r.estimatedDuration || 0} min</TableCell>
                          <TableCell>{r.distance} km</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(r.startTime), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="space-x-1">
                            {r.status === 'scheduled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateRoute.mutate(
                                    { id: r.id, data: { status: 'in-progress', actualStartTime: new Date().toISOString() } },
                                    {
                                      onSuccess: () => notify.success('Route started'),
                                      onError: (e) => notify.error('Update failed', e.message),
                                    }
                                  )
                                }
                              >
                                Start
                              </Button>
                            )}
                            {r.status === 'in-progress' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateRoute.mutate(
                                    { id: r.id, data: { status: 'completed', endTime: new Date().toISOString() } },
                                    {
                                      onSuccess: () => notify.success('Route completed'),
                                      onError: (e) => notify.error('Update failed', e.message),
                                    }
                                  )
                                }
                              >
                                Complete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!routes?.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No routes yet — plan one above or create from trip history
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-0 space-y-4">
          <div className="fleet-card">
            <h3 className="font-semibold mb-2">Create route from trip history / track playback</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Uses departure and arrival from synced Wialon trips as the first and last checkpoints.
              Total duration is calculated from those times.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Departed</TableHead>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(trips || []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.unitName}</TableCell>
                    <TableCell className="text-xs">{new Date(t.departureTime).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{new Date(t.arrivalTime).toLocaleString()}</TableCell>
                    <TableCell>{t.mileage} km</TableCell>
                    <TableCell>{Math.round((t.duration || 0) / 60)} min</TableCell>
                    <TableCell>
                      <LoadingButton
                        size="sm"
                        loading={fromTrip.isPending}
                        onClick={() => fromTrip.mutate(t.id)}
                      >
                        Create route
                      </LoadingButton>
                    </TableCell>
                  </TableRow>
                ))}
                {!trips?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No trip history yet — wait for domain sync or open Monitoring / track playback
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <GenericModuleReports
            moduleLabel="Routes"
            title="Routes executive"
            blurb="Planned and active routes for operations."
            kpis={[
              { label: 'Total', value: stats?.total ?? safeArray(routes).length },
              { label: 'Active', value: stats?.inProgress ?? 0 },
              { label: 'Scheduled', value: stats?.scheduled ?? 0 },
              { label: 'Completed', value: stats?.completed ?? 0 },
            ]}
            columns={[
              { key: 'name', label: 'Route' },
              { key: 'asset', label: 'Asset' },
              { key: 'status', label: 'Status' },
              { key: 'distance', label: 'Distance', align: 'right' },
            ]}
            rows={(safeArray(routes) as Array<{ name?: string; assetPlate?: string; assetName?: string; status?: string; distance?: number }>).map((r) => ({
              name: r.name || '—',
              asset: r.assetPlate || r.assetName || '—',
              status: r.status || '—',
              distance: `${r.distance ?? 0} km`,
              distanceKm: r.distance ?? 0,
            }))}
            charts={{
              heading: 'Asset performance · route analytics',
              categoryKey: 'name',
              bar: {
                title: 'Distance by route',
                subtitle: 'Standing bars — planned / recorded kilometres',
                metrics: [{ key: 'distanceKm', label: 'Distance (km)', color: CHART.brand }],
                topN: 8,
              },
              secondary: {
                type: 'category',
                title: 'Route status mix',
                subtitle: 'Share of routes by operational status',
                groupKey: 'status',
                as: 'pie',
              },
            }}
          />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
