import { CacheService } from './CacheService.js';
import { WialonFleetService } from './WialonFleetService.js';
import { WialonFuelService } from './WialonFuelService.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { resolveFuelAssetCategory, type FuelAssetCategory } from './wialonAssetCategory.js';
import { loadFuelGroupMembership } from './wialonFuelAssetGroups.js';
import {
  unitHasFuelModuleSensors,
  readAllUnitSensors,
  readFuelLevelSensors,
  totalLitersFromReadings,
  splitFuelTankLevels,
  tankCapacityFromItem,
  formatSensorSummary,
  type WialonUnitSensorReading,
} from './wialonFuelSensorUtils.js';
import {
  mapSensorSlots,
  buildAssetFlags,
  computeFleetSummary,
  type FuelSensorSlots,
  type FuelAssetFlags,
  type FuelFleetSummary,
} from './wialonFuelSensorSlots.js';
import { unitSliceToSearchItem, sliceHasFuelSensorData } from './wialonFuelUnitItem.js';
import { WialonUnitItemsCache } from './wialonUnitItemsCache.js';
import { WialonFuelAnalyticsService } from './WialonFuelAnalyticsService.js';
import { withWialonClient } from './WialonSessionService.js';
import { searchUnitsForAccount, accountIdFrom } from './wialonLiveUtils.js';
import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import type { WialonUnitSlice } from './wialonUnitMapper.js';

export type FuelAssetRow = {
  unitId: number;
  name: string;
  plate: string;
  assetType: FuelAssetCategory;
  status: string;
  fuelLiters: number | null;
  mainTankLiters: number | null;
  reserveTankLiters: number | null;
  tankCount: number;
  fuelSensors: WialonUnitSensorReading[];
  sensors: WialonUnitSensorReading[];
  sensorSlots: FuelSensorSlots;
  flags: FuelAssetFlags;
  sensorSummary: string;
  fillingLiters: number | null;
  fuelPercent: number | null;
  engineHours: number | null;
  mileage: number | null;
  updatedAt: string | null;
};

export type FuelAssetsResponse = {
  assets: FuelAssetRow[];
  summary: FuelFleetSummary;
  fetchedAt: string;
  cachedAt: string;
  fromCache: boolean;
};

const MEMORY_TTL_MS = 60_000;
const REDIS_TTL_SEC = 5 * 60;
const memoryCache = new Map<string, { data: FuelAssetsResponse; expires: number }>();
const inflight = new Map<string, Promise<FuelAssetsResponse>>();

/** Prefer calibrated fuel-level sensors; ignore fleet fallback when no level sensor. */
function resolveFuelLiters(
  sensorTotal: number | null,
  fleetLiters: number | undefined | null,
  hasFuelLevelSensor: boolean
): number | null {
  if (!hasFuelLevelSensor) return null;
  if (sensorTotal != null && sensorTotal >= 0) return sensorTotal;
  if (fleetLiters != null && fleetLiters >= 0) return fleetLiters;
  return null;
}

function resolveSearchItem(
  unit: WialonUnitSlice,
  itemsById: Map<number, WialonSearchItem>
): WialonSearchItem {
  const cached = itemsById.get(unit.id);
  if (cached) return cached;
  return unitSliceToSearchItem(unit);
}

async function loadItemsById(
  tenantId: string,
  creds: Awaited<ReturnType<typeof loadTenantWialonCreds>>,
  accountId: string | number,
  _unitsNeedingFetch: WialonUnitSlice[]
): Promise<Map<number, WialonSearchItem>> {
  const accountKey = String(accountId);
  const fromCache = WialonUnitItemsCache.byId(accountKey);
  if (fromCache) return fromCache;

  try {
    return await withWialonClient(creds, async (client) => {
      const items = await searchUnitsForAccount(client, Number(accountId), 10_000);
      WialonUnitItemsCache.set(accountKey, items);
      return new Map(items.map((i) => [i.id, i]));
    });
  } catch {
    return new Map();
  }
}

/** Live fuel from Wialon — uses fleet snapshot first (fast), cached response. */
export class WialonFuelFleetService {
  static invalidateCache(tenantId: string): void {
    memoryCache.delete(tenantId);
    void new CacheService().del(`fuel:assets:${tenantId}`);
  }

  static async listAssets(tenantId: string): Promise<FuelAssetsResponse> {
    const now = Date.now();
    const mem = memoryCache.get(tenantId);
    if (mem && mem.expires > now) {
      return { ...mem.data, fromCache: true };
    }

    const redisKey = `fuel:assets:${tenantId}`;
    const cache = new CacheService();
    const redisCached = await cache.get<FuelAssetsResponse>(redisKey);
    if (redisCached) {
      memoryCache.set(tenantId, { data: redisCached, expires: now + MEMORY_TTL_MS });
      return { ...redisCached, fromCache: true };
    }

    let pending = inflight.get(tenantId);
    if (!pending) {
      pending = this.buildAssets(tenantId).finally(() => inflight.delete(tenantId));
      inflight.set(tenantId, pending);
    }

    const data = await pending;
    void WialonFuelAnalyticsService.warmStandardMonths(tenantId);
    memoryCache.set(tenantId, { data, expires: Date.now() + MEMORY_TTL_MS });
    void cache.set(redisKey, data, REDIS_TTL_SEC);
    return { ...data, fromCache: false };
  }

