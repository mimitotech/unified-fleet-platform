import { useState } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useRoutes, useRouteStats, useCreateRoute } from '@/hooks/useDomain';
import { useDrivers } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { Route, Clock, Play, CheckCircle, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { WialonRoutesPanel } from '@/components/app/WialonLivePanels';
import type { FleetUnit } from '@/lib/fleetUnits';

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-info/15 text-info' },
  'in-progress': { label: 'In Progress', className: 'bg-success/15 text-success' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/15 text-destructive' },
};

export default function RoutesPage() {
  const { data: routes, isLoading } = useRoutes();
  const { data: stats } = useRouteStats();
  const { data: drivers } = useDrivers();
  const createRoute = useCreateRoute();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<FleetUnit | null>(null);
  const [form, setForm] = useState({
    name: '',
    driverId: '',
    distance: '0',
    estimatedDuration: '60',
    notes: '',
    startTime: new Date().toISOString().slice(0, 16),
  });

  const submit = () => {
    if (!form.name) {
      notify.error('Route name is required');
      return;
    }
    const driver = drivers?.find((d) => d.id === form.driverId);
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
        estimatedDuration: Number(form.estimatedDuration) || 0,
        notes: form.notes || undefined,
        color: 'blue',
      },
      {
        onSuccess: () => {
          notify.success('Route planned');
          setOpen(false);
        },
        onError: (e) => notify.error('Failed', e.message),
      }
    );
  };

  return (
    <AppLayout title="Routes" subtitle="Route planning and tracking">
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
                <Button size="sm" onClick={() => setUnit(null)}>
                  <Plus className="h-4 w-4 mr-1" /> Plan route
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Plan route</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Route name</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Vehicle</Label>
                    <FleetUnitSelect value={unit?.id} onValueChange={(_, u) => setUnit(u)} />
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
                      <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Distance (km)</Label>
                      <Input type="number" value={form.distance} onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label>Est. duration (min)</Label>
                    <Input type="number" value={form.estimatedDuration} onChange={(e) => setForm((f) => ({ ...f, estimatedDuration: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <LoadingButton loading={createRoute.isPending} onClick={submit}>Create route</LoadingButton>
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
                  <TableHead>Distance</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes?.map((r) => {
                  const cfg = statusConfig[r.status] || statusConfig.scheduled;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.assetPlate || r.assetName || '—'}</TableCell>
                      <TableCell>{r.driverName || '—'}</TableCell>
                      <TableCell><Badge className={cfg.className}>{cfg.label}</Badge></TableCell>
                      <TableCell>{r.distance} km</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(r.startTime), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!routes?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No routes yet — plan one above
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
