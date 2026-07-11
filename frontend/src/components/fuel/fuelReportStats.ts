import type { FuelTransaction } from '@/types';
import {
  groupSummaryUnitIds,
  isWialonGroupSummary,
  summaryProvidesFilled,
  summaryProvidesUsed,
} from './fuelTransactionFilters';

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

export function computeFuelReportKpis(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): FuelReportKpis {
  const summaryUnits = groupSummaryUnitIds(transactions, fromDate, toDate);
  let totalFilled = 0;
  let totalConsumed = 0;
  let totalMileage = 0;
  let theftEvents = 0;
  let theftVolume = 0;
  let fillingCount = 0;
  let consumptionCount = 0;
  const units = new Set<string>();

  for (const t of transactions) {
    units.add(String(t.unitId));

    if (isWialonGroupSummary(t)) {
      if (summaryUnits.has(String(t.unitId))) {
        if (t.filled > 0) totalFilled += t.filled;
        if (t.fuelUsed > 0) {
          totalConsumed += t.fuelUsed;
          consumptionCount += 1;
        }
        if (t.mileage > 0) totalMileage += t.mileage;
      }
      continue;
    }

    if (summaryUnits.has(String(t.unitId))) {
      if (t.section === 'theft' && t.suddenFuelDrop > 0) {
        theftEvents += t.count > 0 ? t.count : 1;
        theftVolume += t.suddenFuelDrop;
      }
      if (t.section === 'filling' && summaryProvidesFilled(transactions, t.unitId, summaryUnits, fromDate, toDate)) {
        continue;
      }
      if (t.section === 'consumption' && summaryProvidesUsed(transactions, t.unitId, summaryUnits, fromDate, toDate)) {
        continue;
      }
    }

    if (t.section === 'filling' && t.filled > 0) {
      totalFilled += t.filled;
      fillingCount += 1;
    }

    if (t.section === 'consumption') {
      totalConsumed += t.fuelUsed || 0;
      if (t.tank !== 'reserve') totalMileage += t.mileage || 0;
      if (t.fuelUsed > 0 || t.mileage > 0) consumptionCount += 1;
    }

    if (t.section === 'theft' && t.suddenFuelDrop > 0) {
      theftEvents += t.count > 0 ? t.count : 1;
      theftVolume += t.suddenFuelDrop;
    }
  }

  const avgConsumption =
    totalMileage > 0 ? Math.round((totalConsumed / totalMileage) * 1000) / 10 : 0;

  return {
    totalFilled: Math.round(totalFilled * 10) / 10,
    totalConsumed: Math.round(totalConsumed * 10) / 10,
    totalMileage: Math.round(totalMileage * 10) / 10,
    avgConsumption,
    theftEvents,
    theftVolume: Math.round(theftVolume * 10) / 10,
    vehiclesTracked: units.size,
    fillingCount,
    consumptionCount,
  };
}

export function computeVehicleFuelRows(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): VehicleFuelReportRow[] {
  const summaryUnits = groupSummaryUnitIds(transactions, fromDate, toDate);
  const byUnit = new Map<string, VehicleFuelReportRow>();

  for (const t of transactions) {
    const key = String(t.unitId);
    let row = byUnit.get(key);
    if (!row) {
      row = {
        unitId: key,
        unitName: t.unitName,
        filled: 0,
        consumed: 0,
        mileage: 0,
        avgConsumption: 0,
        theftEvents: 0,
        theftVolume: 0,
      };
      byUnit.set(key, row);
    }

    if (isWialonGroupSummary(t)) {
      if (summaryUnits.has(key)) {
        if (t.filled > 0) row.filled = t.filled;
        if (t.fuelUsed > 0) row.consumed = t.fuelUsed;
        if (t.mileage > 0) row.mileage = t.mileage;
      }
      continue;
    }

    if (summaryUnits.has(key)) {
      if (t.section === 'theft' && t.suddenFuelDrop > 0) {
        row.theftEvents += t.count > 0 ? t.count : 1;
        row.theftVolume += t.suddenFuelDrop;
      }
      if (t.section === 'filling' && summaryProvidesFilled(transactions, t.unitId, summaryUnits, fromDate, toDate)) {
        continue;
      }
      if (t.section === 'consumption' && summaryProvidesUsed(transactions, t.unitId, summaryUnits, fromDate, toDate)) {
        continue;
      }
    }

    if (t.section === 'filling' && t.filled > 0) row.filled += t.filled;
    if (t.section === 'consumption') {
      row.consumed += t.fuelUsed || 0;
      if (t.tank !== 'reserve') row.mileage += t.mileage || 0;
    }
    if (t.section === 'theft' && t.suddenFuelDrop > 0) {
      row.theftEvents += t.count > 0 ? t.count : 1;
      row.theftVolume += t.suddenFuelDrop;
    }
  }

  return [...byUnit.values()]
    .map((r) => ({
      ...r,
      filled: Math.round(r.filled * 10) / 10,
      consumed: Math.round(r.consumed * 10) / 10,
      mileage: Math.round(r.mileage * 10) / 10,
      theftVolume: Math.round(r.theftVolume * 10) / 10,
      avgConsumption:
        r.mileage > 0 ? Math.round((r.consumed / r.mileage) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.unitName.localeCompare(b.unitName));
}

export function applyPriceToKpis(kpis: FuelReportKpis, pricePerLiter: number) {
  const price = pricePerLiter > 0 ? pricePerLiter : 0;
  return {
    fillCost: price ? Math.round(kpis.totalFilled * price) : 0,
    usageCost: price ? Math.round(kpis.totalConsumed * price) : 0,
    lossCost: price ? Math.round(kpis.theftVolume * price) : 0,
  };
}
