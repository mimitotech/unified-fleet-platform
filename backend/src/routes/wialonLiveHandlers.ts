import type { Request, Response } from 'express';
import { success, error } from '../utils/response.js';
import { WialonLiveService } from '../services/WialonLiveService.js';
import type { WialonCredentialsInput } from '../services/WialonHierarchyService.js';
import { query } from '../config/database.js';

type CredsLoader = (req: Request) => Promise<WialonCredentialsInput>;

function parseUnitId(req: Request): number | null {
  const id = parseInt(String(req.params.unitId), 10);
  return Number.isNaN(id) ? null : id;
}

function parseRouteId(req: Request): number | null {
  const id = parseInt(String(req.params.routeId), 10);
  return Number.isNaN(id) ? null : id;
}

function parseInterval(req: Request): { from: Date; to: Date } {
  const fromMs = req.query.from ? parseInt(String(req.query.from), 10) : Date.now() - 24 * 3600_000;
  const toMs = req.query.to ? parseInt(String(req.query.to), 10) : Date.now();
  return { from: new Date(fromMs), to: new Date(toMs) };
}

async function resolveAssetUnitId(tenantId: string, assetId: string): Promise<number> {
  const { rows } = await query<{ external_id: string }>(
    `SELECT am.external_id FROM asset_mappings am
     JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND a.id = $2 AND am.source_type = 'wialon'
     LIMIT 1`,
    [tenantId, assetId]
  );
  if (!rows[0]) throw new Error('Asset is not linked to Wialon');
  const unitId = parseInt(rows[0].external_id, 10);
  if (Number.isNaN(unitId)) throw new Error('Invalid Wialon unit mapping');
  return unitId;
}

