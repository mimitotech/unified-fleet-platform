import { useMemo } from 'react';
import {
  useFuelAlerts,
  useGenerators,
  useGeneratorsWithReports,
} from '@/services/fleet';
import {
  buildGeneratorEngineIntervalsByUnit,
  getGeneratorFuelActivity,
} from '@/services/fleet/generatorFuelClassification';
import type { FuelEvent } from '@/types/entities';
import { FuelDrainAlerts } from './FuelDrainAlerts';

interface GeneratorDrainAlertsProps {
  /** Optional ISO date (yyyy-MM-dd). When supplied with `toDate`, drain events
   *  are sourced from the generator fuel report over that range instead of the
   *  rolling 48-hour `useFuelAlerts` window. */
  fromDate?: string;
  toDate?: string;
}

/**
 * GeneratorDrainAlerts — Phase 2f.
 *
 * Two data paths:
 *   - With `fromDate`/`toDate`: pulls theft-section rows from the generator
 *     fuel report and cross-references each event timestamp against the
 *     engine-hours intervals from the same window. Any "theft" that happened
 *     while the generator was running is treated as normal high-rate
 *     consumption (Wialon's drop heuristic fires on generators because they
 *     burn fuel quickly) and excluded; only events that occurred while the
 *     engine was OFF are surfaced as drain alerts.
 *   - Without props: legacy path — `useFuelAlerts(48)` filtered by the local
 *     generator-id set. Preserved so callers that don't supply a date range
 *     keep working unchanged.
 *
 * Hidden entirely when there are no generator-related drain events.
 */
export function GeneratorDrainAlerts({ fromDate, toDate }: GeneratorDrainAlertsProps = {}) {
  const { data: generators = [] } = useGenerators();
  const hasRange = Boolean(fromDate && toDate);

  // Always-cached rolling window — used as the fallback when no date range
  // is supplied. Value is shared with VehiclesFuelTab so this is essentially free.
  const { data: allAlerts = [] } = useFuelAlerts(48);
  // Composite hook gives us both the generator fuel transactions and the
  // engine-hours intervals over the same window (deduped by React Query).
  const reportsQuery = useGeneratorsWithReports(
    hasRange ? { startDate: fromDate, endDate: toDate } : undefined,
  );
  const rangeTransactions = hasRange ? (reportsQuery.fuelQuery.data ?? []) : [];
  const engineHoursRows = hasRange ? (reportsQuery.engineHoursQuery.data ?? []) : [];

  const generatorIds = useMemo(
    () => new Set(generators.map((g) => String(g.id))),
    [generators],
  );

  const engineIntervalsByUnit = useMemo(
    () => buildGeneratorEngineIntervalsByUnit(engineHoursRows),
    [engineHoursRows],
  );

  const generatorAlerts = useMemo<FuelEvent[]>(() => {
    if (hasRange) {
      return rangeTransactions
        .filter((t) => t.section === 'theft' && (t.suddenFuelDrop || 0) > 0)
        .filter((t) => getGeneratorFuelActivity(t, engineIntervalsByUnit).kind === 'drain')
        .map<FuelEvent>((t) => ({
          type: 'theft',
          unitId: String(t.unitId),
          unitName: t.unitName,
          timestamp: new Date(t.timestamp * 1000).toISOString(),
          location: { lat: t.latitude ?? 0, lng: t.longitude ?? 0 },
          volumeChange: -Math.abs(t.suddenFuelDrop || 0),
          levelBefore: t.initialLevel ?? 0,
          levelAfter: t.finalLevel ?? 0,
          section: 'theft',
          suddenFuelDrop: t.suddenFuelDrop,
          count: t.count,
        }));
    }
    return allAlerts.filter((a) => generatorIds.has(String(a.unitId)));
  }, [hasRange, rangeTransactions, allAlerts, generatorIds, engineIntervalsByUnit]);

  if (generatorAlerts.length === 0) {
    return null;
  }

  return <FuelDrainAlerts alerts={generatorAlerts} />;
}
