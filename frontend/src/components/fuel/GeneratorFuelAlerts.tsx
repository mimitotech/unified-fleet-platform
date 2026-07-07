import { useMemo } from 'react';
import { AlertTriangle, Droplets, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useStationaryWithReports, type StationaryFuelType } from './useStationaryFuelHooks';
import type { Generator } from '@/types';
import {
  FUEL_CRITICAL_THRESHOLD_PERCENT,
  FUEL_WARNING_THRESHOLD_PERCENT,
} from './GeneratorListRow';

/**
 * GeneratorFuelAlerts — site-grouped low-fuel alerts for generators.
 *
 * Phase 2e. Mirrors the visual language of FuelLevelAlerts but pivots on the
 * generator domain: thresholds are tighter (critical < 20%, warning < 35%) to
 * match GeneratorListRow, and units are grouped by `siteName` so an operator
 * can see at a glance which sites need a fuel run. Hidden entirely when no
 * unit is below the warning threshold.
 *
 * Uses the same report-enriched generator list as Generators by Site when a
 * date range is supplied, so inferred site names stay consistent across panels.
 */

const ALERTS_PER_ROW = 4;
const MAX_ALERT_ROWS = 2;
const MAX_VISIBLE_PER_SITE = ALERTS_PER_ROW * MAX_ALERT_ROWS;
const UNASSIGNED_SITE = 'Unassigned';

type AlertTone = 'critical' | 'warning';

interface AlertItem {
  id: string;
  name: string;
  fuelLevel: number;
  fuelPercent: number;
  tone: AlertTone;
}

interface SiteBucket {
  site: string;
  critical: AlertItem[];
  warning: AlertItem[];
}

function classify(generator: Generator): AlertTone | null {
  const pct = generator.fuelInfo?.percentage ?? 0;
  if (pct <= 0) return null; // no FLS reading — don't false-alarm
  if (pct < FUEL_CRITICAL_THRESHOLD_PERCENT) return 'critical';
  if (pct < FUEL_WARNING_THRESHOLD_PERCENT) return 'warning';
  return null;
}

function buildBuckets(generators: Generator[]): SiteBucket[] {
  const map = new Map<string, SiteBucket>();
  for (const g of generators) {
    const tone = classify(g);
    if (!tone) continue;
    const site = g.siteName?.trim() || UNASSIGNED_SITE;
    let bucket = map.get(site);
    if (!bucket) {
      bucket = { site, critical: [], warning: [] };
      map.set(site, bucket);
    }
    const item: AlertItem = {
      id: g.id,
      name: g.name,
      fuelLevel: g.fuelInfo?.level ?? g.fuel ?? 0,
      fuelPercent: g.fuelInfo?.percentage ?? 0,
      tone,
    };
    if (tone === 'critical') bucket.critical.push(item);
    else bucket.warning.push(item);
  }

  // Critical-first within each bucket; sites with critical units float to top.
  const buckets = Array.from(map.values()).map((b) => ({
    ...b,
    critical: b.critical.slice().sort((a, b) => a.fuelPercent - b.fuelPercent),
    warning: b.warning.slice().sort((a, b) => a.fuelPercent - b.fuelPercent),
  }));

  return buckets.sort((a, b) => {
    if (a.critical.length !== b.critical.length) return b.critical.length - a.critical.length;
    if (a.site === UNASSIGNED_SITE) return 1;
    if (b.site === UNASSIGNED_SITE) return -1;
    return a.site.localeCompare(b.site);
  });
}

function AlertCard({ item }: { item: AlertItem }) {
  const pct = Math.max(0, Math.min(100, item.fuelPercent));
  const isCritical = item.tone === 'critical';
  return (
    <div
      className={cn(
        'fuel-alert-tile',
        isCritical ? 'bg-destructive/10' : 'bg-warning/10',
      )}
    >
      <Droplets
        className={cn(
          'w-3.5 h-3.5 shrink-0',
          isCritical ? 'text-destructive' : 'text-warning',
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium truncate leading-tight">{item.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Progress
            value={pct}
            className={cn(
              'h-1 flex-1',
              isCritical ? '[&>div]:bg-destructive' : '[&>div]:bg-warning',
            )}
          />
          <span className="text-[10px] font-mono tabular-nums">{Math.round(pct)}%</span>
        </div>
        {item.fuelLevel > 0 && (
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
            {Math.round(item.fuelLevel).toLocaleString()} L
          </p>
        )}
      </div>
    </div>
  );
}

interface GeneratorFuelAlertsProps {
  fromDate?: string;
  toDate?: string;
  stationaryType?: StationaryFuelType;
}

export function GeneratorFuelAlerts({
  fromDate,
  toDate,
  stationaryType = 'generator',
}: GeneratorFuelAlertsProps = {}) {
  const hasRange = Boolean(fromDate && toDate);
  const { data: generators = [] } = useStationaryWithReports(
    stationaryType,
    hasRange ? { startDate: fromDate, endDate: toDate } : undefined,
  );
  const buckets = useMemo(() => buildBuckets(generators), [generators]);

  if (buckets.length === 0) return null;

  const totalCritical = buckets.reduce((sum, b) => sum + b.critical.length, 0);
  const totalWarning = buckets.reduce((sum, b) => sum + b.warning.length, 0);

  return (
    <div className="fleet-card border-warning/40 py-2.5">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <h3 className="fuel-section-title">
            {stationaryType === 'machinery' ? 'Machinery Fuel Alerts' : 'Generator Fuel Alerts'}
          </h3>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {totalCritical} critical · {totalWarning} warning
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          &lt; {FUEL_CRITICAL_THRESHOLD_PERCENT}% critical · &lt;{' '}
          {FUEL_WARNING_THRESHOLD_PERCENT}% warning
        </span>
      </div>

      <div className="space-y-3">
        {buckets.map((bucket) => (
          <div key={bucket.site} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="font-medium text-foreground truncate">{bucket.site}</span>
              {bucket.critical.length > 0 && (
                <span className="text-destructive shrink-0">· {bucket.critical.length} critical</span>
              )}
              {bucket.warning.length > 0 && (
                <span className="text-warning shrink-0">· {bucket.warning.length} warning</span>
              )}
            </div>
            <div className="fuel-alert-grid">
              {[...bucket.critical, ...bucket.warning].slice(0, MAX_VISIBLE_PER_SITE).map((item) => (
                <AlertCard key={item.id} item={item} />
              ))}
            </div>
            {[...bucket.critical, ...bucket.warning].length > MAX_VISIBLE_PER_SITE && (
              <p className="text-[10px] text-muted-foreground">
                +{[...bucket.critical, ...bucket.warning].length - MAX_VISIBLE_PER_SITE} more at this site
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
