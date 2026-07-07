import type { WialonClient } from '../../adapters/wialonClient.js';
import { getCellValue } from './cells.js';
import { detectFuelTables } from './detect.js';
import { fetchLeafRows } from './leafRows.js';
import { effectiveConsumed } from './metrics.js';
import { processAggregateStatsRow, processRow, processRowWithTankMap } from './processRows.js';
import type { FuelReportTemplate, FuelTransaction, ReportTableMeta } from './types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeReportTables(raw: Array<Record<string, unknown>>): ReportTableMeta[] {
  return raw.map((meta) => {
    const header: string[] = [];
    const headerTypes: (string | number)[] = [];

    const h = meta.header as string[] | undefined;
    const ht = meta.header_type as (string | number)[] | undefined;
    if (Array.isArray(h) && h.length) {
      for (let i = 0; i < h.length; i++) {
        header.push(String(h[i] ?? `Column ${i + 1}`));
        if (ht?.[i] != null) headerTypes.push(ht[i] as string | number);
      }
    } else {
      const cols = Number(meta.columns ?? meta.cols ?? 0);
      for (let i = 0; i < cols; i++) {
        header.push(`Column ${i + 1}`);
      }
    }

    return {
      name: String(meta.name ?? ''),
      label: String(meta.label ?? meta.name ?? ''),
      rows: Number(meta.rows ?? 0),
      header,
      headerTypes: headerTypes.length ? headerTypes : undefined,
    };
  });
}

async function execFuelReport(
  client: WialonClient,
  template: FuelReportTemplate,
  objectId: number,
  fromTs: number,
  toTs: number
): Promise<ReportTableMeta[]> {
  await client.request('report/cleanup_result', {}).catch(() => undefined);

  await client.request('report/exec_report', {
    reportResourceId: template.resourceId,
    reportTemplateId: template.templateId,
    reportObjectId: objectId,
    reportObjectSecId: 0,
    interval: { from: fromTs, to: toTs, flags: 0 },
    remoteExec: 1,
  });

  for (let attempt = 0; attempt < 120; attempt++) {
    const statusRes = await client.request<{ status: number; error?: string }>(
      'report/get_report_status',
      {}
    );
    const code = statusRes.status;
    if (code === 4) break;
    if (code === 8 || code === 16) {
      throw new Error(statusRes.error || `Wialon report failed (status ${code})`);
    }
    await sleep(1000);
  }

  await client.request('report/apply_report_result', {}).catch(() => undefined);

  const tablesRes = await client.request<{ tables?: Array<Record<string, unknown>> }>(
    'report/get_report_tables',
    {}
  );

  return normalizeReportTables(tablesRes.tables ?? []);
}

/** Drop unit_stats summary rows when trip-level consumption exists for the same unit. */
function dropRedundantStatsRows(transactions: FuelTransaction[]): FuelTransaction[] {
  const unitsWithTripFuel = new Set<number>();
  for (const r of transactions) {
    if (r.section === 'consumption' && r.sensor !== 'wialon_stats' && effectiveConsumed(r) > 0) {
      unitsWithTripFuel.add(r.unitId);
    }
  }
  return transactions.filter(
    (r) => !(r.section === 'consumption' && r.sensor === 'wialon_stats' && unitsWithTripFuel.has(r.unitId))
  );
}

export async function processUnitFuelData(
  client: WialonClient,
  unit: { id: number; nm: string },
  template: FuelReportTemplate,
  fromTs: number,
  toTs: number
): Promise<FuelTransaction[]> {
  const transactions: FuelTransaction[] = [];
  try {
    const tables = await execFuelReport(client, template, unit.id, fromTs, toTs);
    const detectedTables = detectFuelTables(tables);
    for (const detected of detectedTables) {
      const leafCells = await fetchLeafRows(client, detected.tableIndex, detected.rowCount);
      for (const cells of leafCells) {
        if (detected.isAggregateStats) {
          const tx = processAggregateStatsRow(cells, detected.columnMap, unit, toTs);
          if (tx) transactions.push(tx);
          continue;
        }
        if (detected.isCombinedTable && detected.tankColumnMaps.length) {
          for (const tankMap of detected.tankColumnMaps) {
            const tx = processRowWithTankMap(cells, detected.columnMap, tankMap, detected.section, unit, fromTs);
            if (tx) transactions.push(tx);
          }
        } else {
          const tx = processRow(cells, detected.columnMap, detected.section, detected.tank, unit, fromTs);
          if (tx) transactions.push(tx);
        }
      }
    }
  } finally {
    await client.request('report/cleanup_result', {}).catch(() => undefined);
  }
  return dropRedundantStatsRows(transactions);
}

export async function processGroupFuelData(
  client: WialonClient,
  group: { id: number; nm: string },
  template: FuelReportTemplate,
  fromTs: number,
  toTs: number,
  unitNameToId: Map<string, number>
): Promise<FuelTransaction[]> {
  const transactions: FuelTransaction[] = [];
  try {
    const tables = await execFuelReport(client, template, group.id, fromTs, toTs);
    const detectedTables = detectFuelTables(tables);
    for (const detected of detectedTables) {
      const unitColIdx = detected.columnMap.unit ?? -1;
      const leafCells = await fetchLeafRows(client, detected.tableIndex, detected.rowCount);
      for (const cells of leafCells) {
        const unitName = unitColIdx >= 0 ? getCellValue(cells, unitColIdx) : '';
        const unitId = unitName ? (unitNameToId.get(unitName) ?? 0) : 0;
        const unit = { id: unitId, nm: unitName || 'unknown' };

        if (detected.isAggregateStats) {
          const tx = processAggregateStatsRow(cells, detected.columnMap, unit, toTs);
          if (tx) transactions.push(tx);
          continue;
        }

        if (detected.isCombinedTable && detected.tankColumnMaps.length) {
          for (const tankMap of detected.tankColumnMaps) {
            const tx = processRowWithTankMap(cells, detected.columnMap, tankMap, detected.section, unit, fromTs);
            if (tx) transactions.push(tx);
          }
        } else {
          const tx = processRow(cells, detected.columnMap, detected.section, detected.tank, unit, fromTs);
          if (tx) transactions.push(tx);
        }
      }
    }
  } finally {
    await client.request('report/cleanup_result', {}).catch(() => undefined);
  }
  return dropRedundantStatsRows(transactions);
}
