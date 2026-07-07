import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed, effectiveFilled, effectiveTheft } from './wialonFuelReport/metrics.js';
import type { FuelDailySummary, FuelLedgerEntry } from './wialonFuelLedger.js';

export type FuelPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';
export type FuelGranularity = 'day' | 'week' | 'month' | 'year';

export type FuelAnalyticsTimePoint = {
  key: string;
  label: string;
  filled: number;
  consumed: number;
  theft: number;
  mileage: number;
  cost: number;
  fillEvents: number;
  consumptionEvents: number;
  theftEvents: number;
};

export type FuelAnalyticsAssetRow = {
  unitId: number;
  unitName: string;
  filled: number;
  consumed: number;
  theft: number;
  mileage: number;
  cost: number;
  avgConsumption: number;
  fillEvents: number;
  theftEvents: number;
  sharePercent: number;
  /** Live sensor reading when available */
  remainingFuel: number | null;
  openingFuel: number | null;
};

/** Fuel ledger: Opening + Filled − Used − Lost = Remaining */
export type FuelLedgerSummary = {
  openingFuel: number;
  totalFilled: number;
  totalConsumed: number;
  totalLost: number;
  computedRemaining: number;
  /** Live sensor total when fleet-wide live data is merged */
  liveRemaining: number | null;
  variance: number;
  balanced: boolean;
  confidence: 'high' | 'medium' | 'low';
};

export type FuelAnomaly = {
  id: string;
  unitId: number;
  unitName: string;
  type: 'theft' | 'sudden_drop' | 'high_consumption' | 'unusual_fill';
  severity: 'high' | 'medium' | 'low';
  message: string;
  timestamp: number;
  liters: number;
  initialLevel?: number;
  finalLevel?: number;
  deltaLiters?: number;
  location?: string;
};

export type FuelPrediction = {
  period: string;
  label: string;
  consumed: number;
  filled: number;
  confidence: 'low' | 'medium';
};

export type FuelAnalyticsComparison = {
  previousFrom: string;
  previousTo: string;
  previousMonth: string | null;
  kpis: {
    totalFilled: number;
    totalConsumed: number;
    totalTheft: number;
    totalCost: number;
    totalFillCost?: number;
    totalUsageCost?: number;
    totalLossCost?: number;
    totalMileage: number;
    avgConsumption: number;
  };
  deltas: {
    consumedPct: number | null;
    filledPct: number | null;
    costPct: number | null;
    theftPct: number | null;
  };
};

export type FuelAnalyticsResult = {
  unitId: number | null;
  unitName: string | null;
  period: FuelPeriod;
  granularity: FuelGranularity;
  from: string;
  to: string;
  month: string | null;
  fuelPricePerLiter: number;
  kpis: {
    totalFilled: number;
    totalConsumed: number;
    totalTheft: number;
    totalCost: number;
    totalFillCost?: number;
    totalUsageCost?: number;
    totalLossCost?: number;
    totalMileage: number;
    avgConsumption: number;
    theftEvents: number;
    fillEvents: number;
    consumptionEvents: number;
    unitsTracked: number;
  };
  timeSeries: FuelAnalyticsTimePoint[];
  byAsset: FuelAnalyticsAssetRow[];
  sectionBreakdown: Array<{ name: string; liters: number; cost: number; count: number }>;
  anomalies: FuelAnomaly[];
  predictions: FuelPrediction[];
  comparison: FuelAnalyticsComparison | null;
  ledger: FuelLedgerSummary;
  dailySummaries: FuelDailySummary[];
  ledgerPreview: FuelLedgerEntry[];
  transactionCount: number;
  fetchedAt: string;
  source: 'cache' | 'wialon' | 'partial' | 'none';
  isWarming: boolean;
  warmedMonths: string[];
};

