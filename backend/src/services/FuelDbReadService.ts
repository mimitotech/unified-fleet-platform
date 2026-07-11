import { query } from '../config/database.js';
import { toCamelRows } from '../utils/mapper.js';
import { WialonFuelDbSyncService } from './WialonFuelDbSyncService.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
import {
  computeFuelKpis,
  enrichTankLevels,
  monthlyFuelTrend,
} from './fuelTransactionAggregates.js';
import { applyBalanceConsumption } from './wialonFuelLedger.js';
import { missingConsumption } from './wialonFuelReport/metrics.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { logger } from '../config/logger.js';

const STALE_MS = 15 * 60 * 1000;
const inflight = new Map<string, Promise<void>>();

function isBareDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateToTs(value: string, endOfDay: boolean): number {
  const d = new Date(`${value}T${endOfDay ? '23:59:59Z' : '00:00:00Z'}`);
  return Math.floor(d.getTime() / 1000);
}

function tsToBareDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function syncCursorKey(fromDate: string, toDate: string, assetCategory?: FuelAssetCategory) {
  return `tx:${assetCategory ?? 'all'}:${fromDate}:${toDate}`;
}

function dbRowToFuelTransaction(r: Record<string, unknown>): FuelTransaction {
  const tank = (r.tank as FuelTransaction['tank']) ?? 'main';
  const initialLevel = Number(r.initialLevel ?? 0);
  const finalLevel = Number(r.finalLevel ?? 0);
  const suddenFuelDrop = Number(r.suddenFuelDrop ?? 0);
  const section = r.section as FuelTransaction['section'];
  return {
    id: String(r.id),
    unitId: Number(r.unitId),
    unitName: String(r.unitName),
    section,
    tank,
    timestamp: Number(r.timestamp),
    time: String(r.timeStr ?? r.time ?? ''),
    location: String(r.location ?? ''),
    initialLevel,
    finalLevel,
    filled: Number(r.filled ?? 0),
    sensor: String(r.sensor ?? 'db'),
    fuelUsed: Number(r.fuelUsed ?? 0),
    mileage: Number(r.mileage ?? 0),
    duration: String(r.duration ?? ''),
    durationSeconds: Number(r.durationSeconds ?? 0),
    avgConsumption: Number(r.avgConsumption ?? 0),
    suddenFuelDrop,
    count: Number(r.eventCount ?? r.count ?? 0),
    latitude: r.latitude != null ? Number(r.latitude) : undefined,
    longitude: r.longitude != null ? Number(r.longitude) : undefined,
    mainTankLevel: tank === 'main' ? finalLevel : undefined,
    reserveTankLevel: tank === 'reserve' ? finalLevel : undefined,
  };
}

async function resolveUnitIdsForCategory(tenantId: string, assetCategory?: FuelAssetCategory) {
  if (!assetCategory) return undefined;
  try {
    const { assets } = await WialonFuelFleetService.listAssets(tenantId);
    const unitIds = assets.filter((a) => a.assetType === assetCategory).map((a) => String(a.unitId));
    return unitIds.length ? unitIds : undefined;
  } catch (err) {
    logger.debug(`[FuelDbRead] category unit list skipped tenant=${tenantId} category=${assetCategory}`, err);
    return undefined;
  }
}

/** Derive period consumption when Wialon only synced fillings (Fillings Report tenants). */
async function enrichWithBalanceConsumption(
  tenantId: string,
  rows: FuelTransaction[],
): Promise<FuelTransaction[]> {
  if (!rows.length || !missingConsumption(rows)) return rows;
  let liveFuelByUnit: Map<number, number> | undefined;
  try {
    const { assets } = await WialonFuelFleetService.listAssets(tenantId);
    liveFuelByUnit = new Map(
      assets
        .filter((a) => a.fuelLiters != null && a.fuelLiters >= 0)
        .map((a) => [a.unitId, a.fuelLiters as number]),
    );
  } catch {
    liveFuelByUnit = undefined;
  }
  return applyBalanceConsumption(rows, liveFuelByUnit);
}

