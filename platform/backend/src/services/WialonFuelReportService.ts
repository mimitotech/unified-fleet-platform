import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import type { WialonClient } from '../adapters/wialonClient.js';
import { processGroupFuelData, processUnitFuelData } from './wialonFuelReport/runner.js';
import { enrichTransactionsWithTankLevels } from './wialonFuelReport/enrich.js';
import {
  findFleetGroups,
  findFuelReportTemplates,
  invalidateFuelReportCaches,
  listAllUnits,
  type WialonReportScope,
} from './wialonFuelReport/templates.js';
import { scopeFromCredentials, WialonReportResolverService } from './WialonReportResolverService.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import { isWialonGenerator, isWialonMachinery, isWialonVehicle } from './wialonAssetCategory.js';
import type { FuelGroupMembership } from './wialonFuelAssetGroups.js';
import { loadFuelGroupMembership } from './wialonFuelAssetGroups.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
import { applyBalanceConsumption } from './wialonFuelLedger.js';
import { filterPlausibleFuelEvents } from './fuelEventPlausibility.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';
import { supplementTransactionsWithUnitReports } from './wialonFuelUnitReportSupplement.js';
import { dedupeFuelTransactions } from './wialonFuelReport/dedupe.js';
import { patchTransactionUnitIds, buildUnitNameIndex } from './wialonFuelReport/unitNames.js';
import {
  filterTransactionsByDateRange,
  isCompleteMonthSpan,
} from './wialonFuelReport/rangeFilter.js';
import { computeFuelKpis, monthlyFuelTrend, splitDateRangeByDays } from './fuelTransactionAggregates.js';
import { CacheService } from './CacheService.js';

function computeKpis(rows: FuelTransaction[], fromDate?: string, toDate?: string) {
  return computeFuelKpis(rows, fromDate, toDate);
}

function monthlyTrend(rows: FuelTransaction[]) {
  return monthlyFuelTrend(rows);
}

function splitRangeByDays(fromDate: string, toDate: string, chunkDays: number) {
  return splitDateRangeByDays(fromDate, toDate, chunkDays);
}

function unitHasConsumption(rows: FuelTransaction[], unitId: number): boolean {
  return rows.some(
    (r) =>
      r.unitId === unitId &&
      (Number(r.fuelUsed) > 0 || (r.section === 'consumption' && effectiveConsumed(r) > 0)),
  );
}

const rangeCacheSvc = new CacheService();
const RANGE_CACHE_VERSION = 'v7';
const CACHE_TTL_MS = 30 * 60 * 1000;
const RANGE_REDIS_TTL_SEC = 86400;

const txCache = new Map<string, { rows: FuelTransaction[]; expires: number; fetchedAt: number }>();
const exactRangeInflight = new Map<string, Promise<FuelTransaction[]>>();

function cacheKey(
  tenantId: string,
  fromTs: number,
  toTs: number,
  unitId?: number,
  assetCategory?: FuelAssetCategory
) {
  return `${tenantId}:${fromTs}:${toTs}:${unitId ?? 'all'}:${assetCategory ?? 'all'}`;
}

function rangeRedisKey(
  tenantId: string,
  fromTs: number,
  toTs: number,
  unitId?: number,
  assetCategory?: FuelAssetCategory
) {
  return `fuel:range:${RANGE_CACHE_VERSION}:${tenantId}:${fromTs}:${toTs}:${unitId ?? 'all'}:${assetCategory ?? 'all'}`;
}

function exactRangeInflightKey(
  tenantId: string,
  fromDate: string,
  toDate: string,
  unitId?: number,
  assetCategory?: FuelAssetCategory
) {
  return `${tenantId}:${fromDate}:${toDate}:${unitId ?? 'all'}:${assetCategory ?? 'all'}`;
}

function parseDateRange(fromParam?: string, toParam?: string, days = 1) {
  const toDate = toParam ? new Date(toParam) : new Date();
  const fromDate = fromParam ? new Date(fromParam) : new Date(toDate.getTime() - days * 86400000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date range');
  }
  const bare = /^\d{4}-\d{2}-\d{2}$/;
  if (toParam && bare.test(toParam)) toDate.setUTCHours(23, 59, 59, 999);
  return { fromTs: Math.floor(fromDate.getTime() / 1000), toTs: Math.floor(toDate.getTime() / 1000) };
}

function dateFromTs(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function diffDaysInclusive(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
  return Math.floor((to - from) / 86400000) + 1;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  const limit = Math.max(1, concurrency);
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
  }
  return out;
}