export function previousMonthKeyFrom(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function buildComparison(
  current: FuelAnalyticsResult['kpis'],
  previous: FuelAnalyticsResult['kpis'],
  previousFrom: string,
  previousTo: string,
  previousMonth: string | null
): FuelAnalyticsComparison {
  return {
    previousFrom,
    previousTo,
    previousMonth,
    kpis: {
      totalFilled: previous.totalFilled,
      totalConsumed: previous.totalConsumed,
      totalTheft: previous.totalTheft,
      totalCost: previous.totalCost,
      totalMileage: previous.totalMileage,
      avgConsumption: previous.avgConsumption,
    },
    deltas: {
      consumedPct: pctDelta(current.totalConsumed, previous.totalConsumed),
      filledPct: pctDelta(current.totalFilled, previous.totalFilled),
      costPct: pctDelta(current.totalCost, previous.totalCost),
      theftPct: pctDelta(current.totalTheft, previous.totalTheft),
    },
  };
}

export function monthBounds(yyyyMm: string): { from: string; to: string } {
  const [y, m] = yyyyMm.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function previousMonthKey(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export function monthsInRange(from: string, to: string): string[] {
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const months: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cur.getTime() <= endMonth) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
}

export function resolvePeriod(opts: {
  period: FuelPeriod;
  month?: string;
  from?: string;
  to?: string;
}): { from: string; to: string; granularity: FuelGranularity; month: string | null } {
  const today = new Date();
  const toDefault = today.toISOString().slice(0, 10);

  if (opts.period === 'month') {
    const m = opts.month || currentMonthKey();
    const bounds = monthBounds(m);
    return { from: bounds.from, to: bounds.to, granularity: 'day', month: m };
  }

  if (opts.period === 'year') {
    const y = today.getUTCFullYear();
    return {
      from: `${y}-01-01`,
      to: toDefault,
      granularity: 'month',
      month: null,
    };
  }

  if (opts.period === 'week') {
    const from = new Date(today.getTime() - 84 * 86400000);
    return { from: from.toISOString().slice(0, 10), to: toDefault, granularity: 'week', month: null };
  }

  if (opts.period === 'custom' && opts.from && opts.to) {
    const days = (new Date(opts.to).getTime() - new Date(opts.from).getTime()) / 86400000;
    const granularity: FuelGranularity = days > 120 ? 'month' : days > 45 ? 'week' : 'day';
    return { from: opts.from, to: opts.to, granularity, month: null };
  }

  // day — last 30 days
  const from = new Date(today.getTime() - 29 * 86400000);
  return { from: from.toISOString().slice(0, 10), to: toDefault, granularity: 'day', month: null };
}

function bucketKey(ts: number, granularity: FuelGranularity): { key: string; label: string } {
  const d = new Date(ts * 1000);
  if (granularity === 'year') {
    const y = d.getUTCFullYear();
    return { key: String(y), label: String(y) };
  }
  if (granularity === 'month') {
    const k = d.toISOString().slice(0, 7);
    return { key: k, label: k };
  }
  if (granularity === 'week') {
    const day = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    const k = monday.toISOString().slice(0, 10);
    return { key: k, label: `Wk ${k}` };
  }
  const k = d.toISOString().slice(0, 10);
  return { key: k, label: k.slice(5) };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Fuel spend is based on litres filled (purchased), not lost fuel. */
function fuelCosts(filled: number, consumed: number, lost: number, price: number) {
  if (price <= 0) {
    return { fillCost: 0, usageCost: 0, lossCost: 0, totalCost: 0 };
  }
  return {
    fillCost: round1(filled * price),
    usageCost: round1(consumed * price),
    lossCost: round1(lost * price),
    totalCost: round1(filled * price),
  };
}

function formatLevelDelta(initial: number, final: number, delta: number): string {
  const from = round1(initial);
  const to = round1(final);
  const diff = round1(Math.abs(delta));
  const sign = delta >= 0 ? '+' : '−';
  return `${from} L → ${to} L (${sign}${diff} L)`;
}

function estimateOpeningFuel(rows: FuelTransaction[]): number {
  const sorted = [...rows].filter((r) => r.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  for (const r of sorted) {
    if (r.initialLevel > 0) return r.initialLevel;
    if (r.finalLevel > 0) return r.finalLevel;
  }
  return 0;
}

function estimateClosingFromRows(rows: FuelTransaction[]): number | null {
  const sorted = [...rows].filter((r) => r.timestamp).sort((a, b) => b.timestamp - a.timestamp);
  for (const r of sorted) {
    if (r.finalLevel > 0) return r.finalLevel;
    if (r.initialLevel > 0) return r.initialLevel;
  }
  return null;
}

export function computeFuelLedger(
  rows: FuelTransaction[],
  totals: { filled: number; consumed: number; lost: number },
  liveRemaining: number | null
): FuelLedgerSummary {
  const openingFuel = round1(estimateOpeningFuel(rows));
  const totalFilled = round1(totals.filled);
  const totalConsumed = round1(totals.consumed);
  const totalLost = round1(totals.lost);
  const computedRemaining = round1(
    Math.max(0, openingFuel + totalFilled - totalConsumed - totalLost)
  );
  const rowClosing = estimateClosingFromRows(rows);
  const referenceRemaining = liveRemaining ?? rowClosing ?? computedRemaining;
  const variance = round1(referenceRemaining - computedRemaining);
  const balanced = Math.abs(variance) <= 5;

  let confidence: FuelLedgerSummary['confidence'] = 'low';
  if (openingFuel > 0 && (liveRemaining != null || rowClosing != null)) {
    confidence = balanced ? 'high' : 'medium';
  } else if (totalConsumed > 0 || totalFilled > 0) {
    confidence = 'medium';
  }

  return {
    openingFuel,
    totalFilled,
    totalConsumed,
    totalLost,
    computedRemaining,
    liveRemaining: liveRemaining != null ? round1(liveRemaining) : null,
    variance,
    balanced,
    confidence,
  };
}

function assetOpeningFuel(rows: FuelTransaction[], unitId: number): number | null {
  const unitRows = rows.filter((r) => r.unitId === unitId && r.timestamp);
  if (!unitRows.length) return null;
  const v = estimateOpeningFuel(unitRows);
  return v > 0 ? round1(v) : null;
}

export function buildAnalytics(
  rows: FuelTransaction[],
  opts: {
    unitId?: number | null;
    unitName?: string | null;
    period: FuelPeriod;
    granularity: FuelGranularity;
    from: string;
    to: string;
    month: string | null;
    fuelPricePerLiter: number;
    source: FuelAnalyticsResult['source'];
    isWarming: boolean;
    warmedMonths: string[];
    fetchedAt: string;
    fleetUnits?: Array<{ unitId: number; unitName: string }>;
    liveFuelByUnit?: Map<number, number>;
  }
): FuelAnalyticsResult {
  const filtered =
    opts.unitId != null ? rows.filter((r) => r.unitId === opts.unitId) : rows;
  const price = opts.fuelPricePerLiter > 0 ? opts.fuelPricePerLiter : 0;

  const timeMap = new Map<string, FuelAnalyticsTimePoint>();
  const assetMap = new Map<number, FuelAnalyticsAssetRow>();
  let totalFilled = 0;
  let totalConsumed = 0;
  let totalTheft = 0;
  let totalMileage = 0;
  let fillEvents = 0;
  let consumptionEvents = 0;
  let theftEvents = 0;

  for (const r of filtered) {
    if (!r.timestamp) continue;
    const { key, label } = bucketKey(r.timestamp, opts.granularity);
    const pt = timeMap.get(key) ?? {
      key,
      label,
      filled: 0,
      consumed: 0,
      theft: 0,
      mileage: 0,
      cost: 0,
      fillEvents: 0,
      consumptionEvents: 0,
      theftEvents: 0,
    };

    const asset = assetMap.get(r.unitId) ?? {
      unitId: r.unitId,
      unitName: r.unitName,
      filled: 0,
      consumed: 0,
      theft: 0,
      mileage: 0,
      cost: 0,
      avgConsumption: 0,
      fillEvents: 0,
      theftEvents: 0,
      sharePercent: 0,
      remainingFuel: opts.liveFuelByUnit?.get(r.unitId) ?? null,
      openingFuel: null,
    };

    if (r.section === 'filling') {
      const v = effectiveFilled(r);
      pt.filled += v;
      pt.fillEvents += 1;
      asset.filled += v;
      asset.fillEvents += 1;
      totalFilled += v;
      fillEvents += 1;
    } else if (r.section === 'consumption') {
      const v = effectiveConsumed(r);
      pt.consumed += v;
      pt.consumptionEvents += 1;
      pt.mileage += r.mileage || 0;
      asset.consumed += v;
      asset.mileage += r.mileage || 0;
      consumptionEvents += 1;
      totalConsumed += v;
      totalMileage += r.mileage || 0;
    } else if (r.section === 'theft') {
      const v = effectiveTheft(r);
      pt.theft += v;
      pt.theftEvents += 1;
      asset.theft += v;
      asset.theftEvents += 1;
      totalTheft += v;
      theftEvents += 1;
    }

    timeMap.set(key, pt);
    assetMap.set(r.unitId, asset);
  }

  if (opts.unitId == null && opts.fleetUnits?.length) {
    for (const u of opts.fleetUnits) {
      if (!assetMap.has(u.unitId)) {
        assetMap.set(u.unitId, {
          unitId: u.unitId,
          unitName: u.unitName,
          filled: 0,
          consumed: 0,
          theft: 0,
          mileage: 0,
          cost: 0,
          avgConsumption: 0,
          fillEvents: 0,
          theftEvents: 0,
          sharePercent: 0,
          remainingFuel: opts.liveFuelByUnit?.get(u.unitId) ?? null,
          openingFuel: assetOpeningFuel(filtered, u.unitId),
        });
      }
    }
  }

  const timeSeries = [...timeMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((p) => {
      const costs = fuelCosts(p.filled, p.consumed, p.theft, price);
      return {
        ...p,
        filled: round1(p.filled),
        consumed: round1(p.consumed),
        theft: round1(p.theft),
        mileage: round1(p.mileage),
        cost: costs.fillCost,
      };
    });

  const byAsset = [...assetMap.values()]
    .map((a) => {
      const costs = fuelCosts(a.filled, a.consumed, a.theft, price);
      return {
        ...a,
        filled: round1(a.filled),
        consumed: round1(a.consumed),
        theft: round1(a.theft),
        mileage: round1(a.mileage),
        cost: costs.fillCost,
        avgConsumption:
          a.mileage > 0 ? round1((a.consumed / a.mileage) * 100) : 0,
        sharePercent:
          totalConsumed > 0 ? round1((a.consumed / totalConsumed) * 100) : 0,
        remainingFuel:
          a.remainingFuel ??
          opts.liveFuelByUnit?.get(a.unitId) ??
          estimateClosingFromRows(filtered.filter((r) => r.unitId === a.unitId)),
        openingFuel: a.openingFuel ?? assetOpeningFuel(filtered, a.unitId),
      };
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName));

  const fleetCosts = fuelCosts(totalFilled, totalConsumed, totalTheft, price);

  const sectionBreakdown = [
    {
      name: 'Consumption',
      liters: round1(totalConsumed),
      cost: fleetCosts.usageCost,
      count: consumptionEvents,
    },
    {
      name: 'Fillings',
      liters: round1(totalFilled),
      cost: fleetCosts.fillCost,
      count: fillEvents,
    },
    {
      name: 'Theft / sudden drop',
      liters: round1(totalTheft),
      cost: fleetCosts.lossCost,
      count: theftEvents,
    },
  ];

  const anomalies = detectAnomalies(filtered, byAsset);
  const predictions = predictFromMonthly(monthlyPointsFromRows(filtered, price));

  const avgConsumption = totalMileage > 0 ? round1((totalConsumed / totalMileage) * 100) : 0;

  let liveRemainingTotal: number | null = null;
  if (opts.liveFuelByUnit?.size) {
    let sum = 0;
    let count = 0;
    for (const v of opts.liveFuelByUnit.values()) {
      if (v >= 0) {
        sum += v;
        count += 1;
      }
    }
    liveRemainingTotal = count > 0 ? round1(sum) : null;
  }

  const ledger = computeFuelLedger(
    filtered,
    { filled: totalFilled, consumed: totalConsumed, lost: totalTheft },
    liveRemainingTotal
  );

  return {
    unitId: opts.unitId ?? null,
    unitName: opts.unitName ?? null,
    period: opts.period,
    granularity: opts.granularity,
    from: opts.from,
    to: opts.to,
    month: opts.month,
    fuelPricePerLiter: price,
    kpis: {
      totalFilled: round1(totalFilled),
      totalConsumed: round1(totalConsumed),
      totalTheft: round1(totalTheft),
      totalCost: fleetCosts.totalCost,
      totalFillCost: fleetCosts.fillCost,
      totalUsageCost: fleetCosts.usageCost,
      totalLossCost: fleetCosts.lossCost,
      totalMileage: round1(totalMileage),
      avgConsumption,
      theftEvents,
      fillEvents,
      consumptionEvents,
      unitsTracked:
        opts.unitId == null && opts.fleetUnits?.length
          ? opts.fleetUnits.length
          : new Set(filtered.map((r) => r.unitId).filter((id) => id > 0)).size,
    },
    timeSeries,
    byAsset,
    sectionBreakdown,
    anomalies,
    predictions,
    comparison: null,
    ledger,
    dailySummaries: [],
    ledgerPreview: [],
    transactionCount: filtered.length,
    fetchedAt: opts.fetchedAt,
    source: opts.source,
    isWarming: opts.isWarming,
    warmedMonths: opts.warmedMonths,
  };
}

function detectAnomalies(
  rows: FuelTransaction[],
  byAsset: FuelAnalyticsAssetRow[]
): FuelAnomaly[] {
  const out: FuelAnomaly[] = [];
  const fleetAvg =
    byAsset.length > 0
      ? byAsset.reduce((s, a) => s + a.consumed, 0) / byAsset.length
      : 0;

  for (const r of rows) {
    if (r.section === 'theft' || (r.suddenFuelDrop && r.suddenFuelDrop > 5)) {
      const initial = r.initialLevel ?? 0;
      const final = r.finalLevel ?? 0;
      const liters = effectiveTheft(r) || Math.max(0, initial - final);
      const delta = final - initial;
      const hasLevels = initial > 0 || final > 0;
      const levelDetail = hasLevels ? formatLevelDelta(initial, final, delta) : `${round1(liters)} L`;
      out.push({
        id: `theft-${r.id}`,
        unitId: r.unitId,
        unitName: r.unitName,
        type: 'theft',
        severity: liters >= 50 ? 'high' : liters >= 20 ? 'medium' : 'low',
        message: `Fuel drop: ${levelDetail}`,
        timestamp: r.timestamp,
        liters: round1(liters),
        initialLevel: hasLevels ? round1(initial) : undefined,
        finalLevel: hasLevels ? round1(final) : undefined,
        deltaLiters: hasLevels ? round1(delta) : round1(-liters),
        location: r.location,
      });
    }
    if (r.section === 'filling') {
      const filled = effectiveFilled(r);
      if (filled < 200) continue;
      const initial = r.initialLevel ?? 0;
      const final = r.finalLevel ?? 0;
      const hasLevels = initial > 0 || final > 0;
      const levelDetail = hasLevels
        ? formatLevelDelta(initial, final, final - initial)
        : `${round1(filled)} L`;
      out.push({
        id: `fill-${r.id}`,
        unitId: r.unitId,
        unitName: r.unitName,
        type: 'unusual_fill',
        severity: filled >= 400 ? 'high' : 'medium',
        message: `Large fill: ${levelDetail}`,
        timestamp: r.timestamp,
        liters: round1(filled),
        initialLevel: hasLevels ? round1(initial) : undefined,
        finalLevel: hasLevels ? round1(final) : undefined,
        deltaLiters: hasLevels ? round1(final - initial) : round1(filled),
        location: r.location,
      });
    }
    if (r.section === 'consumption') {
      const consumed = effectiveConsumed(r);
      if (consumed > 0 && fleetAvg > 0 && consumed > fleetAvg * 2.5) {
        out.push({
          id: `cons-${r.id}`,
          unitId: r.unitId,
          unitName: r.unitName,
          type: 'high_consumption',
          severity: consumed > fleetAvg * 4 ? 'high' : 'medium',
          message: `High consumption ${round1(consumed)} L vs fleet average`,
          timestamp: r.timestamp,
          liters: round1(consumed),
          location: r.location,
        });
      }
    }
  }

  return out
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);
}

function monthlyPointsFromRows(rows: FuelTransaction[], price: number): FuelAnalyticsTimePoint[] {
  const map = new Map<string, FuelAnalyticsTimePoint>();
  for (const r of rows) {
    if (!r.timestamp) continue;
    const key = new Date(r.timestamp * 1000).toISOString().slice(0, 7);
    const pt = map.get(key) ?? {
      key,
      label: key,
      filled: 0,
      consumed: 0,
      theft: 0,
      mileage: 0,
      cost: 0,
      fillEvents: 0,
      consumptionEvents: 0,
      theftEvents: 0,
    };
    if (r.section === 'filling') pt.filled += effectiveFilled(r);
    if (r.section === 'consumption') {
      pt.consumed += effectiveConsumed(r);
      pt.mileage += r.mileage || 0;
    }
    if (r.section === 'theft') pt.theft += effectiveTheft(r);
    map.set(key, pt);
  }
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((p) => ({
      ...p,
      filled: round1(p.filled),
      consumed: round1(p.consumed),
      theft: round1(p.theft),
      cost: round1(fuelCosts(p.consumed, p.consumed, p.theft, price).usageCost),
    }));
}

function predictFromMonthly(monthlySeries: FuelAnalyticsTimePoint[]): FuelPrediction[] {
  if (monthlySeries.length < 2) return [];
  const recent = monthlySeries.slice(-3);
  const avgConsumed = recent.reduce((s, p) => s + p.consumed, 0) / recent.length;
  const avgFilled = recent.reduce((s, p) => s + p.filled, 0) / recent.length;
  const last = monthlySeries[monthlySeries.length - 1];
  const [y, m] = last.key.split('-').map(Number);

  const preds: FuelPrediction[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const period = d.toISOString().slice(0, 7);
    preds.push({
      period,
      label: period,
      consumed: round1(avgConsumed),
      filled: round1(avgFilled),
      confidence: monthlySeries.length >= 6 ? 'medium' : 'low',
    });
  }
  return preds;
}
