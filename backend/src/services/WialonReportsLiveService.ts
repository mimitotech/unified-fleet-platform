import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { WialonFleetService } from './WialonFleetService.js';
import { WialonLiveService } from './WialonLiveService.js';
import { WialonFuelService } from './WialonFuelService.js';
import { fetchTripsForUnits } from './wialonLiveReportRows.js';
import { formatFuelRowFields, mergeUnitFuel } from './wialonReportFuelMerge.js';
import type { WialonFuelLive } from './wialonFuel.js';
import { withWialonClient } from './WialonSessionService.js';
import {
  scopeFromCredentials,
  WialonReportResolverService,
  type ResolvedReportTemplate,
} from './WialonReportResolverService.js';
import type { WialonReportModule } from './wialonReportTemplateRegistry.js';

async function loadLiveFuelMap(tenantId: string, unitIds: number[]) {
  const creds = await loadTenantWialonCreds(tenantId);
  const liveById = new Map<number, WialonFuelLive>();
  try {
    const liveUnits = await WialonFuelService.getFleetFuelLive(creds, unitIds);
    for (const u of liveUnits) liveById.set(u.unitId, u.fuel);
  } catch {
    /* optional — snapshot fuel still available */
  }
  return liveById;
}

export class WialonReportsLiveService {
  static async fleetStatus(tenantId: string) {
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const unitIds = snap.units.map((u) => u.id);
    const liveById = await loadLiveFuelMap(tenantId, unitIds);

    const rows = snap.units.map((u) => {
      const merged = mergeUnitFuel(u, liveById.get(u.id));
      const fuel = formatFuelRowFields(u, merged);
      return {
        unitId: u.id,
        unitName: u.name,
        plate: u.plate || '',
        status: u.status,
        motionState: u.motionState || '',
        speedKmh: u.position?.speed != null ? Math.round(u.position.speed) : 0,
        fuelLive: fuel.fuelLive,
        fuelPercent: fuel.fuelPercent,
        fuelLiters: fuel.fuelLiters,
        odometerKm: u.counters?.mileage != null ? Math.round(u.counters.mileage) : null,
        engineHours: u.counters?.engineHours ?? null,
        hardware: u.hwName || '',
        online: u.netconn === true ? 'Online' : u.netconn === false ? 'Offline' : '—',
        lastUpdate: u.position?.time ? new Date(u.position.time * 1000).toISOString() : null,
        latitude: u.position?.lat ?? null,
        longitude: u.position?.lng ?? null,
      };
    });
    return { rows, fetchedAt: snap.fetchedAt, count: rows.length };
  }

  static async fleetFuel(tenantId: string) {
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const unitIds = snap.units.map((u) => u.id);
    const liveById = await loadLiveFuelMap(tenantId, unitIds);

    const rows = snap.units.map((u) => {
      const merged = mergeUnitFuel(u, liveById.get(u.id));
      const fuel = formatFuelRowFields(u, merged);
      return {
        unitId: u.id,
        unitName: u.name,
        plate: u.plate || '',
        status: u.status,
        fuelLive: fuel.fuelLive,
        fuelFiltered: fuel.fuelFiltered,
        fuelLiters: fuel.fuelLiters,
        fuelPercent: fuel.fuelPercent,
        filledLiters: fuel.filledLiters,
        filledFormatted: fuel.filledFormatted,
        sensorName: fuel.sensorName,
        tankCount: fuel.tankCount,
        method: fuel.method,
        hardware: u.hwName || '',
      };
    });
    return { rows, fetchedAt: snap.fetchedAt, count: rows.length };
  }

  static async fleetTrips(tenantId: string, fromMs: number, toMs: number, unitId?: number) {
    const creds = await loadTenantWialonCreds(tenantId);
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const from = new Date(fromMs);
    const to = new Date(toMs);

    const units = snap.units
      .filter((u) => (unitId ? u.id === unitId : true))
      .slice(0, unitId ? 1 : 120)
      .map((u) => ({
        id: u.id,
        name: u.name,
        plate: u.plate,
      }));

    const rows = await fetchTripsForUnits(
      (id, f, t) => WialonLiveService.getUnitTrips(creds, id, f, t),
      units,
      from,
      to,
      8
    );

    return {
      rows,
      fetchedAt: new Date().toISOString(),
      count: rows.length,
      interval: { from: fromMs, to: toMs },
    };
  }

