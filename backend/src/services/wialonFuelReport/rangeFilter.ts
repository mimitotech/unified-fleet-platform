import type { FuelTransaction } from './types.js';

export function isWialonGroupSummary(row: FuelTransaction): boolean {
  return row.sensor === 'wialon_group_summary';
}

function monthBoundsFromTs(ts: number): { start: string; end: string } {
  const yyyyMm = new Date(ts * 1000).toISOString().slice(0, 7);
  const [y, m] = yyyyMm.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${yyyyMm}-01`,
    end: `${yyyyMm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function monthsInRange(fromDate: string, toDate: string): string[] {
  const start = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  const months: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cur.getTime() <= endMonth) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
}

/** True when the range is one or more whole calendar months (e.g. 2026-06-01 → 2026-06-30). */
export function isCompleteMonthSpan(fromDate: string, toDate: string): boolean {
  const months = monthsInRange(fromDate, toDate);
  if (!months.length) return false;
  for (let i = 0; i < months.length; i++) {
    const yyyyMm = months[i];
    const [y, m] = yyyyMm.split('-').map(Number);
    const monthStart = `${yyyyMm}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${yyyyMm}-${String(lastDay).padStart(2, '0')}`;
    if (i === 0 && fromDate !== monthStart) return false;
    if (i === months.length - 1 && toDate !== monthEnd) return false;
  }
  return true;
}

/** Summary row belongs in a date-range result if its calendar month overlaps the range. */
export function summaryMonthOverlapsRange(
  row: FuelTransaction,
  fromDate: string,
  toDate: string
): boolean {
  if (!isWialonGroupSummary(row) || !row.timestamp) return false;
  const { start, end } = monthBoundsFromTs(row.timestamp);
  return end >= fromDate && start <= toDate;
}

/** Use period totals from summary when it matches the selected range (exact or full month). */
export function summaryCoversSelectedRange(
  row: FuelTransaction,
  fromDate: string,
  toDate: string
): boolean {
  if (!isWialonGroupSummary(row) || !row.timestamp) return false;
  const rowDate = new Date(row.timestamp * 1000).toISOString().slice(0, 10);
  if (rowDate >= fromDate && rowDate <= toDate) return true;
  const { start, end } = monthBoundsFromTs(row.timestamp);
  return fromDate <= start && toDate >= end;
}

export function effectiveSummaryUnitIds(
  rows: FuelTransaction[],
  fromDate?: string,
  toDate?: string
): Set<number> {
  const ids = new Set<number>();
  for (const r of rows) {
    if (!isWialonGroupSummary(r)) continue;
    if (fromDate && toDate && !summaryCoversSelectedRange(r, fromDate, toDate)) continue;
    ids.add(r.unitId);
  }
  return ids;
}

export function filterTransactionsByDateRange(
  rows: FuelTransaction[],
  fromDate: string,
  toDate: string
): FuelTransaction[] {
  const fromTs = Math.floor(new Date(fromDate + 'T00:00:00Z').getTime() / 1000);
  const toTs = Math.floor(new Date(toDate + 'T23:59:59Z').getTime() / 1000);
  const allowSummaries = isCompleteMonthSpan(fromDate, toDate);
  const deduped = new Map<string, FuelTransaction>();

  for (const r of rows) {
    if (isWialonGroupSummary(r)) {
      if (summaryCoversSelectedRange(r, fromDate, toDate)) {
        deduped.set(r.id, r);
      } else if (allowSummaries && summaryMonthOverlapsRange(r, fromDate, toDate)) {
        deduped.set(r.id, r);
      }
      continue;
    }
    if (r.timestamp && (r.timestamp < fromTs || r.timestamp > toTs)) continue;
    deduped.set(r.id, r);
  }

  return [...deduped.values()].sort((a, b) => b.timestamp - a.timestamp);
}
