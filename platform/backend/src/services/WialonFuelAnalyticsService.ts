import { CacheService } from './CacheService.js';
import { WialonFuelReportService } from './WialonFuelReportService.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
import {
  applyBalanceConsumption,
  buildDailySummaries,
  buildLedgerFromTransactions,
} from './wialonFuelLedger.js';
import { missingConsumption } from './wialonFuelReport/metrics.js';
import { supplementTransactionsWithUnitReports } from './wialonFuelUnitReportSupplement.js';
import {
  buildAnalytics,
  buildComparison,
  currentMonthKey,
  monthBounds,
  monthsInRange,
  previousMonthKeyFrom,
  resolvePeriod,
  type FuelAnalyticsResult,
  type FuelPeriod,
} from './wialonFuelAnalytics.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';
import { filterTransactionsByDateRange } from './wialonFuelReport/rangeFilter.js';

const MONTH_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 'v6';

const monthMemory = new Map<string, { rows: FuelTransaction[]; expires: number }>();
const monthInflight = new Map<string, Promise<FuelTransaction[]>>();

function monthCacheKey(tenantId: string, yyyyMm: string) {
  return `${tenantId}:fuel:month:${CACHE_VERSION}:${yyyyMm}`;
}

function redisMonthKey(tenantId: string, yyyyMm: string) {
  return `fuel:month:${CACHE_VERSION}:${tenantId}:${yyyyMm}`;
}

function unitHasConsumption(list: FuelTransaction[], unitId: number): boolean {
  return list.some((r) => r.unitId === unitId && r.section === 'consumption' && effectiveConsumed(r) > 0);
}

export class WialonFuelAnalyticsService {
  /** Shared month-backed transaction rows for reports and analytics. */
  static async loadTransactionRows(
    tenantId: string,
    from: string,
    to: string,
    refresh = false
  ) {
    return this.loadRange(tenantId, from, to, refresh);
  }

  /** Read cached month rows only — no Wialon fetch (fast path for initial paint). */
  static async loadCachedRowsOnly(
    tenantId: string,
    from: string,
    to: string
  ): Promise<FuelTransaction[]> {
    const months = monthsInRange(from, to);
    const now = Date.now();
    const allRows: FuelTransaction[] = [];

    await Promise.all(
      months.map(async (m) => {
        const memKey = monthCacheKey(tenantId, m);
        const mem = monthMemory.get(memKey);
        if (mem && mem.expires > now) {
          allRows.push(...mem.rows);
          return;
        }
        const cache = new CacheService();
        const redis = await cache.get<FuelTransaction[]>(redisMonthKey(tenantId, m));
        if (redis?.length) {
          monthMemory.set(memKey, { rows: redis, expires: now + MONTH_TTL_MS });
          allRows.push(...redis);
        }
      })
    );

    return filterTransactionsByDateRange(allRows, from, to);
  }

  /** Optional background warm — does not block analytics reads. */
  static warmStandardMonths(tenantId: string): void {
    void this.ensureMonth(tenantId, currentMonthKey(), false).catch(() => undefined);
    const d = new Date();
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    void this.ensureMonth(tenantId, prev.toISOString().slice(0, 7), false).catch(() => undefined);
  }

  /** Warm all calendar months overlapping a date range (non-blocking). */
  static warmDateRange(tenantId: string, from: string, to: string): void {
    for (const m of monthsInRange(from, to)) {
      void this.ensureMonth(tenantId, m, false).catch(() => undefined);
    }
  }

  static isRangeWarming(tenantId: string, from: string, to: string): boolean {
    for (const m of monthsInRange(from, to)) {
      if (monthInflight.has(`${monthCacheKey(tenantId, m)}:fetch`)) return true;
    }
    return false;
  }

