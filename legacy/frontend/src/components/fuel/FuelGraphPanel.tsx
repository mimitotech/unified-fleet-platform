/**
 * Fuel Graph — fuel level vs time from data we already have:
 * 1) the report tables on screen (instant)
 * 2) cached client fuel transactions for the same period (all assets)
 *
 * No per-unit message polling.
 */

import { useMemo, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Droplets } from 'lucide-react';
import { FuelLevelChart } from '@/components/fuel/FuelLevelChart';
import {
  fuelTransactionsFromReportTables,
  mergeFuelGraphTransactions,
} from '@/lib/fuelGraphFromReport';
import type { WialonReportChart, WialonReportTable } from '@/lib/reportUtils';
import { useFuelTransactions } from '@/services/fleet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FuelGraphUnitOption = { id: number; name: string };

type Props = {
  unitOptions: FuelGraphUnitOption[];
  preferredUnitId?: number;
  fromTs: number;
  toTs: number;
  tables?: WialonReportTable[];
  charts?: WialonReportChart[];
  fallbackUnitName?: string;
};

const ALL = '__all__';

export function FuelGraphPanel({
  unitOptions,
  preferredUnitId,
  fromTs,
  toTs,
  tables = [],
  fallbackUnitName = 'Asset',
}: Props) {
  const fromDate = format(new Date(fromTs * 1000), 'yyyy-MM-dd');
  const toDate = format(new Date(toTs * 1000), 'yyyy-MM-dd');

  // Full client fuel ledger for the period (no assetCategory → all assets).
  const { data: ledger, isLoading: ledgerLoading, isError, refetch } = useFuelTransactions(
    { startDate: fromDate, endDate: toDate },
    { enabled: Boolean(fromDate && toDate) },
  );

  const fromReport = useMemo(
    () => fuelTransactionsFromReportTables(tables, fallbackUnitName),
    [tables, fallbackUnitName],
  );

  const ledgerRows = useMemo(() => {
    const rows = ledger?.transactions;
    return Array.isArray(rows) ? rows : [];
  }, [ledger]);

  const transactions = useMemo(
    () => mergeFuelGraphTransactions(fromReport, ledgerRows),
    [fromReport, ledgerRows],
  );

  const assetNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of transactions) {
      if (t.unitName?.trim()) names.add(t.unitName.trim());
    }
    for (const u of unitOptions) {
      if (u.name?.trim()) names.add(u.name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [transactions, unitOptions]);

  const preferredName = useMemo(() => {
    if (preferredUnitId) {
      const hit = unitOptions.find((u) => u.id === preferredUnitId);
      if (hit?.name) return hit.name;
    }
    return assetNames[0] || fallbackUnitName;
  }, [preferredUnitId, unitOptions, assetNames, fallbackUnitName]);

  const [selected, setSelected] = useState<string>(ALL);

  useEffect(() => {
    setSelected((prev) => {
      if (prev === ALL) return ALL;
      if (prev && assetNames.includes(prev)) return prev;
      return ALL;
    });
  }, [assetNames]);

  const filtered = useMemo(() => {
    if (selected === ALL) return transactions;
    return transactions.filter((t) => t.unitName === selected);
  }, [transactions, selected]);

  const vehicles = useMemo(() => assetNames.map((name) => ({ name })), [assetNames]);

  const fillCount = filtered.filter((t) => (t.filled || 0) > 0 || t.section === 'filling').length;
  const drainCount = filtered.filter(
    (t) => (t.suddenFuelDrop || 0) > 0 || t.section === 'theft',
  ).length;
  const usedSum = filtered.reduce((s, t) => s + (Number(t.fuelUsed) || 0), 0);

  // Report tables are enough to render immediately — never block on ledger.
  const showLoading = ledgerLoading && !fromReport.length && !transactions.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2" data-no-print>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Fuel Graph</p>
          <p className="text-[11px] text-muted-foreground">
            Fuel level vs time · filled / consumed / lost · all assets in this period
            {transactions.length
              ? ` · ${transactions.length.toLocaleString()} events · ${assetNames.length} assets`
              : ''}
            {fillCount || drainCount || usedSum
              ? ` · ${fillCount} fills · ${drainCount} drains · ${usedSum.toFixed(1)} L used (view)`
              : ''}
          </p>
        </div>
        {assetNames.length > 0 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-8 w-[240px] text-xs">
              <SelectValue placeholder="All assets" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All assets ({assetNames.length})</SelectItem>
              {assetNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!transactions.length && !showLoading ? (
        <div className="fleet-card py-12 text-center text-muted-foreground">
          <Droplets className="mx-auto mb-2 h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No fuel events in this period</p>
          <p className="mx-auto mt-1 max-w-md text-xs">
            Run a fuel report with consumption, fillings, or sudden drops — or wait for the fuel
            ledger to load for {preferredName}.
          </p>
        </div>
      ) : (
        <FuelLevelChart
          transactions={filtered}
          vehicles={vehicles}
          isLoading={showLoading}
          error={isError && !fromReport.length ? new Error('Could not load fuel ledger') : null}
          onRetry={() => void refetch()}
          fromDate={fromDate}
          toDate={toDate}
          unitLabel="Asset"
          dense
          multiUnit={selected === ALL}
          hideUnitSelect
        />
      )}
    </div>
  );
}
