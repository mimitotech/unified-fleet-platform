import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Zap, Cog, Fuel, AlertTriangle } from 'lucide-react';
import { useStationaryAssets, useStationaryWithReports, type StationaryFuelType } from './useStationaryFuelHooks';
import {
  buildGeneratorDailyFuelByUnit,
  type GeneratorDailyFuel,
} from '@/services/fleet/generatorDailyFuel';
import type { EnrichedGenerator } from '@/types';
import {
  GeneratorListRow,
  FUEL_CRITICAL_THRESHOLD_PERCENT,
} from './GeneratorListRow';
import { GeneratorDailyFuelDialog } from './GeneratorDailyFuelDialog';

/**
 * GeneratorListTable — flat list of all generators.
 *
 * Phase 2a of the Generators tab. Consumes `useGenerators()` (Wialon-backed)
 * and renders one row per generator sorted alphabetically by name. Site
 * affiliation is still surfaced via the per-row Location column (derived from
 * the earliest fuel-transaction address in the selected window).
 *
 * When `fromDate`/`toDate` are supplied, switches to `useGeneratorsWithReports`
 * which augments each generator with period-aggregated runtime hours and
 * fuel consumption/fills/drains for the selected window. Clicking a row opens
 * the per-day fuel breakdown modal computed from the same fuel + engine-hours
 * feeds that produce the period totals.
 */

interface GeneratorListTableProps {
  fromDate?: string;
  toDate?: string;
  stationaryType?: StationaryFuelType;
}

export function GeneratorListTable({
  fromDate,
  toDate,
  stationaryType = 'generator',
}: GeneratorListTableProps = {}) {
  const isMachinery = stationaryType === 'machinery';
  const unitLabel = isMachinery ? 'Machinery' : 'Generator';
  const unitLabelPlural = isMachinery ? 'machinery units' : 'generators';
  const TitleIcon = isMachinery ? Cog : Zap;

  const hasRange = Boolean(fromDate && toDate);

  const reportsQuery = useStationaryWithReports(
    stationaryType,
    hasRange ? { startDate: fromDate, endDate: toDate } : undefined,
  );
  const baseQuery = useStationaryAssets(stationaryType);

  const generators: EnrichedGenerator[] = hasRange
    ? reportsQuery.data
    : (baseQuery.data ?? []);
  const isLoading = hasRange ? reportsQuery.isLoading : baseQuery.isLoading;
  const error = hasRange ? reportsQuery.error : baseQuery.error;
  const refetch = hasRange ? reportsQuery.refetch : baseQuery.refetch;

  const [search, setSearch] = useState('');
  // Daily breakdown surfaces in a modal opened on row click. We track the
  // selected generator (instead of the previous inline-expansion Set) so the
  // surrounding table layout stays static when drilling into a unit.
  const [selectedGenerator, setSelectedGenerator] =
    useState<EnrichedGenerator | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? generators.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            (g.assetId ?? '').toLowerCase().includes(q) ||
            (g.siteName ?? '').toLowerCase().includes(q) ||
            (g.locationName ?? '').toLowerCase().includes(q),
        )
      : generators;
    return base.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [generators, search]);

  // Header summary counts — running units and critically-low-fuel units across
  // the currently filtered list, so the description reflects the visible rows.
  const summary = useMemo(() => {
    const runningCount = filtered.filter((g) => g.status === 'running').length;
    const criticalFuelCount = filtered.filter((g) => {
      const pct = g.fuelInfo?.percentage ?? 0;
      return pct > 0 && pct < FUEL_CRITICAL_THRESHOLD_PERCENT;
    }).length;
    return { runningCount, criticalFuelCount };
  }, [filtered]);

  // Per-unit, per-day fuel breakdown for the selected window. Reuses the same
  // fuel transactions and engine-hours rows the period totals on each row are
  // derived from, so daily sub-totals add up to the parent row's "Fuel Used".
  const dailyByUnit = useMemo<Map<string, GeneratorDailyFuel[]>>(() => {
    if (!hasRange) return new Map();
    return buildGeneratorDailyFuelByUnit({
      transactions: reportsQuery.fuelQuery.data ?? [],
      engineHours: reportsQuery.engineHoursQuery.data ?? [],
      fromDate,
      toDate,
    });
  }, [
    hasRange,
    fromDate,
    toDate,
    reportsQuery.fuelQuery.data,
    reportsQuery.engineHoursQuery.data,
  ]);

  // Short label for the selected window, e.g. "Apr 15 – Apr 29". Rendered into
  // the period-aware column headers so users immediately know which range the
  // Runtime / Fuel Used totals refer to.
  const periodLabel = useMemo(() => {
    if (!hasRange || !fromDate || !toDate) return '';
    try {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) return '';
      return `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`;
    } catch {
      return '';
    }
  }, [hasRange, fromDate, toDate]);

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">Failed to load {unitLabelPlural}.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TitleIcon className="h-5 w-5 text-primary" />
              {isMachinery ? 'Machinery' : 'Generators'}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {isLoading
                  ? 'Loading…'
                  : `${filtered.length} unit${filtered.length === 1 ? '' : 's'}`}
              </span>
              {!isLoading && filtered.length > 0 && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-moving" />
                    {summary.runningCount} running
                  </span>
                  {summary.criticalFuelCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <Fuel className="h-3 w-3" />
                      {summary.criticalFuelCount} low fuel
                    </span>
                  )}
                </>
              )}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, asset ID, site, or location…"
              className="pl-9 bg-secondary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search
              ? `No ${unitLabelPlural} match the current search.`
              : `No ${unitLabelPlural} found.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs fuel-compact-table">
              <thead>
                <tr className="text-left text-[10px] text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-3 font-medium">{unitLabel}</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium">Location</th>
                  <th className="py-2 px-3 font-medium text-right">
                    {hasRange
                      ? `Runtime${periodLabel ? ` (${periodLabel})` : ''}`
                      : 'Runtime'}
                  </th>
                  {hasRange && (
                    <th className="py-2 pl-3 font-medium text-right">
                      {`Fuel Used${periodLabel ? ` (${periodLabel})` : ''}`}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <GeneratorListRow
                    key={g.id}
                    generator={g}
                    showPeriod={hasRange}
                    onSelect={hasRange ? () => setSelectedGenerator(g) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <GeneratorDailyFuelDialog
        generator={selectedGenerator}
        entries={
          selectedGenerator
            ? dailyByUnit.get(selectedGenerator.id)
            : undefined
        }
        fromDate={fromDate}
        toDate={toDate}
        open={selectedGenerator !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedGenerator(null);
        }}
      />
    </Card>
  );
}
