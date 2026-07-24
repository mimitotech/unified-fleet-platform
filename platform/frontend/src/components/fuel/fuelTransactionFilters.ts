import type { FuelTransaction } from '@/types/entities';

/** Wialon Fuel Report(Group) per-vehicle period summary row. */
export function isWialonGroupSummary(t: FuelTransaction): boolean {
  return t.sensor === 'wialon_group_summary' || t.sensor?.startsWith('wialon_group_summary');
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

function dateFromTs(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
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

/** Include summary rows when their calendar month overlaps the selected range. */
export function summaryMonthOverlapsRange(
  t: FuelTransaction,
  fromDate: string,
  toDate: string,
): boolean {
  if (!isWialonGroupSummary(t) || !t.timestamp) return false;
  if (t.periodFromTs && t.periodToTs) {
    return summaryCoversSelectedRange(t, fromDate, toDate);
  }
  const { start, end } = monthBoundsFromTs(t.timestamp);
  return end >= fromDate && start <= toDate;
}

/**
 * Keep group-summary period totals when they represent the selected range.
 * Exact match preferred; wider nested covers kept only for filter membership
 * (aggregation uses exact-range summaries so week views are not inflated by months).
 */
export function summaryCoversSelectedRange(
  t: FuelTransaction,
  fromDate: string,
  toDate: string,
): boolean {
  if (!isWialonGroupSummary(t)) return false;

  if (t.periodFromTs && t.periodToTs) {
    const pFrom = dateFromTs(t.periodFromTs);
    const pTo = dateFromTs(t.periodToTs);
    if (pFrom === fromDate && pTo === toDate) return true;
    // Nested cover: selected range fully inside summary period (month cache).
    if (fromDate >= pFrom && toDate <= pTo) return true;
    return false;
  }

  if (!t.timestamp) return false;
  const rowDate = dateFromTs(t.timestamp);
  if (rowDate >= fromDate && rowDate <= toDate) return true;
  const { start, end } = monthBoundsFromTs(t.timestamp);
  return fromDate <= start && toDate >= end;
}

/** Exact selected-range summaries only (for collapsed totals / KPIs). */
export function isExactRangeSummary(
  t: FuelTransaction,
  fromDate: string,
  toDate: string,
): boolean {
  if (!isWialonGroupSummary(t) || !t.periodFromTs || !t.periodToTs) return false;
  return dateFromTs(t.periodFromTs) === fromDate && dateFromTs(t.periodToTs) === toDate;
}

/** Filter transactions to a date range; keep covering Wialon period summary rows. */
export function filterFuelTransactionsByDate(
  transactions: FuelTransaction[],
  fromDate?: string,
  toDate?: string,
): FuelTransaction[] {
  const from = fromDate ?? '';
  const to = toDate ?? '';
  return transactions.filter((t) => {
    if (isWialonGroupSummary(t)) {
      if (!from || !to) return true;
      if (summaryCoversSelectedRange(t, from, to)) return true;
      // Full calendar months: also accept month-grain summaries that overlap.
      if (isCompleteMonthSpan(from, to)) return summaryMonthOverlapsRange(t, from, to);
      return false;
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

/**
 * When a unit has an exact-range group-summary row, collapsed totals come from
 * those Wialon report period totals — leaf FLS events only fill metrics the
 * report did not provide, and still drive the expanded event list.
 */
export function unitHasPeriodSummary(
  unitId: string | number,
  summaryUnits: Set<string>,
): boolean {
  return summaryUnits.has(String(unitId));
}

/** True when a period summary row already carries filled volume for this unit. */
export function summaryProvidesFilled(
  transactions: FuelTransaction[],
  unitId: string | number,
  summaryUnits: Set<string>,
  fromDate?: string,
  toDate?: string,
): boolean {
  if (!summaryUnits.has(String(unitId))) return false;
  return transactions.some(
    (t) =>
      isWialonGroupSummary(t) &&
      String(t.unitId) === String(unitId) &&
      (t.filled ?? 0) > 0 &&
      (!fromDate || !toDate || summaryCoversSelectedRange(t, fromDate, toDate)),
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
  if (!summaryUnits.has(String(unitId))) return false;
  return transactions.some(
    (t) =>
      isWialonGroupSummary(t) &&
      String(t.unitId) === String(unitId) &&
      (t.fuelUsed ?? 0) > 0 &&
      (!fromDate || !toDate || summaryCoversSelectedRange(t, fromDate, toDate)),
  );
}

/** True when a period summary row already carries drop/drain volume for this unit. */
export function summaryProvidesDrop(
  transactions: FuelTransaction[],
  unitId: string | number,
  summaryUnits: Set<string>,
  fromDate?: string,
  toDate?: string,
): boolean {
  if (!summaryUnits.has(String(unitId))) return false;
  return transactions.some(
    (t) =>
      isWialonGroupSummary(t) &&
      String(t.unitId) === String(unitId) &&
      (t.suddenFuelDrop ?? 0) > 0 &&
      (!fromDate || !toDate || summaryCoversSelectedRange(t, fromDate, toDate)),
  );
}

/** Synthetic rows produced by balance enrichment — not shown as line items. */
export function isSyntheticFuelRow(t: FuelTransaction): boolean {
  return isWialonGroupSummary(t) || t.sensor === 'balance';
}
