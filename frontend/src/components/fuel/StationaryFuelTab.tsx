import { useMemo, useState } from 'react';
import { getDefaultDateRange } from '@/components/fuel/FuelTransactionsTable/utils';
import { useRefreshFuelTransactions } from '@/services/fleet';
import {
  FuelTransactionsTable,
  FuelFleetSummarySection,
  FuelTrendChart,
  GeneratorKpiCards,
  GeneratorFuelAlerts,
  GeneratorRuntimeTrendChart,
} from '@/components/fuel';
import { computeVehicleFuelRows } from '@/components/fuel/fuelReportStats';
import { useStationaryFleetData } from '@/hooks/useStationaryFleetData';
import type { StationaryFuelType } from './useStationaryFuelHooks';

interface StationaryFuelTabProps {
  stationaryType: StationaryFuelType;
}

const LABELS: Record<
  StationaryFuelType,
  { unit: string; plural: string; summaryTitle: string }
> = {
  generator: {
    unit: 'Generator',
    plural: 'generators',
    summaryTitle: 'Generator fuel summary',
  },
  machinery: {
    unit: 'Machinery',
    plural: 'machinery units',
    summaryTitle: 'Machinery fuel summary',
  },
};

/**
 * Generators & machinery fuel tab — same report layout as vehicles (FLS table,
 * fleet summary, trend chart) with stationary-specific KPIs and runtime chart.
 */
export function StationaryFuelTab({ stationaryType }: StationaryFuelTabProps) {
  const { fromDate: defaultFromDate, toDate: defaultToDate, todayStr } = getDefaultDateRange();
  const [fromDate, setFromDate] = useState<string>(defaultFromDate);
  const [toDate, setToDate] = useState<string>(defaultToDate);

  const labels = LABELS[stationaryType];

  const {
    tableUnits,
    fuelTransactions,
    unitFuelMapByName,
    isFuelLoading,
    fuelError,
  } = useStationaryFleetData({
    stationaryType,
    startDate: fromDate,
    endDate: toDate,
  });

  const refreshFuelMutation = useRefreshFuelTransactions();

  const filteredFuelTransactions = useMemo(() => {
    return fuelTransactions.filter((t) => {
      const txDateStr = new Date(t.timestamp * 1000).toISOString().split('T')[0];
      if (fromDate && txDateStr < fromDate) return false;
      if (toDate && txDateStr > toDate) return false;
      return true;
    });
  }, [fuelTransactions, fromDate, toDate]);

  const reportRows = useMemo(
    () => computeVehicleFuelRows(filteredFuelTransactions),
    [filteredFuelTransactions],
  );

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {fuelError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load Wialon fuel report data: {fuelError.message}. The first load can take a few minutes
          while Wialon reports run — use Sync in the transactions table to retry, or narrow the date range.
        </div>
      )}

      {!fuelError && isFuelLoading && filteredFuelTransactions.length === 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading Wialon fuel reports for {fromDate} to {toDate}… Cached data appears first when available.
        </div>
      )}

      <GeneratorKpiCards fromDate={fromDate} toDate={toDate} stationaryType={stationaryType} />
      <GeneratorFuelAlerts fromDate={fromDate} toDate={toDate} stationaryType={stationaryType} />

      <FuelTransactionsTable
        transactions={filteredFuelTransactions}
        vehicleFuelLevels={unitFuelMapByName}
        units={tableUnits}
        unitLabel={labels.unit}
        unitLabelPlural={labels.plural}
        showFuelPerTrip={false}
        isLoading={isFuelLoading}
        onRefresh={() => refreshFuelMutation.mutate({ startDate: fromDate, endDate: toDate })}
        isRefreshing={refreshFuelMutation.isPending}
        fromDate={fromDate}
        toDate={toDate}
        todayStr={todayStr}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
      />

      <GeneratorRuntimeTrendChart fromDate={fromDate} toDate={toDate} stationaryType={stationaryType} />

      <FuelFleetSummarySection
        rows={reportRows}
        isLoading={isFuelLoading}
        unitLabel={labels.unit}
        summaryTitle={labels.summaryTitle}
      />

      <FuelTrendChart transactions={filteredFuelTransactions} isLoading={isFuelLoading} />
    </div>
  );
}
