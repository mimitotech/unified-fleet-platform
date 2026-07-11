import { WialonFuelReportService } from './WialonFuelReportService.js';
import { WialonGeneratorEngineHoursService } from './WialonGeneratorEngineHoursService.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import { effectiveConsumed, effectiveFilled, effectiveTheft } from './wialonFuelReport/metrics.js';

type AssetIntelligenceRow = {
  unitId: number;
  unitName: string;
  assetCategory: FuelAssetCategory;
  consumed: number;
  filled: number;
  theft: number;
  mileage: number;
  runtimeHours: number;
  avgConsumption: number;
  efficiencyScore: number;
  events: number;
};

type GroupIntelligenceRow = {
  key: 'all' | FuelAssetCategory;
  label: string;
  consumed: number;
  filled: number;
  theft: number;
  mileage: number;
  runtimeHours: number;
  avgConsumption: number;
  assets: number;
};

function dailyKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function categoryLabel(key: 'all' | FuelAssetCategory): string {
  if (key === 'vehicle') return 'Vehicles';
  if (key === 'generator') return 'Generators';
  if (key === 'machinery') return 'Machinery';
  return 'All Assets';
}

export class WialonFuelIntelligenceService {
  static async getFuelIntelligence(
    tenantId: string,
    opts: { from: string; to: string; refresh?: boolean; assetCategory?: FuelAssetCategory; unitId?: number }
  ) {
    const [report, runtimeRows, fuelAssets] = await Promise.all([
      WialonFuelReportService.getTransactions(tenantId, {
        from: opts.from,
        to: opts.to,
        refresh: opts.refresh,
        assetCategory: opts.assetCategory,
      }),
      WialonGeneratorEngineHoursService.list(tenantId, {
        from: opts.from,
        to: opts.to,
        refresh: opts.refresh,
      }).catch(() => []),
      WialonFuelFleetService.listAssets(tenantId).catch(() => ({ assets: [] as Array<{ unitId: number; assetType: FuelAssetCategory }> })),
    ]);

    const categoryByUnit = new Map<number, FuelAssetCategory>();
    for (const a of fuelAssets.assets) categoryByUnit.set(a.unitId, a.assetType);

    const runtimeByUnit = new Map<number, number>();
    const runtimeIntervalsByUnit = new Map<number, Array<{ start: number; end: number; hours: number }>>();
    for (const r of runtimeRows) {
      const durationHours = r.end > r.beginning ? (r.end - r.beginning) / 3600 : 0;
      runtimeByUnit.set(r.unitId, (runtimeByUnit.get(r.unitId) ?? 0) + durationHours);
      const intervals = runtimeIntervalsByUnit.get(r.unitId) ?? [];
      intervals.push({ start: r.beginning, end: r.end, hours: Math.round(durationHours * 100) / 100 });
      runtimeIntervalsByUnit.set(r.unitId, intervals);
    }

    const dailyMap = new Map<string, { consumed: number; filled: number; theft: number; mileage: number; runtimeHours: number }>();
    const dailyByUnit = new Map<number, Map<string, { consumed: number; filled: number; theft: number; mileage: number }>>();
    const assetsMap = new Map<number, AssetIntelligenceRow>();

    for (const tx of report.transactions) {
      const unitId = tx.unitId;
      const cat = categoryByUnit.get(unitId) ?? 'vehicle';
      const consumed = effectiveConsumed(tx);
      const filled = effectiveFilled(tx);
      const theft = effectiveTheft(tx);
      const mileage = tx.section === 'consumption' ? tx.mileage || 0 : 0;

      const row = assetsMap.get(unitId) ?? {
        unitId,
        unitName: tx.unitName,
        assetCategory: cat,
        consumed: 0,
        filled: 0,
        theft: 0,
        mileage: 0,
        runtimeHours: runtimeByUnit.get(unitId) ?? 0,
        avgConsumption: 0,
        efficiencyScore: 0,
        events: 0,
      };
      row.consumed += consumed;
      row.filled += filled;
      row.theft += theft;
      row.mileage += mileage;
      row.events += 1;
      assetsMap.set(unitId, row);

      const day = dailyKey(tx.timestamp);
      const dayRow = dailyMap.get(day) ?? { consumed: 0, filled: 0, theft: 0, mileage: 0, runtimeHours: 0 };
      dayRow.consumed += consumed;
      dayRow.filled += filled;
      dayRow.theft += theft;
      dayRow.mileage += mileage;
      dailyMap.set(day, dayRow);

      const unitDaily = dailyByUnit.get(unitId) ?? new Map<string, { consumed: number; filled: number; theft: number; mileage: number }>();
      const unitDayRow = unitDaily.get(day) ?? { consumed: 0, filled: 0, theft: 0, mileage: 0 };
      unitDayRow.consumed += consumed;
      unitDayRow.filled += filled;
      unitDayRow.theft += theft;
      unitDayRow.mileage += mileage;
      unitDaily.set(day, unitDayRow);
      dailyByUnit.set(unitId, unitDaily);
    }

    for (const [unitId, hours] of runtimeByUnit.entries()) {
      const row = assetsMap.get(unitId);
      if (row) row.runtimeHours = hours;
    }

    const assets = [...assetsMap.values()].map((row) => {
      const avg = row.mileage > 0 ? (row.consumed / row.mileage) * 100 : 0;
      const efficiencyScore = row.runtimeHours > 0 ? row.consumed / row.runtimeHours : row.consumed;
      return {
        ...row,
        avgConsumption: Math.round(avg * 10) / 10,
        efficiencyScore: Math.round(efficiencyScore * 100) / 100,
      };
    });

    const byGroup = new Map<'all' | FuelAssetCategory, GroupIntelligenceRow>();
    const putGroup = (key: 'all' | FuelAssetCategory, source: AssetIntelligenceRow) => {
      const row = byGroup.get(key) ?? {
        key,
        label: categoryLabel(key),
        consumed: 0,
        filled: 0,
        theft: 0,
        mileage: 0,
        runtimeHours: 0,
        avgConsumption: 0,
        assets: 0,
      };
      row.consumed += source.consumed;
      row.filled += source.filled;
      row.theft += source.theft;
      row.mileage += source.mileage;
      row.runtimeHours += source.runtimeHours;
      row.assets += 1;
      byGroup.set(key, row);
    };
    for (const row of assets) {
      putGroup('all', row);
      putGroup(row.assetCategory, row);
    }
    const groups = [...byGroup.values()].map((g) => ({
      ...g,
      avgConsumption: g.mileage > 0 ? Math.round(((g.consumed / g.mileage) * 100) * 10) / 10 : 0,
    }));

    const daily = [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));