  /** Wait for background month cache (first load after restart). */
  static async waitForRangeCache(
    tenantId: string,
    from: string,
    to: string,
    maxMs = 200_000
  ): Promise<FuelTransaction[]> {
    const months = monthsInRange(from, to);
    const inflight = months
      .map((m) => monthInflight.get(`${monthCacheKey(tenantId, m)}:fetch`))
      .filter(Boolean) as Promise<FuelTransaction[]>[];

    if (inflight.length) {
      await Promise.race([
        Promise.all(inflight),
        new Promise((r) => setTimeout(r, maxMs)),
      ]);
      const rows = await this.loadCachedRowsOnly(tenantId, from, to);
      if (rows.length) return rows;
    }

    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const rows = await this.loadCachedRowsOnly(tenantId, from, to);
      if (rows.length > 0) return rows;
      if (!this.isRangeWarming(tenantId, from, to)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return this.loadCachedRowsOnly(tenantId, from, to);
  }

  static async getAnalytics(
    tenantId: string,
    opts: {
      unitId?: number | null;
      unitName?: string | null;
      period?: FuelPeriod;
      month?: string;
      from?: string;
      to?: string;
      fuelPricePerLiter?: number;
      refresh?: boolean;
    }
  ): Promise<FuelAnalyticsResult> {
    const period = opts.period ?? 'month';
    const resolved = resolvePeriod({ period, month: opts.month, from: opts.from, to: opts.to });

    const { rows, source, warmedMonths } = await this.loadRange(
      tenantId,
      resolved.from,
      resolved.to,
      opts.refresh ?? false
    );

    const unitId = opts.unitId ?? null;
    let unitName = opts.unitName ?? null;
    if (unitId != null && !unitName) {
      unitName = rows.find((r) => r.unitId === unitId)?.unitName ?? null;
    }

    let fleetUnits: Array<{ unitId: number; unitName: string }> | undefined;
    let liveFuelByUnit: Map<number, number> | undefined;
    try {
      const fleet = await WialonFuelFleetService.listAssets(tenantId);
      if (unitId == null) {
        fleetUnits = fleet.assets.map((a) => ({ unitId: a.unitId, unitName: a.name }));
      }
      liveFuelByUnit = new Map(
        fleet.assets
          .filter((a) => {
            if (unitId != null && a.unitId !== unitId) return false;
            return a.fuelLiters != null && a.fuelLiters >= 0;
          })
          .map((a) => [a.unitId, a.fuelLiters as number])
      );
    } catch {
      fleetUnits = undefined;
      liveFuelByUnit = undefined;
    }

    const scopedRows =
      unitId != null ? rows.filter((r) => r.unitId === unitId) : rows;

    const ledgerPreview = buildLedgerFromTransactions(scopedRows);
    const dailySummaries = buildDailySummaries(ledgerPreview, liveFuelByUnit);

    const result = buildAnalytics(rows, {
      unitId,
      unitName,
      period,
      granularity: resolved.granularity,
      from: resolved.from,
      to: resolved.to,
      month: resolved.month,
      fuelPricePerLiter: 0,
      source,
      isWarming: source === 'warming' || this.isRangeWarming(tenantId, resolved.from, resolved.to),
      warmedMonths,
      fetchedAt: new Date().toISOString(),
      fleetUnits,
      liveFuelByUnit,
    });

    const withLedger = {
      ...result,
      dailySummaries,
      ledgerPreview: ledgerPreview.slice(-100),
    };

    if (period !== 'month' || !resolved.month || !rows.length) return withLedger;

    const prevMonth = previousMonthKeyFrom(resolved.month);
    const prevBounds = monthBounds(prevMonth);
    const prevLoad = await this.ensureMonth(tenantId, prevMonth, false);
    if (!prevLoad.rows.length) return withLedger;

    const prevFromTs = Math.floor(new Date(prevBounds.from + 'T00:00:00Z').getTime() / 1000);
    const prevToTs = Math.floor(new Date(prevBounds.to + 'T23:59:59Z').getTime() / 1000);
    const prevRows =
      unitId != null
        ? prevLoad.rows.filter(
            (r) => r.unitId === unitId && r.timestamp >= prevFromTs && r.timestamp <= prevToTs
          )
        : prevLoad.rows.filter((r) => r.timestamp >= prevFromTs && r.timestamp <= prevToTs);

    const prevAnalytics = buildAnalytics(prevRows, {
      unitId,
      unitName,
      period: 'month',
      granularity: 'day',
      from: prevBounds.from,
      to: prevBounds.to,
      month: prevMonth,
      fuelPricePerLiter: 0,
      source: prevLoad.source === 'none' ? 'partial' : prevLoad.source,
      isWarming: false,
      warmedMonths: [prevMonth],
      fetchedAt: new Date().toISOString(),
      fleetUnits,
      liveFuelByUnit,
    });

    return {
      ...withLedger,
      comparison: buildComparison(
        withLedger.kpis,
        prevAnalytics.kpis,
        prevBounds.from,
        prevBounds.to,
        prevMonth
      ),
    };
  }

  private static async loadRange(
    tenantId: string,
    from: string,
    to: string,
    refresh: boolean
  ): Promise<{
    rows: FuelTransaction[];
    source: FuelAnalyticsResult['source'];
    warmedMonths: string[];
  }> {
    const months = monthsInRange(from, to);
    const warmedMonths: string[] = [];
    const allRows: FuelTransaction[] = [];
    let anyWialon = false;
    let anyCache = false;

    const monthResults = await Promise.all(
      months.map((m) => this.ensureMonth(tenantId, m, refresh))
    );
    let anyWarming = false;
    for (let i = 0; i < months.length; i++) {
      const { rows, source } = monthResults[i];
      if (source === 'warming') anyWarming = true;
      if (rows.length) warmedMonths.push(months[i]);
      if (source === 'wialon') anyWialon = true;
      if (source === 'cache') anyCache = true;
      allRows.push(...rows);
    }

    const rows = filterTransactionsByDateRange(allRows, from, to);

    let source: FuelAnalyticsResult['source'] = anyWarming
      ? 'warming'
      : anyWialon
        ? 'wialon'
        : anyCache
          ? rows.length
            ? 'cache'
            : 'partial'
          : 'none';

    return { rows, source, warmedMonths };
  }

  private static async ensureMonth(
    tenantId: string,
    yyyyMm: string,
    refresh: boolean
  ): Promise<{ rows: FuelTransaction[]; source: 'cache' | 'wialon' | 'none' | 'warming' }> {
    const memKey = monthCacheKey(tenantId, yyyyMm);
    const now = Date.now();

    if (refresh) {
      monthMemory.delete(memKey);
      await new CacheService().del(redisMonthKey(tenantId, yyyyMm)).catch(() => undefined);
    } else {
      const mem = monthMemory.get(memKey);
      if (mem && mem.expires > now) {
        return { rows: mem.rows, source: 'cache' };
      }
      const cache = new CacheService();
      const redis = await cache.get<FuelTransaction[]>(redisMonthKey(tenantId, yyyyMm));
      if (redis?.length) {
        monthMemory.set(memKey, { rows: redis, expires: now + MONTH_TTL_MS });
        return { rows: redis, source: 'cache' };
      }
    }

    const inflightKey = `${memKey}:fetch`;
    if (monthInflight.has(inflightKey)) {
      if (refresh) {
        const rows = await monthInflight.get(inflightKey)!;
        return { rows, source: rows.length ? 'wialon' : 'none' };
      }
      return { rows: [], source: 'warming' };
    }

    const fetchPromise = this.fetchAndCacheMonth(tenantId, yyyyMm).catch((err) => {
      console.error(`[FuelAnalytics] Month fetch failed for ${tenantId} ${yyyyMm}:`, err);
      return [] as FuelTransaction[];
    });
    monthInflight.set(inflightKey, fetchPromise);
    fetchPromise.finally(() => monthInflight.delete(inflightKey));

    if (refresh) {
      const rows = await fetchPromise;
      return { rows, source: rows.length ? 'wialon' : 'none' };
    }

    return { rows: [], source: 'warming' };
  }

  /** Fetch one calendar month from Wialon reports, enrich once, cache for 24h. */
  private static async fetchAndCacheMonth(
    tenantId: string,
    yyyyMm: string
  ): Promise<FuelTransaction[]> {
    const memKey = monthCacheKey(tenantId, yyyyMm);
    const [y, m] = yyyyMm.split('-').map(Number);
    const from = `${yyyyMm}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${yyyyMm}-${String(lastDay).padStart(2, '0')}`;
    const fromTs = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000);
    const toTs = Math.floor(new Date(to + 'T23:59:59Z').getTime() / 1000);

    const fresh = await WialonFuelReportService.fetchFromWialon(tenantId, {
      from,
      to,
    });
    let rows = fresh;

    let liveFuelByUnit: Map<number, number> | undefined;
    try {
      const fleet = await WialonFuelFleetService.listAssets(tenantId);
      liveFuelByUnit = new Map(
        fleet.assets
          .filter((a) => a.fuelLiters != null && a.fuelLiters >= 0)
          .map((a) => [a.unitId, a.fuelLiters as number])
      );
    } catch {
      liveFuelByUnit = undefined;
    }

    if (missingConsumption(rows)) {
      rows = applyBalanceConsumption(rows, liveFuelByUnit);
    }

    if (rows.length) {
      monthMemory.set(memKey, { rows, expires: Date.now() + MONTH_TTL_MS });
      void new CacheService().set(redisMonthKey(tenantId, yyyyMm), rows, 86400);
    }

    // Per-unit Wialon reports are slow for large fleets — enrich in the background
    // so the HTTP response can return group-report rows immediately.
    void this.enrichMonthWithUnitReports(tenantId, yyyyMm, fromTs, toTs, rows, liveFuelByUnit);

    return rows;
  }

