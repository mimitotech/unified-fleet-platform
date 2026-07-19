import { query } from '../config/database.js';
import { WialonFuelReportService } from './WialonFuelReportService.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
import { filterPlausibleFuelEvents } from './fuelEventPlausibility.js';
import { encodePeriodLocation } from './wialonFuelReport/periodMeta.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';

function toDbNumber(n: number | undefined | null): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  return n;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fuelTxToDbRow(tenantId: string, tx: FuelTransaction, assetCategory?: FuelAssetCategory) {
  const isSummary = tx.sensor === 'wialon_group_summary' || tx.sensor.startsWith('wialon_group_summary');
  return {
    id: tx.id,
    tenantId,
    assetId: null as string | null,
    assetCategory: assetCategory ?? null,
    unitId: String(tx.unitId),
    unitName: tx.unitName,
    section: tx.section,
    tank: tx.tank,
    timestamp: tx.timestamp,
    timeStr: tx.time,
    location: isSummary
      ? encodePeriodLocation(tx.periodFromTs, tx.periodToTs, tx.location)
      : tx.location ?? '',
    latitude: toDbNumber(tx.latitude),
    longitude: toDbNumber(tx.longitude),
    initialLevel: tx.initialLevel ?? 0,
    finalLevel: tx.finalLevel ?? 0,
    filled: tx.filled ?? 0,
    fuelUsed: tx.fuelUsed ?? 0,
    mileage: tx.mileage ?? 0,
    avgConsumption: tx.avgConsumption ?? 0,
    sensor: tx.sensor ?? '',
    duration: tx.duration ?? '',
    durationSeconds: tx.durationSeconds ?? 0,
    suddenFuelDrop: tx.suddenFuelDrop ?? 0,
    eventCount: tx.count ?? 0,
  };
}

/**
 * Persist Wialon-derived fuel transactions into Postgres (`fuel_transactions`).
 * We store the canonical filled/used/level values; UI-only fields like
 * `suddenFuelDrop` are recomputed when reading.
 */
export class WialonFuelDbSyncService {
  static async upsertTransactions(
    tenantId: string,
    txs: FuelTransaction[],
    assetCategory?: FuelAssetCategory,
  ): Promise<void> {
    if (!txs.length) return;

    // Never persist invented balance rows — recompute at read time with live guards.
    let toStore = txs.filter((tx) => tx.sensor !== 'balance');

    // Drop impossible FLS noise before it lands in Postgres (e.g. BOWSER ±34k L swings).
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
    toStore = filterPlausibleFuelEvents(toStore, liveFuelByUnit);
    if (!toStore.length) return;

    const BATCH_SIZE = 250;
    const batches = chunkArray(toStore, BATCH_SIZE);

    const columns = [
      'id',
      'tenant_id',
      'asset_id',
      'asset_category',
      'unit_id',
      'unit_name',
      'section',
      'tank',
      'timestamp',
      'time_str',
      'location',
      'latitude',
      'longitude',
      'initial_level',
      'final_level',
      'filled',
      'fuel_used',
      'mileage',
      'avg_consumption',
      'sensor',
      'duration',
      'duration_seconds',
      'sudden_fuel_drop',
      'event_count',
    ] as const;

    const updateSet = columns
      .filter((c) => c !== 'id')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    for (const batch of batches) {
      const params: unknown[] = [];
      const values: string[] = [];
      let p = 1;

      for (const tx of batch) {
        const row = fuelTxToDbRow(tenantId, tx, assetCategory);
        values.push(`(${columns.map(() => `$${p++}`).join(', ')})`);
        params.push(
          row.id,
          row.tenantId,
          row.assetId,
          row.assetCategory,
          row.unitId,
          row.unitName,
          row.section,
          row.tank,
          row.timestamp,
          row.timeStr,
          row.location,
          row.latitude,
          row.longitude,
          row.initialLevel,
          row.finalLevel,
          row.filled,
          row.fuelUsed,
          row.mileage,
          row.avgConsumption,
          row.sensor,
          row.duration,
          row.durationSeconds,
          row.suddenFuelDrop,
          row.eventCount,
        );
      }

      await query(
        `INSERT INTO fuel_transactions (${columns.join(', ')})
         VALUES ${values.join(', ')}
         ON CONFLICT (id) DO UPDATE
         SET ${updateSet}, updated_at = NOW()`,
        params,
      );
    }
  }

  static async syncRangeToDb(opts: {
    tenantId: string;
    from: string;
    to: string;
    assetCategory?: FuelAssetCategory;
    refresh?: boolean;
    unitId?: number;
  }): Promise<FuelTransaction[]> {
    const res = await WialonFuelReportService.getTransactions(opts.tenantId, {
      from: opts.from,
      to: opts.to,
      unitId: opts.unitId,
      refresh: opts.refresh,
      assetCategory: opts.assetCategory,
    });
    const txs = res.transactions ?? [];
    await this.upsertTransactions(opts.tenantId, txs, opts.assetCategory);
    return txs;
  }
}

