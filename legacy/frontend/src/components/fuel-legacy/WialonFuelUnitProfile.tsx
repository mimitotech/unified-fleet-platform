import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWialonUnitFuelProfile, useUpdateWialonFuelDetection } from '@/hooks/useWialonFuel';
import { Loader2, Save, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  unitId: number | null;
  unitName?: string;
};

export function WialonFuelUnitProfile({ unitId, unitName }: Props) {
  const { data, isLoading } = useWialonUnitFuelProfile(unitId, unitId != null);
  const updateDetection = useUpdateWialonFuelDetection();
  const [minFill, setMinFill] = useState('');
  const [minTheft, setMinTheft] = useState('');

  if (!unitId) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        Select a vehicle to view fuel configuration.
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const params = (data.settings as { fuelLevelParams?: Record<string, number> }).fuelLevelParams ?? {};
  const math = (data.settings as { fuelConsMath?: Record<string, number> }).fuelConsMath;
  const rates = (data.settings as { fuelConsRates?: Record<string, number> }).fuelConsRates;

  const saveDetection = () => {
    void updateDetection.mutateAsync({
      unitId,
      params: {
        minFillingVolume: minFill ? Number(minFill) : params.minFillingVolume,
        minTheftVolume: minTheft ? Number(minTheft) : params.minTheftVolume,
        flags: params.flags ?? 0x08,
      },
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{unitName || `Unit ${unitId}`} — Fuel profile</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Live fuel" value={data.live?.fuel?.levelFormatted || '—'} tone="good" />
        <Stat label="Trip" value={data.live?.tripStateLabel || '—'} />
        <Stat label="Speed" value={data.live?.speedKmh != null ? `${data.live.speedKmh} km/h` : '—'} />
        <Stat label="Odometer" value={data.live?.mileage != null ? `${Math.round(data.live.mileage)} km` : '—'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculation methods</p>
          <div className="flex flex-wrap gap-1">
            {data.decoded.calcTypes.length
              ? data.decoded.calcTypes.map((l) => (
                  <Badge key={l} variant="secondary" className="text-[10px]">
                    {l}
                  </Badge>
                ))
              : <span className="text-xs text-muted-foreground">Not configured</span>}
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detection flags</p>
          <div className="flex flex-wrap gap-1">
            {data.decoded.levelParams.length
              ? data.decoded.levelParams.map((l) => (
                  <Badge key={l} variant="outline" className="text-[10px]">
                    {l}
                  </Badge>
                ))
              : <span className="text-xs text-muted-foreground">Default</span>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <p className="text-xs font-semibold mb-2">Consumption settings</p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div><span className="text-muted-foreground">Idle</span><p className="font-medium">{math?.idling ?? '—'} L/h</p></div>
          <div><span className="text-muted-foreground">Urban</span><p className="font-medium">{math?.urban ?? '—'} L/100km</p></div>
          <div><span className="text-muted-foreground">Suburban</span><p className="font-medium">{math?.suburban ?? '—'} L/100km</p></div>
          <div><span className="text-muted-foreground">Summer rate</span><p className="font-medium">{rates?.consSummer ?? '—'} L/100km</p></div>
          <div><span className="text-muted-foreground">Winter rate</span><p className="font-medium">{rates?.consWinter ?? '—'} L/100km</p></div>
        </div>
      </div>

      {data.live?.fuel?.sensors?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sensor</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Filtered</TableHead>
              <TableHead>Filled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.live.fuel.sensors.map((s) => (
              <TableRow key={s.sensorId}>
                <TableCell>{s.name || s.sensorId}</TableCell>
                <TableCell className="font-semibold">{s.valueFormatted || s.value || '—'}</TableCell>
                <TableCell>{s.level != null ? `${s.level} L` : '—'}</TableCell>
                <TableCell>{s.filled != null && s.filled > 0 ? `+${s.filled} L` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
        <p className="text-xs font-semibold">Update fill/theft detection (unit/update_fuel_level_params)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px]">Min filling volume (L)</Label>
            <Input
              className="h-8 mt-1"
              placeholder={String(params.minFillingVolume ?? 20)}
              value={minFill}
              onChange={(e) => setMinFill(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px]">Min theft volume (L)</Label>
            <Input
              className="h-8 mt-1"
              placeholder={String(params.minTheftVolume ?? 10)}
              value={minTheft}
              onChange={(e) => setMinTheft(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={saveDetection} disabled={updateDetection.isPending}>
          {updateDetection.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save detection params
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2', tone === 'good' && 'border-status-moving/30 bg-status-moving/5')}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function WialonFuelUnitPicker({
  units,
  value,
  onChange,
}: {
  units: Array<{ id: string; wialonId?: number; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[220px]">
        <SelectValue placeholder="Select vehicle" />
      </SelectTrigger>
      <SelectContent>
        {units.map((u) => (
          <SelectItem key={u.id} value={String(u.wialonId ?? u.id)}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