  /** Background enrichment: unit-level reports + balance consumption, then refresh cache. */
  private static async enrichMonthWithUnitReports(
    tenantId: string,
    yyyyMm: string,
    fromTs: number,
    toTs: number,
    initialRows: FuelTransaction[],
    liveFuelByUnit?: Map<number, number>
  ): Promise<void> {
    const memKey = monthCacheKey(tenantId, yyyyMm);
    try {
      let unitIds = [...new Set(initialRows.map((r) => r.unitId).filter((id) => id > 0))];
      if (!unitIds.length) {
        try {
          const fleet = await WialonFuelFleetService.listAssets(tenantId);
          unitIds = fleet.assets.map((a) => a.unitId).filter((id) => id > 0);
        } catch {
          return;
        }
      }
      if (!unitIds.length) return;

      if (!missingConsumption(initialRows) && initialRows.length > 0) {
        const unitsMissing = unitIds.filter((id) => !unitHasConsumption(initialRows, id));
        if (!unitsMissing.length) return;
      }

      let rows =
        initialRows.length > 0
          ? initialRows
          : await supplementTransactionsWithUnitReports(tenantId, [], fromTs, toTs, unitIds);

      if (initialRows.length > 0 && missingConsumption(rows)) {
        rows = await supplementTransactionsWithUnitReports(tenantId, rows, fromTs, toTs, unitIds);
      }

      if (missingConsumption(rows)) {
        rows = applyBalanceConsumption(rows, liveFuelByUnit);
      }

      if (!rows.length) return;

      monthMemory.set(memKey, { rows, expires: Date.now() + MONTH_TTL_MS });
      await new CacheService().set(redisMonthKey(tenantId, yyyyMm), rows, 86400);
      console.info(`[FuelAnalytics] Background enrich complete for ${tenantId} ${yyyyMm}: ${rows.length} rows`);
    } catch (err) {
      console.error(`[FuelAnalytics] Background enrich failed for ${tenantId} ${yyyyMm}:`, err);
    }
  }
}
