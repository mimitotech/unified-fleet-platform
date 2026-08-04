import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import { scopeFromCredentials, WialonReportResolverService, } from './WialonReportResolverService.js';
import { CANONICAL_FUEL_REPORTS, resolveCanonicalFuelSlots, } from './wialonFuelReport/templates.js';
import { loadFuelGroupMembership } from './wialonFuelAssetGroups.js';
import { detectFuelCategorySupport } from './wialonFuelCategoryStructure.js';
export class WialonFuelReportCapabilityService {
    static async getFuelCapabilities(tenantId) {
        const creds = await loadTenantWialonCreds(tenantId);
        const scope = scopeFromCredentials(tenantId, creds);
        return withWialonClient(creds, async (client) => {
            const slotsResolved = await resolveCanonicalFuelSlots(client, scope);
            const membership = await loadFuelGroupMembership(client, tenantId);
            const categorySupport = await detectFuelCategorySupport(client, scope, membership);
            const allTemplates = await WialonReportResolverService.listAllTemplates(client, scope, 500);
            const fuelTemplates = allTemplates.filter((t) => t.module === 'fuel' || /fuel/i.test(t.templateName));
            const slots = [
                {
                    key: 'vehicle.group',
                    family: 'vehicle',
                    role: 'group',
                    expectedName: CANONICAL_FUEL_REPORTS.vehicle.group,
                    available: Boolean(slotsResolved.vehicle.group),
                    matchedName: slotsResolved.vehicle.group?.templateName ?? null,
                    resourceId: slotsResolved.vehicle.group?.resourceId ?? null,
                    templateId: slotsResolved.vehicle.group?.templateId ?? null,
                },
                {
                    key: 'vehicle.unit',
                    family: 'vehicle',
                    role: 'unit',
                    expectedName: CANONICAL_FUEL_REPORTS.vehicle.unit,
                    available: Boolean(slotsResolved.vehicle.unit),
                    matchedName: slotsResolved.vehicle.unit?.templateName ?? null,
                    resourceId: slotsResolved.vehicle.unit?.resourceId ?? null,
                    templateId: slotsResolved.vehicle.unit?.templateId ?? null,
                },
                {
                    key: 'generator.group',
                    family: 'generator',
                    role: 'group',
                    expectedName: CANONICAL_FUEL_REPORTS.generator.group,
                    available: Boolean(slotsResolved.generator.group),
                    matchedName: slotsResolved.generator.group?.templateName ?? null,
                    resourceId: slotsResolved.generator.group?.resourceId ?? null,
                    templateId: slotsResolved.generator.group?.templateId ?? null,
                },
                {
                    key: 'generator.unit',
                    family: 'generator',
                    role: 'unit',
                    expectedName: CANONICAL_FUEL_REPORTS.generator.unit,
                    available: Boolean(slotsResolved.generator.unit),
                    matchedName: slotsResolved.generator.unit?.templateName ?? null,
                    resourceId: slotsResolved.generator.unit?.resourceId ?? null,
                    templateId: slotsResolved.generator.unit?.templateId ?? null,
                },
            ];
            const modules = ['fuel', 'engineHours', 'trips', 'events', 'emissions'];
            const capabilities = modules.map((module) => {
                const moduleTemplates = allTemplates.filter((t) => t.module === module);
                return {
                    module,
                    available: moduleTemplates.length > 0,
                    groupTemplateCount: moduleTemplates.filter((t) => t.isGroupReport).length,
                    unitTemplateCount: moduleTemplates.filter((t) => !t.isGroupReport).length,
                    templates: moduleTemplates.slice(0, 20).map((t) => ({
                        resourceId: t.resourceId,
                        resourceName: t.resourceName,
                        templateId: t.templateId,
                        templateName: t.templateName,
                        isGroupReport: t.isGroupReport,
                        fuelFamily: t.fuelFamily,
                    })),
                };
            });
            const readyCount = slots.filter((s) => s.available).length;
            const missing = slots.filter((s) => !s.available).map((s) => s.expectedName);
            return {
                tenantId,
                scope,
                expectedReports: CANONICAL_FUEL_REPORTS,
                slots,
                readyCount,
                missingReports: missing,
                uniform: missing.length === 0,
                supportedCategories: {
                    vehicle: categorySupport.vehicle,
                    generator: categorySupport.generator,
                    machinery: categorySupport.machinery,
                    unifiedFleet: categorySupport.unifiedFleet,
                },
                categorySupportReasons: categorySupport.reasons,
                capabilities,
                discoveredFuelTemplates: fuelTemplates.slice(0, 40).map((t) => ({
                    templateName: t.templateName,
                    isGroupReport: t.isGroupReport,
                    fuelFamily: t.fuelFamily ?? null,
                    resourceName: t.resourceName,
                })),
                fetchedAt: new Date().toISOString(),
            };
        });
    }
}
