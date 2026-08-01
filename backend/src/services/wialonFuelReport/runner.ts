import { execWialonReportTables } from '../wialonReportExec.js';
import type { WialonClient } from '../../adapters/wialonClient.js';
import { getCellValue } from './cells.js';
import { detectFuelTables } from './detect.js';
import { fetchLeafRows } from './leafRows.js';
import { effectiveConsumed } from './metrics.js';
import { processAggregateStatsRow, processRow, processRowWithTankMap, processUnitGroupSummaryRow } from './processRows.js';
import type { FuelReportTemplate, FuelTransaction } from './types.js';
import { buildUnitNameIndex } from './unitNames.js';

async function execFuelReport(
  client: WialonClient,
  template: FuelReportTemplate,
  objectId: number,
  fromTs: number,
  toTs: number
) {
  return execWialonReportTables(client, {
    reportResourceId: template.resourceId,
    reportTemplateId: template.templateId,
    reportObjectId: objectId,
    fromTs,
    toTs,
  });
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
  const unitIndex = buildUnitNameIndex([...unitNameToId.entries()].map(([nm, id]) => ({ id, nm })));
  try {
    const tables = await execFuelReport(client, template, group.id, fromTs, toTs);
    const detectedTables = detectFuelTables(tables);
    for (const detected of detectedTables) {
      const unitColIdx = detected.columnMap.unit ?? -1;

      // Top-level rows on group tables are the Wialon period totals per unit
      // (e.g. GENERATOR 1 Consumed=20.14). Children are event breakdowns.
      // Sudden-drop tables are different: tops are either event groups or the
      // event itself — never use them as inflated period "summaries" for Drop.
      if (detected.isGroupUnitSummary && detected.section !== 'theft' && detected.rowCount > 0) {
        const topRows = await client.request<
          Array<{ n?: number; c?: import('./types.js').WialonCell[]; d?: number }>
        >('report/get_result_rows', {
          tableIndex: detected.tableIndex,
          indexFrom: 0,
          indexTo: detected.rowCount - 1,
        });
        const tops = Array.isArray(topRows) ? topRows : [];
        for (const row of tops) {
          const cells = row.c ?? [];
          if (!cells.length) continue;
          const unitName = unitColIdx >= 0 ? getCellValue(cells, unitColIdx) : '';
          const unitId = unitName ? unitIndex.resolve(unitName) : 0;
          const unit = { id: unitId, nm: unitName || 'unknown' };
          const summary = processUnitGroupSummaryRow(
            cells,
            detected.columnMap,
            detected.headers,
            unit,
            toTs,
            detected.section,
            fromTs,
          );
          if (summary) transactions.push(summary);
        }
      }

      // Leaf rows = individual events for expand/detail (never treat as period summary).
      // Skip orphan tops on consumption group tables — already stored as summaries.
      // For filling + theft, keep orphan tops as events (genset flat tables have no children).
      const leafCells = await fetchLeafRows(client, detected.tableIndex, detected.rowCount, 6, {
        skipOrphanTops: detected.isGroupUnitSummary && detected.section === 'consumption',
      });
      for (const cells of leafCells) {
        const unitName = unitColIdx >= 0 ? getCellValue(cells, unitColIdx) : '';
        const unitId = unitName ? unitIndex.resolve(unitName) : 0;
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
