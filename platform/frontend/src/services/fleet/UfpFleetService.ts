import { clientApi } from '@/lib/api';
import type {
  Alert,
  Driver,
  FuelTransaction,
  Generator,
  GeneratorEngineHours,
  Machinery,
  Route,
  Vehicle,
} from '@/types';
import type {
  DateRange,
  FleetServiceConfig,
  FleetStats,
  FuelByVehicle,
  FuelEvent,
  FuelKpiData,
  FuelReport,
  FuelStats,
  FuelTransactionFilters,
  GeneratorEngineHoursFilters,
  IFleetService,
  MonthlyFuelTrend,
  VehicleFilters,
  VehiclePosition,
} from './types';
import {
  fuelAssetToGenerator,
  fuelAssetToMachinery,
  fuelAssetToVehicle,
} from '../transformers/wialonFuelAssetTransformer';
import { wialonFuelTransactionsToFuelTransactions } from '../transformers/fuelTransformer';
import type { FuelAssetCategory, FuelFleetSummary, WialonFuelAssetRow } from '@/lib/fuelTypes';

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultFuelRange(): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => formatLocalDate(d);
  const to = fmt(today);
  const from = fmt(new Date(today.getTime() - 6 * 86400000));
  return { from, to };
}

function consumptionToEngineHours(rows: FuelTransaction[]): GeneratorEngineHours[] {
  const out: GeneratorEngineHours[] = [];
  for (const tx of rows) {
    if (tx.section !== 'consumption') continue;
    const durationSec =
      tx.durationSeconds > 0
        ? tx.durationSeconds
        : tx.duration
          ? parseDurationToSeconds(tx.duration)
          : 0;
    if (durationSec <= 0) continue;
    const beginning = tx.timestamp;
    const end = beginning + durationSec;
    out.push({
      id: `${tx.unitId}|${beginning}|${end}`,
      unitId: String(tx.unitId),
      unitName: tx.unitName,
      grouping: '[GENSETS]',
      beginning,
      end,
      initialEngineHours: 0,
      engineHours: durationSec / 3600,
      finalEngineHours: durationSec / 3600,
    });
  }
  return out;
}

function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return 0;
}

export class UfpFleetService implements IFleetService {
  private config: FleetServiceConfig;
  private initialized = false;
  private fuelAssetsCache: WialonFuelAssetRow[] | null = null;
  private fuelSummaryCache: FuelFleetSummary | null = null;

  constructor(config: FleetServiceConfig = { useMock: false, serviceType: 'backend' }) {
    this.config = config;
  }

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  isConnected(): boolean {
    return this.initialized;
  }

  /** Authoritative fuel asset list — Wialon units with fuel sensors, classified by backend. */
  async getFuelAssets(force = false): Promise<WialonFuelAssetRow[]> {
    if (!force && this.fuelAssetsCache) return this.fuelAssetsCache;
    const res = await clientApi.getWialonFuelAssets();
    this.fuelAssetsCache = res.assets;
    this.fuelSummaryCache = res.summary;
    return res.assets;
  }

  async getFuelFleetSummary(): Promise<FuelFleetSummary> {
    if (this.fuelSummaryCache) return this.fuelSummaryCache;
    const res = await clientApi.getWialonFuelAssets();
    this.fuelSummaryCache = res.summary;
    this.fuelAssetsCache = res.assets;
    return res.summary;
  }

  private async unitIdsForCategory(category: FuelAssetCategory): Promise<Set<string>> {
    const assets = await this.getFuelAssets();
    return new Set(assets.filter((a) => a.assetType === category).map((a) => String(a.unitId)));
  }

  private async nonVehicleUnitIds(): Promise<Set<string>> {
    const assets = await this.getFuelAssets();
    return new Set(
      assets.filter((a) => a.assetType === 'generator' || a.assetType === 'machinery').map((a) => String(a.unitId)),
    );
  }

  async getVehicles(_filters?: VehicleFilters): Promise<Vehicle[]> {
    const assets = await this.getFuelAssets();
    return assets.filter((a) => a.assetType === 'vehicle').map(fuelAssetToVehicle);
  }

  async getVehicleById(id: string): Promise<Vehicle | null> {
    const vehicles = await this.getVehicles();
    return vehicles.find((v) => v.id === id) ?? null;
  }

  async getVehiclePositions(_vehicleIds: string[]): Promise<VehiclePosition[]> {
    return [];
  }

  async getGenerators(): Promise<Generator[]> {
    const assets = await this.getFuelAssets();
    return assets.filter((a) => a.assetType === 'generator').map(fuelAssetToGenerator);
  }

  async getGeneratorById(id: string): Promise<Generator | null> {
    const generators = await this.getGenerators();
    return generators.find((g) => g.id === id) ?? null;
  }