    let unitDetail: {
      unitId: number;
      unitName: string;
      daily: Array<{ date: string; consumed: number; filled: number; theft: number; mileage: number; runtimeHours: number }>;
      runtimeIntervals: Array<{ start: number; end: number; hours: number }>;
    } | null = null;
    if (opts.unitId) {
      const asset = assets.find((a) => a.unitId === opts.unitId);
      if (asset) {
        const unitDaily = dailyByUnit.get(opts.unitId) ?? new Map();
        const runtimePerDay = new Map<string, number>();
        for (const iv of runtimeIntervalsByUnit.get(opts.unitId) ?? []) {
          const day = dailyKey(iv.start);
          runtimePerDay.set(day, (runtimePerDay.get(day) ?? 0) + iv.hours);
        }
        unitDetail = {
          unitId: opts.unitId,
          unitName: asset.unitName,
          daily: [...unitDaily.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, v]) => ({
              date,
              consumed: Math.round(v.consumed * 10) / 10,
              filled: Math.round(v.filled * 10) / 10,
              theft: Math.round(v.theft * 10) / 10,
              mileage: Math.round(v.mileage * 10) / 10,
              runtimeHours: Math.round((runtimePerDay.get(date) ?? 0) * 10) / 10,
            })),
          runtimeIntervals: (runtimeIntervalsByUnit.get(opts.unitId) ?? []).sort((a, b) => b.start - a.start),
        };
      }
    }

    return {
      from: opts.from,
      to: opts.to,
      totals: {
        consumed: Math.round(groups.find((g) => g.key === 'all')?.consumed ?? 0),
        filled: Math.round(groups.find((g) => g.key === 'all')?.filled ?? 0),
        theft: Math.round(groups.find((g) => g.key === 'all')?.theft ?? 0),
        mileage: Math.round(groups.find((g) => g.key === 'all')?.mileage ?? 0),
        runtimeHours: Math.round((groups.find((g) => g.key === 'all')?.runtimeHours ?? 0) * 10) / 10,
      },
      groups,
      assets: assets.sort((a, b) => b.consumed - a.consumed),
      daily,
      unitDetail,
      fetchedAt: new Date().toISOString(),
    };
  }
}

