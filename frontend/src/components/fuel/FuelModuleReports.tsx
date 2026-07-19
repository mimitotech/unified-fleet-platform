import { useMemo, useState } from 'react';
import type { FuelTransaction } from '@/types/entities';
import { computePeriodFuelKpis, aggregateUnitFuelColumns } from './fuelColumnMetrics';
import { filterFuelTransactionsByDate } from './fuelTransactionFilters';
import { ModuleReportsShell } from '@/components/reports/ModuleReportsShell';
import type { DomainChartSpec } from '@/lib/domainReportCharts';
import { CHART } from '@/lib/chartColors';

type ReportKind =
  | 'executive'
  | 'fillings'
  | 'consumption'
  | 'drops'
  | 'balance'
  | 'ranking';

const REPORTS: Array<{ id: ReportKind; title: string; blurb: string }> = [
  {
    id: 'executive',
    title: 'Executive fuel summary',
    blurb: 'Filled, used, drops, net position and fleet coverage.',
  },
  {
    id: 'fillings',
    title: 'Fillings analysis',
    blurb: 'Fill volumes, fill share and live tank levels.',
  },
  {
    id: 'consumption',
    title: 'Consumption analysis',
    blurb: 'Used liters, share of fleet use and avg burn.',
  },
  {
    id: 'drops',
    title: 'Sudden drop review',
    blurb: 'Drain events and risk share of consumption.',
  },
  {
    id: 'balance',
    title: 'Fill vs use balance',
    blurb: 'Net change per asset for the period.',
  },
  {
    id: 'ranking',
    title: 'Asset ranking',
    blurb: 'Ranked by use, fill and live level for decisions.',
  },
];

