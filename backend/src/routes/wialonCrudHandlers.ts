import type { Request, Response } from 'express';
import { success, error } from '../utils/response.js';
import { WialonCrudService } from '../services/WialonCrudService.js';
import type { WialonCredentialsInput } from '../services/WialonHierarchyService.js';

type CredsLoader = (req: Request) => Promise<WialonCredentialsInput>;

function parseId(param: string | string[] | undefined): number | null {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = parseInt(String(raw), 10);
  return Number.isNaN(id) ? null : id;
}

export function createWialonCrudHandlers(loadCreds: CredsLoader) {
  return {
    createUnit: async (req: Request, res: Response) => {
      const { creatorId, name, hwTypeId } = req.body as Record<string, unknown>;
      if (!creatorId || !name || !hwTypeId) return error(res, 'creatorId, name, hwTypeId required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.createUnit(creds, {
          creatorId: Number(creatorId),
          name: String(name),
          hwTypeId: Number(hwTypeId),
        });
        return success(res, result, 201);
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    patchUnit: async (req: Request, res: Response) => {
      const unitId = parseId(req.params.unitId);
      if (!unitId) return error(res, 'Invalid unit id');
      try {
        const creds = await loadCreds(req);
        const body = req.body as Record<string, unknown>;
        const results: Record<string, unknown> = {};
        if (body.name) results.name = await WialonCrudService.renameUnit(creds, unitId, String(body.name));
        if (body.phone) results.phone = await WialonCrudService.updateUnitPhone(creds, unitId, String(body.phone));
        if (body.deviceTypeId && body.uniqueId) {
          results.device = await WialonCrudService.updateDeviceType(
            creds,
            unitId,
            Number(body.deviceTypeId),
            String(body.uniqueId)
          );
        }
        return success(res, { unitId, ...results });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    upsertSensor: async (req: Request, res: Response) => {
      const unitId = parseId(req.params.unitId);
      if (!unitId) return error(res, 'Invalid unit id');
      const { callMode, name, type, param, unit, description, table, id } = req.body as Record<string, unknown>;
      if (!callMode || !name || !type || !param) return error(res, 'callMode, name, type, param required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.upsertSensor(creds, {
          itemId: unitId,
          id: id != null ? Number(id) : undefined,
          callMode: callMode as 'create' | 'update' | 'delete',
          name: String(name),
          type: String(type),
          param: String(param),
          unit: unit != null ? String(unit) : undefined,
          description: description != null ? String(description) : undefined,
          table: table as Array<{ x: number; a: number; b: number }> | undefined,
        });
        return success(res, { unitId, result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    patchGeofence: async (req: Request, res: Response) => {
      const { callMode, name, type, points, center, radius, resourceId, id, color, description } =
        req.body as Record<string, unknown>;
      if (!callMode || !name) return error(res, 'callMode and name required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.updateGeofence(creds, {
          resourceId: resourceId != null ? Number(resourceId) : undefined,
          id: id != null ? Number(id) : undefined,
          callMode: callMode as 'create' | 'update' | 'delete',
          name: String(name),
          type: type as 'line' | 'polygon' | 'circle' | undefined,
          points: points as Array<{ lat: number; lng: number }> | undefined,
          center: center as { lat: number; lng: number } | undefined,
          radius: radius != null ? Number(radius) : undefined,
          color: color != null ? Number(color) : undefined,
          description: description != null ? String(description) : undefined,
        });
        return success(res, { result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    upsertDriver: async (req: Request, res: Response) => {
      const { callMode, name, code, phone, description, resourceId, id } = req.body as Record<string, unknown>;
      if (!callMode || !name) return error(res, 'callMode and name required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.upsertDriver(creds, {
          resourceId: resourceId != null ? Number(resourceId) : undefined,
          id: id != null ? Number(id) : undefined,
          callMode: callMode as 'create' | 'update' | 'delete',
          name: String(name),
          code: code != null ? String(code) : undefined,
          phone: phone != null ? String(phone) : undefined,
          description: description != null ? String(description) : undefined,
        });
        return success(res, { result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    bindDriver: async (req: Request, res: Response) => {
      const { unitId, driverId, assign, resourceId, time } = req.body as Record<string, unknown>;
      if (!unitId || !driverId) return error(res, 'unitId and driverId required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.bindDriver(creds, {
          resourceId: resourceId != null ? Number(resourceId) : undefined,
          unitId: Number(unitId),
          driverId: Number(driverId),
          assign: assign !== false,
          time: time != null ? Number(time) : undefined,
        });
        return success(res, { result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    upsertNotification: async (req: Request, res: Response) => {
      const { callMode, name, text, unitIds, trigger, actions, resourceId, id } = req.body as Record<string, unknown>;
      if (!callMode || !name || !trigger) return error(res, 'callMode, name, trigger required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.upsertNotification(creds, {
          resourceId: resourceId != null ? Number(resourceId) : undefined,
          id: id != null ? Number(id) : undefined,
          callMode: callMode as 'create' | 'update' | 'delete',
          name: String(name),
          text: text != null ? String(text) : undefined,
          unitIds: unitIds as number[] | undefined,
          trigger: trigger as Record<string, unknown>,
          actions: actions as Array<Record<string, unknown>> | undefined,
        });
        return success(res, { result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    createRoute: async (req: Request, res: Response) => {
      const { creatorId, name } = req.body as Record<string, unknown>;
      if (!creatorId || !name) return error(res, 'creatorId and name required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.createRoute(creds, Number(creatorId), String(name));
        return success(res, result, 201);
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    updateRouteCheckpoints: async (req: Request, res: Response) => {
      const routeId = parseId(req.params.routeId);
      if (!routeId) return error(res, 'Invalid route id');
      const { checkpoints } = req.body as { checkpoints?: Array<{ name: string; lat: number; lng: number; radius?: number }> };
      if (!checkpoints?.length) return error(res, 'checkpoints required');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.updateRouteCheckpoints(creds, routeId, checkpoints);
        return success(res, { routeId, result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    loadMessages: async (req: Request, res: Response) => {
      const unitId = parseId(req.params.unitId);
      if (!unitId) return error(res, 'Invalid unit id');
      const from = parseInt(String(req.query.from || Date.now() - 86400000), 10);
      const to = parseInt(String(req.query.to || Date.now()), 10);
      const count = parseInt(String(req.query.count || '500'), 10);
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.loadMessages(
          creds,
          unitId,
          Math.floor(from / 1000),
          Math.floor(to / 1000),
          count
        );
        return success(res, { unitId, result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },

    createTrackLayer: async (req: Request, res: Response) => {
      const unitId = parseId(req.params.unitId);
      if (!unitId) return error(res, 'Invalid unit id');
      const { from, to, layerName, trackColor, trackWidth, arrows } = req.body as Record<string, unknown>;
      if (!from || !to) return error(res, 'from and to required (unix ms)');
      try {
        const creds = await loadCreds(req);
        const result = await WialonCrudService.createTrackLayer(creds, {
          unitId,
          from: Math.floor(Number(from) / 1000),
          to: Math.floor(Number(to) / 1000),
          layerName: layerName != null ? String(layerName) : undefined,
          trackColor: trackColor != null ? String(trackColor) : undefined,
          trackWidth: trackWidth != null ? Number(trackWidth) : undefined,
          arrows: arrows != null ? Number(arrows) : undefined,
        });
        return success(res, { unitId, result });
      } catch (e) {
        return error(res, (e as Error).message);
      }
    },
  };
}
