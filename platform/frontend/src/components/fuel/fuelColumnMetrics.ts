import type { FuelTransaction } from '@/types/entities';
import type { TransactionDisplayValues } from './FuelTransactionsTable/types';
import {
  isWialonGroupSummary,
  filterFuelTransactionsByDate,
  isSyntheticFuelRow,
} from './fuelTransactionFilters';
import { derivePeriodFuelUsed } from './derivePeriodFuelUsed';
import { filterPlausibleFuelEvents } from './fuelEventPlausibility';
import { effectiveSuddenDropVolume } from './fuelTheftVolume';
import type { FuelReportKpis } from './fuelReportStats';

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function dateFromTs(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Derive fill liters from level rise when the filled column is empty (matches backend). */
function deriveFilled(filled: number, initialLevel: number, finalLevel: number): number {
  if (filled > 0) return filled;
  if (initialLevel > 0 && finalLevel > initialLevel) return finalLevel - initialLevel;
  return filled;
}

/** Derive used liters from level drop when fuelUsed is empty (matches backend). */
function deriveFuelUsed(fuelUsed: number, initialLevel: number, finalLevel: number): number {
  if (fuelUsed > 0) return fuelUsed;
  if (initialLevel > 0 && finalLevel >= 0 && initialLevel > finalLevel) {
    return initialLevel - finalLevel;
  }
  return fuelUsed;
}

function effectiveFilledVol(t: FuelTransaction): number {
  if (t.section !== 'filling') return 0;
  return deriveFilled(Number(t.filled) || 0, Number(t.initialLevel) || 0, Number(t.finalLevel) || 0);
}

function effectiveUsedVol(t: FuelTransaction): number {
  if (t.section !== 'consumption') return 0;
  return deriveFuelUsed(Number(t.fuelUsed) || 0, Number(t.initialLevel) || 0, Number(t.finalLevel) || 0);
}

/** Exact-range Wialon group summaries only (not wider nested periods). */
function exactRangeSummaries(
  txs: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): FuelTransaction[] {
  if (!fromDate || !toDate) return [];
  return txs.filter((t) => {
    if (!isWialonGroupSummary(t)) return false;
    if (!t.periodFromTs || !t.periodToTs) return false;
    return dateFromTs(t.periodFromTs) === fromDate && dateFromTs(t.periodToTs) === toDate;
  });
}

/** Per-row display — each event shows only its own metric in the correct column. */
export function getTransactionColumnValues(t: FuelTransaction): TransactionDisplayValues {
  const isMain = t.tank === 'main' || !t.tank;
  const isReserve = t.tank === 'reserve';

  let filledMain = 0;
  let filledReserve = 0;
  let usedMain = 0;
  let usedReserve = 0;
  let dropMain = 0;
  let dropReserve = 0;

  const filledVol = effectiveFilledVol(t);
  if (filledVol > 0) {
    if (isReserve) filledReserve = filledVol;
    else filledMain = filledVol;
  }

  const usedVol = effectiveUsedVol(t);
  if (usedVol > 0) {
    if (isReserve) usedReserve = usedVol;
    else usedMain = usedVol;
  }

  const dropVol = t.section === 'theft' ? effectiveSuddenDropVolume(t) : 0;
  if (t.section === 'theft' && dropVol > 0) {
    if (isReserve) dropReserve = dropVol;
    else dropMain = dropVol;
  }

  const levelMain =
    t.mainTankLevel ?? (isMain && t.finalLevel > 0 ? t.finalLevel : isMain && t.initialLevel > 0 ? t.initialLevel : 0);
  const levelReserve =
    t.reserveTankLevel ?? (isReserve && t.finalLevel > 0 ? t.finalLevel : isReserve && t.initialLevel > 0 ? t.initialLevel : 0);

  const totalFilledFls = filledMain + filledReserve;
  const filledStation = t.filledStation ?? 0;
  const variance = totalFilledFls > 0 || filledStation > 0 ? totalFilledFls - filledStation : 0;

  return {
    filledMain,
    filledReserve,
    filledStation,
    variance,
    usedMain,
    usedReserve,
    levelMain,
    levelReserve,
    dropMain,
    dropReserve,
    totalLevel: levelMain + levelReserve,
    totalDrop: dropMain + dropReserve,
    totalUsed: usedMain + usedReserve,
    totalFilledFls,
    fuelType: t.fuelType || '',
    totalCost: t.totalCost ?? 0,
    cardNumber: t.cardNumber?.trim() ?? '',
  };
}

export type UnitFuelColumnTotals = TransactionDisplayValues & {
  alertCount: number;
};

type AggregateOpts = {
  fromDate?: string;
  toDate?: string;
  liveLevel?: number;
};

/**
 * Period totals per unit.
 * Collapsed parent row = sum of the same leaf events shown when expanded.
 * Exact-range Wialon group summaries fill a metric only when leaves have nothing for it.
 */
export function aggregateUnitFuelColumns(
  transactions: FuelTransaction[],
  opts?: AggregateOpts,
): UnitFuelColumnTotals {
  const periodTxs = filterPlausibleFuelEvents(
    filterFuelTransactionsByDate(transactions, opts?.fromDate, opts?.toDate),
    opts?.liveLevel,
  );
  const leaves = periodTxs.filter((t) => !isSyntheticFuelRow(t));
  const exactSummaries = exactRangeSummaries(periodTxs, opts?.fromDate, opts?.toDate);
  const latestMainTs = { value: -1 };
  const latestReserveTs = { value: -1 };
  const hasRealUsed =
    leaves.some((t) => effectiveUsedVol(t) > 0) ||
    exactSummaries.some((t) => Number(t.fuelUsed ?? 0) > 0);

  const totals: UnitFuelColumnTotals = {
    filledMain: 0,
    filledReserve: 0,
    filledStation: 0,
    variance: 0,
    usedMain: 0,
    usedReserve: 0,
    levelMain: 0,
    levelReserve: 0,
    dropMain: 0,
    dropReserve: 0,
    totalLevel: 0,
    totalDrop: 0,
    totalUsed: 0,
    totalFilledFls: 0,
    fuelType: '',
    totalCost: 0,
    cardNumber: '',
    alertCount: 0,
  };

  const fuelTypeCounts = new Map<string, number>();
  let latestCard = '';
  let latestCardTs = -1;

  for (const t of leaves) {
    const isMain = t.tank === 'main' || !t.tank;
    const isReserve = t.tank === 'reserve';

    const filledVol = effectiveFilledVol(t);
    if (filledVol > 0) {
      if (isReserve) totals.filledReserve += filledVol;
      else totals.filledMain += filledVol;
    }

    const usedVol = effectiveUsedVol(t);
    if (usedVol > 0) {
      if (isReserve) totals.usedReserve += usedVol;
      else totals.usedMain += usedVol;
    }

    if (t.section === 'theft') {
      const vol = effectiveSuddenDropVolume(t);
      if (vol > 0) {
        if (isReserve) totals.dropReserve += vol;
        else totals.dropMain += vol;
        totals.alertCount += t.count > 0 ? t.count : 1;
      }
    }

    if (isMain && t.timestamp > latestMainTs.value) {
      if (t.finalLevel > 0) totals.levelMain = t.finalLevel;
      else if (t.initialLevel > 0) totals.levelMain = t.initialLevel;
      latestMainTs.value = t.timestamp;
    }
    if (isReserve && t.timestamp > latestReserveTs.value) {
      if (t.finalLevel > 0) totals.levelReserve = t.finalLevel;
      else if (t.initialLevel > 0) totals.levelReserve = t.initialLevel;
      latestReserveTs.value = t.timestamp;
    }

    totals.filledStation += t.filledStation ?? 0;
    totals.totalCost += t.totalCost ?? 0;

    if (t.fuelType) {
      const key = t.fuelType.trim();
      fuelTypeCounts.set(key, (fuelTypeCounts.get(key) ?? 0) + 1);
    }
    if (t.cardNumber?.trim() && t.timestamp >= latestCardTs) {
      latestCard = t.cardNumber.trim();
      latestCardTs = t.timestamp;
    }
  }

  // Exact-range summary fills gaps only — never inflate above leaf event sums.
  if (exactSummaries.length) {
    let summaryFilled = 0;
    let summaryUsed = 0;
    let summaryDrop = 0;
    let summaryLevel = 0;
    let summaryAlerts = 0;
    for (const t of exactSummaries) {
      if (t.filled > summaryFilled) summaryFilled = t.filled;
      if (t.fuelUsed > summaryUsed) summaryUsed = t.fuelUsed;
      const drop = effectiveSuddenDropVolume(t);
      if (drop > summaryDrop) {
        summaryDrop = drop;
        summaryAlerts = Math.max(summaryAlerts, t.count > 0 ? t.count : 1);
      }
      if (t.finalLevel > 0) summaryLevel = t.finalLevel;
    }
    if (totals.filledMain <= 0 && summaryFilled > 0) totals.filledMain = summaryFilled;
    if (totals.usedMain <= 0 && summaryUsed > 0) totals.usedMain = summaryUsed;
    if (totals.dropMain <= 0 && summaryDrop > 0) {
      totals.dropMain = summaryDrop;
      totals.alertCount = Math.max(totals.alertCount, summaryAlerts);
    }
    if (totals.levelMain <= 0 && summaryLevel > 0) totals.levelMain = summaryLevel;
  }

  // Balance-derived used when nothing else reports consumption.
  if (!hasRealUsed && totals.usedMain <= 0 && totals.filledMain > 0) {
    const mainTxs = leaves.filter((t) => t.tank === 'main' || !t.tank);
    const derived = derivePeriodFuelUsed(mainTxs, totals.filledMain, totals.dropMain, opts?.liveLevel);
    if (derived > 0) totals.usedMain = derived;
  }
  if (!hasRealUsed && totals.usedReserve <= 0 && totals.filledReserve > 0) {
    const reserveTxs = leaves.filter((t) => t.tank === 'reserve');
    const derived = derivePeriodFuelUsed(reserveTxs, totals.filledReserve, totals.dropReserve, opts?.liveLevel);
    if (derived > 0) totals.usedReserve = derived;
  }

  // Live sensor updates main tank only — keep reserve from period events.
  if (opts?.liveLevel && opts.liveLevel > 0) {
    totals.levelMain = opts.liveLevel;
  }

  totals.totalFilledFls = totals.filledMain + totals.filledReserve;
  totals.variance =
    totals.totalFilledFls > 0 || totals.filledStation > 0
      ? totals.totalFilledFls - totals.filledStation
      : 0;
  totals.totalDrop = round1(totals.dropMain + totals.dropReserve);
  totals.totalUsed = round1(totals.usedMain + totals.usedReserve);
  totals.totalLevel = round1(totals.levelMain + totals.levelReserve);

  if (fuelTypeCounts.size) {
    totals.fuelType = [...fuelTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  totals.cardNumber = latestCard;

  return {
    ...totals,
    filledMain: round1(totals.filledMain),
    filledReserve: round1(totals.filledReserve),
    filledStation: round1(totals.filledStation),
    variance: round1(totals.variance),
    usedMain: round1(totals.usedMain),
    usedReserve: round1(totals.usedReserve),
    levelMain: round1(totals.levelMain),
    levelReserve: round1(totals.levelReserve),
    dropMain: round1(totals.dropMain),
    dropReserve: round1(totals.dropReserve),
    totalCost: round1(totals.totalCost),
  };
}

/**
 * Fleet-wide period KPIs — uses the same per-unit aggregation as collapsed table rows
 * so KPI tiles always match the table totals for the selected date range.
 */
export function computePeriodFuelKpis(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
  liveLevelsByName?: Map<string, number>,
): FuelReportKpis {
  const periodTxs = filterFuelTransactionsByDate(transactions, fromDate, toDate);
  const byUnit = new Map<string, FuelTransaction[]>();

  for (const t of periodTxs) {
    const list = byUnit.get(t.unitName) ?? [];
    list.push(t);
    byUnit.set(t.unitName, list);
  }

  let totalFilled = 0;
  let totalConsumed = 0;
  let totalMileage = 0;
  let theftEvents = 0;
  let theftVolume = 0;
  let fillingCount = 0;
  let consumptionCount = 0;

  for (const [unitName, unitTxs] of byUnit) {
    const liveLevel = liveLevelsByName?.get(unitName);
    const cols = aggregateUnitFuelColumns(unitTxs, {
      fromDate,
      toDate,
      liveLevel,
    });
    totalFilled += cols.filledMain + cols.filledReserve;
    totalConsumed += cols.totalUsed;
    theftVolume += cols.totalDrop;
    theftEvents += cols.alertCount;

    for (const t of filterPlausibleFuelEvents(unitTxs, liveLevel)) {
      if (isSyntheticFuelRow(t)) continue;
      if (effectiveFilledVol(t) > 0) fillingCount += 1;
      if (effectiveUsedVol(t) > 0) {
        consumptionCount += 1;
        if (t.tank !== 'reserve') totalMileage += t.mileage || 0;
      }
    }
  }

  const avgConsumption =
    totalMileage > 0 ? Math.round((totalConsumed / totalMileage) * 1000) / 10 : 0;

  return {
    totalFilled: round1(totalFilled),
    totalConsumed: round1(totalConsumed),
    totalMileage: round1(totalMileage),
    avgConsumption,
    theftEvents,
    theftVolume: round1(theftVolume),
    vehiclesTracked: byUnit.size,
    fillingCount,
    consumptionCount,
  };
}
