import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FleetTrackMap, trackPeriodToMinutes, type TrackPeriod } from '@/components/fleet/FleetTrackMap';
import { UnitDetailPanel } from '@/components/fleet/UnitDetailPanel';
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
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

const PERIODS: { id: TrackPeriod; label: string; unit: string }[] = [
  { id: 'hour', label: 'Hours', unit: 'hour(s)' },
  { id: 'day', label: 'Days', unit: 'day(s)' },
  { id: 'week', label: 'Weeks', unit: 'week(s)' },
  { id: 'month', label: 'Months', unit: 'month(s)' },
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

  const withPosition = useMemo(() => units.filter((u) => u.lat != null && u.lng != null), [units]);
  const filtered = useMemo(() => {
    const hay = q.trim().toLowerCase();
    const pool = units;
    if (!hay) return pool;
    return pool.filter((u) => `${u.name} ${u.plate || ''}`.toLowerCase().includes(hay));
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
  const liveRecent = rangeMode === 'relative' && minutes <= 24 * 60;
  const history = useWialonTrackHistory(
    wialonId,
    connected && wialonId != null,
    timeRange,
    liveRecent,
  );

  const { stops, summary, isLoading, isFetching, isError, errorMessage, pointCount, points, trips, useTripColors, refetch } =
    history;

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

  const trackLoading = isLoading || isFetching;

  return (
    <div className={cn('fleet-card p-0 overflow-hidden monitoring-workspace', className)}>
      <div className="grid h-full grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-3 border-r border-border/60 flex flex-col h-full min-h-0 overflow-hidden">
          <div className="p-2.5 border-b border-border/60 space-y-2 shrink-0">
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={rangeMode === 'relative' ? 'default' : 'outline'}
                className="h-7 flex-1 text-[11px]"
                onClick={() => setRangeMode('relative')}
              >
                Relative
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rangeMode === 'absolute' ? 'default' : 'outline'}
                className="h-7 flex-1 text-[11px]"
                onClick={() => setRangeMode('absolute')}
              >
                Interval
              </Button>
            </div>

            {rangeMode === 'relative' ? (
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
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-[10px] text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs mt-0.5"
                    value={fromDate}
                    max={toDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs mt-0.5"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <Input
              placeholder="Search asset…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={!selected || !connected || trackLoading}
              onClick={() => refetch()}
            >
              {trackLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Loading track…
                </>
              ) : (
                'Show track'
              )}
            </Button>
            {!connected && (
              <p className="text-[10px] text-amber-700">Wialon link idle — connect in Admin to load GPS history.</p>
            )}
          </div>

          <ul className="max-h-[22%] lg:max-h-[28%] overflow-auto p-1.5 space-y-0.5 shrink-0 border-b border-border/60">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelectId?.(u.id)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted/50 transition-colors',
                    selected?.id === u.id && 'bg-primary/10 ring-1 ring-primary/25',
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
                  <span className="text-muted-foreground">Distance</span>
                  <span className="font-medium text-right">{summary.distanceKm} km</span>
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

            {useTripColors && tripRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Trips
                </p>
                <div className="space-y-1">
                  {tripRows.map((trip) => (
                    <button
                      key={trip.i}
                      type="button"
                      onClick={() => jumpToTrip(trip.from)}
                      className="w-full rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <span className="h-2 w-3 rounded-sm" style={{ background: trip.color }} />
                          {trip.label}
                        </span>
                        {trip.mileage > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {Math.round(trip.mileage * 10) / 10} km
                          </span>
                        )}
                      </div>
                      {trip.from > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(trip.from * 1000), 'MMM d, HH:mm')}
                          {trip.to > 0 ? ` – ${format(new Date(trip.to * 1000), 'HH:mm')}` : ''}
                        </p>
                      )}
                    </button>
                  ))}
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
            {isError && selected && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-2 text-xs space-y-1">
                <p className="font-medium text-destructive">Could not load track</p>
                <p className="text-muted-foreground break-words">{errorMessage || 'Wialon request failed'}</p>
                <Button type="button" size="sm" variant="outline" className="h-7 w-full text-[11px]" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            )}

            {!isError && !trackLoading && selected && pointCount === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No GPS data for this period. Try a longer range, or click Show track again after Wialon syncs.
              </p>
            )}
            {!trackLoading &&
              !isError &&
              stops.map((stop, i) => (
                <button
                  key={`${stop.from}-${i}`}
                  type="button"
                  onClick={() => {
                    setFocusStop({ lat: stop.lat, lng: stop.lng });
                    jumpToTrip(stop.from);
                  }}
                  className="w-full rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5 mb-1.5 text-xs text-left hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold">{stop.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatTrackDuration(stop.durationSec)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(stop.from * 1000), 'MMM d, HH:mm')} –{' '}
                    {format(new Date(stop.to * 1000), 'HH:mm')}
                  </p>
                </button>
              ))}
            {!trackLoading && stops.length === 0 && pointCount > 0 && (
              <p className="text-xs text-muted-foreground py-2">No long stops detected in this period.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 h-full min-h-0 relative border-r border-border/60 flex flex-col">
          <div className="flex-1 min-h-0 relative">
            <FleetTrackMap
              unit={selected}
              history={history}
              liveRecent={liveRecent}
              height="100%"
              playhead={playhead}
              focusPoint={focusStop}
            />
          </div>

          {/* Wialon-style track player */}
          {selected && pointCount > 1 && (
            <div className="shrink-0 border-t border-border/60 bg-card/95 px-3 py-2 space-y-1.5">
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
                  <SelectTrigger className="h-7 w-[68px] text-[10px]">
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
                  {playhead
                    ? format(new Date(playhead.time * 1000), 'MMM d, HH:mm:ss')
                    : '—'}
                </span>
                <span>
                  {Math.round(playhead?.speed ?? 0)} km/h · point {playIndex + 1}/{points.length}
                </span>
              </div>
              {useTripColors && tripRows.length > 0 && (
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  {tripRows.map((trip) => (
                    <div
                      key={trip.i}
                      className="h-full"
                      style={{
                        background: trip.color,
                        width: `${100 / tripRows.length}%`,
                      }}
                      title={trip.label}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 overflow-hidden">
          {pointCount > 0 && playhead ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="shrink-0 border-b border-border/60 px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: ROUTE_LINE_COLOR }} />
                  <p className="text-sm font-semibold truncate">{selected?.name}</p>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {format(new Date(playhead.time * 1000), 'dd.MM.yyyy HH:mm:ss')} ·{' '}
                  {Math.round(playhead.speed)} km/h
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Parameters
                </p>
                {playheadParams.length > 0 ? (
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px] font-mono">
                    {playheadParams.map((row) => (
                      <div key={row.key} className="contents">
                        <span className="text-muted-foreground truncate">{row.key}</span>
                        <span className="tabular-nums text-right text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No message parameters on this GPS point. Play the track to scrub through points that include sensor IO.
                  </p>
                )}
              </div>
              <div className="shrink-0 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
                Point {playIndex + 1} / {points.length} · use player controls to move the unit on the map
              </div>
            </div>
          ) : (
            <UnitDetailPanel
              unit={selected}
              live
              showControls
              className="h-full border-0 rounded-none shadow-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}
