import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { WialonFleetService } from './WialonFleetService.js';
import { WialonFuelService } from './WialonFuelService.js';
import { formatFuelRowFields } from './wialonReportFuelMerge.js';
import { unitHasFuelLevelSensors, totalLitersFromReadings } from './wialonFuelSensorUtils.js';
import { wialonFuelEventStore } from './wialonFuelEventStore.js';
import { decodeBitFlags, CALC_TYPE_FLAGS, FUEL_LEVEL_PARAM_FLAGS, normalizeFuelLevelParams } from './wialonFuelFlags.js';
import { decodeCalcTypes } from './wialonFuel.js';

export class WialonFuelManagementService {
  /** Live fuel levels from fleet snapshot sensors; FLS used only for active fill detection. */
  static async syncLiveFuel(tenantId: string) {
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);

    let fillByUnit = new Map<number, number>();
    try {
      const creds = await loadTenantWialonCreds(tenantId);
      const fls = await WialonFuelService.getFleetFuelLive(
        creds,
        snap.units.map((u) => u.id),
        new Map(snap.units.map((u) => [u.id, (u.sens ?? []).map((s) => ({ id: s.id, name: s.name }))]))
      );
      fillByUnit = new Map(
        fls.filter((r) => (r.fuel?.filled ?? 0) > 0).map((r) => [r.unitId, r.fuel!.filled!])
      );
    } catch {
      /* FLS optional */
    }

    const units = snap.units
      .filter((u) => unitHasFuelLevelSensors(u.sens))
      .map((u) => {
        const fuel = u.fuel;
        const filled = fillByUnit.get(u.id);
        const merged = fuel
          ? { ...fuel, filled: filled ?? fuel.filled, filledFormatted: filled ? `${filled} L` : fuel.filledFormatted }
          : undefined;
        const total = merged?.levelLiters ?? (merged?.sensors ? totalLitersFromReadings(
          merged.sensors.map((s, i) => ({
            sensorId: s.sensorId ?? i,
            name: s.name || '',
            param: '',
            liters: s.level ?? s.value ?? 0,
            rawValue: 0,
          }))
        ) : null);
        const row = formatFuelRowFields(u, merged);
        return {
          unitId: u.id,
          unitName: u.name,
          plate: u.plate || '',
          status: u.status,
          ...row,
          fuelLiters: total,
          filledLiters: filled ?? row.filledLiters,
          sensors: merged?.sensors ?? [],
          hardware: u.hwName || '',
        };
      });

    wialonFuelEventStore.ingestFromLive(
      tenantId,
      units.map((u) => ({
        unitId: u.unitId,
        unitName: u.unitName,
        fuel: { filled: u.filledLiters ?? undefined, levelLiters: u.fuelLiters ?? undefined, sensors: u.sensors },
      }))
    );

    return { units, fetchedAt: snap.fetchedAt, count: units.length };
  }

  static async getOverview(tenantId: string) {
    const { units, fetchedAt } = await this.syncLiveFuel(tenantId);
    const withFuel = units.filter((u) => u.fuelLiters != null && u.fuelLiters > 0);
    const lowFuel = units.filter((u) => u.fuelPercent != null && u.fuelPercent < 25);
    return {
      fetchedAt,
      reportingUnits: withFuel.length,
      totalUnits: units.length,
      lowFuelCount: lowFuel.length,
      activeFillings: units.filter((u) => (u.filledLiters ?? 0) > 0).length,
      avgFuelPercent:
        withFuel.length > 0
          ? Math.round(withFuel.reduce((a, u) => a + (u.fuelPercent ?? 0), 0) / withFuel.length)
          : 0,
      vehiclesTracked: units.length,
    };
  }

  static async getEvents(tenantId: string, limit = 200) {
    await this.syncLiveFuel(tenantId);
    return { events: wialonFuelEventStore.list(tenantId, limit), fetchedAt: new Date().toISOString() };
  }

  static async getUnitProfile(tenantId: string, unitId: number) {
    const creds = await loadTenantWialonCreds(tenantId);
    const [settings, live] = await Promise.all([
      WialonFuelService.getFuelSettings(creds, unitId),
      WialonFuelService.getUnitFuelLive(creds, unitId),
    ]);
    const levelParams = normalizeFuelLevelParams(settings.fuelLevelParams as Record<string, unknown> | undefined);
    return {
      unitId,
      settings: {
        ...settings,
        calcTypeLabels: settings.calcTypeLabels?.length ? settings.calcTypeLabels : decodeCalcTypes(settings.calcTypes),
        fuelLevelParamLabels: decodeBitFlags(levelParams.flags, FUEL_LEVEL_PARAM_FLAGS),
        fuelLevelParams: levelParams,
      },
      live,
      decoded: {
        calcTypes: decodeBitFlags(settings.calcTypes, CALC_TYPE_FLAGS),
        levelParams: decodeBitFlags(levelParams.flags, FUEL_LEVEL_PARAM_FLAGS),
      },
      fetchedAt: new Date().toISOString(),
    };
  }
}
