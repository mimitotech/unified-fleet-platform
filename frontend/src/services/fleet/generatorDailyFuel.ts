import type { FuelTransaction } from '@/types';
import {
  buildGeneratorEngineIntervalsByUnit,
  getGeneratorFuelActivity,
  type GeneratorEngineInterval,
} from './generatorFuelClassification';
import type { GeneratorEngineHours } from '@/types';

/**
 * Per-day fuel & runtime activity for a single generator within a reporting
 * window. Mirrors the per-vehicle daily breakdown shown in the fuel views:
 * each row is one EAT calendar day with engine-hours plus the litres
 * consumed, filled, and drained attributed to that generator on that day.
 */
export interface GeneratorDailyFuel {
  /** ISO date `yyyy-MM-dd` in Africa/Kampala (EAT). */
  date: string;
  /** Engine-on hours during this EAT calendar day. */
  runtimeHours: number;
  /** Litres consumed (engine-on burn). */
  consumed: number;
  /** Litres filled. */
  filled: number;
  /** Litres drained while engine was off. Kept separate at the data layer
   *  so callers can still distinguish theft from consumption; the daily
   *  modal merges these into a single "Consumed" column for users. */
  drained: number;
}

// Day bucketing must align with the fuel page's other EAT-aware displays.
// `en-CA` returns yyyy-MM-dd; the timezone option pins it to Kampala wall-clock.
const EAT_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kampala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const txDateKey = (tsSec: number): string =>
  EAT_DATE_FMT.format(new Date(tsSec * 1000));

// EAT is UTC+3 with no DST, so each EAT calendar day starts exactly 3h
// before the same wall-clock midnight in UTC. Returns the unix-seconds
// boundary at the start of the given `yyyy-MM-dd` EAT day.
const EAT_OFFSET_S = 3 * 3600;
function eatDayStartSec(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - EAT_OFFSET_S * 1000;
  return Math.floor(utcMs / 1000);
}

// Distribute one engine-on interval across the EAT calendar days it spans,
// adding the per-day overlap (in seconds) into `into`. Intervals shorter
// than a day are kept whole; multi-day intervals are split on EAT midnight.
function accumulateIntervalSeconds(
  beg: number,
  end: number,
  into: Map<string, number>,
): void {
  if (!(end > beg)) return;
  let cursor = beg;
  while (cursor < end) {
    const dayKey = txDateKey(cursor);
    const dayEnd = eatDayStartSec(dayKey) + 86400;
    const sliceEnd = Math.min(end, dayEnd);
    into.set(dayKey, (into.get(dayKey) ?? 0) + (sliceEnd - cursor));
    cursor = sliceEnd;
  }
}

/**
 * Enumerate every yyyy-MM-dd between `fromDate` and `toDate` inclusive (EAT).
 * Returns an empty array when the range is invalid so callers can skip the
 * zero-fill step gracefully.
 */
function enumerateDays(fromDate?: string, toDate?: string): string[] {
  if (!fromDate || !toDate) return [];
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];

  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function emptyEntry(date: string): GeneratorDailyFuel {
  return { date, runtimeHours: 0, consumed: 0, filled: 0, drained: 0 };
}

/**
 * Build a per-unit, per-day fuel & runtime breakdown from the same raw data
 * the `GeneratorListTable` row totals already use. Keeps the engine-on/off
 * classification consistent with `useGeneratorsWithReports` so daily
 * sub-totals add up to the period totals shown on the parent row, and
 * distributes engine-hours intervals across the EAT calendar days they span.
 */
export function buildGeneratorDailyFuelByUnit(input: {
  transactions: FuelTransaction[];
  engineHours: GeneratorEngineHours[];
  fromDate?: string;
  toDate?: string;
}): Map<string, GeneratorDailyFuel[]> {
  const { transactions, engineHours, fromDate, toDate } = input;

  const intervalsByUnit: Map<string, GeneratorEngineInterval[]> =
    buildGeneratorEngineIntervalsByUnit(engineHours);

  const byUnitDay = new Map<string, Map<string, GeneratorDailyFuel>>();
  const ensureDay = (unitKey: string, dayKey: string): GeneratorDailyFuel => {
    let byDay = byUnitDay.get(unitKey);
    if (!byDay) {
      byDay = new Map<string, GeneratorDailyFuel>();
      byUnitDay.set(unitKey, byDay);
    }
    let entry = byDay.get(dayKey);
    if (!entry) {
      entry = emptyEntry(dayKey);
      byDay.set(dayKey, entry);
    }
    return entry;
  };

  // Stage 1 — distribute each engine-hours interval across the EAT calendar
  // days it spans, accumulating per-day runtime in seconds first to keep
  // float precision consistent with the multi-day splitting above.
  for (const row of engineHours) {
    if (!(row.beginning > 0 && row.end > 0 && row.end > row.beginning)) continue;
    const unitKey = String(row.unitId);
    const dailySeconds = new Map<string, number>();
    accumulateIntervalSeconds(row.beginning, row.end, dailySeconds);
    for (const [dayKey, sec] of dailySeconds) {
      ensureDay(unitKey, dayKey).runtimeHours += sec / 3600;
    }
  }

  // Stage 2 — bucket each fuel tx into (unitId, day) and accumulate litres.
  for (const tx of transactions) {
    const activity = getGeneratorFuelActivity(tx, intervalsByUnit);
    if (
      activity.consumed === 0 &&
      activity.filled === 0 &&
      activity.drained === 0
    ) {
      continue;
    }
    const unitKey = String(tx.unitId);
    const dayKey = txDateKey(tx.timestamp);
    const entry = ensureDay(unitKey, dayKey);
    entry.consumed += activity.consumed;
    entry.filled += activity.filled;
    entry.drained += activity.drained;
  }

  // Stage 3 — emit one entry per day in the window for every unit that had
  // any activity. Days with no events are kept (zero values) so the table
  // shows a continuous timeline within the selected period.
  const windowDays = enumerateDays(fromDate, toDate);
  const result = new Map<string, GeneratorDailyFuel[]>();

  for (const [unitKey, byDay] of byUnitDay) {
    const days = windowDays.length > 0 ? windowDays : Array.from(byDay.keys()).sort();
    const rows = days.map<GeneratorDailyFuel>((d) => byDay.get(d) ?? emptyEntry(d));
    result.set(unitKey, rows);
  }

  return result;
}
