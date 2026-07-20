import { query } from '../config/database.js';
import { toCamelRows } from '../utils/mapper.js';
import { WialonFuelDbSyncService } from './WialonFuelDbSyncService.js';
import { WialonFuelLiveSnapshotService } from './WialonFuelLiveSnapshotService.js';
import { WialonFuelReportService } from './WialonFuelReportService.js';
import {
  computeFuelKpis,
  enrichTankLevels,
  monthlyFuelTrend,
} from './fuelTransactionAggregates.js';
import { applyBalanceConsumption } from './wialonFuelLedger.js';
import { filterPlausibleFuelEvents } from './fuelEventPlausibility.js';
import { decodePeriodLocation } from './wialonFuelReport/periodMeta.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { logger } from '../config/logger.js';

const STALE_MS = 15 * 60 * 1000;
/** Do not re-queue Wialon sync immediately after a failure (avoids thrash + endless "Updating…"). */
const ERROR_BACKOFF_MS = 2 * 60 * 1000;
const inflight = new Map<string, Promise<void>>();
const lastQueueAt = new Map<string, number>();
/** In-flight live Wialon fetches (same key as sync) so concurrent polls share one report exec. */
const liveInflight = new Map<string, Promise<FuelTransaction[]>>();

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
  const sensor = String(r.sensor ?? 'db');
  const decoded = decodePeriodLocation(String(r.location ?? ''));
  return {
    id: String(r.id),
    unitId: Number(r.unitId),
    unitName: String(r.unitName),
    section,
    tank,
    timestamp: Number(r.timestamp),
    time: String(r.timeStr ?? r.time ?? ''),
    location: decoded.location,
    initialLevel,
    finalLevel,
    filled: Number(r.filled ?? 0),
    sensor,
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
    periodFromTs: decoded.periodFromTs,
    periodToTs: decoded.periodToTs,
  };
}