  private static async buildAssets(tenantId: string): Promise<FuelAssetsResponse> {
    const cachedAt = new Date().toISOString();
    const [snap, creds] = await Promise.all([
      WialonFleetService.getCachedLiveFleet(tenantId),
      loadTenantWialonCreds(tenantId),
    ]);
    const accountId = accountIdFrom(creds);

    let groupMembership = {
      generatorUnitIds: new Set<number>(),
      machineryUnitIds: new Set<number>(),
      vehicleUnitIds: new Set<number>(),
    };
    try {
      groupMembership = await withWialonClient(creds, (client) =>
        loadFuelGroupMembership(client, tenantId)
      );
    } catch {
      /* optional — heuristics still apply */
    }

    const fuelUnits = snap.units.filter((u) => unitHasFuelModuleSensors(u.sens));
    const needsFullItem = fuelUnits.filter((u) => !sliceHasFuelSensorData(u));

    let itemsById = new Map<number, WialonSearchItem>();
    if (needsFullItem.length && accountId != null) {
      itemsById = await loadItemsById(tenantId, creds, accountId, needsFullItem);
    }

    const fuelUnitIds = fuelUnits.map((u) => u.id);
    const sensByUnit = new Map(
      fuelUnits.map((u) => [u.id, u.sens.map((s) => ({ id: s.id, name: s.name }))])
    );

    const fillByUnit = new Map<number, number>();
    if (fuelUnitIds.length) {
      try {
        const fls = await WialonFuelService.getFleetFuelLive(creds, fuelUnitIds, sensByUnit);
        for (const row of fls) {
          const filled = row.fuel?.filled;
          if (filled != null && filled > 0) fillByUnit.set(row.unitId, filled);
        }
      } catch {
        /* optional */
      }
    }

    const assets: FuelAssetRow[] = [];

    for (const unit of fuelUnits) {
      const customFields: Record<string, string> = {};
      for (const f of unit.flds ?? []) {
        if (f.name) customFields[f.name] = String(f.value ?? '');
      }

      const rawItem = resolveSearchItem(unit, itemsById);
      const sensors = readAllUnitSensors(rawItem);
      const fuelSensors = sensors.filter((s) => s.isFuelLevel);
      const fuelLevelReadings = readFuelLevelSensors(rawItem);
      const tankSplit = splitFuelTankLevels(sensors);
      const sensorTotal = fuelLevelReadings.length ? totalLitersFromReadings(fuelLevelReadings) : null;
      const sensorSlots = mapSensorSlots(sensors);
      const hasFuelLevel = sensorSlots.fuelLevel != null || fuelSensors.length > 0;

      const totalLiters = resolveFuelLiters(sensorTotal, unit.fuel?.levelLiters, hasFuelLevel);

      const capacity = tankCapacityFromItem(rawItem);
      const fuelPercent =
        hasFuelLevel && totalLiters != null && capacity && capacity > 0
          ? Math.min(100, Math.round((totalLiters / capacity) * 100))
          : null;

      const posTime = unit.position?.time;
      const updatedAt = posTime ? new Date(posTime * 1000).toISOString() : snap.fetchedAt;
      const fillingLiters = fillByUnit.get(unit.id) ?? null;
      const flags = buildAssetFlags(sensorSlots, updatedAt, fillingLiters);

      const assetType = resolveFuelAssetCategory({
        name: unit.name,
        plate: unit.plate,
        engineHours: unit.counters?.engineHours,
        mileage: unit.counters?.mileage,
        customFields,
        unitId: unit.id,
        groupMembership,
        sensorNames: sensors.map((s) => s.name),
      });

      assets.push({
        unitId: unit.id,
        name: unit.name,
        plate: unit.plate || '',
        assetType,
        status: unit.status,
        fuelLiters: totalLiters,
        mainTankLiters: tankSplit.mainLiters,
        reserveTankLiters: tankSplit.reserveLiters,
        tankCount: tankSplit.tankCount,
        fuelSensors,
        sensors,
        sensorSlots,
        flags,
        sensorSummary: formatSensorSummary(sensors),
        fillingLiters,
        fuelPercent,
        engineHours: unit.counters?.engineHours ?? null,
        mileage: unit.counters?.mileage ?? null,
        updatedAt,
      });
    }

    assets.sort((a, b) => a.name.localeCompare(b.name));
    return {
      assets,
      summary: computeFleetSummary(assets),
      fetchedAt: snap.fetchedAt,
      cachedAt,
      fromCache: false,
    };
  }
}
