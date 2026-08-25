/**
 * Harvest ALL Wialon alerts for the tenant's own units:
 * - Task / registered notification messages (messages/get_task_messages)
 * - Triggered notification history (message flag 0x4000)
 * - Unit event messages (message flag 0x0600) — power, sensors, speed, etc.
 * - Optional eco/events report enrichment (throttled)
 *
 * Configured notification rules in Wialon appear here once they fire and are
 * registered as events / triggered-notification messages on the unit.
 */
import type { FleetAlert } from '@ufp/shared';
import type { WialonClient } from '../adapters/wialonClient.js';
import {
  classifyWialonAlertType,
  isNoiseAlert,
  mapUnitMessageToAlert,
  normalizeTaskMessages,
  severityForAlertType,
  type RawMsg,
} from './wialonAlertClassify.js';
import { WialonLiveService } from './WialonLiveService.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { logger } from '../config/logger.js';

const ecoReportCooldown = new Map<string, number>();
const unitMsgCursor = new Map<string, number>();
const ECO_COOLDOWN_MS = 15 * 60 * 1000;

export type EcoReportTemplate = {
  resourceId: number;
  templateId: number;
  templateName: string;
};

/** Find eco / safety report template on tenant Wialon resources (old MAMS listReportTemplates parity). */
export async function findEcoReportTemplate(
  credentials: WialonCredentialsInput,
): Promise<EcoReportTemplate | null> {
  try {
    const templates = await WialonLiveService.listReportTemplates(credentials, 400);
    for (const t of templates) {
      const name = t.name || '';
      if (!/eco\s*driv|violation|harsh|events?\s*report|safety/i.test(name)) continue;
      if (/\(group\)|\bgroup\b/i.test(name) && !/\(unit/i.test(name)) continue;
      return {
        resourceId: t.resourceId,
        templateId: t.id,
        templateName: name,
      };
    }
  } catch (err) {
    logger.debug('[AlertHarvest] findEcoReportTemplate failed', err);
  }
  return null;
}

/** Event messages (registered events from notifications / sensors). */
const FLAG_EVENT = 1536; // 0x0600
/** Messages stored when a notification is triggered. */
const FLAG_TRIGGERED_NOTIFICATION = 16384; // 0x4000
/** Mask for message type byte. */
const FLAG_TYPE_MASK = 65280; // 0xFF00

/** How many units to deep-scan for events/notifications per sync cycle. */
const UNIT_MSG_BATCH = 35;

type ReportColumn = { key: string; label: string };

function exactRowFields(
  row: Record<string, unknown>,
  columns: ReportColumn[],
): Array<{ label: string; value: string }> {
  return columns.flatMap((column) => {
    const value = row[column.key];
    if (value == null || String(value).trim() === '') return [];
    return [{ label: column.label, value: String(value) }];
  });
}

function fieldValue(
  fields: Array<{ label: string; value: string }>,
  patterns: RegExp[],
): string | undefined {
  for (const field of fields) {
    if (patterns.some((p) => p.test(field.label))) return field.value.trim();
  }
  return undefined;
}

function rowTimestamp(fields: Array<{ label: string; value: string }>, fallbackSec: number): Date {
  const timeField = fieldValue(fields, [/^beginning$/i, /^time$/i, /^start$/i, /date/i]);
  if (timeField) {
    const parsed = Date.parse(timeField.replace(' ', 'T'));
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return new Date(fallbackSec * 1000);
}

function normalizeUnitKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function addAlert(byExternal: Map<string, FleetAlert>, alert: FleetAlert) {
  if (!alert.timestamp || Number.isNaN(alert.timestamp.getTime())) return;
  if (isNoiseAlert(alert)) return;
  byExternal.set(alert.externalId || alert.id, alert);
}

async function safeUnload(client: WialonClient) {
  try {
    await client.request('messages/unload', {});
  } catch {
    /* loader may already be empty */
  }
}

async function loadUnitMessages(
  client: WialonClient,
  unitId: number,
  timeFrom: number,
  timeTo: number,
  flags: number,
  loadCount: number,
): Promise<RawMsg[]> {
  await safeUnload(client);
  try {
    const result = await client.request<unknown>('messages/load_interval', {
      itemId: unitId,
      timeFrom,
      timeTo,
      flags,
      flagsMask: FLAG_TYPE_MASK,
      loadCount,
    });
    return normalizeTaskMessages(result);
  } catch {
    return [];
  }
}

/** Pull notification / task messages for many units (batch API). */
export async function harvestTaskMessageAlerts(
  client: WialonClient,
  unitIds: number[],
  unitNameById: Map<number, string>,
  timeFrom: number,
  timeTo: number,
): Promise<FleetAlert[]> {
  const byExternal = new Map<string, FleetAlert>();
  const BATCH = 50;
  const unitSet = new Set(unitIds);

  for (let i = 0; i < unitIds.length; i += BATCH) {
    const batch = unitIds.slice(i, i + BATCH);
    let gotAny = false;
    try {
      const result = await client.request<unknown>('messages/get_task_messages', {
        itemIds: batch,
        timeFrom,
        timeTo,
        loadCount: 10000,
      });
      for (const m of normalizeTaskMessages(result)) {
        if (!m?.t) continue;
        if (m.item_id != null && !unitSet.has(m.item_id)) continue;
        gotAny = true;
        addAlert(byExternal, mapUnitMessageToAlert(m, unitNameById));
      }
    } catch (err) {
      logger.debug('[AlertHarvest] get_task_messages batch failed', err);
    }

    // Fallback: some accounts only answer singular itemId.
    if (!gotAny) {
      for (const unitId of batch) {
        try {
          const one = await client.request<unknown>('messages/get_task_messages', {
            itemId: unitId,
            timeFrom,
            timeTo,
            loadCount: 500,
          });
          for (const m of normalizeTaskMessages(one)) {
            if (!m?.t) continue;
            addAlert(
              byExternal,
              mapUnitMessageToAlert({ ...m, item_id: m.item_id ?? unitId }, unitNameById, unitId),
            );
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  return [...byExternal.values()];
}

/**
 * Deep-scan unit history for triggered notifications + registered events.
 * Rotates through the fleet so large tenants still get full coverage over time.
 */
export async function harvestUnitEventAndNotificationAlerts(
  client: WialonClient,
  scopeKey: string,
  unitIds: number[],
  unitNameById: Map<number, string>,
  timeFrom: number,
  timeTo: number,
): Promise<FleetAlert[]> {
  if (!unitIds.length) return [];

  const byExternal = new Map<string, FleetAlert>();
  const cursor = unitMsgCursor.get(scopeKey) ?? 0;
  const start = cursor % unitIds.length;
  const slice: number[] = [];
  for (let i = 0; i < Math.min(UNIT_MSG_BATCH, unitIds.length); i++) {
    slice.push(unitIds[(start + i) % unitIds.length]);
  }
  unitMsgCursor.set(scopeKey, start + slice.length);

  // Prefer a recent window for deep scans so we catch live events quickly.
  const recentFrom = Math.max(timeFrom, timeTo - 36 * 3600);

  for (const unitId of slice) {
    const [triggered, events] = await Promise.all([
      loadUnitMessages(client, unitId, recentFrom, timeTo, FLAG_TRIGGERED_NOTIFICATION, 400),
      loadUnitMessages(client, unitId, recentFrom, timeTo, FLAG_EVENT, 400),
    ]);

    for (const m of [...triggered, ...events]) {
      if (!m?.t) continue;
      addAlert(
        byExternal,
        mapUnitMessageToAlert({ ...m, item_id: m.item_id ?? unitId }, unitNameById, unitId),
      );
    }
  }

  await safeUnload(client);
  return [...byExternal.values()];
}

/**
 * Eco / safety alerts for THIS tenant only.
 * Never run a group report against an arbitrary Wialon group (that pulls other clients' cars).
 */
export async function harvestEcoReportAlerts(
  credentials: WialonCredentialsInput,
  client: WialonClient,
  scopeKey: string,
  timeFrom: number,
  timeTo: number,
  allowedUnitIds: number[],
  unitNameById: Map<number, string>,
  opts?: { skipCooldown?: boolean; maxUnits?: number },
): Promise<FleetAlert[]> {
  if (!allowedUnitIds.length) return [];

  const last = ecoReportCooldown.get(scopeKey) ?? 0;
  if (!opts?.skipCooldown && Date.now() - last < ECO_COOLDOWN_MS) return [];
  ecoReportCooldown.set(scopeKey, Date.now());

  const allowedNames = new Set(
    [...unitNameById.values()].map(normalizeUnitKey).filter(Boolean),
  );

  try {
    const tpl = await findEcoReportTemplate(credentials);
    if (!tpl) return [];

    const { resourceId, templateId, templateName } = tpl;
    const alerts: FleetAlert[] = [];
    const sampleCap = opts?.maxUnits ?? Math.min(40, allowedUnitIds.length);
    const ecoCursor = unitMsgCursor.get(`${scopeKey}:eco`) ?? 0;
    const sample: number[] = [];
    if (opts?.maxUnits && opts.maxUnits >= allowedUnitIds.length) {
      sample.push(...allowedUnitIds);
    } else {
      for (let i = 0; i < sampleCap; i++) {
        sample.push(allowedUnitIds[(ecoCursor + i) % allowedUnitIds.length]);
      }
      unitMsgCursor.set(`${scopeKey}:eco`, ecoCursor + sample.length);
    }

    for (const unitId of sample) {
      const unitName = unitNameById.get(unitId) || String(unitId);
      try {
        const report = await WialonLiveService.executeReport(credentials, {
          reportResourceId: resourceId,
          reportTemplateId: templateId,
          reportObjectId: unitId,
          from: timeFrom,
          to: timeTo,
          maxRowsPerTable: 200,
        });

        for (const table of report.tables) {
          for (const row of table.rows) {
            const fields = exactRowFields(row, table.columns);
            const rowUnit =
              fieldValue(fields, [/^unit$/i, /^grouping$/i, /^object$/i, /^name$/i]) || unitName;
            if (allowedNames.size && !allowedNames.has(normalizeUnitKey(rowUnit))) continue;

            const violation =
              fieldValue(fields, [
                /^violation$/i,
                /^criterion$/i,
                /^criteria$/i,
                /^event$/i,
                /^type$/i,
              ]) || '';
            const classificationText = `${templateName} ${table.label} ${violation} ${fields
              .map((f) => `${f.label}: ${f.value}`)
              .join(' ')}`;
            const type = classifyWialonAlertType(classificationText);
            if (
              type === 'fleet_event' &&
              !/brake|accel|speed|corner|idle|fuel|fill|theft|violation|eco|harsh|power|generat|sensor/i.test(
                classificationText,
              )
            ) {
              continue;
            }
            const resolvedType =
              type === 'fleet_event'
                ? classifyWialonAlertType(`${violation || classificationText} eco violation`)
                : type;

            const exactDetails = fields.map((f) => `${f.label}: ${f.value}`).join(' · ');
            const ts = rowTimestamp(fields, timeTo);
            const title = `${(violation || exactDetails.split(' · ')[0] || templateName).slice(0, 160)} · ${unitName}`;
            const externalId = `eco-unit:${unitId}:${templateId}:${table.index}:${ts.getTime()}:${resolvedType}:${title.slice(0, 60)}`;

            alerts.push({
              id: externalId,
              type: resolvedType,
              severity: severityForAlertType(resolvedType),
              title,
              description: exactDetails.slice(0, 1000),
              timestamp: ts,
              sourceType: 'wialon',
              externalId,
              assetId: String(unitId),
              acknowledged: false,
            });
          }
        }
      } catch {
        /* unit may have no eco data for the interval */
      }
    }

    return alerts;
  } catch {
    return [];
  }
}