async function readTransactionsFromDb(opts: {
  tenantId: string;
  fromTs: number;
  toTs: number;
  assetCategory?: FuelAssetCategory;
  unitId?: number;
  rowLimit: number;
}): Promise<FuelTransaction[]> {
  let sql = `SELECT
      id, unit_id, unit_name, section, tank, timestamp, time_str, location,
      latitude, longitude, initial_level, final_level, filled, fuel_used, mileage,
      avg_consumption, sensor, duration, duration_seconds, sudden_fuel_drop, event_count
    FROM fuel_transactions
    WHERE tenant_id = $1 AND timestamp >= $2 AND timestamp <= $3`;
  const params: unknown[] = [opts.tenantId, opts.fromTs, opts.toTs];

  const unitIds = await resolveUnitIdsForCategory(opts.tenantId, opts.assetCategory);
  if (opts.assetCategory) {
    sql += ` AND (asset_category = $${params.length + 1}`;
    params.push(opts.assetCategory);
    if (unitIds && unitIds.length) {
      sql += ` OR unit_id = ANY($${params.length + 1})`;
      params.push(unitIds);
    }
    sql += `)`;
  } else if (unitIds && unitIds.length) {
    sql += ` AND unit_id = ANY($${params.length + 1})`;
    params.push(unitIds);
  }
  if (opts.unitId != null) {
    sql += ` AND unit_id = $${params.length + 1}`;
    params.push(String(opts.unitId));
  }

  sql += ` ORDER BY timestamp DESC LIMIT ${opts.rowLimit}`;
  const { rows } = await query(sql, params);
  const mapped = toCamelRows(rows).map((r) => dbRowToFuelTransaction(r as Record<string, unknown>));
  return enrichTankLevels(mapped);
}

async function getSyncCursor(tenantId: string, cursorKey: string) {
  const { rows } = await query<{
    last_synced_at: string | null;
    last_success_at: string | null;
    row_count: number;
    last_error: string | null;
  }>(
    `SELECT last_synced_at, last_success_at, row_count, last_error
     FROM fuel_sync_cursor WHERE tenant_id = $1 AND cursor_key = $2`,
    [tenantId, cursorKey],
  );
  return rows[0] ?? null;
}