function buildTransactionsResponse(
  transactions: FuelTransaction[],
  fromDate: string,
  toDate: string,
  fromTs: number,
  toTs: number,
  source: 'cache' | 'wialon' | 'warming',
  warming: boolean,
  needsRefresh: boolean
) {
  return {
    transactions,
    kpis: computeKpis(transactions, fromDate, toDate),
    trend: monthlyTrend(transactions),
    fromTs,
    toTs,
    source,
    needsRefresh,
    warming,
    fetchedAt: new Date().toISOString(),
  };
}

function unitsForAssetCategory(
  allUnits: Array<{ id: number; nm: string }>,
  assetCategory?: FuelAssetCategory,
  membership?: FuelGroupMembership,
): Array<{ id: number; nm: string }> {
  if (!assetCategory) return allUnits;
  return allUnits.filter((u) => {
    const input = { name: u.nm, unitId: u.id, groupMembership: membership };
    if (assetCategory === 'generator') return isWialonGenerator(input);
    if (assetCategory === 'machinery') return isWialonMachinery(input);
    return isWialonVehicle(input);
  });
}

export class WialonFuelReportService {
  /** Direct Wialon report fetch — used by month cache warming only. */
  static async fetchFromWialon(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      unitId?: number;
      days?: number;
      refresh?: boolean;
      assetCategory?: FuelAssetCategory;
    }
  ): Promise<FuelTransaction[]> {
    const { fromTs, toTs } = parseDateRange(opts.from, opts.to, opts.days);
    const groupConcurrency = 3;
    const creds = await loadTenantWialonCreds(tenantId);
    const scope: WialonReportScope = scopeFromCredentials(tenantId, creds);
    const rows = await withWialonClient(creds, async (client: WialonClient) => {
      const { groupTemplate, unitTemplate, expected } = await findFuelReportTemplates(client, scope, {
        assetCategory: opts.assetCategory,
        tenantId,
      });
      if (!groupTemplate && !unitTemplate) {
        const catalog = await WialonReportResolverService.listAllTemplates(client, scope, 40);
        const fuelNames = catalog
          .filter((t) => /fuel/i.test(t.templateName))
          .map((t) => t.templateName);
        throw new Error(
          fuelNames.length
            ? `No matching Wialon fuel report templates for this account. Expected "${expected.group}" and/or "${expected.unit}". Found: ${fuelNames.join(', ')}.`
            : `No Wialon fuel report templates found. Create "${expected.group}" and "${expected.unit}" on this billing account in Wialon.`
        );
      }

      console.info(
        `[FuelReport] tenant=${tenantId} category=${opts.assetCategory ?? 'all'} group=${groupTemplate?.templateName ?? '—'} unit=${unitTemplate?.templateName ?? '—'}`,
      );

      const allUnits = await listAllUnits(client, scope);
      const membership = await loadFuelGroupMembership(client, tenantId);
      const unitNameToId = new Map(allUnits.map((u) => [u.nm, u.id]));
      const unitIndex = buildUnitNameIndex(allUnits);
      let transactions: FuelTransaction[] = [];

      // Same pipeline for every FLS category: prefer group reports, then unit reports.
      let groups: Array<{ id: number; nm: string }> = [];
      if (groupTemplate) {
        groups = await findFleetGroups(client, scope, { assetCategory: opts.assetCategory });
        const groupTxBatches = await mapWithConcurrency(groups, groupConcurrency, async (group) => {
          try {
            return await processGroupFuelData(client, group, groupTemplate, fromTs, toTs, unitNameToId);
          } catch (err) {
            console.error(`[FuelReport] Group "${group.nm}" failed:`, err);
            return [] as FuelTransaction[];
          }
        });
        for (const groupTxs of groupTxBatches) transactions.push(...groupTxs);
      }

      // Group reports can still return deactivated/removed units that remain in the Wialon group.
      const activeUnitIds = new Set(allUnits.map((u) => u.id));
      const activeUnitNames = new Set(allUnits.map((u) => u.nm.trim().toLowerCase()).filter(Boolean));
      if (transactions.length && (activeUnitIds.size || activeUnitNames.size)) {
        transactions = transactions.filter((t) => {
          if (t.unitId > 0 && activeUnitIds.has(t.unitId)) return true;
          const name = String(t.unitName || '').trim().toLowerCase();
          return Boolean(name && activeUnitNames.has(name));
        });
      }

      let targetUnits = opts.unitId
        ? allUnits.filter((u) => u.id === opts.unitId)
        : allUnits;

      if (!opts.unitId && opts.assetCategory) {
        const categoryUnits = unitsForAssetCategory(allUnits, opts.assetCategory, membership);
        if (categoryUnits.length) {
          targetUnits = categoryUnits;
        } else if (groupTemplate && transactions.length) {
          const scopedUnitIds = new Set(
            transactions
              .map((t) => t.unitId)
              .filter((id): id is number => Number.isFinite(id) && id > 0),
          );
          if (scopedUnitIds.size > 0) {
            targetUnits = allUnits.filter((u) => scopedUnitIds.has(u.id));
          }
        }
      }

      // Prefer group reports when they yield data. If the category has no matching
      // Wialon groups (common for small machinery fleets), fall through to per-unit.
      const LARGE_FLEET = 12;
      const groupsEmpty = !groups.length;
      const groupHarvestEmpty = !transactions.length;
      const shouldRunUnitReports = Boolean(
        unitTemplate &&
          (opts.unitId ||
            (!groupTemplate && targetUnits.length < LARGE_FLEET) ||
            ((groupsEmpty || groupHarvestEmpty) &&
              targetUnits.length > 0 &&
              targetUnits.length < LARGE_FLEET)),
      );
      if (shouldRunUnitReports) {
        if (groupTemplate && (groupsEmpty || groupHarvestEmpty) && !opts.unitId) {
          console.info(
            `[FuelReport] No usable group harvest for category=${opts.assetCategory ?? 'all'} (${targetUnits.length} units) — running per-unit reports`,
          );
        }
        const unitsToRun = opts.unitId ? targetUnits : targetUnits.slice(0, LARGE_FLEET);
        const concurrency = Math.min(3, Math.max(1, unitsToRun.length));
        const unitBatches = await mapWithConcurrency(unitsToRun, concurrency, async (unit) => {
          try {
            return await processUnitFuelData(client, unit, unitTemplate!, fromTs, toTs);
          } catch (err) {
            console.error(`[FuelReport] Unit "${unit.nm}" failed:`, err);
            return [] as FuelTransaction[];
          }
        });
        for (const unitTxs of unitBatches) transactions.push(...unitTxs);
      } else if (!opts.unitId && groupTemplate && targetUnits.length >= LARGE_FLEET) {
        console.info(
          `[FuelReport] Using group summaries for ${targetUnits.length} units (category=${opts.assetCategory ?? 'all'}; skip per-unit fan-out)`,
        );
      }

      if (opts.unitId) {
        transactions = transactions.filter((t) => t.unitId === opts.unitId);
      }

      // Keep only this category's units after group/unit harvest (group reports can mix fleets).
      if (!opts.unitId && opts.assetCategory && targetUnits.length) {
        const catIds = new Set(targetUnits.map((u) => u.id));
        const catNames = new Set(
          targetUnits.map((u) => String(u.nm || '').trim().toLowerCase()).filter(Boolean),
        );
        transactions = transactions.filter((t) => {
          if (t.unitId > 0 && catIds.has(t.unitId)) return true;
          const name = String(t.unitName || '').trim().toLowerCase();
          return Boolean(name && catNames.has(name));
        });
      }

      patchTransactionUnitIds(transactions, unitIndex);

      const unitIds = opts.unitId ? [opts.unitId] : targetUnits.map((u) => u.id);
      const missingConsumption = unitIds.filter((id) => !unitHasConsumption(transactions, id));
      // Same supplement path for all categories; cap size so large fleets stay on group reports.
      if (missingConsumption.length > 0 && unitTemplate && missingConsumption.length < LARGE_FLEET) {
        try {
          transactions = await supplementTransactionsWithUnitReports(
            tenantId,
            transactions,
            fromTs,
            toTs,
            missingConsumption,
            opts.assetCategory,
          );
        } catch (err) {
          console.error('[FuelReport] Unit report supplement failed:', err);
        }
      }

      transactions = dedupeFuelTransactions(transactions);
      const fromDateStr = opts.from || dateFromTs(fromTs);
      const toDateStr = opts.to || dateFromTs(toTs);
      transactions = filterTransactionsByDateRange(transactions, fromDateStr, toDateStr);
      transactions = enrichTransactionsWithTankLevels(transactions);
      transactions.sort((a, b) => b.timestamp - a.timestamp);
      return transactions;
    });
    return this.enrichWithBalanceConsumption(tenantId, rows);
  }

  /** Opening + filled − closing when Wialon only exposes fillings (e.g. Fillings Report). */
  private static async enrichWithBalanceConsumption(
    tenantId: string,
    rows: FuelTransaction[],
  ): Promise<FuelTransaction[]> {
    let liveFuelByUnit: Map<number, number> | undefined;
    try {
      const fleet = await WialonFuelFleetService.listAssets(tenantId);
      liveFuelByUnit = new Map(
        fleet.assets
          .filter((a) => a.fuelLiters != null && a.fuelLiters >= 0)
          .map((a) => [a.unitId, a.fuelLiters as number]),
      );
    } catch {
      liveFuelByUnit = undefined;
    }
    const plausible = filterPlausibleFuelEvents(
      rows.filter((r) => r.sensor !== 'balance'),
      liveFuelByUnit,
    );
    return applyBalanceConsumption(plausible, liveFuelByUnit);
  }

  private static startExactRangeFetch(
    tenantId: string,
    fromDate: string,
    toDate: string,
    opts: { unitId?: number; refresh?: boolean; assetCategory?: FuelAssetCategory }
  ): Promise<FuelTransaction[]> {
    const inflightKey = exactRangeInflightKey(tenantId, fromDate, toDate, opts.unitId, opts.assetCategory);
    const existing = exactRangeInflight.get(inflightKey);
    if (existing && !opts.refresh) return existing;

    const promise = this.fetchAndPersistRange(tenantId, fromDate, toDate, opts).finally(() =>
      exactRangeInflight.delete(inflightKey)
    );
    exactRangeInflight.set(inflightKey, promise);
    return promise;
  }

  private static async fetchAndPersistRange(
    tenantId: string,
    fromDate: string,
    toDate: string,
    opts: { unitId?: number; refresh?: boolean; assetCategory?: FuelAssetCategory }
  ): Promise<FuelTransaction[]> {
    const { fromTs, toTs } = parseDateRange(fromDate, toDate);
    const spanDays = diffDaysInclusive(fromDate, toDate);
    let rows: FuelTransaction[];
    if (spanDays > 31 && !opts.unitId) {
      const chunks = splitRangeByDays(fromDate, toDate, 14);
      const chunkRows = await mapWithConcurrency(chunks, 2, async (chunk) =>
        this.fetchFromWialon(tenantId, {
          from: chunk.from,
          to: chunk.to,
          refresh: opts.refresh,
          assetCategory: opts.assetCategory,
        }).catch(() => [] as FuelTransaction[])
      );
      rows = chunkRows.flat();
    } else {
      rows = await this.fetchFromWialon(tenantId, {
        from: fromDate,
        to: toDate,
        unitId: opts.unitId,
        refresh: opts.refresh,
        assetCategory: opts.assetCategory,
      });
    }
    let transactions = rows;
    if (opts.unitId) {
      transactions = transactions.filter((t) => t.unitId === opts.unitId);
    }
    transactions = enrichTransactionsWithTankLevels(transactions);
    if (transactions.length) {
      const now = Date.now();
      const key = cacheKey(tenantId, fromTs, toTs, opts.unitId, opts.assetCategory);
      txCache.set(key, { rows: transactions, expires: now + CACHE_TTL_MS, fetchedAt: now });
      await rangeCacheSvc
        .set(rangeRedisKey(tenantId, fromTs, toTs, opts.unitId, opts.assetCategory), transactions, RANGE_REDIS_TTL_SEC)
        .catch(() => undefined);
    }
    return transactions;
  }

  private static async readRangeCacheRows(
    tenantId: string,
    fromTs: number,
    toTs: number,
    unitId?: number,
    assetCategory?: FuelAssetCategory
  ): Promise<FuelTransaction[] | null> {
    const redis = await rangeCacheSvc
      .get<FuelTransaction[]>(rangeRedisKey(tenantId, fromTs, toTs, unitId, assetCategory))
      .catch(() => null);
    return redis?.length ? redis : null;
  }

  /** Non-blocking background warm for a dashboard date range. */
  static warmRangeInBackground(
    tenantId: string,
    opts: {
      from: string;
      to: string;
      unitId?: number;
      assetCategory?: FuelAssetCategory;
      refresh?: boolean;
    }
  ): void {
    const fromDate = opts.from;
    const toDate = opts.to;
    const completeSpan = isCompleteMonthSpan(fromDate, toDate);

    void import('./WialonFuelAnalyticsService.js').then(({ WialonFuelAnalyticsService }) => {
      WialonFuelAnalyticsService.warmDateRange(tenantId, fromDate, toDate);
    });

    if (completeSpan && !opts.refresh) return;

    const inflightKey = exactRangeInflightKey(tenantId, fromDate, toDate, opts.unitId, opts.assetCategory);
    if (exactRangeInflight.has(inflightKey)) return;

    void this.startExactRangeFetch(tenantId, fromDate, toDate, {
      unitId: opts.unitId,
      refresh: opts.refresh,
      assetCategory: opts.assetCategory,
    }).catch(() => undefined);
  }

  /** Fetch fuel transactions — always returns fully-fetched data (no warming response). */
  static async getTransactions(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      refresh?: boolean;
      unitId?: number;
      days?: number;
      assetCategory?: FuelAssetCategory;
    }
  ) {
    const { fromTs, toTs } = parseDateRange(opts.from, opts.to, opts.days);
    const key = cacheKey(tenantId, fromTs, toTs, opts.unitId, opts.assetCategory);
    const now = Date.now();
    const fromDate = opts.from || dateFromTs(fromTs);
    const toDate = opts.to || dateFromTs(toTs);

    if (opts.refresh) {
      const creds = await loadTenantWialonCreds(tenantId);
      invalidateFuelReportCaches(scopeFromCredentials(tenantId, creds));
      txCache.delete(key);
      await rangeCacheSvc
        .del(rangeRedisKey(tenantId, fromTs, toTs, opts.unitId, opts.assetCategory))
        .catch(() => undefined);

      const rows = await this.startExactRangeFetch(tenantId, fromDate, toDate, {
        unitId: opts.unitId,
        refresh: true,
        assetCategory: opts.assetCategory,
      });
      return buildTransactionsResponse(rows, fromDate, toDate, fromTs, toTs, 'wialon', false, false);
    }

    const mem = txCache.get(key);
    if (mem && mem.expires > now && mem.rows.length) {
      return buildTransactionsResponse(mem.rows, fromDate, toDate, fromTs, toTs, 'cache', false, false);
    }

    const redisRows = await this.readRangeCacheRows(
      tenantId,
      fromTs,
      toTs,
      opts.unitId,
      opts.assetCategory
    );
    if (redisRows?.length) {
      txCache.set(key, { rows: redisRows, expires: now + CACHE_TTL_MS, fetchedAt: now });
      return buildTransactionsResponse(
        redisRows,
        fromDate,
        toDate,
        fromTs,
        toTs,
        'cache',
        false,
        false
      );
    }

    const completeSpan = isCompleteMonthSpan(fromDate, toDate);
    if (!completeSpan || opts.assetCategory) {
      const exactRows = await this.startExactRangeFetch(tenantId, fromDate, toDate, {
        unitId: opts.unitId,
        refresh: false,
        assetCategory: opts.assetCategory,
      });
      return buildTransactionsResponse(exactRows, fromDate, toDate, fromTs, toTs, 'wialon', false, false);
    }

    const { WialonFuelAnalyticsService } = await import('./WialonFuelAnalyticsService.js');
    let { rows, source } = await WialonFuelAnalyticsService.loadTransactionRows(tenantId, fromDate, toDate, false);
    if (source === 'warming' || rows.length === 0) {
      const forced = await WialonFuelAnalyticsService.loadTransactionRows(tenantId, fromDate, toDate, true);
      rows = forced.rows;
      source = forced.source;
    }

    let transactions = rows;
    if (opts.unitId) {
      transactions = transactions.filter((t) => t.unitId === opts.unitId);
    }
    transactions = enrichTransactionsWithTankLevels(transactions);
    if (transactions.length) {
      txCache.set(key, { rows: transactions, expires: now + CACHE_TTL_MS, fetchedAt: now });
      await rangeCacheSvc
        .set(rangeRedisKey(tenantId, fromTs, toTs, opts.unitId, opts.assetCategory), transactions, RANGE_REDIS_TTL_SEC)
        .catch(() => undefined);
    }

    return buildTransactionsResponse(
      transactions,
      fromDate,
      toDate,
      fromTs,
      toTs,
      source === 'wialon' ? 'wialon' : 'cache',
      false,
      false
    );
  }

  static async getOverview(tenantId: string, opts: { from?: string; to?: string; refresh?: boolean }) {
    const data = await this.getTransactions(tenantId, opts);
    return {
      ...data.kpis,
      transactionCount: data.transactions.length,
      fromTs: data.fromTs,
      toTs: data.toTs,
      fetchedAt: data.fetchedAt,
      source: data.source,
    };
  }

  static async getTrend(tenantId: string, opts: { from?: string; to?: string; refresh?: boolean }) {
    const data = await this.getTransactions(tenantId, opts);
    return { trend: data.trend, fetchedAt: data.fetchedAt };
  }
}
