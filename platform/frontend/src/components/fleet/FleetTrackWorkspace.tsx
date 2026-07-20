import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FleetTrackMap, trackPeriodToMinutes, type TrackPeriod } from '@/components/fleet/FleetTrackMap';
import { UnitDetailPanel } from '@/components/fleet/UnitDetailPanel';
import { formatFuelDisplay, type FleetUnit } from '@/lib/fleetUnits';
import { formatTrackDuration } from '@/lib/trackAnalysis';
import { useWialonTrackHistory } from '@/hooks/useWialonTrackHistory';
import { useWialonContext } from '@/hooks/useWialon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Loader2 } from 'lucide-react';

const PERIODS: { id: TrackPeriod; label: string; unit: string }[] = [
  { id: 'hour', label: 'Hours', unit: 'hour(s)' },
  { id: 'day', label: 'Days', unit: 'day(s)' },
  { id: 'week', label: 'Weeks', unit: 'week(s)' },
  { id: 'month', label: 'Months', unit: 'month(s)' },
];

type Props = {
  units: FleetUnit[];
  selectedId?: string | null;
  onSelectId?: (id: string) => void;
  className?: string;
};

export function FleetTrackWorkspace({ units, selectedId, onSelectId, className }: Props) {
  const { connected } = useWialonContext();
  const [period, setPeriod] = useState<TrackPeriod>('day');
  const [amount, setAmount] = useState(1);
  const [q, setQ] = useState('');

  const withPosition = useMemo(() => units.filter((u) => u.lat != null && u.lng != null), [units]);
  const filtered = useMemo(() => {
    const hay = q.trim().toLowerCase();
    // Keep units without GPS in the picker so generators aren't dropped silently.
    const pool = units;
    if (!hay) return pool;
    return pool.filter((u) => `${u.name} ${u.plate || ''}`.toLowerCase().includes(hay));
  }, [units, q]);

  const selected =
    filtered.find((u) => u.id === selectedId) ||
    units.find((u) => u.id === selectedId) ||
    null;

  useEffect(() => {
    // Only auto-pick when nothing is selected and there is a GPS-capable unit.
    if (selectedId || !onSelectId) return;
    const firstWithGps = filtered.find((u) => u.lat != null && u.lng != null) || withPosition[0];
    if (firstWithGps?.id) onSelectId(firstWithGps.id);
  }, [selectedId, filtered, withPosition, onSelectId]);

  const minutes = trackPeriodToMinutes(period, amount);
  const wialonId = selected?.wialonId ?? (selected && Number.isFinite(Number(selected.id)) ? Number(selected.id) : null);
  const liveRecent = minutes <= 24 * 60;
  const { stops, summary, isLoading, isFetching, pointCount } = useWialonTrackHistory(
    wialonId,
    connected && wialonId != null,
    minutes,
    liveRecent
  );

  const rangeLabel = useMemo(() => {
    const mins = minutes;
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) return `${Math.round(mins / 60)} h`;
    if (mins < 10080) return `${Math.round(mins / 1440)} d`;
    return `${Math.round(mins / 10080)} wk`;
  }, [minutes]);

  const trackLoading = isLoading || isFetching;

  return (
    <div className={cn('fleet-card p-0 overflow-hidden monitoring-workspace', className)}>
      <div className="grid h-full grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-3 border-r border-border/60 flex flex-col h-full min-h-0 overflow-hidden">
          <div className="p-2.5 border-b border-border/60 space-y-2 shrink-0">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Time range</Label>
              <div className="flex gap-1.5 mt-1">
                <Select value={period} onValueChange={(v) => setPeriod(v as TrackPeriod)}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  max={period === 'hour' ? 72 : period === 'day' ? 90 : period === 'week' ? 52 : 24}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 w-16 text-xs"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Last {amount} {PERIODS.find((p) => p.id === period)?.unit} (~{rangeLabel})
              </p>
            </div>
            <Input
              placeholder="Search asset…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <ul className="max-h-[28%] lg:max-h-[35%] overflow-auto p-1.5 space-y-0.5 shrink-0 border-b border-border/60">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelectId?.(u.id)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted/50 transition-colors',
                    selected?.id === u.id && 'bg-primary/10 ring-1 ring-primary/25'
                  )}
                >
                  <UnitTypeIcon wialonId={u.wialonId} iconUgi={u.iconUgi} size="sm" title={u.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium line-clamp-2">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFuelDisplay(u)} · {u.plate || u.id}
                    </p>
                  </div>
                  <StatusBadge
                    status={u.status}
                    label={u.motionState}
                    assetCategory={u.assetCategory}
                    stationary={u.stationary}
                    size="sm"
                    showDot={false}
                  />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1 overflow-auto min-h-0 p-2 space-y-3">
            {selected && pointCount > 0 && !trackLoading && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-2 text-[10px] space-y-1">
                <p className="font-semibold text-primary uppercase tracking-wide">Route summary</p>
                <div className="grid grid-cols-2 gap-1 tabular-nums">
                  <span className="text-muted-foreground">GPS points</span>
                  <span className="font-medium text-right">{summary.pointCount}</span>
                  <span className="text-muted-foreground">Stops</span>
                  <span className="font-medium text-right">{summary.stopCount}</span>
                  <span className="text-muted-foreground">Moving</span>
                  <span className="font-medium text-right">{formatTrackDuration(summary.movingSec)}</span>
                  <span className="text-muted-foreground">Idle</span>
                  <span className="font-medium text-right">{formatTrackDuration(summary.idleSec)}</span>
                  <span className="text-muted-foreground">Stopped</span>
                  <span className="font-medium text-right">{formatTrackDuration(summary.stoppedSec)}</span>
                </div>
              </div>
            )}

            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {selected?.stationary ? 'Stops & offline periods' : 'Stops along route'}
            </p>
            {trackLoading && selected && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing route…
              </div>
            )}
            {!trackLoading && selected && pointCount === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No GPS data for this period.</p>
            )}
            {!trackLoading &&
              stops.map((stop, i) => (
                <div
                  key={`${stop.from}-${i}`}
                  className="rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5 mb-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold">{stop.label}</span>
                    <span className="text-muted-foreground tabular-nums">{formatTrackDuration(stop.durationSec)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(stop.from * 1000), 'MMM d, HH:mm')} – {format(new Date(stop.to * 1000), 'HH:mm')}
                  </p>
                </div>
              ))}
            {!trackLoading && stops.length === 0 && pointCount > 0 && (
              <p className="text-xs text-muted-foreground py-2">No long stops detected in this period.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 h-full min-h-0 relative border-r border-border/60">
          <FleetTrackMap unit={selected} period={period} amount={amount} height="100%" />
        </div>

        <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 overflow-hidden">
          <UnitDetailPanel
            unit={selected}
            live
            showControls
            className="h-full border-0 rounded-none shadow-none"
          />
        </div>
      </div>
    </div>
  );
}