async function touchSyncCursor(
  tenantId: string,
  cursorKey: string,
  patch: { success?: boolean; rowCount?: number; error?: string | null },
) {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO fuel_sync_cursor (tenant_id, cursor_key, last_synced_at, last_success_at, row_count, last_error)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, cursor_key) DO UPDATE SET
       last_synced_at = EXCLUDED.last_synced_at,
       last_success_at = CASE WHEN $7 THEN EXCLUDED.last_success_at ELSE fuel_sync_cursor.last_success_at END,
       row_count = CASE WHEN $7 THEN EXCLUDED.row_count ELSE fuel_sync_cursor.row_count END,
       last_error = EXCLUDED.last_error`,
    [
      tenantId,
      cursorKey,
      now,
      patch.success ? now : null,
      patch.rowCount ?? 0,
      patch.error ?? null,
      patch.success ?? false,
    ],
  );
}

function isStale(cursor: { last_success_at: string | null } | null): boolean {
  if (!cursor?.last_success_at) return true;
  return Date.now() - new Date(cursor.last_success_at).getTime() > STALE_MS;
}

function buildResponse(
  transactions: FuelTransaction[],
  fromDate: string,
  toDate: string,
  fromTs: number,
  toTs: number,
  source: 'db' | 'wialon' | 'warming' | 'cache',
  warming: boolean,
  needsRefresh: boolean,
  lastSyncedAt?: string | null,
) {
  return {
    transactions,
    kpis: computeFuelKpis(transactions, fromDate, toDate),
    trend: monthlyFuelTrend(transactions),
    fromTs,
    toTs,
    source,
    warming,
    needsRefresh,
    fetchedAt: new Date().toISOString(),
    lastSyncedAt: lastSyncedAt ?? null,
  };
}

export class FuelDbReadService {
  static queueBackgroundSync(opts: {
    tenantId: string;
    fromDate: string;
    toDate: string;
    assetCategory?: FuelAssetCategory;
    refresh?: boolean;
  }): void {
    const key = `${opts.tenantId}:${opts.fromDate}:${opts.toDate}:${opts.assetCategory ?? 'all'}`;
    if (inflight.has(key)) return;

    const job = (async () => {
      const cursorKey = syncCursorKey(opts.fromDate, opts.toDate, opts.assetCategory);
      try {
        await touchSyncCursor(opts.tenantId, cursorKey, { success: false, error: null });
        const txs = await WialonFuelDbSyncService.syncRangeToDb({
          tenantId: opts.tenantId,
          from: opts.fromDate,
          to: opts.toDate,
          assetCategory: opts.assetCategory,
          refresh: opts.refresh ?? false,
        });
        await touchSyncCursor(opts.tenantId, cursorKey, {
          success: true,
          rowCount: txs.length,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`[FuelDbRead] background sync failed tenant=${opts.tenantId}`, err);
        await touchSyncCursor(opts.tenantId, cursorKey, { success: false, error: message });
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, job);
    void job;
  }

  static async getTransactions(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      refresh?: boolean;
      unitId?: number;
      assetCategory?: FuelAssetCategory;
    },
  ) {
    const fromRaw = opts.from;
    const toRaw = opts.to;

    if (!fromRaw || !toRaw) {
      const { rows } = await query(
        `SELECT
           id, unit_id, unit_name, section, tank, timestamp, time_str, location,
           latitude, longitude, initial_level, final_level, filled, fuel_used, mileage,
           avg_consumption, sensor, duration, duration_seconds, sudden_fuel_drop, event_count
         FROM fuel_transactions
         WHERE tenant_id = $1
         ORDER BY timestamp DESC
         LIMIT 200`,
        [tenantId],
      );
      const transactions = enrichTankLevels(
        toCamelRows(rows).map((r) => dbRowToFuelTransaction(r as Record<string, unknown>)),
      );
      const cursor = await getSyncCursor(tenantId, 'tx:latest');
      return buildResponse(
        transactions,
        '',
        '',
        0,
        0,
        'db',
        false,
        isStale(cursor),
        cursor?.last_success_at,
      );
    }

    const fromTs = isBareDate(fromRaw)
      ? dateToTs(fromRaw, false)
      : Number.isFinite(Number(fromRaw))
        ? parseInt(fromRaw, 10)
        : NaN;
    const toTs = isBareDate(toRaw)
      ? dateToTs(toRaw, true)
      : Number.isFinite(Number(toRaw))
        ? parseInt(toRaw, 10)
        : NaN;

    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
      return buildResponse([], fromRaw, toRaw, 0, 0, 'db', false, false);
    }

    const fromDate = isBareDate(fromRaw) ? fromRaw : tsToBareDate(fromTs);
    const toDate = isBareDate(toRaw) ? toRaw : tsToBareDate(toTs);
    const spanDays = Math.max(1, Math.floor((toTs - fromTs) / 86400) + 1);
    const rowLimit = spanDays <= 7 ? 800 : spanDays <= 14 ? 2000 : 5000;
    const cursorKey = syncCursorKey(fromDate, toDate, opts.assetCategory);
    const cursor = await getSyncCursor(tenantId, cursorKey);

    if (opts.refresh) {
      const txs = await WialonFuelDbSyncService.syncRangeToDb({
        tenantId,
        from: fromDate,
        to: toDate,
        assetCategory: opts.assetCategory,
        refresh: true,
        unitId: opts.unitId,
      });
      await touchSyncCursor(tenantId, cursorKey, { success: true, rowCount: txs.length, error: null });
      let transactions = await enrichWithBalanceConsumption(tenantId, txs);
      if (opts.unitId != null) {
        transactions = transactions.filter((t) => t.unitId === opts.unitId);
      }
      return buildResponse(
        transactions,
        fromDate,
        toDate,
        fromTs,
        toTs,
        'wialon',
        false,
        false,
        new Date().toISOString(),
      );
    }

    let transactions = await readTransactionsFromDb({
      tenantId,
      fromTs,
      toTs,
      assetCategory: opts.assetCategory,
      unitId: opts.unitId,
      rowLimit,
    });
    transactions = await enrichWithBalanceConsumption(tenantId, transactions);

    const stale = isStale(cursor);
    const needsRefresh = stale || (transactions.length === 0 && !cursor?.last_synced_at);

    if (needsRefresh) {
      this.queueBackgroundSync({
        tenantId,
        fromDate,
        toDate,
        assetCategory: opts.assetCategory,
      });
    }

    return buildResponse(
      transactions,
      fromDate,
      toDate,
      fromTs,
      toTs,
      transactions.length ? 'db' : needsRefresh ? 'warming' : 'db',
      needsRefresh && transactions.length === 0,
      needsRefresh,
      cursor?.last_success_at,
    );
  }
}
