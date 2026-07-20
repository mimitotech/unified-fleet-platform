import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed, effectiveFilled, effectiveTheft } from './wialonFuelReport/metrics.js';
import {
  effectiveSummaryUnitIds,
  isWialonGroupSummary,
} from './wialonFuelReport/rangeFilter.js';

/**
 * Fleet KPIs aligned with Wialon group-report period totals:
 * units with a covering summary use summary only; others sum plausible leaves.
 */
export function computeFuelKpis(rows: FuelTransaction[], fromDate?: string, toDate?: string) {
  const summaryUnitIds = effectiveSummaryUnitIds(rows, fromDate, toDate);

  const filledByUnit = new Map<number, number>();
  const usedByUnit = new Map<number, number>();
  const dropByUnit = new Map<number, number>();
  let theftEvents = 0;
  let fillingCount = 0;
  let consumptionCount = 0;
  let totalMileage = 0;

  for (const r of rows) {
    if (isWialonGroupSummary(r)) {
      if (!summaryUnitIds.has(r.unitId)) continue;
      if (r.filled > 0) {
        filledByUnit.set(r.unitId, Math.max(filledByUnit.get(r.unitId) ?? 0, r.filled));
      }
      if (r.fuelUsed > 0) {
        usedByUnit.set(r.unitId, Math.max(usedByUnit.get(r.unitId) ?? 0, r.fuelUsed));
      }
      const drop = effectiveTheft(r);
      if (drop > 0) {
        dropByUnit.set(r.unitId, Math.max(dropByUnit.get(r.unitId) ?? 0, drop));
        theftEvents += r.count > 0 ? r.count : 1;
      }
      continue;
    }

    // Units in the group report: leaves never contribute to KPI totals.
    if (summaryUnitIds.has(r.unitId)) continue;

    if (r.section === 'filling') {
      const v = effectiveFilled(r);
      if (v > 0) {
        filledByUnit.set(r.unitId, (filledByUnit.get(r.unitId) ?? 0) + v);
        fillingCount += 1;
      }
    }
    if (r.section === 'consumption') {
      const v = effectiveConsumed(r);
      if (v > 0) {
        usedByUnit.set(r.unitId, (usedByUnit.get(r.unitId) ?? 0) + v);
        consumptionCount += 1;
        if (r.tank === 'main') totalMileage += r.mileage || 0;
      }
    }
    if (r.section === 'theft') {
      const v = effectiveTheft(r);
      if (v > 0) {
        dropByUnit.set(r.unitId, (dropByUnit.get(r.unitId) ?? 0) + v);
        theftEvents += r.count > 0 ? r.count : 1;
      }
    }
  }

  // Count fill/consumption events for summary units from leaf rows (display only counts).
  for (const r of rows) {
    if (isWialonGroupSummary(r) || !summaryUnitIds.has(r.unitId)) continue;
    if (r.section === 'filling' && effectiveFilled(r) > 0) fillingCount += 1;
    if (r.section === 'consumption' && effectiveConsumed(r) > 0) {
      consumptionCount += 1;
      if (r.tank === 'main') totalMileage += r.mileage || 0;
    }
  }

  const totalFilled = [...filledByUnit.values()].reduce((a, b) => a + b, 0);
  const totalConsumed = [...usedByUnit.values()].reduce((a, b) => a + b, 0);
  const totalTheftLiters = [...dropByUnit.values()].reduce((a, b) => a + b, 0);
  const avgConsumption = totalMileage > 0 ? Math.round((totalConsumed / totalMileage) * 1000) / 10 : 0;

  return {
    totalFilled: Math.round(totalFilled * 10) / 10,
    totalConsumed: Math.round(totalConsumed * 10) / 10,
    totalTheftLiters: Math.round(totalTheftLiters * 10) / 10,
    totalMileage: Math.round(totalMileage * 10) / 10,
    avgConsumption,
    theftEvents,
    vehiclesTracked: new Set(rows.map((r) => r.unitId).filter(Boolean)).size,
    consumptionCount,
    fillingCount,
    theftCount: theftEvents,
  };
}

export function monthlyFuelTrend(rows: FuelTransaction[]) {
  const byMonth = new Map<string, { filled: number; consumed: number }>();
  for (const r of rows) {
    if (!r.timestamp) continue;
    if (isWialonGroupSummary(r)) continue; // avoid double-counting month trend with leaves
    const month = new Date(r.timestamp * 1000).toISOString().slice(0, 7);
    const row = byMonth.get(month) ?? { filled: 0, consumed: 0 };
    if (r.section === 'filling') row.filled += effectiveFilled(r);
    if (r.section === 'consumption') row.consumed += effectiveConsumed(r);
    if (r.section === 'theft') row.consumed += effectiveTheft(r);
    byMonth.set(month, row);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      filled: Math.round(v.filled * 10) / 10,
      consumed: Math.round(v.consumed * 10) / 10,
    }));
}

export function enrichTankLevels<T extends FuelTransaction>(mapped: T[]): T[] {
  const tankByKey = new Map<string, { main?: number; reserve?: number }>();
  for (const r of mapped) {
    const key = `${r.unitId}:${r.timestamp}`;
    const cur = tankByKey.get(key) ?? {};
    if (r.tank === 'main') cur.main = r.finalLevel;
    if (r.tank === 'reserve') cur.reserve = r.finalLevel;
    tankByKey.set(key, cur);
  }
  return mapped.map((r) => {
    const key = `${r.unitId}:${r.timestamp}`;
    const levels = tankByKey.get(key);
    return {
      ...r,
      mainTankLevel: levels?.main ?? r.mainTankLevel,
      reserveTankLevel: levels?.reserve ?? r.reserveTankLevel,
    };
  });
}

export function splitDateRangeByDays(
  fromDate: string,
  toDate: string,
  chunkDays: number,
): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    return [{ from: fromDate, to: toDate }];
  }
  const safeChunk = Math.max(1, chunkDays);
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + safeChunk - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    out.push({
      from: chunkStart.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    cursor.setUTCDate(cursor.getUTCDate() + safeChunk);
  }
  return out;
}

export function rollingFuelRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - Math.max(1, days - 1) * 86400000);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { from: fmt(from), to: fmt(to) };
}
