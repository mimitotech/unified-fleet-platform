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
} from './wialonFuelReport/templates.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed, effectiveFilled, effectiveTheft } from './wialonFuelReport/metrics.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const txCache = new Map<string, { rows: FuelTransaction[]; expires: number }>();

function cacheKey(tenantId: string, fromTs: number, toTs: number, unitId?: number) {
  return `${tenantId}:${fromTs}:${toTs}:${unitId ?? 'all'}`;
}

function parseDateRange(fromParam?: string, toParam?: string, days = 30) {
  const toDate = toParam ? new Date(toParam) : new Date();
  const fromDate = fromParam ? new Date(fromParam) : new Date(toDate.getTime() - days * 86400000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date range');
  }
  const bare = /^\d{4}-\d{2}-\d{2}$/;
  if (toParam && bare.test(toParam)) toDate.setUTCHours(23, 59, 59, 999);
  return { fromTs: Math.floor(fromDate.getTime() / 1000), toTs: Math.floor(toDate.getTime() / 1000) };
}

function computeKpis(rows: FuelTransaction[]) {
  const consumption = rows.filter((r) => r.section === 'consumption');
  const filling = rows.filter((r) => r.section === 'filling');
  const theft = rows.filter((r) => r.section === 'theft');
  const totalFilled = filling.reduce((a, r) => a + effectiveFilled(r), 0);
  const totalConsumed = consumption.reduce((a, r) => a + effectiveConsumed(r), 0);
  const totalMileage = consumption.filter((r) => r.tank === 'main').reduce((a, r) => a + (r.mileage || 0), 0);
  const theftEvents = theft.length;
  const avgConsumption = totalMileage > 0 ? Math.round((totalConsumed / totalMileage) * 1000) / 10 : 0;
  return {
    totalFilled: Math.round(totalFilled * 10) / 10,
    totalConsumed: Math.round(totalConsumed * 10) / 10,
    totalMileage: Math.round(totalMileage * 10) / 10,
    avgConsumption,
    theftEvents,
    vehiclesTracked: new Set(rows.map((r) => r.unitId).filter(Boolean)).size,
    consumptionCount: consumption.length,
    fillingCount: filling.length,
    theftCount: theft.length,
  };
}

function monthlyTrend(rows: FuelTransaction[]) {
  const byMonth = new Map<string, { filled: number; consumed: number }>();
  for (const r of rows) {
    if (!r.timestamp) continue;
    const month = new Date(r.timestamp * 1000).toISOString().slice(0, 7);
    const row = byMonth.get(month) ?? { filled: 0, consumed: 0 };
    if (r.section === 'filling') row.filled += effectiveFilled(r);
    if (r.section === 'consumption') row.consumed += effectiveConsumed(r);
    if (r.section === 'theft') row.consumed += effectiveTheft(r);
    byMonth.set(month, row);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, filled: Math.round(v.filled * 10) / 10, consumed: Math.round(v.consumed * 10) / 10 }));
}