export function createWialonLiveHandlers(loadCreds: CredsLoader) {
  return {
    units: async (req: Request, res: Response) => {
      try {
        const creds = await loadCreds(req);
        const units = await WialonLiveService.listUnits(creds);
        return success(res, { units, count: units.length });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    geofences: async (req: Request, res: Response) => {
      try {
        const creds = await loadCreds(req);
        const geofences = await WialonLiveService.listGeofences(creds);
        return success(res, { geofences, count: geofences.length });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    unitSensors: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      try {
        const creds = await loadCreds(req);
        const sensors = await WialonLiveService.getUnitSensors(creds, unitId);
        return success(res, { unitId, sensors });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    unitDetail: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      try {
        const creds = await loadCreds(req);
        const detail = await WialonLiveService.getUnitDetail(creds, unitId);
        return success(res, { unitId, detail });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    videoUnits: async (req: Request, res: Response) => {
      try {
        const creds = await loadCreds(req);
        const data = await WialonLiveService.getVideoUnits(creds);
        return success(res, data);
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    geocode: async (req: Request, res: Response) => {
      const lat = parseFloat(String(req.query.lat));
      const lng = parseFloat(String(req.query.lng));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return error(res, 'lat and lng query params required');
      }
      try {
        const creds = await loadCreds(req);
        const result = await WialonLiveService.reverseGeocode(creds, lat, lng);
        return success(res, { geocode: result ?? { address: '', parts: [] } });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    unitTrips: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      const { from, to } = parseInterval(req);
      try {
        const creds = await loadCreds(req);
        const trips = await WialonLiveService.getUnitTrips(creds, unitId, from, to);
        return success(res, { unitId, trips, count: trips.length, from: from.toISOString(), to: to.toISOString() });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    unitTrack: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      const { from, to } = parseInterval(req);
      try {
        const creds = await loadCreds(req);
        const points = await WialonLiveService.getUnitTrack(creds, unitId, from, to);
        return success(res, { unitId, points, count: points.length });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    unitCommands: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      try {
        const creds = await loadCreds(req);
        const commands = await WialonLiveService.getUnitCommands(creds, unitId);
        return success(res, { unitId, commands });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    sendUnitCommand: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      const commandName = String(req.body?.commandName || req.body?.command || '');
      if (!commandName) return error(res, 'commandName is required');
      const param = (req.body?.param || req.body?.params || {}) as Record<string, unknown>;
      try {
        const creds = await loadCreds(req);
        const result = await WialonLiveService.sendUnitCommand(creds, unitId, commandName, param);
        return success(res, { unitId, commandName, result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    assetCommand: async (req: Request & { tenantId?: string }, res: Response) => {
      const tenantId = req.tenantId;
      if (!tenantId) return error(res, 'Tenant required', 403);
      const commandName = String(req.body?.commandName || req.body?.command || '');
      if (!commandName) return error(res, 'commandName is required');
      try {
        const unitId = await resolveAssetUnitId(tenantId, String(req.params.assetId));
        const creds = await loadCreds(req);
        const param = (req.body?.param || req.body?.params || {}) as Record<string, unknown>;
        const result = await WialonLiveService.sendUnitCommand(creds, unitId, commandName, param);
        return success(res, { assetId: req.params.assetId, unitId, commandName, result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    unitIcon: async (req: Request, res: Response) => {
      const unitId = parseUnitId(req);
      if (!unitId) return error(res, 'Invalid unit id');
      const size = Math.min(64, Math.max(16, parseInt(String(req.query.size || '32'), 10) || 32));
      const ugi = Math.max(1, parseInt(String(req.query.v || '1'), 10) || 1);
      try {
        const creds = await loadCreds(req);
        const buf = await WialonLiveService.fetchUnitIcon(creds, unitId, size, ugi);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(Buffer.from(buf));
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    routeRounds: async (req: Request, res: Response) => {
      const routeId = parseRouteId(req);
      if (!routeId) return error(res, 'Invalid route id');
      try {
        const creds = await loadCreds(req);
        const rounds = await WialonLiveService.listRouteRounds(creds, routeId);
        return success(res, { routeId, rounds, count: rounds.length });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    createGeofence: async (req: Request, res: Response) => {
      const { name, type, center, radius, points, resourceId, color } = req.body as Record<string, unknown>;
      if (!name || !type) return error(res, 'name and type required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonLiveService.createGeofenceZone(creds, {
          resourceId: resourceId ? parseInt(String(resourceId), 10) : undefined,
          name: String(name),
          type: type === 'polygon' ? 'polygon' : 'circle',
          center: center as { lat: number; lng: number } | undefined,
          radius: radius != null ? Number(radius) : undefined,
          points: points as Array<{ lat: number; lng: number }> | undefined,
          color: color != null ? Number(color) : undefined,
        });
        return success(res, { result }, 201);
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    execReport: async (req: Request, res: Response) => {
      const {
        reportResourceId,
        reportTemplateId,
        reportObjectId,
        reportObjectSecId,
        from,
        to,
      } = req.body as Record<string, unknown>;
      const resourceId = parseInt(String(reportResourceId), 10);
      const templateId = parseInt(String(reportTemplateId), 10);
      const objectId = parseInt(String(reportObjectId), 10);
      const fromTs = parseInt(String(from), 10);
      const toTs = parseInt(String(to), 10);
      if ([resourceId, templateId, objectId, fromTs, toTs].some((n) => Number.isNaN(n))) {
        return error(res, 'reportResourceId, reportTemplateId, reportObjectId, from, to required');
      }
      try {
        const creds = await loadCreds(req);
        const maxRowsPerTable = req.body.maxRowsPerTable
          ? parseInt(String(req.body.maxRowsPerTable), 10)
          : undefined;
        const data = await WialonLiveService.executeReport(creds, {
          reportResourceId: resourceId,
          reportTemplateId: templateId,
          reportObjectId: objectId,
          reportObjectSecId: reportObjectSecId ? parseInt(String(reportObjectSecId), 10) : 0,
          from: fromTs,
          to: toTs,
          maxRowsPerTable: Number.isFinite(maxRowsPerTable) ? maxRowsPerTable : undefined,
        });
        return success(res, data);
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },
  };
}
