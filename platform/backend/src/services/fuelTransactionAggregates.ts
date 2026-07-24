import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed, effectiveFilled, effectiveTheft } from './wialonFuelReport/metrics.js';
import {
  exactRangeSummaryUnitIds,
  isExactRangeSummary,
  isWialonGroupSummary,
} from './wialonFuelReport/rangeFilter.js';

/**
 * Fleet KPIs — same policy as the Fuel UI table:
 * exact-range Wialon group summaries are authoritative for Filled / Used / Drop;
 * leaf events fill a metric only when the report has no period total for it.
 */
export function computeFuelKpis(rows: FuelTransaction[], fromDate?: string, toDate?: string) {
  const exactSummaryIds = exactRangeSummaryUnitIds(rows, fromDate, toDate);

  const byUnit = new Map<number, FuelTransaction[]>();
  for (const r of rows) {
    if (!r.unitId) continue;
    const list = byUnit.get(r.unitId) ?? [];
    list.push(r);
    byUnit.set(r.unitId, list);
  }

  let totalFilled = 0;
  let totalConsumed = 0;
  let totalTheftLiters = 0;
  let theftEvents = 0;
  let fillingCount = 0;
  let consumptionCount = 0;
  let totalMileage = 0;

  for (const [unitId, unitRows] of byUnit) {
    const leaves = unitRows.filter((r) => !isWialonGroupSummary(r) && r.sensor !== 'balance');
    const exactSummaries = unitRows.filter((r) => isExactRangeSummary(r, fromDate, toDate));

    let summaryFilled = 0;
    let summaryUsed = 0;
    let summaryDrop = 0;
    let summaryAlerts = 0;
    if (exactSummaries.length && exactSummaryIds.has(unitId)) {
      for (const t of exactSummaries) {
        if (t.filled > summaryFilled) summaryFilled = t.filled;
        if (t.fuelUsed > summaryUsed) summaryUsed = t.fuelUsed;
        const d = effectiveTheft(t);
        if (d > summaryDrop) {
          summaryDrop = d;
          summaryAlerts = Math.max(summaryAlerts, t.count > 0 ? t.count : 1);
        }
      }
    }

    let filled = 0;
    let used = 0;
    let drop = 0;

    for (const r of leaves) {
      if (r.section === 'filling') {
        const v = effectiveFilled(r);
        if (v > 0) {
          if (summaryFilled <= 0) filled += v;
          fillingCount += 1;
        }
      }
      if (r.section === 'consumption') {
        const v = effectiveConsumed(r);
        if (v > 0) {
          if (summaryUsed <= 0) used += v;
          consumptionCount += 1;
          if (r.tank !== 'reserve') totalMileage += r.mileage || 0;
        }
      }
      if (r.section === 'theft') {
        const v = effectiveTheft(r);
        if (v > 0) {
          if (summaryDrop <= 0) {
            drop += v;
            theftEvents += r.count > 0 ? r.count : 1;
          }
        }
      }
    }

    if (summaryFilled > 0) filled = summaryFilled;
    if (summaryUsed > 0) used = summaryUsed;
    if (summaryDrop > 0) {
      drop = summaryDrop;
      theftEvents += summaryAlerts;
    }

    totalFilled += filled;
    totalConsumed += used;
    totalTheftLiters += drop;
  }

  const avgConsumption =
    totalMileage > 0 ? Math.round((totalConsumed / totalMileage) * 1000) / 10 : 0;

  return {
    totalFilled: Math.round(totalFilled * 10) / 10,
    totalConsumed: Math.round(totalConsumed * 10) / 10,
    totalTheftLiters: Math.round(totalTheftLiters * 10) / 10,
    totalMileage: Math.round(totalMileage * 10) / 10,
    avgConsumption,
    theftEvents,
    vehiclesTracked: byUnit.size,
    consumptionCount,
    fillingCount,
    theftCount: theftEvents,
  };
}

export function monthlyFuelTrend(rows: FuelTransaction[]) {
  const byMonth = new Map<string, { filled: number; consumed: number }>();
  for (const r of rows) {
    if (!r.timestamp) continue;
    if (isWialonGroupSummary(r) || r.sensor === 'balance') continue;
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
    if (r.tank === 'main' || !r.tank) cur.main = r.finalLevel;
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
