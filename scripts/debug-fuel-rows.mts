import 'dotenv/config';
import pg from 'pg';
import { loadTenantWialonCreds } from '../backend/src/services/tenantWialonCredentials.js';
import { withWialonClient } from '../backend/src/services/WialonSessionService.js';
import { findFleetGroups, findFuelReportTemplates } from '../backend/src/services/wialonFuelReport/templates.js';
import { scopeFromCredentials } from '../backend/src/services/WialonReportResolverService.js';
import { execWialonReportTables } from '../backend/src/services/wialonReportExec.js';
import { detectFuelTables } from '../backend/src/services/wialonFuelReport/detect.js';
import { fetchLeafRows } from '../backend/src/services/wialonFuelReport/leafRows.js';
import { getCellValue, getCellNumber } from '../backend/src/services/wialonFuelReport/cells.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet',
});

async function main() {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = 'nsamba-motors-ug'");
  const tenantId = rows[0]?.id;
  if (!tenantId) throw new Error('tenant not found');

  const creds = await loadTenantWialonCreds(tenantId);
  const scope = scopeFromCredentials(tenantId, creds);
  const fromTs = Math.floor(new Date('2026-06-23T00:00:00Z').getTime() / 1000);
  const toTs = Math.floor(new Date('2026-07-07T23:59:59Z').getTime() / 1000);

  await withWialonClient(creds, async (client) => {
    const { groupTemplate } = await findFuelReportTemplates(client, scope);
    const group = (await findFleetGroups(client, scope)).find((g) => g.nm.includes('Q3'))!;
    const tables = await execWialonReportTables(client, {
      reportResourceId: groupTemplate!.resourceId,
      reportTemplateId: groupTemplate!.templateId,
      reportObjectId: group.id,
      fromTs,
      toTs,
    });
    const detected = detectFuelTables(tables);
    for (const d of detected) {
      const meta = tables[d.tableIndex];
      console.log('\n===', meta.name, d.section, 'rows', d.rowCount, '===');
      console.log('headers:', meta.header);
      console.log('columnMap:', d.columnMap);
      const leaves = await fetchLeafRows(client, d.tableIndex, Math.min(d.rowCount, 30));
      console.log('leaf count:', leaves.length);
      for (let i = 0; i < Math.min(4, leaves.length); i++) {
        const cells = leaves[i];
        const unit = getCellValue(cells, d.columnMap.unit ?? -1);
        if (d.section === 'theft' && !unit.includes('688') && leaves.length > 10) continue;
        const parts = meta.header.map((h, idx) => `${h}=${getCellValue(cells, idx) || getCellNumber(cells, idx)}`);
        console.log(`  [${i}] ${unit}:`, parts.join(' | '));
      }
    }
  });
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
