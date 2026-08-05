import 'dotenv/config';
import { loadTenantWialonCreds } from '../backend/src/services/tenantWialonCredentials.js';
import { withWialonClient } from '../backend/src/services/WialonSessionService.js';
import {
  findFleetGroups,
  findFuelReportTemplates,
  listAllUnits,
} from '../backend/src/services/wialonFuelReport/templates.js';
import { scopeFromCredentials } from '../backend/src/services/WialonReportResolverService.js';
import { execWialonReportTables } from '../backend/src/services/wialonReportExec.js';
import { fetchLeafRows } from '../backend/src/services/wialonFuelReport/leafRows.js';
import { getCellNumber, getCellValue } from '../backend/src/services/wialonFuelReport/cells.js';
import { isWialonGenerator } from '../backend/src/services/wialonAssetCategory.js';
import type { FuelReportTemplate } from '../backend/src/services/wialonFuelReport/types.js';
import type { WialonClient } from '../backend/src/adapters/wialonClient.js';

const tenantId = '8380813c-4654-486f-924d-57fced03e13d';
const fromTs = Math.floor(new Date('2026-07-05T00:00:00Z').getTime() / 1000);
const toTs = Math.floor(new Date('2026-07-11T23:59:59Z').getTime() / 1000);

function formatRow(header: string[], cells: unknown[]): string {
  return header
    .map((h, ci) => {
      const t = getCellValue(cells as never, ci);
      const n = getCellNumber(cells as never, ci);
      const showN = Number.isFinite(n) && n !== 0 && t && !t.includes(String(n));
      return `${h}=${t || (n ? String(n) : '—')}${showN ? ` (v=${n})` : ''}`;
    })
    .join(' | ');
}

async function dumpReport(
  client: WialonClient,
  label: string,
  template: FuelReportTemplate,
  objectId: number,
  objectName: string,
) {
  console.log('\n' + '='.repeat(100));
  console.log(`REPORT: ${label}`);
  console.log(`Template: ${template.templateName} (id=${template.templateId})`);
  console.log(`Object: ${objectName} (id=${objectId})`);
  console.log(`Interval: 2026-07-05 → 2026-07-11 UTC`);
  console.log('='.repeat(100));

  try {
    const tables = await execWialonReportTables(client, {
      reportResourceId: template.resourceId,
      reportTemplateId: template.templateId,
      reportObjectId: objectId,
      fromTs,
      toTs,
      pollAttempts: 180,
    });

    if (!tables.length) {
      console.log('(no tables returned)');
      return;
    }

    for (let ti = 0; ti < tables.length; ti++) {
      const meta = tables[ti];
      console.log(`\n### ${meta.label || meta.name}  [${meta.name}]  rows=${meta.rows}`);
      console.log(`Columns: ${meta.header.join(' | ')}`);
      if (!meta.rows) {
        console.log('(empty)');
        continue;
      }

      // Top-level rows (group summaries often live here)
      const topRows = await client.request<Array<{ n?: number; c?: unknown[]; d?: number }>>(
        'report/get_result_rows',
        { tableIndex: ti, indexFrom: 0, indexTo: Math.min(meta.rows, 50) - 1 },
      );
      const tops = Array.isArray(topRows) ? topRows : [];
      console.log(`\nTOP-LEVEL rows (${tops.length}):`);
      for (let i = 0; i < tops.length; i++) {
        const row = tops[i];
        console.log(`  T${i + 1} (children=${row.d ?? 0}): ${formatRow(meta.header, row.c ?? [])}`);
      }

      const leaf = await fetchLeafRows(client, ti, meta.rows);
      console.log(`\nLEAF/DETAIL rows (${leaf.length}):`);
      for (let ri = 0; ri < leaf.length; ri++) {
        console.log(`  L${ri + 1}: ${formatRow(meta.header, leaf[ri])}`);
      }
    }
  } catch (e) {
    console.log('ERROR:', e instanceof Error ? e.message : e);
  } finally {
    await client.request('report/cleanup_result', {}).catch(() => undefined);
  }
}

const creds = await loadTenantWialonCreds(tenantId);
const scope = scopeFromCredentials(tenantId, creds);

await withWialonClient(creds, async (client) => {
  const genTpl = await findFuelReportTemplates(client, scope, { assetCategory: 'generator' });
  const defTpl = await findFuelReportTemplates(client, scope, {});
  const groups = await findFleetGroups(client, scope, { assetCategory: 'generator' });
  const units = (await listAllUnits(client, scope)).filter((u) => isWialonGenerator({ name: u.nm }));
  const group = groups[0];

  console.log('URSB Wialon — live report numbers (for comparison)');
  console.log('account', creds.accountId);

  // 1) Primary genset usage group report
  if (genTpl.groupTemplate && group) {
    await dumpReport(
      client,
      'Fuel Usage Report(Gensets) on group URSB GENSET',
      genTpl.groupTemplate,
      group.id,
      group.nm,
    );
  }

  // 2) Fillings-only group report (what default path uses)
  if (
    defTpl.groupTemplate &&
    group &&
    defTpl.groupTemplate.templateId !== genTpl.groupTemplate?.templateId
  ) {
    await dumpReport(
      client,
      'Fuel Fillings Report(group) on group URSB GENSET',
      defTpl.groupTemplate,
      group.id,
      group.nm,
    );
  }

  // 3) Per-unit usage report
  if (genTpl.unitTemplate) {
    for (const u of units) {
      await dumpReport(
        client,
        `Fuel Usage Report (Units) on ${u.nm}`,
        genTpl.unitTemplate,
        u.id,
        u.nm,
      );
    }
  }
});