  async getMachinery(): Promise<Machinery[]> {
    const assets = await this.getFuelAssets();
    return assets.filter((a) => a.assetType === 'machinery').map(fuelAssetToMachinery);
  }

  async getMachineryById(id: string): Promise<Machinery | null> {
    const items = await this.getMachinery();
    return items.find((m) => m.id === id) ?? null;
  }

  async getGeneratorEngineHours(
    filters?: GeneratorEngineHoursFilters,
  ): Promise<GeneratorEngineHours[]> {
    try {
      const range = defaultFuelRange();
      const from = filters?.startDate ?? range.from;
      const to = filters?.endDate ?? range.to;
      const res = await clientApi.getWialonGeneratorEngineHours(
        from,
        to,
        filters?.refresh ?? false,
        filters?.unitId ? Number(filters.unitId) : undefined,
      );
      let rows: GeneratorEngineHours[] = res.data.map((r) => ({
        id: r.id,
        unitId: String(r.unitId),
        unitName: r.unitName,
        grouping: r.grouping,
        beginning: r.beginning,
        end: r.end,
        initialEngineHours: r.initialEngineHours,
        engineHours: r.engineHours,
        finalEngineHours: r.finalEngineHours,
      }));

      if (filters?.unitId) {
        rows = rows.filter((r) => r.unitId === filters.unitId);
      } else {
        const genIds = await this.unitIdsForCategory('generator');
        const mchIds = await this.unitIdsForCategory('machinery');
        const stationaryIds = new Set([...genIds, ...mchIds]);
        if (stationaryIds.size > 0) {
          rows = rows.filter((r) => stationaryIds.has(r.unitId));
        }
      }

      if (rows.length > 0) return rows;
      const stationaryFuel = await this.getFuelTransactionsByCategory('generator', filters);
      const machineryFuel = await this.getFuelTransactionsByCategory('machinery', filters);
      return consumptionToEngineHours([...stationaryFuel, ...machineryFuel]);
    } catch (error) {
      console.error('[UfpFleetService] getGeneratorEngineHours failed:', error);
      return [];
    }
  }

  async getGeneratorFuelTransactions(filters?: FuelTransactionFilters): Promise<FuelTransaction[]> {
    return this.getFuelTransactionsByCategory('generator', filters);
  }

  async getMachineryFuelTransactions(filters?: FuelTransactionFilters): Promise<FuelTransaction[]> {
    return this.getFuelTransactionsByCategory('machinery', filters);
  }

  private async getFuelTransactionsByCategory(
    category: FuelAssetCategory,
    filters?: FuelTransactionFilters,
  ): Promise<FuelTransaction[]> {
    const { transactions } = await this.getFuelTransactionsMeta({
      ...filters,
      assetCategory: category,
    });
    if (filters?.vehicleId) {
      return transactions.filter((t) => String(t.unitId) === filters.vehicleId);
    }
    return transactions;
  }

  async getFleetStats(): Promise<FleetStats> {
    const summary = await this.getFuelFleetSummary();
    const vehicles = await this.getVehicles();
    const generators = await this.getGenerators();
    return {
      totalVehicles: summary.vehicles || vehicles.length,
      moving: vehicles.filter((v) => v.status === 'moving').length,
      idle: vehicles.filter((v) => v.status === 'idle').length,
      stopped: vehicles.filter((v) => v.status === 'stopped').length,
      offline: vehicles.filter((v) => v.status === 'offline').length,
      totalGenerators: summary.generators || generators.length,
      generatorsRunning: generators.filter((g) => g.status === 'running').length,
    };
  }

  async getFuelLevels(): Promise<Map<string, number>> {
    const assets = await this.getFuelAssets();
    const map = new Map<string, number>();
    for (const a of assets) {
      if (a.fuelLiters != null) map.set(String(a.unitId), a.fuelLiters);
    }
    return map;
  }

  async getFuelStats(_unitId: string, _days?: number): Promise<FuelStats> {
    return {
      unitId: _unitId,
      unitName: '',
      currentLevel: 0,
      consumption24h: 0,
      consumption7d: 0,
      averageConsumption: 0,
    };
  }

  async getFuelReport(_unitId: string, _dateRange: DateRange): Promise<FuelReport> {
    throw new Error('Not implemented');
  }

  async getFuelAlerts(hours = 24): Promise<FuelEvent[]> {
    const since = Date.now() - hours * 3600_000;
    const { from, to } = defaultFuelRange();
    const txs = await this.getFuelTransactions({ startDate: from, endDate: to, includeGenerators: true, includeMachinery: true });
    return txs
      .filter((t) => t.section === 'theft' && t.suddenFuelDrop > 0 && t.timestamp * 1000 >= since)
      .map((t) => ({
        type: 'theft' as const,
        unitId: String(t.unitId),
        unitName: t.unitName,
        timestamp: new Date(t.timestamp * 1000).toISOString(),
        location: { lat: t.latitude ?? 0, lng: t.longitude ?? 0 },
        volumeChange: -t.suddenFuelDrop,
        levelBefore: t.initialLevel,
        levelAfter: t.finalLevel,
      }));
  }

