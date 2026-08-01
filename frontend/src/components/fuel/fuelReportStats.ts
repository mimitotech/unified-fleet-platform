import type { FuelTransaction } from '@/types';
import { aggregateUnitFuelColumns, computePeriodFuelKpis } from './fuelColumnMetrics';
import { effectiveSuddenDropVolume } from './fuelTheftVolume';
import { isSyntheticFuelRow } from './fuelTransactionFilters';

export type FuelReportKpis = {
  totalFilled: number;
  totalConsumed: number;
  totalMileage: number;
  avgConsumption: number;
  theftEvents: number;
  theftVolume: number;
  vehiclesTracked: number;
  fillingCount: number;
  consumptionCount: number;
  /** Sum of live tank levels across assets (litres). */
  totalLiveFuelLiters?: number;
};

export type VehicleFuelReportRow = {
  unitId: string;
  unitName: string;
  filled: number;
  consumed: number;
  mileage: number;
  avgConsumption: number;
  theftEvents: number;
  theftVolume: number;
};

/** Same aggregation as the fuel table / KPI strip. */
export function computeFuelReportKpis(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): FuelReportKpis {
  return computePeriodFuelKpis(transactions, fromDate, toDate);
}

export function computeVehicleFuelRows(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): VehicleFuelReportRow[] {
  const byUnit = new Map<string, FuelTransaction[]>();

  for (const t of transactions) {
    const key = String(t.unitId);
    const list = byUnit.get(key) ?? [];
    list.push(t);
    byUnit.set(key, list);
  }

  const rows: VehicleFuelReportRow[] = [];
  for (const [unitId, unitTxs] of byUnit) {
    const cols = aggregateUnitFuelColumns(unitTxs, { fromDate, toDate });
    let mileage = 0;
    let theftEvents = 0;
    for (const t of unitTxs) {
      if (isSyntheticFuelRow(t)) continue;
      if (t.section === 'consumption' && t.tank !== 'reserve') mileage += t.mileage || 0;
      if (t.section === 'theft' && effectiveSuddenDropVolume(t) > 0) {
        theftEvents += t.count > 0 ? t.count : 1;
      }
    }
    rows.push({
      unitId,
      unitName: unitTxs[0]?.unitName ?? unitId,
      filled: cols.filledMain + cols.filledReserve,
      consumed: cols.totalUsed,
      mileage: Math.round(mileage * 10) / 10,
      theftEvents: theftEvents || cols.alertCount,
      theftVolume: cols.totalDrop,
      avgConsumption:
        mileage > 0 ? Math.round((cols.totalUsed / mileage) * 1000) / 10 : 0,
    });
  }

  return rows.sort((a, b) => a.unitName.localeCompare(b.unitName));
}

export function applyPriceToKpis(kpis: FuelReportKpis, pricePerLiter: number) {
  const price = pricePerLiter > 0 ? pricePerLiter : 0;
  return {
    fillCost: price ? Math.round(kpis.totalFilled * price) : 0,
    usageCost: price ? Math.round(kpis.totalConsumed * price) : 0,
    lossCost: price ? Math.round(kpis.theftVolume * price) : 0,
  };
}
