import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { FleetTrackMap, trackPeriodToMinutes, type TrackPeriod } from '@/components/fleet/FleetTrackMap';
import { formatFuelDisplay, type FleetUnit } from '@/lib/fleetUnits';
import { formatTrackDuration, TRIP_LINE_COLORS, ROUTE_LINE_COLOR } from '@/lib/trackAnalysis';
import { useWialonTrackHistory, type TrackTimeRange } from '@/hooks/useWialonTrackHistory';
import { useWialonContext } from '@/hooks/useWialon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { Loader2, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

const PERIODS: { id: TrackPeriod; label: string; unit: string }[] = [
  { id: 'hour', label: 'Hours', unit: 'h' },
  { id: 'day', label: 'Days', unit: 'd' },
  { id: 'week', label: 'Weeks', unit: 'w' },
  { id: 'month', label: 'Months', unit: 'mo' },
];

const SPEEDS = [1, 2, 4, 8, 16, 32, 100] as const;

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80 px-0.5">
      {children}
    </p>
  );
}

type Props = {
  units: FleetUnit[];
  selectedId?: string | null;
  onSelectId?: (id: string) => void;
  className?: string;
};

export function FleetTrackWorkspace({ units, selectedId, onSelectId, className }: Props) {
  const { connected } = useWialonContext();
  const [rangeMode, setRangeMode] = useState<'relative' | 'absolute'>('relative');
  const [period, setPeriod] = useState<TrackPeriod>('day');
  const [amount, setAmount] = useState(1);
  const [fromDate, setFromDate] = useState(() => shiftDays(todayIso(), -1));
  const [toDate, setToDate] = useState(() => todayIso());
  const [q, setQ] = useState('');
  const [playIndex, setPlayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [focusStop, setFocusStop] = useState<{ lat: number; lng: number } | null>(null);
  const [liveUpdates, setLiveUpdates] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const withPosition = useMemo(() => units.filter((u) => u.lat != null && u.lng != null), [units]);
  const filtered = useMemo(() => {
    const hay = q.trim().toLowerCase();
    if (!hay) return units;
    return units.filter((u) => `${u.name} ${u.plate || ''}`.toLowerCase().includes(hay));
  }, [units, q]);

  const selected =
    filtered.find((u) => u.id === selectedId) ||
    units.find((u) => u.id === selectedId) ||
    null;

  useEffect(() => {
    if (selectedId || !onSelectId) return;
    const firstWithGps = filtered.find((u) => u.lat != null && u.lng != null) || withPosition[0];
    if (firstWithGps?.id) onSelectId(firstWithGps.id);
  }, [selectedId, filtered, withPosition, onSelectId]);

  const minutes = trackPeriodToMinutes(period, amount);
  const timeRange: TrackTimeRange = useMemo(() => {
    if (rangeMode === 'absolute') {
      const fromMs = new Date(`${fromDate}T00:00:00`).getTime();
      const toMs = new Date(`${toDate}T23:59:59`).getTime();
      return { mode: 'absolute', fromMs, toMs };
    }
    return { mode: 'relative', minutes };
  }, [rangeMode, minutes, fromDate, toDate]);

  const wialonId = selected?.wialonId ?? (selected && Number.isFinite(Number(selected.id)) ? Number(selected.id) : null);
  const canLive = rangeMode === 'relative' && minutes <= 60;
  const liveRecent = liveUpdates && canLive;
  const history = useWialonTrackHistory(
    wialonId,
    connected && wialonId != null,
    timeRange,
    liveRecent,
  );

  const { stops, summary, isLoading, isFetching, isError, errorMessage, pointCount, points, trips, useTripColors, refetch } =
    history;

  const fitKey = useMemo(
    () => `${wialonId ?? 'none'}|${rangeMode === 'absolute' ? `${fromDate}:${toDate}` : `rel:${minutes}`}`,
    [wialonId, rangeMode, fromDate, toDate, minutes],
  );

  const trackLoading = isLoading && pointCount === 0;

  useEffect(() => {
    setPlaying(false);
    setPlayIndex(0);
    setFocusStop(null);
  }, [selected?.id, timeRange]);

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const id = window.setInterval(() => {
      setPlayIndex((i) => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return points.length - 1;
        }
        return i + 1;
      });
    }, Math.max(40, 320 / playSpeed));
    return () => window.clearInterval(id);
  }, [playing, points.length, playSpeed]);

  const playhead = points[playIndex] ?? null;

  const tripRows = useMemo(() => {
    return trips.slice(0, 24).map((t, i) => {
      const fromBlock = t.from as Record<string, unknown> | undefined;
      const toBlock = t.to as Record<string, unknown> | undefined;
      const from = Number(t.t1 ?? fromBlock?.t ?? t.begin ?? 0);
      const to = Number(t.t2 ?? toBlock?.t ?? t.end ?? 0);
      const mileage = Number(t.mileage ?? t.distance ?? t.m ?? 0);
      const mileageKm = mileage > 500 ? mileage / 1000 : mileage;
      return {
        i,
        color: TRIP_LINE_COLORS[i % TRIP_LINE_COLORS.length],
        from,
        to,
        mileage: mileageKm,
        label: `Trip ${i + 1}`,
      };
    });
  }, [trips]);

  const playheadParams = useMemo(() => {
    const raw = playhead?.params;
    if (!raw) return [] as Array<{ key: string; value: string }>;
    return Object.entries(raw)
      .filter(([, v]) => v !== '' && v != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        value: typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value),
      }));
  }, [playhead]);

  const jumpToTrip = useCallback(
    (fromTs: number) => {
      if (!points.length) return;
      let best = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].time - fromTs);
        if (d < bestDiff) {
          bestDiff = d;
          best = i;
        }
      }
      setPlayIndex(best);
      setPlaying(false);
    },
    [points],
  );

  useEffect(() => {
    if (!focusStop) return;
    const t = window.setTimeout(() => setFocusStop(null), 800);
    return () => window.clearTimeout(t);
  }, [focusStop]);

  const rangeLabel = useMemo(() => {
    if (rangeMode === 'absolute') return `${fromDate} → ${toDate}`;
    const mins = minutes;
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) return `${Math.round(mins / 60)} h`;
    if (mins < 10080) return `${Math.round(mins / 1440)} d`;
    return `${Math.round(mins / 10080)} wk`;
  }, [rangeMode, fromDate, toDate, minutes]);

  const leftPanel = (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Interval controls */}
      <div className="shrink-0 border-b border-border/50 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Interval</SectionTitle>
          <span className="text-[10px] text-muted-foreground tabular-nums truncate">{rangeLabel}</span>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/50 p-0.5">
          <button
            type="button"
            className={cn(
              'h-7 rounded text-[11px] font-medium transition-colors',
              rangeMode === 'relative' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setRangeMode('relative')}
          >
            Relative
          </button>
          <button
            type="button"
            className={cn(
              'h-7 rounded text-[11px] font-medium transition-colors',
              rangeMode === 'absolute' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setRangeMode('absolute')}
          >
            Interval
          </button>
        </div>

        {rangeMode === 'relative' ? (
          <div className="flex gap-1.5">
            <Select value={period} onValueChange={(v) => setPeriod(v as TrackPeriod)}>
              <SelectTrigger className="h-8 flex-1 text-[11px]">
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
              className="h-8 w-14 text-[11px] text-center tabular-nums px-1"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <div className="min-w-0">
              <Label className="text-[9px] text-muted-foreground">From</Label>
              <Input
                type="date"
                className="h-8 text-[11px] mt-0.5 px-1.5"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label className="text-[9px] text-muted-foreground">To</Label>
              <Input
                type="date"
                className="h-8 text-[11px] mt-0.5 px-1.5"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
        )}

        <Button
          type="button"
          size="sm"
          className="h-8 w-full text-[11px] font-semibold"
          disabled={!selected || !connected || isFetching}
          onClick={() => refetch()}
        >
          {isFetching ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Loading…
            </>
          ) : (
            'Show track'
          )}
        </Button>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <label
            className={cn(
              'inline-flex items-center gap-1.5 text-[10px] select-none',
              canLive ? 'text-muted-foreground cursor-pointer' : 'text-muted-foreground/40',
            )}
          >
            <input
              type="checkbox"
              className="size-3 rounded border-border"
              checked={liveUpdates && canLive}
              disabled={!canLive}
              onChange={(e) => setLiveUpdates(e.target.checked)}
            />
            Live ≤1h
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setMapExpanded((v) => !v)}
          >
            {mapExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {mapExpanded ? 'Restore' : 'Expand'}
          </button>
        </div>
        {!connected && (
          <p className="text-[10px] text-amber-700 leading-snug">Wialon link idle — connect in Admin.</p>
        )}
      </div>

      {/* Units */}
      <div className="shrink-0 border-b border-border/50 flex flex-col max-h-[34%] min-h-[7.5rem]">
        <div className="px-3 pt-2 pb-1.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <SectionTitle>Units</SectionTitle>
            <span className="text-[10px] text-muted-foreground tabular-nums">{filtered.length}</span>
          </div>
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-7 text-[11px]"
          />
        </div>
        <ul className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-0.5 min-h-0">
          {filtered.map((u) => {
            const active = selected?.id === u.id;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelectId?.(u.id)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    active ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/60',
                  )}
                >
                  <UnitTypeIcon wialonId={u.wialonId} iconUgi={u.iconUgi} size="sm" title={u.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate leading-tight">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                      {formatFuelDisplay(u)}
                      {u.plate ? ` · ${u.plate}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-[9px] font-medium uppercase tracking-wide',
                      u.status === 'moving' && 'text-status-moving',
                      u.status === 'idle' && 'text-status-idle',
                      u.status === 'stopped' && 'text-status-stopped',
                      u.status === 'offline' && 'text-muted-foreground',
                    )}
                  >
                    {u.motionState || u.status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Route results */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-3">
        {trackLoading && selected && (
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground py-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analysing route…
          </div>
        )}

        {isError && selected && (
          <div className="rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 space-y-1.5">
            <p className="text-[11px] font-medium text-destructive">Could not load track</p>
            <p className="text-[10px] text-muted-foreground leading-snug break-words">
              {errorMessage || 'Wialon request failed'}
            </p>
            <Button type="button" size="sm" variant="outline" className="h-7 w-full text-[11px]" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isError && !trackLoading && selected && pointCount === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-6 px-2 leading-relaxed">
            No GPS points for this period. Adjust the interval and press Show track.
          </p>
        )}

        {selected && pointCount > 0 && !trackLoading && (
          <div className="space-y-1.5">
            <SectionTitle>Summary</SectionTitle>
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: 'Distance', value: `${summary.distanceKm} km` },
                { label: 'Points', value: String(summary.pointCount) },
                { label: 'Stops', value: String(summary.stopCount) },
                { label: 'Moving', value: formatTrackDuration(summary.movingSec) },
                { label: 'Idle', value: formatTrackDuration(summary.idleSec) },
                { label: 'Stopped', value: formatTrackDuration(summary.stoppedSec) },
              ].map((cell) => (
                <div key={cell.label} className="rounded-md bg-muted/40 px-1.5 py-1.5 text-center min-w-0">
                  <p className="text-[9px] text-muted-foreground truncate">{cell.label}</p>
                  <p className="text-[11px] font-semibold tabular-nums truncate mt-0.5">{cell.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {useTripColors && tripRows.length > 0 && (
          <div className="space-y-1.5">
            <SectionTitle>Trips · {tripRows.length}</SectionTitle>
            <div className="space-y-0.5">
              {tripRows.map((trip) => (
                <button
                  key={trip.i}
                  type="button"
                  onClick={() => jumpToTrip(trip.from)}
                  className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="h-2 w-2.5 rounded-sm shrink-0" style={{ background: trip.color }} />
                  <span className="text-[11px] font-medium shrink-0">{trip.label}</span>
                  <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                    {trip.from > 0 ? format(new Date(trip.from * 1000), 'dd MMM HH:mm') : '—'}
                    {trip.to > 0 ? `–${format(new Date(trip.to * 1000), 'HH:mm')}` : ''}
                  </span>
                  {trip.mileage > 0 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                      {Math.round(trip.mileage * 10) / 10} km
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {!trackLoading && !isError && pointCount > 0 && (
          <div className="space-y-1.5">
            <SectionTitle>
              {selected?.stationary ? 'Stops & offline' : 'Stops'} · {stops.length}
            </SectionTitle>
            {stops.length === 0 ? (
              <p className="text-[10px] text-muted-foreground px-0.5">No long stops in this period.</p>
            ) : (
              <div className="space-y-0.5">
                {stops.map((stop, i) => (
                  <button
                    key={`${stop.from}-${i}`}
                    type="button"
                    onClick={() => {
                      setFocusStop({ lat: stop.lat, lng: stop.lng });
                      jumpToTrip(stop.from);
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-[11px] font-medium shrink-0 w-14 truncate">{stop.label}</span>
                    <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                      {format(new Date(stop.from * 1000), 'dd MMM HH:mm')}–{format(new Date(stop.to * 1000), 'HH:mm')}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                      {formatTrackDuration(stop.durationSec)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const rightPanel = (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {pointCount > 0 && playhead ? (
        <>
          <div className="shrink-0 border-b border-border/50 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: ROUTE_LINE_COLOR }} />
              <p className="text-[12px] font-semibold truncate">{selected?.name}</p>
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {format(new Date(playhead.time * 1000), 'dd.MM.yyyy HH:mm:ss')}
            </p>
            <p className="text-[11px] font-medium tabular-nums">
              {Math.round(playhead.speed)} km/h
              {playhead.course != null ? ` · ${Math.round(playhead.course)}°` : ''}
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
            <SectionTitle>Parameters</SectionTitle>
            {playheadParams.length > 0 ? (
              <div className="mt-1.5 divide-y divide-border/40">
                {playheadParams.map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-[10px] text-muted-foreground font-mono truncate min-w-0">{row.key}</span>
                    <span className="text-[10px] font-mono tabular-nums text-foreground shrink-0">{row.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                No sensor parameters on this point. Scrub the player to find IO values.
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground tabular-nums">
            {playIndex + 1} / {points.length}
          </div>
        </>
      ) : (
        <div className="flex flex-col h-full min-h-0 px-3 py-3">
          <SectionTitle>Unit</SectionTitle>
          {selected ? (
            <div className="mt-2 space-y-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <UnitTypeIcon
                  wialonId={selected.wialonId}
                  iconUgi={selected.iconUgi}
                  size="sm"
                  title={selected.name}
                />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold leading-snug break-words">{selected.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {selected.plate || selected.id}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize mt-0.5">{selected.motionState || selected.status}</p>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Fuel</p>
                  <p className="font-medium mt-0.5 truncate">{formatFuelDisplay(selected)}</p>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Speed</p>
                  <p className="font-medium tabular-nums mt-0.5">{Math.round(selected.speed ?? 0)} km/h</p>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Online</p>
                  <p className="font-medium mt-0.5">{selected.status === 'offline' ? 'No' : 'Yes'}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
                Choose an interval and press <span className="font-medium text-foreground">Show track</span> to load the route and playback parameters.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-4 text-center">Select a unit to begin.</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'fleet-card p-0 overflow-hidden monitoring-workspace monitoring-workspace-track',
        mapExpanded && 'monitoring-workspace-track-expanded',
        className,
      )}
    >
      <div
        className={cn(
          'grid h-full min-h-0',
          mapExpanded
            ? 'grid-cols-1'
            : 'grid-cols-1 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(240px,280px)]',
        )}
      >
        {/* Left rail */}
        <aside
          className={cn(
            'border-r border-border/50 min-h-0 overflow-hidden',
            mapExpanded ? 'hidden' : 'hidden lg:block',
          )}
        >
          {leftPanel}
        </aside>

        {/* Map + player */}
        <section className="relative flex flex-col h-full min-h-0 min-w-0">
          <div className="flex-1 min-h-0 relative">
            <FleetTrackMap
              unit={selected}
              history={history}
              liveRecent={liveRecent}
              height="100%"
              playhead={playhead}
              focusPoint={focusStop}
              fitKey={fitKey}
            />
            {mapExpanded && (
              <div className="absolute top-2 left-2 right-2 z-[600] flex items-start justify-between gap-2 pointer-events-none">
                <div className="pointer-events-auto max-w-[min(100%,320px)] w-full rounded-lg border border-border/60 bg-card/95 shadow-md overflow-hidden max-h-[min(70vh,520px)] flex flex-col">
                  {leftPanel}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="pointer-events-auto h-8 text-xs shadow-md shrink-0"
                  onClick={() => setMapExpanded(false)}
                >
                  <Minimize2 className="h-3.5 w-3.5 mr-1.5" />
                  Restore layout
                </Button>
              </div>
            )}
            {mapExpanded && pointCount > 0 && playhead && (
              <div className="absolute top-12 right-2 z-[600] w-[min(100%,260px)] max-h-[min(55vh,420px)] rounded-lg border border-border/60 bg-card/95 shadow-md overflow-hidden pointer-events-auto">
                {rightPanel}
              </div>
            )}
          </div>

          {selected && pointCount > 1 && (
            <div className="shrink-0 border-t border-border/50 bg-card px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setPlayIndex(0)}
                  aria-label="Restart"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setPlayIndex(Math.min(points.length - 1, playIndex + 10))}
                  aria-label="Skip forward"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </Button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, points.length - 1)}
                  value={playIndex}
                  onChange={(e) => {
                    setPlaying(false);
                    setPlayIndex(Number(e.target.value));
                  }}
                  className="flex-1 accent-primary h-1.5"
                />
                <Select
                  value={String(playSpeed)}
                  onValueChange={(v) => setPlaySpeed(Number(v) as (typeof SPEEDS)[number])}
                >
                  <SelectTrigger className="h-7 w-[64px] text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEEDS.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>
                  {playhead ? format(new Date(playhead.time * 1000), 'dd MMM, HH:mm:ss') : '—'}
                </span>
                <span>
                  {Math.round(playhead?.speed ?? 0)} km/h · {playIndex + 1}/{points.length}
                </span>
              </div>
              {useTripColors && tripRows.length > 0 && (
                <div className="flex h-1 w-full overflow-hidden rounded-full bg-muted">
                  {tripRows.map((trip) => (
                    <div
                      key={trip.i}
                      className="h-full"
                      style={{ background: trip.color, width: `${100 / tripRows.length}%` }}
                      title={trip.label}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right rail */}
        <aside
          className={cn(
            'border-l border-border/50 min-h-0 overflow-hidden',
            mapExpanded ? 'hidden' : 'hidden lg:block',
          )}
        >
          {rightPanel}
        </aside>

        {/* Mobile: filters under map */}
        <div className="lg:hidden border-t border-border/50 max-h-[42%] overflow-hidden">
          {leftPanel}
        </div>
      </div>
    </div>
  );
}