  async getFuelTransactionsMeta(
    filters?: FuelTransactionFilters,
  ): Promise<{ transactions: FuelTransaction[]; warming: boolean; needsRefresh?: boolean }> {
    const range = defaultFuelRange();
    const from = filters?.startDate ?? range.from;
    const to = filters?.endDate ?? range.to;
    const data = await clientApi.getFuelTransactions(
      from,
      to,
      filters?.refresh ?? false,
      filters?.vehicleId ? Number(filters.vehicleId) : undefined,
      filters?.assetCategory,
    );
    let transactions = wialonFuelTransactionsToFuelTransactions(data.transactions);

    if (filters?.assetCategory) {
      // Backend already scoped by assetCategory — only patch missing unitIds from the
      // fuel-assets list. Never drop rows when the client asset list is empty/mismatched
      // (that was wiping generators/machinery tabs).
      try {
        const assets = await this.getFuelAssets();
        const categoryAssets = assets.filter((a) => a.assetType === filters.assetCategory);
        if (categoryAssets.length) {
          const idSet = new Set(categoryAssets.map((a) => String(a.unitId)));
          const byName = new Map(
            categoryAssets.map((a) => [a.name.trim().toLowerCase(), a] as const),
          );
          transactions = transactions.map((t) => {
            if (t.unitId && idSet.has(String(t.unitId))) return t;
            const match = byName.get(t.unitName.trim().toLowerCase());
            if (match) return { ...t, unitId: String(match.unitId || t.unitId) };
            return t;
          });
        }
      } catch {
        // Keep backend-scoped rows as-is.
      }
    } else if (filters?.vehicleId) {
      transactions = transactions.filter((t) => String(t.unitId) === filters.vehicleId);
    } else if (!filters?.includeGenerators && !filters?.includeMachinery) {
      try {
        const exclude = await this.nonVehicleUnitIds();
        transactions = transactions.filter((t) => !exclude.has(String(t.unitId)));
      } catch {
        // Keep vehicle rows when asset list is temporarily unavailable.
      }
    }

    const needsRefresh = Boolean(data.needsRefresh);
    const warming = Boolean(
      data.warming ?? (data.source === 'warming' && transactions.length === 0),
    );
    // Keep warming and needsRefresh separate — soft refresh must not look like "still syncing"
    return { transactions, warming, needsRefresh };
  }

  async getFuelTransactions(filters?: FuelTransactionFilters): Promise<FuelTransaction[]> {
    const { transactions } = await this.getFuelTransactionsMeta(filters);
    return transactions;
  }

  async getFuelKpis(): Promise<FuelKpiData> {
    return {
      totalFuelCost: 0,
      totalLiters: 0,
      avgCostPerLiter: 0,
      avgEfficiency: 0,
      monthlyBudget: 0,
      budgetUsed: 0,
      transactionsThisMonth: 0,
      preferredStationUsage: 0,
    };
  }

  async getFuelByVehicle(): Promise<FuelByVehicle[]> {
    return [];
  }

  async getMonthlyFuelTrend(): Promise<MonthlyFuelTrend[]> {
    try {
      const { trend } = await clientApi.getWialonFuelTrend();
      return trend.map((p) => ({ month: p.month, liters: p.filled + p.consumed, cost: 0 }));
    } catch {
      return [];
    }
  }

  async getDrivers(): Promise<Driver[]> {
    return [];
  }

  async getDriverById(_id: string): Promise<Driver | null> {
    return null;
  }

  async getRoutes(): Promise<Route[]> {
    return [];
  }

  async getRouteById(_id: string): Promise<Route | null> {
    return null;
  }

  async getAlerts(): Promise<Alert[]> {
    return [];
  }

  async acknowledgeAlert(_alertId: string): Promise<boolean> {
    return false;
  }

  async getFuelStations(): Promise<import('@/types').FuelStation[]> {
    return [];
  }

  async getDashboardKpis(): Promise<import('./types').DashboardKpiData> {
    const stats = await this.getFleetStats();
    return {
      totalVehicles: stats.totalVehicles,
      activeVehicles: stats.moving + stats.idle,
      totalGenerators: stats.totalGenerators,
      activeGenerators: stats.generatorsRunning,
      fuelAlerts: 0,
      maintenanceDue: 0,
      driverCount: 0,
      routeCount: 0,
    };
  }

  async getChartData(): Promise<import('./types').ChartData> {
    return {
      fuelTrend: [],
      vehicleUtilization: [],
      driverPerformance: [],
    };
  }
}
