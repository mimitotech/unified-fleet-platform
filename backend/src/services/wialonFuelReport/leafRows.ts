import type { WialonClient } from '../../adapters/wialonClient.js';
import type { WialonCell, WialonReportRow } from './types.js';

/** Fetch leaf rows from hierarchical Wialon fuel report tables (MAMS pattern). */
export async function fetchLeafRows(
  client: WialonClient,
  tableIndex: number,
  topRowCount: number,
  maxDepth = 6
): Promise<WialonCell[][]> {
  const leaves: WialonCell[][] = [];
  const BATCH = 100;

  async function collectFrom(row: WialonReportRow, path: number[], depth: number): Promise<void> {
    const childCount = row.d ?? 0;
    if (childCount <= 0 || depth >= maxDepth) {
      if (row.c?.length) leaves.push(row.c);
      return;
    }

    let children: WialonReportRow[] = [];
    if (depth === 0) {
      const sub = await client.request<WialonReportRow[]>('report/get_result_subrows', {
        tableIndex,
        rowIndex: path[0],
      });
      children = Array.isArray(sub) ? sub : [];
    } else {
      const resp = await client.request<WialonReportRow[] | { r?: WialonReportRow[] }>(
        'report/select_result_rows',
        {
          tableIndex,
          config: { type: 'row', data: { rows: path, level: depth + 1, flat: 0 } },
        }
      );
      if (Array.isArray(resp)) {
        const first = resp[0] as WialonReportRow & { r?: WialonReportRow[] };
        children = first?.r?.length ? first.r : (resp as WialonReportRow[]);
      } else if (resp && Array.isArray(resp.r)) {
        children = resp.r;
      }
    }

    if (!children.length) {
      if (row.c?.length) leaves.push(row.c);
      return;
    }

    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      const childIndex = child.n ?? j;
      await collectFrom(child, [...path, childIndex], depth + 1);
    }
  }

  for (let batchStart = 0; batchStart < topRowCount; batchStart += BATCH) {
    const batchEnd = Math.min(batchStart + BATCH, topRowCount);
    const topRows = await client.request<WialonReportRow[]>('report/get_result_rows', {
      tableIndex,
      indexFrom: batchStart,
      indexTo: batchEnd - 1,
    });
    const rows = Array.isArray(topRows) ? topRows : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = row.n ?? batchStart + i;
      await collectFrom(row, [rowIndex], 0);
    }
  }

  return leaves;
}
