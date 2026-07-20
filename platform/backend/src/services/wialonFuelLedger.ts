import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed, effectiveFilled, effectiveTheft } from './wialonFuelReport/metrics.js';
import { isPlausibleBalanceLevel, isPlausibleFuelEvent } from './fuelEventPlausibility.js';

export type FuelLedgerEventType = 'opening' | 'refill' | 'consumption' | 'theft' | 'balance';

export type FuelLedgerEntry = {
  id: string;
  unitId: number;
  unitName: string;
  timestamp: number;
  date: string;
  eventType: FuelLedgerEventType;
  label: string;
  amountIn: number;
  amountOut: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  source: 'report' | 'trip' | 'balance' | 'sensor';
  mileage: number;
  location: string;
  referenceId: string;
};

export type FuelDailySummary = {
  unitId: number;
  unitName: string;
  date: string;
  openingFuel: number;
  filled: number;
  consumed: number;
  lost: number;
  closingFuel: number;
  mileage: number;
  tripCount: number;
  refillCount: number;
  theftCount: number;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function dayKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function txToLedgerEntries(tx: FuelTransaction): FuelLedgerEntry[] {
  const base = {
    unitId: tx.unitId,
    unitName: tx.unitName,
    timestamp: tx.timestamp,
    date: tx.timestamp ? dayKey(tx.timestamp) : '',
    mileage: tx.mileage || 0,
    location: tx.location || '',
    referenceId: tx.id,
    source: 'report' as const,
  };

  if (tx.section === 'filling') {
    const vol = effectiveFilled(tx);
    if (vol <= 0 && tx.initialLevel <= 0 && tx.finalLevel <= 0) return [];
    return [
      {
        ...base,
        id: `ledger-fill-${tx.id}`,
        eventType: 'refill',
        label: 'Fuel refill',
        amountIn: round1(vol),
        amountOut: 0,
        balanceBefore: tx.initialLevel > 0 ? round1(tx.initialLevel) : null,
        balanceAfter: tx.finalLevel > 0 ? round1(tx.finalLevel) : null,
      },
    ];
  }

  if (tx.section === 'theft') {
    const vol = effectiveTheft(tx);
    if (vol <= 0) return [];
    return [
      {
        ...base,
        id: `ledger-theft-${tx.id}`,
        eventType: 'theft',
        label: 'Fuel loss / theft',
        amountIn: 0,
        amountOut: round1(vol),
        balanceBefore: tx.initialLevel > 0 ? round1(tx.initialLevel) : null,
        balanceAfter: tx.finalLevel > 0 ? round1(tx.finalLevel) : null,
      },
    ];
  }

  if (tx.section === 'consumption') {
    const vol = effectiveConsumed(tx);
    if (vol <= 0 && tx.mileage <= 0 && tx.durationSeconds <= 0) return [];
    return [
      {
        ...base,
        id: `ledger-cons-${tx.id}`,
        eventType: 'consumption',
        label: tx.duration ? `Trip · ${tx.duration}` : 'Fuel consumption',
        amountIn: 0,
        amountOut: round1(vol),
        balanceBefore: tx.initialLevel > 0 ? round1(tx.initialLevel) : null,
        balanceAfter: tx.finalLevel > 0 ? round1(tx.finalLevel) : null,
      },
    ];
  }

  return [];
}

function parseTripTimes(trip: Record<string, unknown>): { fromTs: number; toTs: number } {
  const fromBlock = trip.from as Record<string, unknown> | undefined;
  const toBlock = trip.to as Record<string, unknown> | undefined;
  const fromTs = Number(
    fromBlock?.t ?? trip.t1 ?? trip.tm ?? trip.time_begin ?? trip.begin ?? trip.from
  );
  const toTs = Number(
    toBlock?.t ?? trip.t2 ?? trip.time_end ?? trip.end ?? (typeof trip.to === 'number' ? trip.to : 0)
  );
  return { fromTs, toTs };
}

/** Convert Wialon trip API rows into consumption ledger transactions. */
export function tripsToConsumptionTransactions(
  trips: Array<Record<string, unknown>>,
  unitId: number,
  unitName: string
): FuelTransaction[] {
  const out: FuelTransaction[] = [];
  for (const trip of trips) {
    const { fromTs, toTs } = parseTripTimes(trip);
    const timestamp = Number.isFinite(toTs) && toTs > 0 ? toTs : Number.isFinite(fromTs) ? fromTs : 0;
    if (!timestamp) continue;

    const fuelRaw = Number(
      trip.fuel ??
        trip.fuel_consumption ??
        trip.fuelCons ??
        trip.fc ??
        trip.fuel_used ??
        trip.cnt ??
        trip.fuel_cnt
    );
    let fuelUsed = Number.isFinite(fuelRaw) && fuelRaw > 0 ? fuelRaw : 0;
    const distanceM = Number(trip.m ?? trip.distance ?? trip.mileage ?? trip.len);
    const mileage = Number.isFinite(distanceM) ? distanceM / 1000 : 0;

    const fuelBegin = Number(
      trip.fuel_begin ?? trip.fuelBegin ?? trip.fuel_level_begin ?? trip.fls_begin
    );
    const fuelEnd = Number(trip.fuel_end ?? trip.fuelEnd ?? trip.fuel_level_end ?? trip.fls_end);
    let initialLevel = Number.isFinite(fuelBegin) ? fuelBegin : 0;
    let finalLevel = Number.isFinite(fuelEnd) ? fuelEnd : 0;

    if (fuelUsed <= 0 && initialLevel > 0 && finalLevel >= 0 && initialLevel > finalLevel) {
      fuelUsed = initialLevel - finalLevel;
    }

    // Trip with distance but no fuel — estimate from mileage only if we must skip (no estimate without model)
    if (fuelUsed <= 0 && mileage <= 0) continue;

    out.push({
      id: `trip-${unitId}-${timestamp}`,
      unitId,
      unitName,
      section: 'consumption',
      tank: 'main',
      timestamp,
      time: new Date(timestamp * 1000).toISOString(),
      location: String(trip.address ?? trip.location ?? ''),
      initialLevel: round1(initialLevel),
      finalLevel: round1(finalLevel),
      filled: 0,
      sensor: 'trip',
      fuelUsed: round1(fuelUsed),
      mileage: round1(mileage),
      duration: '',
      durationSeconds: Number.isFinite(fromTs) && Number.isFinite(toTs) && toTs > fromTs ? toTs - fromTs : 0,
      avgConsumption: mileage > 0 && fuelUsed > 0 ? round1((fuelUsed / mileage) * 100) : 0,
      suddenFuelDrop: 0,
      count: 0,
    });
  }
  return out;
}

export function mergeTransactions(...groups: FuelTransaction[][]): FuelTransaction[] {
  const map = new Map<string, FuelTransaction>();
  for (const group of groups) {
    for (const tx of group) {
      const existing = map.get(tx.id);
      if (!existing) {
        map.set(tx.id, tx);
        continue;
      }
      if (effectiveConsumed(tx) > effectiveConsumed(existing)) {
        map.set(tx.id, tx);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export function buildLedgerFromTransactions(rows: FuelTransaction[]): FuelLedgerEntry[] {
  const entries: FuelLedgerEntry[] = [];
  for (const tx of rows) {
    entries.push(...txToLedgerEntries(tx));
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Method 2: Opening + Filled − Closing − Lost = Consumed
 * Applied per unit when trip/report consumption is missing.
 */
export function applyBalanceConsumption(
  rows: FuelTransaction[],
  liveFuelByUnit?: Map<number, number>
): FuelTransaction[] {
  const byUnit = new Map<number, FuelTransaction[]>();
  for (const r of rows) {
    const list = byUnit.get(r.unitId) ?? [];
    list.push(r);
    byUnit.set(r.unitId, list);
  }

  const supplements: FuelTransaction[] = [];

  for (const [unitId, unitRows] of byUnit) {
    const live = liveFuelByUnit?.get(unitId);
    const plausibleRows = unitRows.filter((r) => isPlausibleFuelEvent(r, live));

    const hasSummary = plausibleRows.some(
      (r) => r.section === 'consumption' && r.sensor === 'wialon_group_summary' && effectiveConsumed(r) > 0
    );
    if (hasSummary) continue;

    // Prefer real Wialon consumption rows over invented balance math.
    const consumedFromReports = plausibleRows
      .filter((r) => r.section === 'consumption' && r.sensor !== 'balance')
      .reduce((s, r) => s + effectiveConsumed(r), 0);
    if (consumedFromReports > 0) continue;

    const sorted = [...plausibleRows].sort((a, b) => a.timestamp - b.timestamp);
    let opening = 0;
    for (const r of sorted) {
      const candidate = r.initialLevel > 0 ? r.initialLevel : r.finalLevel > 0 ? r.finalLevel : 0;
      if (candidate > 0 && isPlausibleBalanceLevel(candidate, live)) {
        opening = candidate;
        break;
      }
    }

    const filled = sorted.filter((r) => r.section === 'filling').reduce((s, r) => s + effectiveFilled(r), 0);
    const lost = sorted.filter((r) => r.section === 'theft').reduce((s, r) => s + effectiveTheft(r), 0);

    let closing = live ?? 0;
    if (closing <= 0) {
      for (let i = sorted.length - 1; i >= 0; i--) {
        const candidate =
          sorted[i].finalLevel > 0 ? sorted[i].finalLevel : sorted[i].initialLevel > 0 ? sorted[i].initialLevel : 0;
        if (candidate > 0 && isPlausibleBalanceLevel(candidate, live)) {
          closing = candidate;
          break;
        }
      }
    }

    // Need a trustworthy opening; otherwise balance amplifies FLS noise into fake "Used".
    if (!isPlausibleBalanceLevel(opening, live ?? closing)) continue;

    const derived =
      opening > 0 || filled > 0 || closing > 0
        ? Math.max(0, opening + filled - closing - lost)
        : 0;

    if (derived <= 0) continue;
    // Derived use cannot exceed a few tank-volumes for the period.
    const tankRef = live && live > 0 ? live : closing;
    if (tankRef > 0 && derived > tankRef * 3 && derived > 500) continue;

    const unitName = unitRows[0]?.unitName ?? `Unit ${unitId}`;
    const lastTs = sorted[sorted.length - 1]?.timestamp || Math.floor(Date.now() / 1000);

    supplements.push({
      id: `balance-${unitId}-${lastTs}`,
      unitId,
      unitName,
      section: 'consumption',
      tank: 'main',
      timestamp: lastTs,
      time: '',
      location: '',
      initialLevel: round1(opening),
      finalLevel: round1(closing),
      filled: 0,
      sensor: 'balance',
      fuelUsed: round1(derived),
      mileage: plausibleRows
        .filter((r) => r.section === 'consumption')
        .reduce((s, r) => s + (r.mileage || 0), 0),
      duration: '',
      durationSeconds: 0,
      avgConsumption: 0,
      suddenFuelDrop: 0,
      count: 0,
    });
  }

  if (supplements.length) {
    return mergeTransactions(rows, supplements);
  }
  return rows;
}

export function buildDailySummaries(
  ledger: FuelLedgerEntry[],
  liveFuelByUnit?: Map<number, number>
): FuelDailySummary[] {
  const byKey = new Map<string, FuelDailySummary>();

  for (const e of ledger) {
    if (!e.date) continue;
    const key = `${e.unitId}:${e.date}`;
    const row =
      byKey.get(key) ??
      ({
        unitId: e.unitId,
        unitName: e.unitName,
        date: e.date,
        openingFuel: 0,
        filled: 0,
        consumed: 0,
        lost: 0,
        closingFuel: 0,
        mileage: 0,
        tripCount: 0,
        refillCount: 0,
        theftCount: 0,
      } satisfies FuelDailySummary);

    if (e.eventType === 'opening') row.openingFuel += e.balanceAfter ?? 0;
    if (e.eventType === 'refill') {
      row.filled += e.amountIn;
      row.refillCount += 1;
    }
    if (e.eventType === 'consumption') {
      row.consumed += e.amountOut;
      row.tripCount += 1;
      row.mileage += e.mileage;
    }
    if (e.eventType === 'theft') {
      row.lost += e.amountOut;
      row.theftCount += 1;
    }
    byKey.set(key, row);
  }

  const summaries = [...byKey.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.unitName.localeCompare(b.unitName)
  );

  const byUnit = new Map<number, FuelDailySummary[]>();
  for (const s of summaries) {
    const list = byUnit.get(s.unitId) ?? [];
    list.push(s);
    byUnit.set(s.unitId, list);
  }

  for (const [unitId, days] of byUnit) {
    let prevClosing = 0;
    for (const d of days) {
      if (d.openingFuel <= 0 && prevClosing > 0) d.openingFuel = round1(prevClosing);
      d.filled = round1(d.filled);
      d.consumed = round1(d.consumed);
      d.lost = round1(d.lost);
      d.mileage = round1(d.mileage);
      d.closingFuel = round1(Math.max(0, d.openingFuel + d.filled - d.consumed - d.lost));
      prevClosing = d.closingFuel;
    }
    const live = liveFuelByUnit?.get(unitId);
    if (live != null && live > 0 && days.length) {
      days[days.length - 1].closingFuel = round1(live);
    }
  }

  return summaries;
}
