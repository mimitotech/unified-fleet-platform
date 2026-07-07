import type { WialonClient } from '../adapters/wialonClient.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import { processUnitFuelData } from './wialonFuelReport/runner.js';
import { findFuelReportTemplates, listAllUnits } from './wialonFuelReport/templates.js';
import { mergeTransactions } from './wialonFuelLedger.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';

const UNIT_REPORT_CONCURRENCY = 2;

function unitHasConsumption(rows: FuelTransaction[], unitId: number): boolean {
  return rows.some((r) => r.unitId === unitId && r.section === 'consumption' && effectiveConsumed(r) > 0);
}

/** Run Fuel Report(Unit) per asset missing consumption (Wialon Method 1 per unit). */
export async function supplementTransactionsWithUnitReports(
  tenantId: string,
  rows: FuelTransaction[],
  fromTs: number,
  toTs: number,
  unitIds?: number[]
): Promise<FuelTransaction[]> {
  const creds = await loadTenantWialonCreds(tenantId);
  const supplements: FuelTransaction[] = [];

  await withWialonClient(creds, async (client) => {
    const { unitTemplate, groupTemplate } = await findFuelReportTemplates(client);
    const template = unitTemplate ?? groupTemplate;
    if (!template) return;

    let targets: Array<{ id: number; nm: string }> = [];
    if (unitIds?.length) {
      const all = await listAllUnits(client);
      const byId = new Map(all.map((u) => [u.id, u]));
      targets = unitIds
        .filter((id) => !unitHasConsumption(rows, id) && !unitHasConsumption(supplements, id))
        .map((id) => byId.get(id) ?? { id, nm: rows.find((r) => r.unitId === id)?.unitName ?? `Unit ${id}` });
    } else {
      const all = await listAllUnits(client);
      targets = all.filter((u) => !unitHasConsumption(rows, u.id));
    }

    if (!targets.length) return;

    for (let i = 0; i < targets.length; i += UNIT_REPORT_CONCURRENCY) {
      const batch = targets.slice(i, i + UNIT_REPORT_CONCURRENCY);
      const parts = await Promise.all(
        batch.map(async (unit) => {
          try {
            return await processUnitFuelData(client, unit, template, fromTs, toTs);
          } catch {
            return [] as FuelTransaction[];
          }
        })
      );
      for (const p of parts) supplements.push(...p);
    }
  });

  if (!supplements.length) return rows;
  return mergeTransactions(rows, supplements);
}
