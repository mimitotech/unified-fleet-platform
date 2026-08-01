/**
 * Verify fuel field structure for a tenant — maps each UI column to data sources.
 * Usage: node --import tsx scripts/verify-fuel-structure.mts [tenant-slug]
 */
import 'dotenv/config';
import pg from 'pg';
import { WialonFuelReportService } from '../backend/src/services/WialonFuelReportService.js';
import { WialonFuelAnalyticsService } from '../backend/src/services/WialonFuelAnalyticsService.js';

const slug = process.argv[2] || 'nsamba-motors-ug';
const from = '2026-06-23';
const to = '2026-07-07';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet',
});

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : '—';
}

async function main() {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [slug]);
  const tenantId = rows[0]?.id;
  if (!tenantId) throw new Error(`Tenant not found: ${slug}`);

  console.log(`\n=== Fuel structure verify: ${slug} (${from} → ${to}) ===\n`);

  const cached = await WialonFuelAnalyticsService.loadCachedRowsOnly(tenantId, from, to);
  console.log('Cached rows (redis/memory):', cached.length);

  const api = await WialonFuelReportService.getTransactions(tenantId, { from, to });
  console.log('API getTransactions:', {
    count: api.transactions.length,
    source: api.source,
    warming: api.warming,
    kpis: api.kpis,
  });

  const txs = api.transactions;
  const bySection = { consumption: 0, filling: 0, theft: 0, other: 0 };
  const bySensor = new Map<string, number>();
  for (const t of txs) {
    if (t.section in bySection) bySection[t.section as keyof typeof bySection]++;
    else bySection.other++;
    const s = t.sensor || '(empty)';
    bySensor.set(s, (bySensor.get(s) ?? 0) + 1);
  }
  console.log('\nBy section:', bySection);
  console.log('By sensor:', Object.fromEntries(bySensor));

  const n = txs.length;
  const withFilled = txs.filter((t) => t.filled > 0).length;
  const withUsed = txs.filter((t) => t.fuelUsed > 0).length;
  const withDrop = txs.filter((t) => t.suddenFuelDrop > 0).length;
  const withMileage = txs.filter((t) => t.mileage > 0).length;
  const withFinalLevel = txs.filter((t) => t.finalLevel > 0).length;
  const withStation = txs.filter((t) => (t as { filledStation?: number }).filledStation > 0).length;
  const withCost = txs.filter((t) => (t as { totalCost?: number }).totalCost > 0).length;

  console.log('\n--- UI column data availability ---');
  console.log('Filled(Main/Reserve):', withFilled, '/', n, pct(withFilled, n), '← section=filling, filled>0');
  console.log('Used(Main/Reserve):', withUsed, '/', n, pct(withUsed, n), '← section=consumption OR group summary');
  console.log('Drop(Main/Reserve):', withDrop, '/', n, pct(withDrop, n), '← section=theft, suddenFuelDrop>0');
  console.log('Level(Main):', withFinalLevel, '/', n, pct(withFinalLevel, n), '← finalLevel on events');
  console.log('Mileage (KPI):', withMileage, '/', n, pct(withMileage, n), '← consumption/summary only');
  console.log('Filled(Station):', withStation, '/', n, '← not from Wialon (manual/card integration)');
  console.log('Cost / Card No:', withCost, '/', n, '← not from Wialon fuel report');

  const sample = txs.find((t) => t.unitName.includes('688'));
  if (sample) {
    const u688 = txs.filter((t) => t.unitName.includes('688'));
    console.log('\n--- UBF 688Q sample ---');
    console.log('rows:', u688.length);
    console.log('summary:', u688.find((t) => t.sensor === 'wialon_group_summary'));
    console.log('fills:', u688.filter((t) => t.section === 'filling').length, 'sum L:', u688.filter((t) => t.section === 'filling').reduce((s, t) => s + t.filled, 0).toFixed(1));
    console.log('theft:', u688.filter((t) => t.section === 'theft').length, 'sum L:', u688.filter((t) => t.section === 'theft').reduce((s, t) => s + t.suddenFuelDrop, 0).toFixed(1));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
