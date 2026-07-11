import type { FuelTransaction } from '@/types/entities';
import type { TransactionDisplayValues } from './FuelTransactionsTable/types';
import { groupSummaryUnitIds, isWialonGroupSummary, summaryProvidesFilled, summaryProvidesUsed, filterFuelTransactionsByDate, isSyntheticFuelRow } from './fuelTransactionFilters';
import { derivePeriodFuelUsed } from './derivePeriodFuelUsed';
import type { FuelReportKpis } from './fuelReportStats';

function round1(n: number) {
  return Math.round(n * 10) / 10;
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

  if (t.section === 'filling' && t.filled > 0) {
    if (isReserve) filledReserve = t.filled;
    else filledMain = t.filled;
  }

  if (t.section === 'consumption' && (t.fuelUsed ?? 0) > 0) {
    if (isReserve) usedReserve = t.fuelUsed;
    else usedMain = t.fuelUsed;
  }

  if (t.section === 'theft' && (t.suddenFuelDrop ?? 0) > 0) {
    if (isReserve) dropReserve = t.suddenFuelDrop;
    else dropMain = t.suddenFuelDrop;
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
 * Period totals per unit — each column aggregates only its Wialon meaning.
 * Used = consumption (+ balance-derived when fillings-only). Drop = sudden fuel loss only.
 */
export function aggregateUnitFuelColumns(
  transactions: FuelTransaction[],
  opts?: AggregateOpts,
): UnitFuelColumnTotals {
  const periodTxs = filterFuelTransactionsByDate(transactions, opts?.fromDate, opts?.toDate);
  const summaryUnits = groupSummaryUnitIds(periodTxs, opts?.fromDate, opts?.toDate);
  const latestMainTs = { value: -1 };
  const latestReserveTs = { value: -1 };

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

  for (const t of periodTxs) {
    const isMain = t.tank === 'main' || !t.tank;
    const isReserve = t.tank === 'reserve';

    if (isWialonGroupSummary(t)) {
      if (!summaryUnits.has(String(t.unitId))) continue;
      if (t.filled > 0) totals.filledMain = t.filled;
      if (t.fuelUsed > 0) totals.usedMain = t.fuelUsed;
      if (t.finalLevel > 0) totals.levelMain = t.finalLevel;
      continue;
    }

    if (t.sensor === 'balance') {
      const skipUsedDetail = summaryProvidesUsed(
        periodTxs,
        t.unitId,
        summaryUnits,
        opts?.fromDate,
        opts?.toDate,
      );
      if (!skipUsedDetail && t.section === 'consumption' && Number(t.fuelUsed ?? 0) > 0) {
        const vol = Number(t.fuelUsed);
        if (isReserve) totals.usedReserve += vol;
        else totals.usedMain += vol;
      }
      continue;
    }

    const skipFillDetail = summaryProvidesFilled(
      periodTxs,
      t.unitId,
      summaryUnits,
      opts?.fromDate,
      opts?.toDate,
    );
    const skipUsedDetail = summaryProvidesUsed(
      periodTxs,
      t.unitId,
      summaryUnits,
      opts?.fromDate,
      opts?.toDate,
    );

    if (!skipFillDetail && t.section === 'filling' && Number(t.filled) > 0) {
      const vol = Number(t.filled);
      if (isReserve) totals.filledReserve += vol;
      else totals.filledMain += vol;
    }

    if (!skipUsedDetail && t.section === 'consumption' && Number(t.fuelUsed ?? 0) > 0) {
      const vol = Number(t.fuelUsed);
      if (isReserve) totals.usedReserve += vol;
      else totals.usedMain += vol;
    }

    if (t.section === 'theft' && (t.suddenFuelDrop ?? 0) > 0) {
      if (isReserve) totals.dropReserve += t.suddenFuelDrop;
      else totals.dropMain += t.suddenFuelDrop;
      totals.alertCount += t.count > 0 ? t.count : 1;
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

  // Balance-derived used when Wialon only synced fillings (Fillings Report tenants).
  if (totals.usedMain <= 0 && totals.filledMain > 0) {
    const mainTxs = periodTxs.filter((t) => (t.tank === 'main' || !t.tank) && !isSyntheticFuelRow(t));
    const derived = derivePeriodFuelUsed(mainTxs, totals.filledMain, totals.dropMain, opts?.liveLevel);
    if (derived > 0) totals.usedMain = derived;
  }
  if (totals.usedReserve <= 0 && totals.filledReserve > 0) {
    const reserveTxs = periodTxs.filter((t) => t.tank === 'reserve' && !isSyntheticFuelRow(t));
    const derived = derivePeriodFuelUsed(reserveTxs, totals.filledReserve, totals.dropReserve);
    if (derived > 0) totals.usedReserve = derived;
  }

  totals.totalFilledFls = totals.filledMain + totals.filledReserve;
  totals.variance =
    totals.totalFilledFls > 0 || totals.filledStation > 0
      ? totals.totalFilledFls - totals.filledStation
      : 0;
  totals.totalDrop = round1(totals.dropMain + totals.dropReserve);
  totals.totalUsed = round1(totals.usedMain + totals.usedReserve);
  totals.totalLevel = round1(
    opts?.liveLevel && opts.liveLevel > 0
      ? opts.liveLevel
      : totals.levelMain + totals.levelReserve,
  );

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
    const cols = aggregateUnitFuelColumns(unitTxs, {
      fromDate,
      toDate,
      liveLevel: liveLevelsByName?.get(unitName),
    });
    totalFilled += cols.filledMain + cols.filledReserve;
    totalConsumed += cols.totalUsed;
    theftVolume += cols.totalDrop;

    for (const t of unitTxs) {
      if (isSyntheticFuelRow(t)) continue;
      if (t.section === 'filling' && Number(t.filled) > 0) fillingCount += 1;
      if (t.section === 'consumption' && Number(t.fuelUsed) > 0) {
        consumptionCount += 1;
        if (t.tank !== 'reserve') totalMileage += t.mileage || 0;
      }
      if (t.section === 'theft' && Number(t.suddenFuelDrop) > 0) {
        theftEvents += t.count > 0 ? t.count : 1;
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
