import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import { FLEET_STATUS } from '@/lib/chartColors';

const STATUS_KEYS = new Set(['status']);
const FUEL_KEYS = new Set(['fuelLive', 'fuelFormatted', 'fuelFiltered', 'fuelPercent', 'fuelLiters', 'fuelLevel']);
const SPEED_KEYS = new Set(['speedKmh', 'maxSpeedKmh', 'avgSpeedKmh']);
const SEVERITY_KEYS = new Set(['severity']);
const ONLINE_KEYS = new Set(['online']);
const METHOD_KEYS = new Set(['method']);
const FILLED_KEYS = new Set(['filledLiters', 'filledFormatted']);

function fuelTone(pct: number | null, liters: number | null): string {
  if (pct != null && pct <= 100) {
    if (pct >= 50) return 'text-status-moving font-semibold';
    if (pct >= 25) return 'text-status-idle font-semibold';
    return 'text-status-stopped font-semibold';
  }
  if (liters != null && liters > 0) return 'text-primary font-semibold tabular-nums';
  return 'text-muted-foreground';
}

function speedTone(kmh: number): string {
  if (kmh >= 80) return 'text-status-stopped font-semibold tabular-nums';
  if (kmh >= 50) return 'text-status-idle font-semibold tabular-nums';
  if (kmh > 0) return 'text-status-moving font-semibold tabular-nums';
  return 'text-muted-foreground tabular-nums';
}

function FuelBar({ percent }: { percent: number }) {
  const color =
    percent >= 50 ? FLEET_STATUS.moving : percent >= 25 ? FLEET_STATUS.idle : FLEET_STATUS.stopped;
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-9 text-right">{percent}%</span>
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const cls =
    s.includes('critical') || s.includes('emergency')
      ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
      : s.includes('warn')
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400';
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {severity || '—'}
    </span>
  );
}

export function renderReportCell(key: string, value: unknown, row: Record<string, unknown>): ReactNode {
  if (value == null || value === '') {
    return <span className="text-muted-foreground/60">—</span>;
  }

  if (STATUS_KEYS.has(key)) {
    const s = String(value).toLowerCase();
    if (['moving', 'idle', 'stopped', 'offline'].includes(s)) {
      return <StatusBadge status={s as 'moving' | 'idle' | 'stopped' | 'offline'} size="sm" />;
    }
  }

  if (FUEL_KEYS.has(key)) {
    if (key === 'fuelPercent' || key === 'fuelLevel') {
      const pct = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(pct) && pct <= 100) return <FuelBar percent={Math.round(pct)} />;
    }
    const pct = typeof row.fuelPercent === 'number' ? row.fuelPercent : Number(row.fuelPercent);
    const liters = typeof row.fuelLiters === 'number' ? row.fuelLiters : Number(row.fuelLiters);
    return <span className={fuelTone(Number.isFinite(pct) ? pct : null, Number.isFinite(liters) ? liters : null)}>{String(value)}</span>;
  }

  if (SPEED_KEYS.has(key)) {
    const kmh = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(kmh)) return <span className={speedTone(kmh)}>{kmh}</span>;
  }

  if (SEVERITY_KEYS.has(key)) {
    return <SeverityPill severity={String(value)} />;
  }

  if (ONLINE_KEYS.has(key)) {
    const online = String(value).toLowerCase() === 'online';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium',
          online ? 'text-status-moving' : 'text-status-offline'
        )}
      >
        <span className={cn('h-2 w-2 rounded-full', online ? 'bg-status-moving' : 'bg-status-offline')} />
        {String(value)}
      </span>
    );
  }

  if (METHOD_KEYS.has(key)) {
    const m = String(value);
    const color = m.includes('FLS') ? 'text-primary' : m.includes('calc') ? 'text-blue-600' : 'text-muted-foreground';
    return <span className={cn('text-xs font-medium', color)}>{m}</span>;
  }

  if (FILLED_KEYS.has(key)) {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isFinite(n) && n > 0) {
      return <span className="text-status-moving font-semibold tabular-nums">+{n} L</span>;
    }
  }

  if (key === 'category') {
    const c = String(value).toLowerCase();
    const bg =
      c === 'sensor'
        ? 'bg-primary/10 text-primary'
        : c === 'parameter'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
          : 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400';
    return <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', bg)}>{String(value)}</span>;
  }

  if (key === 'distanceKm' || key === 'durationMin' || key === 'fuelUsedLiters') {
    return <span className="font-medium tabular-nums text-foreground">{String(value)}</span>;
  }

  return String(value);
}

export function kpiToneClass(tone?: 'good' | 'warn' | 'bad' | 'neutral'): string {
  switch (tone) {
    case 'good':
      return 'border-status-moving/30 bg-status-moving/5 text-status-moving';
    case 'warn':
      return 'border-status-idle/30 bg-status-idle/5 text-status-idle';
    case 'bad':
      return 'border-status-stopped/30 bg-status-stopped/5 text-status-stopped';
    default:
      return 'border-border/60 bg-muted/30 text-foreground';
  }
}