async function enrichWithBalanceConsumption(
  tenantId: string,
  rows: FuelTransaction[],
): Promise<FuelTransaction[]> {
  // Drop previously persisted synthetic balance rows — recompute with live guards only.
  const withoutBalance = rows.filter((r) => r.sensor !== 'balance');
  let liveFuelByUnit: Map<number, number> | undefined;
  try {
    // Prefer stored live snapshots (fast) over listAssets (slow Wialon fan-out)
    const snaps = await WialonFuelLiveSnapshotService.getLatestByTenant(tenantId);
    liveFuelByUnit = new Map();
    for (const s of snaps as Array<Record<string, unknown>>) {
      const id = Number(s.unitId ?? s.unit_id);
      const liters = Number(s.fuelLiters ?? s.fuel_liters);
      if (Number.isFinite(id) && Number.isFinite(liters) && liters >= 0) {
        liveFuelByUnit.set(id, liters);
      }
    }
    if (!liveFuelByUnit.size) liveFuelByUnit = undefined;
  } catch {
    liveFuelByUnit = undefined;
  }

  const plausible = filterPlausibleFuelEvents(withoutBalance, liveFuelByUnit);
  // If plausibility wiped every real event but DB had rows, keep originals (still drop balance).
  // Prevents empty Fuel tables when live snapshots are sparse/stale vs historical FLS.
  if (withoutBalance.length > 0 && plausible.length === 0) {
    return applyBalanceConsumption(withoutBalance, liveFuelByUnit);
  }
  return applyBalanceConsumption(plausible, liveFuelByUnit);
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

  // Prefer exact category. Untagged rows are backfilled on live sync with assetCategory.
  if (opts.assetCategory) {
    sql += ` AND asset_category = $${params.length + 1}`;
    params.push(opts.assetCategory);
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

async function applyStationFilledToTransactions(
  tenantId: string,
  fromDate: string,
  toDate: string,
  transactions: FuelTransaction[],
): Promise<FuelTransaction[]> {
  if (!fromDate || !toDate || !transactions.length) return transactions;
  try {
    const { FuelVarianceService } = await import('./FuelVarianceService.js');
    const { normalizePlateKey } = await import('./FuelStationSheetService.js');
    const { extractPlateFromName } = await import('./unitPlateUtils.js');
    const stationByKey = await FuelVarianceService.getStationTotalsByKey(tenantId, fromDate, toDate);
    if (!stationByKey.size) return transactions;

    const unitNames = [...new Set(transactions.map((t) => t.unitName).filter(Boolean))];
    const assigned = new Map<string, number>();
    const usedKeys = new Set<string>();
    for (const unitName of unitNames) {
      const keys = [
        normalizePlateKey(extractPlateFromName(unitName) || ''),
        normalizePlateKey(unitName),
      ].filter(Boolean);
      let liters = 0;
      for (const key of keys) {
        const st = stationByKey.get(key);
        if (!st || usedKeys.has(key)) continue;
        liters += st.stationLiters;
        usedKeys.add(key);
      }
      if (liters > 0) assigned.set(unitName, liters);
    }
    if (!assigned.size) return transactions;

    const applied = new Set<string>();
    return transactions.map((t) => {
      if (t.section !== 'filling') return t;
      if (applied.has(t.unitName)) return t;
      const station = assigned.get(t.unitName);
      if (!(station && station > 0)) return t;
      applied.add(t.unitName);
      return { ...t, filledStation: station };
    });
  } catch (err) {
    logger.debug(`[FuelDbRead] station fill enrich skipped tenant=${tenantId}`, err);
    return transactions;
  }
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

    const now = Date.now();
    const last = lastQueueAt.get(key) ?? 0;
    // Soft debounce even without an error (poll storms)
    if (!opts.refresh && now - last < 30_000) return;

    const job = (async () => {
      const cursorKey = syncCursorKey(opts.fromDate, opts.toDate, opts.assetCategory);
      try {
        // Skip re-queue shortly after a recorded failure unless Force refresh
        if (!opts.refresh) {
          const existing = await getSyncCursor(opts.tenantId, cursorKey);
          if (existing?.last_error && existing.last_synced_at) {
            const errAt = new Date(existing.last_synced_at).getTime();
            if (Date.now() - errAt < ERROR_BACKOFF_MS) return;
          }
        }

        lastQueueAt.set(key, Date.now());
        await touchSyncCursor(opts.tenantId, cursorKey, { success: false, error: null });
        const txs = await WialonFuelDbSyncService.syncRangeToDb({
          tenantId: opts.tenantId,
          from: opts.fromDate,
          to: opts.toDate,
          assetCategory: opts.assetCategory,
          refresh: opts.refresh ?? false,
        });
        await touchSyncCursor(opts.tenantId, cursorKey, {
          success: txs.length > 0,
          rowCount: txs.length,
          error: txs.length > 0 ? null : 'Wialon report returned 0 fuel rows for this period',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`[FuelDbRead] background sync failed tenant=${opts.tenantId}`, err);
        lastQueueAt.set(key, Date.now());
        await touchSyncCursor(opts.tenantId, cursorKey, { success: false, error: message });
      } finally {
        inflight.delete(key);
      }
    })();

    // Mark queued immediately so debounce works even before the async job starts
    lastQueueAt.set(key, now);
    inflight.set(key, job);
    void job;
  }

  /**
   * Live Wialon report fetch (offline-quality path). Shared across concurrent polls.
   * Persists rows to MariaDB in the background so later reads are fast.
   */
  static async fetchLiveFromWialon(opts: {
    tenantId: string;
    fromDate: string;
    toDate: string;
    assetCategory?: FuelAssetCategory;
    unitId?: number;
    refresh?: boolean;
  }): Promise<FuelTransaction[]> {
    const key = `${opts.tenantId}:live:${opts.fromDate}:${opts.toDate}:${opts.assetCategory ?? 'all'}:${opts.unitId ?? ''}`;
    const existing = liveInflight.get(key);
    if (existing) return existing;

    const job = (async () => {
      const live = await WialonFuelReportService.getTransactions(opts.tenantId, {
        from: opts.fromDate,
        to: opts.toDate,
        unitId: opts.unitId,
        assetCategory: opts.assetCategory,
        refresh: opts.refresh ?? false,
      });
      const txs = live.transactions ?? [];
      if (txs.length) {
        void WialonFuelDbSyncService.upsertTransactions(
          opts.tenantId,
          txs,
          opts.assetCategory,
        ).catch((err) =>
          logger.warn(`[FuelDbRead] persist live rows failed tenant=${opts.tenantId}`, err),
        );
        const cursorKey = syncCursorKey(opts.fromDate, opts.toDate, opts.assetCategory);
        void touchSyncCursor(opts.tenantId, cursorKey, {
          success: true,
          rowCount: txs.length,
          error: null,
        }).catch(() => undefined);
      }
      return txs;
    })().finally(() => {
      liveInflight.delete(key);
    });

    liveInflight.set(key, job);
    return job;
  }

  static async getTransactions(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      refresh?: boolean;
      unitId?: number;
      assetCategory?: FuelAssetCategory;
      /** When false, return DB rows without queuing Wialon sync (KPIs / dashboard). */
      queueSync?: boolean;
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
    const allowQueue = opts.queueSync !== false;

    const finalize = async (transactions: FuelTransaction[], source: 'db' | 'wialon' | 'warming') => {
      let txs = await enrichWithBalanceConsumption(tenantId, transactions);
      txs = await applyStationFilledToTransactions(tenantId, fromDate, toDate, txs);
      return { txs };
    };

    // ── Force refresh: await live Wialon reports (same as offline) ──────────
    if (opts.refresh && allowQueue) {
      try {
        const liveRows = await this.fetchLiveFromWialon({
          tenantId,
          fromDate,
          toDate,
          assetCategory: opts.assetCategory,
          unitId: opts.unitId,
          refresh: true,
        });
        const { txs } = await finalize(liveRows, 'wialon');
        return buildResponse(
          txs,
          fromDate,
          toDate,
          fromTs,
          toTs,
          txs.length ? 'wialon' : 'db',
          false,
          false,
          new Date().toISOString(),
        );
      } catch (err) {
        logger.warn(`[FuelDbRead] live refresh failed tenant=${tenantId}`, err);
        // Fall through to DB + background sync
        this.queueBackgroundSync({
          tenantId,
          fromDate,
          toDate,
          assetCategory: opts.assetCategory,
          refresh: true,
        });
      }
    }

    let transactions = await readTransactionsFromDb({
      tenantId,
      fromTs,
      toTs,
      assetCategory: opts.assetCategory,
      unitId: opts.unitId,
      rowLimit,
    });

    // ── Offline parity: when DB empty, await live Wialon fuel reports ───────
    if (transactions.length === 0 && allowQueue) {
      try {
        logger.info(
          `[FuelDbRead] DB empty — live Wialon fallback tenant=${tenantId} ${fromDate}→${toDate} cat=${opts.assetCategory ?? 'all'}`,
        );
        const liveRows = await this.fetchLiveFromWialon({
          tenantId,
          fromDate,
          toDate,
          assetCategory: opts.assetCategory,
          unitId: opts.unitId,
          refresh: false,
        });
        const { txs } = await finalize(liveRows, 'wialon');
        return buildResponse(
          txs,
          fromDate,
          toDate,
          fromTs,
          toTs,
          txs.length ? 'wialon' : 'db',
          false,
          txs.length === 0,
          txs.length ? new Date().toISOString() : cursor?.last_success_at,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`[FuelDbRead] live Wialon fallback failed tenant=${tenantId}: ${message}`);
        void touchSyncCursor(tenantId, cursorKey, { success: false, error: message }).catch(
          () => undefined,
        );
        // Keep background sync for retry; return empty with warming so UI can poll
        this.queueBackgroundSync({
          tenantId,
          fromDate,
          toDate,
          assetCategory: opts.assetCategory,
        });
        return buildResponse(
          [],
          fromDate,
          toDate,
          fromTs,
          toTs,
          'warming',
          true,
          true,
          cursor?.last_success_at,
        );
      }
    }

    const { txs } = await finalize(transactions, 'db');
    transactions = txs;

    const stale = isStale(cursor);
    const recentlyFailed =
      Boolean(cursor?.last_error) &&
      Boolean(cursor?.last_synced_at) &&
      Date.now() - new Date(cursor!.last_synced_at!).getTime() < ERROR_BACKOFF_MS;
    const needsRefresh = !recentlyFailed && stale;

    if (needsRefresh && allowQueue) {
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
      'db',
      false,
      needsRefresh && allowQueue,
      cursor?.last_success_at,
    );
  }
}
