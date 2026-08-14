import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();
const mod = requireModule('routes');

type Checkpoint = {
  id?: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  notes?: string | null;
};

function durationMinutesFromCheckpoints(checkpoints: Checkpoint[]): number {
  const times: number[] = [];
  for (const cp of checkpoints) {
    for (const key of ['arrivalTime', 'departureTime'] as const) {
      const raw = cp[key];
      if (!raw) continue;
      const t = new Date(raw).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
  }
  if (times.length < 2) return 0;
  times.sort((a, b) => a - b);
  return Math.max(0, Math.round((times[times.length - 1] - times[0]) / 60000));
}

router.get('/', requireTenant, mod, async (req: TenantRequest, res) => {
  const status = req.query.status as string | undefined;
  let sql = `SELECT * FROM fleet_routes WHERE tenant_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [req.tenantId];
  if (status) {
    sql += ` AND status = $2`;
    params.push(status);
  }
  sql += ` ORDER BY start_time DESC`;
  const { rows } = await query(sql, params);
  const mapped = toCamelRows(rows).map((row) => {
    const r = row as { waypoints?: unknown };
    if (typeof r.waypoints === 'string') {
      try {
        r.waypoints = JSON.parse(r.waypoints);
      } catch {
        r.waypoints = [];
      }
    }
    return r;
  });
  return success(res, mapped);
});

router.get('/stats', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE status = 'scheduled')::int as scheduled,
       COUNT(*) FILTER (WHERE status = 'in-progress')::int as in_progress,
       COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
       COALESCE(SUM(distance), 0)::float as total_distance
     FROM fleet_routes WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows)[0]);
});

router.get('/trips', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  const params: unknown[] = [req.tenantId];
  let sql = `SELECT * FROM trip_summaries WHERE tenant_id = $1`;

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    params.push(`${from} 00:00:00`);
    sql += ` AND departure_time >= $${params.length}`;
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    params.push(`${to} 23:59:59`);
    sql += ` AND departure_time <= $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY departure_time DESC LIMIT $${params.length}`;

  const { rows } = await query(sql, params);
  return success(res, toCamelRows(rows));
});

/** Create a planned route from a historical trip summary (playback / trip history). */
router.post('/from-trip/:tripId', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rows: trips } = await query(
    `SELECT * FROM trip_summaries WHERE id = $1 AND tenant_id = $2`,
    [req.params.tripId, req.tenantId]
  );
  const trip = trips[0] as Record<string, unknown> | undefined;
  if (!trip) return error(res, 'Trip not found', 404);

  const depTime = trip.departure_time ? new Date(String(trip.departure_time)) : new Date();
  const arrTime = trip.arrival_time ? new Date(String(trip.arrival_time)) : null;
  const durationMin =
    arrTime && !Number.isNaN(arrTime.getTime())
      ? Math.max(0, Math.round((arrTime.getTime() - depTime.getTime()) / 60000))
      : Number(trip.duration) || 0;

  const checkpoints: Checkpoint[] = [
    {
      id: 'start',
      name: String(trip.departure_address || 'Departure'),
      lat: Number(trip.departure_lat) || null,
      lng: Number(trip.departure_lng) || null,
      address: trip.departure_address ? String(trip.departure_address) : null,
      departureTime: depTime.toISOString(),
      arrivalTime: null,
    },
    {
      id: 'end',
      name: String(trip.arrival_address || 'Arrival'),
      lat: Number(trip.arrival_lat) || null,
      lng: Number(trip.arrival_lng) || null,
      address: trip.arrival_address ? String(trip.arrival_address) : null,
      arrivalTime: arrTime ? arrTime.toISOString() : null,
      departureTime: null,
    },
  ];

  const name =
    String(req.body?.name || '').trim() ||
    `Route from ${String(trip.unit_name || 'trip')} (${depTime.toISOString().slice(0, 10)})`;

  const { rows } = await query(
    `INSERT INTO fleet_routes (tenant_id, name, status, asset_id, asset_name, asset_plate, driver_id, driver_name,
       start_time, end_time, distance, waypoints, eta, color, estimated_duration, notes)
     VALUES ($1,$2,'scheduled',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'blue',$13,$14) RETURNING *`,
    [
      req.tenantId,
      name,
      trip.asset_id || null,
      trip.unit_name || null,
      null,
      req.body?.driverId || null,
      req.body?.driverName || null,
      depTime,
      arrTime,
      Number(trip.mileage) || 0,
      JSON.stringify(checkpoints),
      arrTime,
      durationMin,
      `Created from trip history ${trip.trip_id || trip.id}`,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.post('/', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    name, status, assetId, assetName, assetPlate, driverId, driverName,
    startTime, endTime, distance, waypoints, eta, color, estimatedDuration, notes,
  } = req.body;
  if (!name) return error(res, 'name required');
  const checkpoints = Array.isArray(waypoints) ? (waypoints as Checkpoint[]) : [];
  const autoDuration = durationMinutesFromCheckpoints(checkpoints);
  const { rows } = await query(
    `INSERT INTO fleet_routes (tenant_id, name, status, asset_id, asset_name, asset_plate, driver_id, driver_name,
       start_time, end_time, distance, waypoints, eta, color, estimated_duration, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      req.tenantId, name, status || 'scheduled', assetId, assetName, assetPlate,
      driverId, driverName, startTime || new Date(), endTime || null, distance || 0,
      JSON.stringify(checkpoints), eta || endTime || null, color || 'blue',
      estimatedDuration || autoDuration || 0, notes,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.patch('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    name, status, endTime, actualStartTime, actualDuration, fuelUsage, notes,
    waypoints, estimatedDuration, distance, driverId, driverName, assetId, assetName, assetPlate,
    startTime, eta,
  } = req.body;

  let computedDuration = estimatedDuration;
  if (Array.isArray(waypoints) && (estimatedDuration == null || estimatedDuration === '')) {
    computedDuration = durationMinutesFromCheckpoints(waypoints as Checkpoint[]);
  }

  const { rows } = await query(
    `UPDATE fleet_routes SET
       name = COALESCE($3, name),
       status = COALESCE($4, status),
       end_time = COALESCE($5, end_time),
       actual_start_time = COALESCE($6, actual_start_time),
       actual_duration = COALESCE($7, actual_duration),
       fuel_usage = COALESCE($8, fuel_usage),
       notes = COALESCE($9, notes),
       waypoints = COALESCE($10, waypoints),
       estimated_duration = COALESCE($11, estimated_duration),
       distance = COALESCE($12, distance),
       driver_id = COALESCE($13, driver_id),
       driver_name = COALESCE($14, driver_name),
       asset_id = COALESCE($15, asset_id),
       asset_name = COALESCE($16, asset_name),
       asset_plate = COALESCE($17, asset_plate),
       start_time = COALESCE($18, start_time),
       eta = COALESCE($19, eta),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      req.params.id,
      req.tenantId,
      name ?? null,
      status ?? null,
      endTime ?? null,
      actualStartTime ?? null,
      actualDuration ?? null,
      fuelUsage ?? null,
      notes ?? null,
      waypoints != null ? JSON.stringify(waypoints) : null,
      computedDuration ?? null,
      distance ?? null,
      driverId ?? null,
      driverName ?? null,
      assetId ?? null,
      assetName ?? null,
      assetPlate ?? null,
      startTime ?? null,
      eta ?? null,
    ]
  );
  if (!rows[0]) return error(res, 'Route not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await query(`UPDATE fleet_routes SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
    req.params.id, req.tenantId,
  ]);
  return success(res, { deleted: true });
});

export default router;
