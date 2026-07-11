import type { FuelTransaction } from '@/types/entities';

/** Wialon Fuel Report(Group) per-vehicle period summary row. */
export function isWialonGroupSummary(t: FuelTransaction): boolean {
  return t.sensor === 'wialon_group_summary';
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

/** Include summary rows when their calendar month overlaps the selected range. */
export function summaryMonthOverlapsRange(
  t: FuelTransaction,
  fromDate: string,
  toDate: string,
): boolean {
  if (!isWialonGroupSummary(t) || !t.timestamp) return false;
  const { start, end } = monthBoundsFromTs(t.timestamp);
  return end >= fromDate && start <= toDate;
}

/** Use period totals from summary when it matches the selected range (exact or full month). */
export function summaryCoversSelectedRange(
  t: FuelTransaction,
  fromDate: string,
  toDate: string,
): boolean {
  if (!isWialonGroupSummary(t) || !t.timestamp) return false;
  const rowDate = new Date(t.timestamp * 1000).toISOString().slice(0, 10);
  if (rowDate >= fromDate && rowDate <= toDate) return true;
  const { start, end } = monthBoundsFromTs(t.timestamp);
  return fromDate <= start && toDate >= end;
}

export function isCompleteMonthSpan(fromDate: string, toDate: string): boolean {
  const start = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  const months: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cur.getTime() <= endMonth) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  for (let i = 0; i < months.length; i++) {
    const yyyyMm = months[i];
    const [y, m] = yyyyMm.split('-').map(Number);
    const monthStart = `${yyyyMm}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${yyyyMm}-${String(lastDay).padStart(2, '0')}`;
    if (i === 0 && fromDate !== monthStart) return false;
    if (i === months.length - 1 && toDate !== monthEnd) return false;
  }
  return months.length > 0;
}

/** Filter transactions to a date range; keep overlapping period summary rows. */
export function filterFuelTransactionsByDate(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): FuelTransaction[] {
  const from = fromDate ?? '';
  const to = toDate ?? '';
  const allowSummaries = from && to ? isCompleteMonthSpan(from, to) : true;
  return transactions.filter((t) => {
    if (isWialonGroupSummary(t)) {
      if (!from || !to) return true;
      if (!allowSummaries) return summaryCoversSelectedRange(t, from, to);
      return summaryMonthOverlapsRange(t, from, to);
    }
    if (!t.timestamp) return true;
    const txDateStr = new Date(t.timestamp * 1000).toISOString().split('T')[0];
    if (fromDate && txDateStr < fromDate) return false;
    if (toDate && txDateStr > toDate) return false;
    return true;
  });
}

/** Units whose Wialon group summary should drive period totals for the selected range. */
export function groupSummaryUnitIds(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): Set<string> {
  const ids = new Set<string>();
  for (const t of transactions) {
    if (!isWialonGroupSummary(t)) continue;
    if (fromDate && toDate && !summaryCoversSelectedRange(t, fromDate, toDate)) continue;
    ids.add(String(t.unitId));
  }
  return ids;
}

/** True when a period summary row already carries filled volume for this unit. */
export function summaryProvidesFilled(
  transactions: FuelTransaction[],
  unitId: string | number,
  summaryUnits: Set<string>,
  fromDate?: string,
  toDate?: string,
): boolean {
  if (!fromDate || !toDate || !isCompleteMonthSpan(fromDate, toDate)) return false;
  if (!summaryUnits.has(String(unitId))) return false;
  return transactions.some(
    (t) =>
      isWialonGroupSummary(t) &&
      String(t.unitId) === String(unitId) &&
      (t.filled ?? 0) > 0,
  );
}

/** True when a period summary row already carries consumption for this unit. */
export function summaryProvidesUsed(
  transactions: FuelTransaction[],
  unitId: string | number,
  summaryUnits: Set<string>,
  fromDate?: string,
  toDate?: string,
): boolean {
  if (!fromDate || !toDate || !isCompleteMonthSpan(fromDate, toDate)) return false;
  if (!summaryUnits.has(String(unitId))) return false;
  return transactions.some(
    (t) =>
      isWialonGroupSummary(t) &&
      String(t.unitId) === String(unitId) &&
      (t.fuelUsed ?? 0) > 0,
  );
}

/** Synthetic rows produced by balance enrichment — not shown as line items. */
export function isSyntheticFuelRow(t: FuelTransaction): boolean {
  return t.sensor === 'wialon_group_summary' || t.sensor === 'balance';
}
