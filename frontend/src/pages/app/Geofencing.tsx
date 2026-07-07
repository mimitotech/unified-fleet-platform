import { useState } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { useGeofences, useCreateGeofence, useDeleteGeofence } from '@/hooks/useDomain';
import { useCreateWialonGeofence } from '@/hooks/useWialonLive';
import { useWialonContext } from '@/hooks/useWialon';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { WialonGeofencesLivePanel } from '@/components/app/WialonLivePanels';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Geofencing() {
  const { data: geofences, isLoading } = useGeofences();
  const createGeofence = useCreateGeofence();
  const deleteGeofence = useDeleteGeofence();
  const createWialon = useCreateWialonGeofence();
  const { connected } = useWialonContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [syncWialon, setSyncWialon] = useState(true);
  const [form, setForm] = useState({
    name: '',
    type: 'circle',
    lat: '0.3476',
    lng: '32.5825',
    radius: '200',
    color: '#3B82F6',
  });

  const submit = () => {
    if (!form.name) {
      notify.error('Name is required');
      return;
    }
    const center = { lat: parseFloat(form.lat), lng: parseFloat(form.lng) };
    const radius = parseFloat(form.radius) || 200;
    const payload = {
      name: form.name,
      type: form.type,
      center,
      radius,
      color: form.color,
      isActive: true,
    };
    createGeofence.mutate(payload, {
      onSuccess: () => {
        notify.success('Geofence created in MAMS');
        if (connected && syncWialon) {
          createWialon.mutate(
            { name: form.name, type: 'circle', center, radius },
            {
              onSuccess: () => {
                notify.success('Zone pushed to Wialon');
                qc.invalidateQueries({ queryKey: ['wialon-geofences-live'] });
              },
              onError: (e) => notify.error('Wialon sync failed', e.message),
            }
          );
        }
        setOpen(false);
      },
      onError: (e) => notify.error('Failed', e.message),
    });
  };

  return (
    <AppLayout title="Geofencing" subtitle="Geographic zones and alerts">
      <WialonContextBanner />
      <div className="flex justify-end mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create zone</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create geofence</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="polygon">Polygon (center only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Latitude</Label>
                  <Input value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Radius (m)</Label>
                  <Input value={form.radius} onChange={(e) => setForm((f) => ({ ...f, radius: e.target.value }))} />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              {connected && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={syncWialon} onChange={(e) => setSyncWialon(e.target.checked)} />
                  Also create in Wialon (real-time)
                </label>
              )}
            </div>
            <DialogFooter>
              <LoadingButton loading={createGeofence.isPending || createWialon.isPending} onClick={submit}>
                Create
              </LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <WialonGeofencesLivePanel />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {geofences?.map((g) => (
            <div key={g.id} className="fleet-card flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${g.color}22` }}
              >
                <MapPin className="w-5 h-5" style={{ color: g.color }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{g.name}</h3>
                  <Badge variant={g.isActive ? 'default' : 'secondary'}>
                    {g.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground capitalize">{g.type} zone</p>
                {g.radius && (
                  <p className="text-xs text-muted-foreground mt-1">Radius: {g.radius}m</p>
                )}
                {g.center && (
                  <p className="text-xs text-muted-foreground">
                    {g.center.lat.toFixed(4)}, {g.center.lng.toFixed(4)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive"
                onClick={() =>
                  deleteGeofence.mutate(g.id, {
                    onSuccess: () => notify.success('Geofence removed'),
                    onError: (e) => notify.error('Delete failed', e.message),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!geofences?.length && (
            <p className="text-muted-foreground col-span-full text-center py-12">
              No geofences configured — create one above
            </p>
          )}
        </div>
      )}
    </AppLayout>
  );
}