function dateFromTs(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
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

export class WialonFuelReportService {
  /** Direct Wialon report fetch — used by month cache warming only. */
  static async fetchFromWialon(
    tenantId: string,
    opts: { from?: string; to?: string; unitId?: number; days?: number }
  ): Promise<FuelTransaction[]> {
    const { fromTs, toTs } = parseDateRange(opts.from, opts.to, opts.days);
    const creds = await loadTenantWialonCreds(tenantId);
    const rows = await withWialonClient(creds, async (client: WialonClient) => {
      const { groupTemplate, unitTemplate } = await findFuelReportTemplates(client);
      if (!groupTemplate && !unitTemplate) {
        throw new Error(
          'No Wialon fuel report templates found. Configure "Fuel Report(Group)" and/or "Fuel Report(Unit)" in Wialon resources.'
        );
      }

      const allUnits = await listAllUnits(client);
      const unitNameToId = new Map(allUnits.map((u) => [u.nm, u.id]));
      let transactions: FuelTransaction[] = [];

      if (groupTemplate) {
        const groups = await findFleetGroups(client);
        const groupTxBatches = await mapWithConcurrency(groups, 2, async (group) => {
          try {
            return await processGroupFuelData(client, group, groupTemplate, fromTs, toTs, unitNameToId);
          } catch (err) {
            console.error(`[FuelReport] Group "${group.nm}" failed:`, err);
            return [] as FuelTransaction[];
          }
        });
        for (const groupTxs of groupTxBatches) transactions.push(...groupTxs);
      }

      if (unitTemplate && opts.unitId) {
        const unit = allUnits.find((u) => u.id === opts.unitId);
        if (unit) {
          try {
            const unitTxs = await processUnitFuelData(client, unit, unitTemplate, fromTs, toTs);
            transactions.push(...unitTxs);
          } catch (err) {
            console.error(`[FuelReport] Unit "${unit.nm}" failed:`, err);
          }
        }
      }

      if (opts.unitId) {
        transactions = transactions.filter((t) => t.unitId === opts.unitId);
      }

      transactions = transactions.filter(
        (t) => !t.timestamp || t.timestamp <= 0 || (t.timestamp >= fromTs && t.timestamp <= toTs)
      );
      transactions = enrichTransactionsWithTankLevels(transactions);
      transactions.sort((a, b) => b.timestamp - a.timestamp);
      return transactions;
    });
    return rows;
  }

  /** Fetch fuel transactions for a date range (month cache + short-lived range cache). */
  static async getTransactions(
    tenantId: string,
    opts: { from?: string; to?: string; refresh?: boolean; unitId?: number; days?: number }
  ) {
    const { fromTs, toTs } = parseDateRange(opts.from, opts.to, opts.days);
    const key = cacheKey(tenantId, fromTs, toTs, opts.unitId);
    const now = Date.now();
    const fromDate = opts.from || dateFromTs(fromTs);
    const toDate = opts.to || dateFromTs(toTs);

    if (!opts.refresh) {
      const cached = txCache.get(key);
      if (cached && cached.expires > now && cached.rows.length) {
        return {
          transactions: cached.rows,
          kpis: computeKpis(cached.rows),
          trend: monthlyTrend(cached.rows),
          fromTs,
          toTs,
          source: 'cache' as const,
          needsRefresh: false,
          fetchedAt: new Date().toISOString(),
        };
      }

      const { WialonFuelAnalyticsService } = await import('./WialonFuelAnalyticsService.js');
      const partial = await WialonFuelAnalyticsService.loadCachedRowsOnly(tenantId, fromDate, toDate);
      if (partial.length > 0) {
        let transactions = partial;
        if (opts.unitId) {
          transactions = transactions.filter((t) => t.unitId === opts.unitId);
        }
        transactions = enrichTransactionsWithTankLevels(transactions);
        txCache.set(key, { rows: transactions, expires: now + CACHE_TTL_MS });

        void WialonFuelAnalyticsService.loadTransactionRows(
          tenantId,
          fromDate,
          toDate,
          false
        ).then(({ rows }) => {
          if (!rows.length) return;
          let enriched = rows;
          if (opts.unitId) enriched = enriched.filter((t) => t.unitId === opts.unitId);
          enriched = enrichTransactionsWithTankLevels(enriched);
          txCache.set(key, { rows: enriched, expires: Date.now() + CACHE_TTL_MS });
        });

        return {
          transactions,
          kpis: computeKpis(transactions),
          trend: monthlyTrend(transactions),
          fromTs,
          toTs,
          source: 'cache' as const,
          needsRefresh: true,
          fetchedAt: new Date().toISOString(),
        };
      }
    } else {
      invalidateFuelReportCaches();
    }

    const { WialonFuelAnalyticsService } = await import('./WialonFuelAnalyticsService.js');
    const { rows: loaded, source: loadSource } = await WialonFuelAnalyticsService.loadTransactionRows(
      tenantId,
      fromDate,
      toDate,
      opts.refresh ?? false
    );
    let transactions = loaded;
    if (opts.unitId) {
      transactions = transactions.filter((t) => t.unitId === opts.unitId);
    }
    transactions = enrichTransactionsWithTankLevels(transactions);

    if (transactions.length) {
      txCache.set(key, { rows: transactions, expires: now + CACHE_TTL_MS });
    }

    return {
      transactions,
      kpis: computeKpis(transactions),
      trend: monthlyTrend(transactions),
      fromTs,
      toTs,
      source: loadSource === 'wialon' ? ('wialon' as const) : ('cache' as const),
      needsRefresh: false,
      fetchedAt: new Date().toISOString(),
    };
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
