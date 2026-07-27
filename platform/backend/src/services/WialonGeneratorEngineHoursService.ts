import { createHash } from 'crypto';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import type { WialonClient } from '../adapters/wialonClient.js';
import { fetchLeafRows } from './wialonFuelReport/leafRows.js';
import { getCellNumber, getCellTimestamp, getCellValue } from './wialonFuelReport/cells.js';
import type { WialonCell } from './wialonFuelReport/types.js';
import { execWialonReportTables } from './wialonReportExec.js';
import { listAllUnits } from './wialonFuelReport/templates.js';
import {
  scopeFromCredentials,
  WialonReportResolverService,
} from './WialonReportResolverService.js';

export type GeneratorEngineHoursRow = {
  id: string;
  unitId: number;
  unitName: string;
  grouping: string;
  beginning: number;
  end: number;
  initialEngineHours: number;
  engineHours: number;
  finalEngineHours: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { rows: GeneratorEngineHoursRow[]; expires: number }>();

const ENGINE_HOURS_PATTERNS = [
  ['unit', ['unit', 'object', 'name']],
  ['beginning', ['beginning', 'begin', 'start time', 'start']],
  ['endTime', ['end time', 'finish', 'end']],
  ['initialEngineHours', ['initial engine', 'engine hours initial', 'initial']],
  ['engineHours', ['engine hours']],
  ['finalEngineHours', ['final engine', 'engine hours final', 'final']],
] as const;

function cacheKey(tenantId: string, fromTs: number, toTs: number) {
  return `${tenantId}:${fromTs}:${toTs}`;
}

function parseDateRange(fromParam?: string, toParam?: string, days = 30) {
  const toDate = toParam ? new Date(toParam) : new Date();
  const fromDate = fromParam ? new Date(fromParam) : new Date(toDate.getTime() - days * 86400000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date range');
  }
  if (toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) toDate.setUTCHours(23, 59, 59, 999);
  return { fromTs: Math.floor(fromDate.getTime() / 1000), toTs: Math.floor(toDate.getTime() / 1000) };
}

function headerMatches(header: string, patterns: readonly string[]): boolean {
  const h = header.toLowerCase().trim();
  return patterns.some((p) => h.includes(p));
}

function isEngineHoursTable(headers: string[]): boolean {
  const norm = headers.map((h) => h.toLowerCase().trim());
  const hasUnit = norm.some((h) => h.includes('unit') || h.includes('object'));
  const hasBegin = norm.some((h) => h.includes('begin') || h.includes('start'));
  const hasEnd = norm.some((h) => h.includes('end') || h.includes('finish'));
  const hasEh = norm.some((h) => h.includes('engine'));
  return hasUnit && hasBegin && hasEnd && hasEh;
}

function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  for (const [field, patterns] of ENGINE_HOURS_PATTERNS) {
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      if (headerMatches(headers[i], patterns)) {
        map[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return map;
}

async function execReportTables(
  client: WialonClient,
  resourceId: number,
  templateId: number,
  groupId: number,
  fromTs: number,
  toTs: number
) {
  return execWialonReportTables(client, {
    reportResourceId: resourceId,
    reportTemplateId: templateId,
    reportObjectId: groupId,
    fromTs,
    toTs,
  });
}

function rowId(unitId: number, beginning: number, end: number): string {
  return createHash('sha256').update(`${unitId}|${beginning}|${end}`).digest('hex').slice(0, 16);
}

async function parseEngineHoursTable(
  client: WialonClient,
  tableIndex: number,
  rowCount: number,
  columnMap: Record<string, number>,
  groupName: string,
  unitNameToId: Map<string, number>
): Promise<GeneratorEngineHoursRow[]> {
  const rows: GeneratorEngineHoursRow[] = [];
  const unitCol = columnMap.unit ?? -1;
  const beginCol = columnMap.beginning ?? -1;
  const endCol = columnMap.endTime ?? -1;
  const initialCol = columnMap.initialEngineHours ?? -1;
  const ehCol = columnMap.engineHours ?? -1;
  const finalCol = columnMap.finalEngineHours ?? -1;

  const leafCells = await fetchLeafRows(client, tableIndex, rowCount);
  for (const cells of leafCells) {
    const unitName = unitCol >= 0 ? getCellValue(cells, unitCol) : '';
    if (!unitName) continue;
    const unitId = unitNameToId.get(unitName) ?? 0;
    const beginning = getCellTimestamp(cells, beginCol);
    const end = getCellTimestamp(cells, endCol);
    if (!beginning || !end) continue;

    const initialEngineHours = getCellNumber(cells, initialCol);
    const engineHours = getCellNumber(cells, ehCol);
    const finalEngineHours = getCellNumber(cells, finalCol);
    if (engineHours === 0 && initialEngineHours === 0 && finalEngineHours === 0) continue;

    rows.push({
      id: rowId(unitId, beginning, end),
      unitId,
      unitName,
      grouping: groupName,
      beginning,
      end,
      initialEngineHours,
      engineHours,
      finalEngineHours,
    });
  }
  return rows;
}

export class WialonGeneratorEngineHoursService {
  static async list(
    tenantId: string,
    opts: { from?: string; to?: string; refresh?: boolean; unitId?: number; days?: number }
  ): Promise<GeneratorEngineHoursRow[]> {
    const { fromTs, toTs } = parseDateRange(opts.from, opts.to, opts.days ?? 30);
    const key = cacheKey(tenantId, fromTs, toTs);
    if (!opts.refresh) {
      const hit = cache.get(key);
      if (hit && hit.expires > Date.now()) return hit.rows;
    }

    const creds = await loadTenantWialonCreds(tenantId);
    const scope = scopeFromCredentials(tenantId, creds);
    const rows = await withWialonClient(creds, async (client) => {
      const groups = await WialonReportResolverService.listUnitGroups(client, scope);
      const group =
        groups.find((g) => /genset|generator/i.test(g.nm)) ?? groups[0] ?? null;
      if (!group) return [];

      const resolved = await WialonReportResolverService.findModuleTemplates(
        client,
        scope,
        'engineHours',
        { includeFallback: true }
      );
      const groupTemplates = resolved
        .filter((t) => t.isGroupReport)
        .map((t) => ({
          resourceId: t.resourceId,
          templateId: t.templateId,
          name: t.templateName,
          isGroup: true as const,
        }));
      const unitTemplates = resolved
        .filter((t) => !t.isGroupReport && /engine hour/i.test(t.templateName))
        .map((t) => ({
          resourceId: t.resourceId,
          templateId: t.templateId,
          name: t.templateName,
          isGroup: false as const,
        }));
      const templates = groupTemplates.length ? groupTemplates : unitTemplates;
      if (!templates.length) return [];

      const units = await listAllUnits(client, scope);
      const unitNameToId = new Map(units.map((u) => [u.nm, u.id]));
      const generatorUnits = units.filter((u) => /generator|genset/i.test(u.nm) && !/\bbowser\b|fuel\s*tanker/i.test(u.nm));

      const deduped = new Map<string, GeneratorEngineHoursRow>();

      if (groupTemplates.length) {
        for (const tmpl of groupTemplates) {
          try {
            const tables = await execReportTables(
              client,
              tmpl.resourceId,
              tmpl.templateId,
              group.id,
              fromTs,
              toTs
            );
            for (let idx = 0; idx < tables.length; idx++) {
              const table = tables[idx];
              if (!isEngineHoursTable(table.header)) continue;
              const columnMap = buildColumnMap(table.header);
              const parsed = await parseEngineHoursTable(
                client,
                idx,
                table.rows,
                columnMap,
                group.nm,
                unitNameToId
              );
              for (const row of parsed) {
                deduped.set(row.id, row);
              }
            }
          } catch (err) {
            console.warn('[GeneratorEngineHours] template failed:', tmpl.name, err);
          } finally {
            await client.request('report/cleanup_result', {}).catch(() => undefined);
          }
        }
      } else {
        const targets = generatorUnits.length ? generatorUnits : units;
        for (const tmpl of unitTemplates) {
          for (const unit of targets) {
            try {
              const tables = await execReportTables(
                client,
                tmpl.resourceId,
                tmpl.templateId,
                unit.id,
                fromTs,
                toTs
              );
              for (let idx = 0; idx < tables.length; idx++) {
                const table = tables[idx];
                if (!isEngineHoursTable(table.header)) continue;
                const columnMap = buildColumnMap(table.header);
                const parsed = await parseEngineHoursTable(
                  client,
                  idx,
                  table.rows,
                  columnMap,
                  unit.nm,
                  unitNameToId
                );
                for (const row of parsed) {
                  deduped.set(row.id, row);
                }
              }
            } catch (err) {
              console.warn('[GeneratorEngineHours] unit template failed:', unit.nm, err);
            } finally {
              await client.request('report/cleanup_result', {}).catch(() => undefined);
            }
          }
        }
      }
      return [...deduped.values()];
    });

    let out = rows;
    if (opts.unitId != null) out = out.filter((r) => r.unitId === opts.unitId);
    out.sort((a, b) => b.beginning - a.beginning);

    cache.set(key, { rows: out, expires: Date.now() + CACHE_TTL_MS });
    return out;
  }
}
