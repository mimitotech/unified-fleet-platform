/**
 * Debug fuel template/group discovery for a tenant (no secrets printed).
 * Usage: node --import tsx scripts/debug-fuel-discovery.mts nsamba-motors-ug
 */
import 'dotenv/config';
import pg from 'pg';
import { loadTenantWialonCreds } from '../backend/src/services/tenantWialonCredentials.js';
import { withWialonClient } from '../backend/src/services/WialonSessionService.js';
import { findFleetGroups, findFuelReportTemplates, listAllUnits } from '../backend/src/services/wialonFuelReport/templates.js';
import { scopeFromCredentials } from '../backend/src/services/WialonReportResolverService.js';
import { WialonFuelReportService } from '../backend/src/services/WialonFuelReportService.js';

const slug = process.argv[2] || 'nsamba-motors-ug';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet',
});

async function main() {
  const { rows: tenantRows } = await pool.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [slug]);
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) {
    console.error('Tenant not found:', slug);
    process.exit(1);
  }

  const creds = await loadTenantWialonCreds(tenantId);
  const scope = scopeFromCredentials(tenantId, creds);
  console.log('tenant:', slug, 'accountId:', scope.accountId ?? '(none)');

  await withWialonClient(creds, async (client) => {
    const { groupTemplate, unitTemplate } = await findFuelReportTemplates(client, scope);
    const groups = await findFleetGroups(client, scope);
    const units = await listAllUnits(client, scope);
    console.log('templates:', {
      group: groupTemplate?.templateName ?? null,
      unit: unitTemplate?.templateName ?? null,
    });
    console.log('groups:', groups.length, groups.slice(0, 5).map((g) => g.nm));
    console.log('units:', units.length);
  });

  const from = '2026-06-23';
  const to = '2026-07-07';
  console.log(`fetching ${from} → ${to}…`);
  const rows = await WialonFuelReportService.fetchFromWialon(tenantId, { from, to });
  const consumption = rows.filter((r) => r.section === 'consumption').length;
  const filling = rows.filter((r) => r.section === 'filling').length;
  console.log('transactions:', rows.length, { consumption, filling });
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
