import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import { processUnitFuelData } from './wialonFuelReport/runner.js';
import { findFuelReportTemplates, listAllUnits } from './wialonFuelReport/templates.js';
import { mergeTransactions } from './wialonFuelLedger.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';
import { scopeFromCredentials } from './WialonReportResolverService.js';
const UNIT_REPORT_CONCURRENCY = 2;
function unitHasConsumption(rows, unitId) {
    return rows.some((r) => r.unitId === unitId && r.section === 'consumption' && effectiveConsumed(r) > 0);
}
/**
 * Run the category-correct unit report per asset missing consumption.
 * Vehicles → Fuel Report(Unit); Generators → Fuel Usage Report(Units).
 */
export async function supplementTransactionsWithUnitReports(tenantId, rows, fromTs, toTs, unitIds, assetCategory) {
    const creds = await loadTenantWialonCreds(tenantId);
    const scope = scopeFromCredentials(tenantId, creds);
    const supplements = [];
    await withWialonClient(creds, async (client) => {
        const { unitTemplate } = await findFuelReportTemplates(client, scope, { assetCategory });
        if (!unitTemplate)
            return;
        let targets = [];
        if (unitIds?.length) {
            const all = await listAllUnits(client, scope);
            const byId = new Map(all.map((u) => [u.id, u]));
            targets = unitIds
                .filter((id) => !unitHasConsumption(rows, id) && !unitHasConsumption(supplements, id))
                .map((id) => byId.get(id) ?? { id, nm: rows.find((r) => r.unitId === id)?.unitName ?? `Unit ${id}` });
        }
        else {
            const all = await listAllUnits(client, scope);
            targets = all.filter((u) => !unitHasConsumption(rows, u.id));
        }
        if (!targets.length)
            return;
        for (let i = 0; i < targets.length; i += UNIT_REPORT_CONCURRENCY) {
            const batch = targets.slice(i, i + UNIT_REPORT_CONCURRENCY);
            const parts = await Promise.all(batch.map(async (unit) => {
                try {
                    return await processUnitFuelData(client, unit, unitTemplate, fromTs, toTs);
                }
                catch {
                    return [];
                }
            }));
            for (const p of parts)
                supplements.push(...p);
        }
    });
    if (!supplements.length)
        return rows;
    return mergeTransactions(rows, supplements);
}
