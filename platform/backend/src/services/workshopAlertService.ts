import type { FleetAlert } from '@ufp/shared';
import { query } from '../config/database.js';
import { AlertOrchestrator } from '../orchestrators/AlertOrchestrator.js';

export const WORKSHOP_ALERT = {
  breakdown: {
    type: 'workshop_breakdown',
    name: 'Breakdown',
  },
  maintenance: {
    type: 'workshop_maintenance',
    name: 'Maintenance',
  },
  inspection: {
    type: 'workshop_inspection',
    name: 'Inspection needs attention',
  },
  serviceDue: {
    type: 'workshop_service_due',
    name: 'Service due',
  },
} as const;

/** Always-available workshop alert names for Alert types + user ACL. */
export const WORKSHOP_BUILTIN_ALERT_TYPES: Array<{ name: string; type: string }> = [
  WORKSHOP_ALERT.breakdown,
  WORKSHOP_ALERT.maintenance,
  WORKSHOP_ALERT.inspection,
  WORKSHOP_ALERT.serviceDue,
];

function severityFromBreakdown(severity?: string | null): FleetAlert['severity'] {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'major') return 'warning';
  return 'info';
}

function severityFromMaintenancePriority(priority?: string | null): FleetAlert['severity'] {
  const p = String(priority || '').toLowerCase();
  if (p === 'critical' || p === 'high') return 'warning';
  return 'info';
}