  static async unitSensors(tenantId: string, unitId: number) {
    const creds = await loadTenantWialonCreds(tenantId);
    const detail = await WialonLiveService.getUnitDetail(creds, unitId);

    const sensorRows = (detail.sensors || []).map((s) => ({
      unitId,
      unitName: detail.name,
      name: s.name,
      value: s.value,
      unit: s.unit || '',
      category: 'Sensor',
    }));
    const paramRows = (detail.prms || []).slice(0, 100).map((p) => ({
      unitId,
      unitName: detail.name,
      name: p.key,
      value: p.value,
      unit: '',
      category: 'Parameter',
    }));
    const fieldRows = (detail.flds || []).map((f) => ({
      unitId,
      unitName: detail.name,
      name: f.name,
      value: f.value,
      unit: '',
      category: 'Field',
    }));

    return {
      rows: [...sensorRows, ...paramRows, ...fieldRows],
      fetchedAt: new Date().toISOString(),
      count: sensorRows.length + paramRows.length + fieldRows.length,
    };
  }

  /** Account-scoped Wialon report templates for Reports workspace (grouped by module). */
  static async getTemplateCatalog(tenantId: string) {
    const creds = await loadTenantWialonCreds(tenantId);
    const scope = scopeFromCredentials(tenantId, creds);

    return withWialonClient(creds, async (client) => {
      const templates = await WialonReportResolverService.listAllTemplates(client, scope);
      const groups = await WialonReportResolverService.listUnitGroups(client, scope, { limit: 80 });

      const byModule = new Map<WialonReportModule, ResolvedReportTemplate[]>();
      for (const t of templates) {
        const list = byModule.get(t.module) ?? [];
        list.push(t);
        byModule.set(t.module, list);
      }

      const modules = [...byModule.entries()].map(([module, items]) => ({
        module,
        count: items.length,
        templates: items,
      }));

      return {
        templates,
        modules,
        groups,
        count: templates.length,
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  /** Resolver-assisted exec_report — picks template by module or uses explicit ids. */
  static async runTemplateReport(
    tenantId: string,
    input: {
      module?: WialonReportModule;
      resourceId?: number;
      templateId?: number;
      objectId: number;
      objectKind?: 'unit' | 'group';
      from: number;
      to: number;
      maxRowsPerTable?: number;
    }
  ) {
    const creds = await loadTenantWialonCreds(tenantId);
    const scope = scopeFromCredentials(tenantId, creds);
    const objectKind = input.objectKind ?? 'unit';

    let resourceId = input.resourceId;
    let templateId = input.templateId;

    if (resourceId == null || templateId == null) {
      if (!input.module) {
        throw new Error('module or resourceId+templateId required');
      }
      const resolved = await withWialonClient(creds, async (client) =>
        WialonReportResolverService.findModuleTemplates(client, scope, input.module!, {
          includeFallback: true,
        })
      );
      const picked = WialonReportResolverService.pickTemplate(resolved, {
        isGroupReport: objectKind === 'group',
        preferNonFallback: true,
      });
      if (!picked) {
        throw new Error(`No Wialon report template found for module "${input.module}"`);
      }
      resourceId = picked.resourceId;
      templateId = picked.templateId;
    }

    const result = await WialonLiveService.executeReport(creds, {
      reportResourceId: resourceId,
      reportTemplateId: templateId,
      reportObjectId: input.objectId,
      reportObjectSecId: 0,
      from: input.from,
      to: input.to,
      maxRowsPerTable: input.maxRowsPerTable,
    });

    return {
      ...result,
      template: { resourceId, templateId, module: input.module ?? null, objectKind },
    };
  }
}
