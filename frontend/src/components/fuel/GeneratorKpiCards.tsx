import { useMemo } from 'react';
import { Zap, Clock, Fuel, Activity, Cog } from 'lucide-react';
import { MetricCard } from '@/components/app/MetricCard';
import { useGeneratorEngineHours } from '@/services/fleet';
import { useStationaryAssets, type StationaryFuelType } from './useStationaryFuelHooks';
import { groupSummaryUnitIds, isWialonGroupSummary } from './fuelTransactionFilters';
import type { EnrichedGenerator, FuelTransaction, Generator, Machinery } from '@/types';

interface GeneratorKpiCardsProps {
  fromDate?: string;
  toDate?: string;
  stationaryType?: StationaryFuelType;
  fuelTransactions?: FuelTransaction[];
  isFuelLoading?: boolean;
}

interface KpiAggregates {
  total: number;
  running: number;
  totalRuntimeHours: number;
  totalFuelLitres: number;
  unitsWithFuel: number;
  avgFuelPercent: number;
  totalPowerKw: number;
  activeLoadKw: number;
}

function effectiveConsumedTx(t: FuelTransaction): number {
  if (t.fuelUsed > 0) return t.fuelUsed;
  if (t.section === 'theft' && t.suddenFuelDrop > 0) return t.suddenFuelDrop;
  return 0;
}

function aggregate(
  generators: Array<Generator | Machinery | EnrichedGenerator>,
  hasRange: boolean,
): KpiAggregates {
  let running = 0;
  let totalRuntimeHours = 0;
  let totalFuelLitres = 0;
  let unitsWithFuel = 0;
  let percentSum = 0;
  let percentCount = 0;
  let totalPowerKw = 0;
  let activeLoadKw = 0;

  for (const g of generators) {
    if (g.status === 'running') running += 1;
    const enriched = g as EnrichedGenerator;
    if (hasRange) {
      totalRuntimeHours += enriched.runtimeHoursPeriod ?? 0;
    } else {
      totalRuntimeHours += enriched.totalRunningHours ?? 0;
    }

    const litres = g.fuelInfo?.level ?? g.fuel ?? 0;
    if (litres > 0) {
      totalFuelLitres += litres;
      unitsWithFuel += 1;
    }

    const pct = g.fuelInfo?.percentage;
    if (pct != null && pct > 0) {
      percentSum += pct;
      percentCount += 1;
    }

    const power = g.power ?? 0;
    totalPowerKw += power;
    if (g.status === 'running' && g.loadPercentage != null && power > 0) {
      activeLoadKw += (power * g.loadPercentage) / 100;
    }
  }

  return {
    total: generators.length,
    running,
    totalRuntimeHours,
    totalFuelLitres,
    unitsWithFuel,
    avgFuelPercent: percentCount > 0 ? percentSum / percentCount : 0,
    totalPowerKw,
    activeLoadKw,
  };
}

export function GeneratorKpiCards({
  fromDate,
  toDate,
  stationaryType = 'generator',
  fuelTransactions = [],
  isFuelLoading = false,
}: GeneratorKpiCardsProps = {}) {
  const isMachinery = stationaryType === 'machinery';
  const hasRange = Boolean(fromDate && toDate);
  const assetsQ = useStationaryAssets(stationaryType);
  const engineQ = useGeneratorEngineHours(
    hasRange ? { startDate: fromDate, endDate: toDate } : undefined,
    { enabled: hasRange },
  );

  const generators = useMemo(() => {
    const base = assetsQ.data ?? [];
    if (!hasRange) return base;

    const runtimeByUnit = new Map<string, number>();
    for (const row of engineQ.data ?? []) {
      const key = String(row.unitId);
      const durSec = row.end > row.beginning ? row.end - row.beginning : 0;
      const hours = durSec > 0 ? durSec / 3600 : row.engineHours;
      runtimeByUnit.set(key, (runtimeByUnit.get(key) ?? 0) + hours);
    }

    const summaryUnits = groupSummaryUnitIds(fuelTransactions, fromDate, toDate);
    const consumedByUnit = new Map<string, number>();
    for (const tx of fuelTransactions) {
      if (tx.section !== 'consumption' && tx.section !== 'theft') continue;
      const uid = String(tx.unitId);
      if (isWialonGroupSummary(tx)) {
        if (!summaryUnits.has(uid)) continue;
        if (tx.fuelUsed > 0) consumedByUnit.set(uid, tx.fuelUsed);
        continue;
      }
      if (summaryUnits.has(uid)) continue;
      const used = effectiveConsumedTx(tx);
      if (used > 0) consumedByUnit.set(uid, (consumedByUnit.get(uid) ?? 0) + used);
    }

    return base.map<EnrichedGenerator>((g) => ({
      ...g,
      runtimeHoursPeriod: runtimeByUnit.get(String(g.id)) ?? 0,
      fuelConsumedPeriod: consumedByUnit.get(String(g.id)),
    }));
  }, [assetsQ.data, engineQ.data, fuelTransactions, fromDate, toDate, hasRange]);

  const k = useMemo(() => aggregate(generators, hasRange), [generators, hasRange]);

  const label = isMachinery ? 'machinery' : 'generator';
  const activeSubtitle = k.total > 0
    ? `${Math.round((k.running / k.total) * 100)}% of ${k.total}`
    : `No ${label}s`;

  const runtimeValue = k.totalRuntimeHours >= 1000
    ? `${(k.totalRuntimeHours / 1000).toFixed(1)}k h`
    : `${Math.round(k.totalRuntimeHours).toLocaleString()} h`;
  const runtimeSubtitle = hasRange ? 'Period runtime' : 'Lifetime hours';

  const fuelSubtitle = k.unitsWithFuel > 0
    ? `${Math.round(k.avgFuelPercent)}% avg · ${k.unitsWithFuel} units`
    : 'No fuel sensors';

  const powerSubtitle = k.running > 0 && k.activeLoadKw > 0
    ? `${k.activeLoadKw.toFixed(1)} kW load`
    : `${k.running} running`;

  const ActiveIcon = isMachinery ? Cog : Zap;
  const isReportsLoading = isFuelLoading || engineQ.isLoading;

  if (assetsQ.isLoading) {
    return (
      <div className="fuel-kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="fuel-kpi-grid">
      <MetricCard
        title={isMachinery ? 'Active Machinery' : 'Active Generators'}
        value={`${k.running} / ${k.total}`}
        subtitle={activeSubtitle}
        icon={ActiveIcon}
        variant="success"
        size="xs"
      />
      <MetricCard
        title="Total Runtime"
        value={isReportsLoading && hasRange ? '…' : runtimeValue}
        subtitle={runtimeSubtitle}
        icon={Clock}
        variant="primary"
        size="xs"
      />
      <MetricCard
        title="Fuel Onsite"
        value={`${Math.round(k.totalFuelLitres).toLocaleString()} L`}
        subtitle={fuelSubtitle}
        icon={Fuel}
        variant="warning"
        size="xs"
      />
      <MetricCard
        title="Power Capacity"
        value={`${Math.round(k.totalPowerKw).toLocaleString()} kW`}
        subtitle={powerSubtitle}
        icon={Activity}
        variant="info"
        size="xs"
      />
    </div>
  );
}