async function alertExists(tenantId: string, externalId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM alerts WHERE tenant_id = $1 AND external_id = $2 LIMIT 1`,
    [tenantId, externalId],
  );
  return Boolean(rows[0]);
}

async function acknowledgeByExternalId(tenantId: string, externalId: string): Promise<void> {
  await query(
    `UPDATE alerts SET acknowledged = true
     WHERE tenant_id = $1 AND external_id = $2 AND acknowledged = false`,
    [tenantId, externalId],
  );
}

async function emit(
  tenantId: string,
  input: {
    externalId: string;
    type: string;
    name: string;
    severity: FleetAlert['severity'];
    assetId?: string | null;
    assetLabel: string;
    description?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    occurredAt?: Date | string | null;
  },
): Promise<void> {
  if (await alertExists(tenantId, input.externalId)) return;
  const orch = new AlertOrchestrator(tenantId);
  const label = String(input.assetLabel || 'Asset').trim() || 'Asset';
  try {
    await orch.insertAlert({
      tenantId,
      type: input.type,
      severity: input.severity,
      title: `${input.name} · ${label}`,
      description: input.description || undefined,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      timestamp: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      // DB enum only allows telematics sources — workshop events still use this slot.
      sourceType: 'wialon',
      externalId: input.externalId,
      assetId: input.assetId || undefined,
      acknowledged: false,
    });
  } catch (err) {
    // Concurrent tenants/users may race the exists-check; ignore duplicate inserts.
    const msg = (err as Error)?.message || '';
    if (!/duplicate|unique|constraint/i.test(msg)) throw err;
  }
}

function parseLocation(location: unknown): { lat?: number; lng?: number } {
  if (!location) return {};
  let value = location;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const loc = value as Record<string, unknown>;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  return {
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
  };
}

export async function emitBreakdownAlert(input: {
  tenantId: string;
  breakdownId: string;
  assetId?: string | null;
  vehicleName: string;
  severity?: string | null;
  description?: string | null;
  location?: unknown;
  breakdownTime?: Date | string | null;
  resolved?: boolean;
}): Promise<void> {
  const externalId = `workshop-breakdown:${input.breakdownId}`;
  if (input.resolved) {
    await acknowledgeByExternalId(input.tenantId, externalId);
    return;
  }
  const loc = parseLocation(input.location);
  await emit(input.tenantId, {
    externalId,
    type: WORKSHOP_ALERT.breakdown.type,
    name: WORKSHOP_ALERT.breakdown.name,
    severity: severityFromBreakdown(input.severity),
    assetId: input.assetId,
    assetLabel: input.vehicleName,
    description: input.description,
    latitude: loc.lat,
    longitude: loc.lng,
    occurredAt: input.breakdownTime,
  });
}

export async function emitMaintenanceAlert(input: {
  tenantId: string;
  maintenanceId: string;
  assetId?: string | null;
  vehicleName: string;
  priority?: string | null;
  description?: string | null;
  status?: string | null;
  maintenanceType?: string | null;
  startDate?: Date | string | null;
}): Promise<void> {
  const externalId = `workshop-maintenance:${input.maintenanceId}`;
  const status = String(input.status || 'pending').toLowerCase();
  if (status === 'completed' || status === 'cancelled') {
    await acknowledgeByExternalId(input.tenantId, externalId);
    return;
  }
  await emit(input.tenantId, {
    externalId,
    type: WORKSHOP_ALERT.maintenance.type,
    name: WORKSHOP_ALERT.maintenance.name,
    severity: severityFromMaintenancePriority(input.priority),
    assetId: input.assetId,
    assetLabel: input.vehicleName,
    description:
      [input.maintenanceType, input.description].filter(Boolean).join(' — ') || input.description,
    occurredAt: input.startDate,
  });
}

export async function emitInspectionAlert(input: {
  tenantId: string;
  inspectionId: string;
  assetId?: string | null;
  vehicleName: string;
  overallStatus?: string | null;
  notes?: string | null;
  inspectionType?: string | null;
  inspectionDate?: Date | string | null;
}): Promise<void> {
  const externalId = `workshop-inspection:${input.inspectionId}`;
  const status = String(input.overallStatus || 'pass')
    .toLowerCase()
    .replace(/_/g, '-');
  const passed = status === 'pass' || status === 'passed' || status === 'ok';
  if (passed) {
    await acknowledgeByExternalId(input.tenantId, externalId);
    return;
  }
  const needsAttention =
    status === 'needs-attention' || status.includes('fail') || status === 'attention';
  if (!needsAttention) return;
  await emit(input.tenantId, {
    externalId,
    type: WORKSHOP_ALERT.inspection.type,
    name: WORKSHOP_ALERT.inspection.name,
    severity: status.includes('fail') ? 'warning' : 'info',
    assetId: input.assetId,
    assetLabel: input.vehicleName,
    description:
      [input.inspectionType, input.notes].filter(Boolean).join(' — ') ||
      'Checklist requires attention',
    occurredAt: input.inspectionDate,
  });
}

export async function emitServiceDueAlert(input: {
  tenantId: string;
  assetId?: string | null;
  vehicleName: string;
  reason: string;
  sourceId: string;
}): Promise<void> {
  const externalId = `workshop-service-due:${input.sourceId}`;
  await emit(input.tenantId, {
    externalId,
    type: WORKSHOP_ALERT.serviceDue.type,
    name: WORKSHOP_ALERT.serviceDue.name,
    severity: 'critical',
    assetId: input.assetId,
    assetLabel: input.vehicleName,
    description: input.reason,
    occurredAt: new Date(),
  });
}

type DbRow = Record<string, unknown>;

function rowStr(row: DbRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return '';
}

/**
 * Backfill Inbox alerts from open workshop work so existing records show up
 * without waiting for the next create/edit.
 *
 * Throttled per tenant so KPI polling under many concurrent users cannot
 * stampede the DB with repeated full scans.
 */
const workshopSyncInFlight = new Map<string, Promise<void>>();
const workshopSyncLastAt = new Map<string, number>();
const WORKSHOP_SYNC_MIN_INTERVAL_MS = 60_000;

export async function syncOpenWorkshopAlerts(tenantId: string): Promise<void> {
  if (!tenantId) return;
  const now = Date.now();
  const last = workshopSyncLastAt.get(tenantId) || 0;
  if (now - last < WORKSHOP_SYNC_MIN_INTERVAL_MS) return;

  const existing = workshopSyncInFlight.get(tenantId);
  if (existing) return existing;

  const run = (async () => {
    workshopSyncLastAt.set(tenantId, Date.now());
    const [brk, maint, insp] = await Promise.all([
      query<DbRow>(
        `SELECT id, asset_id, vehicle_name, severity, description, location, breakdown_time
         FROM breakdown_reports
         WHERE tenant_id = $1 AND deleted_at IS NULL AND resolution_time IS NULL
         ORDER BY breakdown_time DESC LIMIT 100`,
        [tenantId],
      ),
      query<DbRow>(
        `SELECT id, asset_id, vehicle_name, priority, description, status, maintenance_type, start_date,
                next_service_km, next_service_hours, next_service_days, odometer_reading, engine_hours
         FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status IN ('pending', 'in-progress')
         ORDER BY start_date DESC LIMIT 100`,
        [tenantId],
      ),
      query<DbRow>(
        `SELECT id, asset_id, vehicle_name, overall_status, notes, inspection_type, inspection_date
         FROM vehicle_inspections
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND overall_status IN ('needs-attention', 'needs_attention', 'fail', 'failed')
         ORDER BY inspection_date DESC LIMIT 100`,
        [tenantId],
      ),
    ]);

    // Sequential emits keep insertAlert pressure bounded under multi-tenant load.
    for (const row of brk.rows) {
      await emitBreakdownAlert({
        tenantId,
        breakdownId: rowStr(row, 'id'),
        assetId: rowStr(row, 'asset_id') || null,
        vehicleName: rowStr(row, 'vehicle_name') || 'Asset',
        severity: rowStr(row, 'severity') || null,
        description: rowStr(row, 'description') || null,
        location: row.location,
        breakdownTime: (row.breakdown_time as Date | string) || null,
      });
    }

    for (const row of maint.rows) {
      await emitMaintenanceAlert({
        tenantId,
        maintenanceId: rowStr(row, 'id'),
        assetId: rowStr(row, 'asset_id') || null,
        vehicleName: rowStr(row, 'vehicle_name') || 'Asset',
        priority: rowStr(row, 'priority') || null,
        description: rowStr(row, 'description') || null,
        status: rowStr(row, 'status') || null,
        maintenanceType: rowStr(row, 'maintenance_type') || null,
        startDate: (row.start_date as Date | string) || null,
      });

      const days = Number(row.next_service_days);
      if (Number.isFinite(days) && days >= 0 && row.start_date) {
        const start = new Date(row.start_date as string | Date);
        if (!Number.isNaN(start.getTime())) {
          const due = new Date(start.getTime() + days * 86400000);
          if (due.getTime() <= Date.now()) {
            await emitServiceDueAlert({
              tenantId,
              assetId: rowStr(row, 'asset_id') || null,
              vehicleName: rowStr(row, 'vehicle_name') || 'Asset',
              reason: `Service interval reached (${days} day${days === 1 ? '' : 's'} from last job)`,
              sourceId: `maint-days:${rowStr(row, 'id')}`,
            });
          }
        }
      }
    }

    for (const row of insp.rows) {
      await emitInspectionAlert({
        tenantId,
        inspectionId: rowStr(row, 'id'),
        assetId: rowStr(row, 'asset_id') || null,
        vehicleName: rowStr(row, 'vehicle_name') || 'Asset',
        overallStatus: rowStr(row, 'overall_status') || null,
        notes: rowStr(row, 'notes') || null,
        inspectionType: rowStr(row, 'inspection_type') || null,
        inspectionDate: (row.inspection_date as Date | string) || null,
      });
    }
  })().finally(() => {
    workshopSyncInFlight.delete(tenantId);
  });

  workshopSyncInFlight.set(tenantId, run);
  return run;
}

/** Fire-and-forget wrapper so workshop writes never fail on alert errors. */
export function safeWorkshopAlert(promise: Promise<void>): void {
  void promise.catch((err) => {
    console.warn('[workshop-alerts]', (err as Error)?.message || err);
  });
}