export function FuelModuleReports({
  transactions,
  fromDate: defaultFrom,
  toDate: defaultTo,
  todayStr,
  liveLevels,
  assetNames = [],
}: {
  transactions: FuelTransaction[];
  fromDate: string;
  toDate: string;
  todayStr: string;
  liveLevels?: Map<string, number>;
  assetNames?: string[];
}) {
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [asset, setAsset] = useState('all');
  const [kind, setKind] = useState<ReportKind>('executive');

  const names = useMemo(() => {
    const set = new Set(assetNames);
    for (const t of transactions) if (t.unitName) set.add(t.unitName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [assetNames, transactions]);

  const ranged = useMemo(
    () => filterFuelTransactionsByDate(transactions, fromDate, toDate),
    [transactions, fromDate, toDate],
  );

  const scopedTx = useMemo(
    () => (asset === 'all' ? ranged : ranged.filter((t) => t.unitName === asset)),
    [ranged, asset],
  );

  const kpis = useMemo(
    () => computePeriodFuelKpis(scopedTx, fromDate, toDate, liveLevels),
    [scopedTx, fromDate, toDate, liveLevels],
  );

  const rows = useMemo(() => {
    const list = (asset === 'all' ? names : [asset]).map((unitName) => {
      const cols = aggregateUnitFuelColumns(
        ranged.filter((t) => t.unitName === unitName),
        { fromDate, toDate, liveLevel: liveLevels?.get(unitName) },
      );
      const filled = cols.filledMain + cols.filledReserve;
      const used = cols.totalUsed;
      const drop = cols.totalDrop;
      const live = liveLevels?.get(unitName) ?? cols.totalLevel;
      const net = filled - used;
      return {
        name: unitName,
        filled: Math.round(filled * 10) / 10,
        used: Math.round(used * 10) / 10,
        drop: Math.round(drop * 10) / 10,
        live: live != null ? Math.round(live * 10) / 10 : 0,
        net: Math.round(net * 10) / 10,
        fillShare: 0,
        useShare: 0,
        dropShare: 0,
        efficiency: used > 0 && filled > 0 ? Math.round((used / filled) * 1000) / 10 : 0,
      };
    });
    const totFilled = list.reduce((s, r) => s + r.filled, 0) || 1;
    const totUsed = list.reduce((s, r) => s + r.used, 0) || 1;
    const totDrop = list.reduce((s, r) => s + r.drop, 0) || 1;
    return list
      .map((r) => ({
        ...r,
        fillShare: Math.round((r.filled / totFilled) * 1000) / 10,
        useShare: Math.round((r.used / totUsed) * 1000) / 10,
        dropShare: Math.round((r.drop / totDrop) * 1000) / 10,
        filledL: `${r.filled} L`,
        usedL: `${r.used} L`,
        dropL: `${r.drop} L`,
        liveL: `${r.live} L`,
        netL: `${r.net} L`,
        fillSharePct: `${Math.round((r.filled / totFilled) * 1000) / 10}%`,
        useSharePct: `${Math.round((r.used / totUsed) * 1000) / 10}%`,
        dropSharePct: `${Math.round((r.drop / totDrop) * 1000) / 10}%`,
        efficiencyPct: r.efficiency ? `${r.efficiency}%` : '—',
      }))
      .sort((a, b) => b.used - a.used || b.filled - a.filled);
  }, [names, asset, ranged, fromDate, toDate, liveLevels]);

  const visibleRows = useMemo(() => {
    if (kind === 'fillings') return rows.filter((r) => r.filled > 0);
    if (kind === 'consumption') return rows.filter((r) => r.used > 0);
    if (kind === 'drops') return rows.filter((r) => r.drop > 0);
    return rows;
  }, [rows, kind]);

  const columns = useMemo(() => {
    const base = [{ key: 'name', label: 'Asset' }];
    if (kind === 'executive' || kind === 'ranking') {
      return [
        ...base,
        { key: 'filledL', label: 'Filled', align: 'right' as const },
        { key: 'usedL', label: 'Used', align: 'right' as const },
        { key: 'netL', label: 'Net', align: 'right' as const },
        { key: 'dropL', label: 'Drop', align: 'right' as const },
        { key: 'liveL', label: 'Live level', align: 'right' as const },
        { key: 'useSharePct', label: 'Use share', align: 'right' as const },
        { key: 'efficiencyPct', label: 'Use vs fill', align: 'right' as const },
      ];
    }
    if (kind === 'fillings') {
      return [
        ...base,
        { key: 'filledL', label: 'Filled', align: 'right' as const },
        { key: 'fillSharePct', label: 'Fill share', align: 'right' as const },
        { key: 'liveL', label: 'Live level', align: 'right' as const },
        { key: 'netL', label: 'Net', align: 'right' as const },
      ];
    }
    if (kind === 'consumption') {
      return [
        ...base,
        { key: 'usedL', label: 'Used', align: 'right' as const },
        { key: 'useSharePct', label: 'Use share', align: 'right' as const },
        { key: 'filledL', label: 'Filled', align: 'right' as const },
        { key: 'efficiencyPct', label: 'Use vs fill', align: 'right' as const },
      ];
    }
    if (kind === 'drops') {
      return [
        ...base,
        { key: 'dropL', label: 'Drop', align: 'right' as const },
        { key: 'dropSharePct', label: 'Drop share', align: 'right' as const },
        { key: 'usedL', label: 'Used', align: 'right' as const },
        { key: 'liveL', label: 'Live level', align: 'right' as const },
      ];
    }
    return [
      ...base,
      { key: 'filledL', label: 'Filled', align: 'right' as const },
      { key: 'usedL', label: 'Used', align: 'right' as const },
      { key: 'netL', label: 'Net (F−U)', align: 'right' as const },
      { key: 'liveL', label: 'Live level', align: 'right' as const },
    ];
  }, [kind]);

  const charts: DomainChartSpec = {
    heading: 'Asset performance · fuel analytics',
    categoryKey: 'name',
    bar: {
      title: 'Fill vs use by asset',
      subtitle: 'Standing bars — filled and consumed litres',
      metrics: [
        { key: 'filled', label: 'Filled (L)', color: CHART.brand },
        { key: 'used', label: 'Used (L)', color: '#0d9488' },
      ],
      topN: 8,
    },
    secondary: {
      type: 'bars',
      title: 'Drops & live level',
      subtitle: 'Standing bars — sudden drops and live tank level',
      metrics: [
        { key: 'drop', label: 'Drop (L)', color: '#dc2626' },
        { key: 'live', label: 'Live (L)', color: '#2563eb' },
      ],
      topN: 8,
    },
  };

  return (
    <ModuleReportsShell
      moduleLabel="Fuel"
      reports={REPORTS}
      selectedReportId={kind}
      onSelectedReportIdChange={(id) => setKind(id as ReportKind)}
      assetNames={names}
      assetKey="name"
      todayStr={todayStr}
      controlledFrom={fromDate}
      controlledTo={toDate}
      controlledAsset={asset}
      onFromChange={setFromDate}
      onToChange={setToDate}
      onAssetChange={setAsset}
      kpis={[
        { label: 'Total filled', value: `${kpis.totalFilled.toLocaleString()} L` },
        { label: 'Total consumed', value: `${kpis.totalConsumed.toLocaleString()} L` },
        { label: 'Sudden drops', value: `${kpis.theftVolume.toLocaleString()} L` },
        {
          label: 'Net (fill − use)',
          value: `${(kpis.totalFilled - kpis.totalConsumed).toLocaleString()} L`,
        },
        { label: 'Assets', value: kpis.vehiclesTracked },
        {
          label: 'Use vs fill',
          value:
            kpis.totalFilled > 0
              ? `${((kpis.totalConsumed / kpis.totalFilled) * 100).toFixed(1)}%`
              : '—',
        },
      ]}
      columns={columns}
      rows={visibleRows}
      charts={charts}
    />
  );
}
