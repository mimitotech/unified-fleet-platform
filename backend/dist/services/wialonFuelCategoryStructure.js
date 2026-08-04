import { CANONICAL_FUEL_REPORTS, } from './wialonFuelReport/templates.js';
import { WialonReportResolverService } from './WialonReportResolverService.js';
function normalizeTemplateName(name) {
    return name.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')');
}
function isTrueGeneratorTemplateName(name) {
    const n = normalizeTemplateName(name);
    const group = normalizeTemplateName(CANONICAL_FUEL_REPORTS.generator.group);
    const unit = normalizeTemplateName(CANONICAL_FUEL_REPORTS.generator.unit);
    if (n === group || n === unit)
        return true;
    // Allow near-canonical genset titles used on some accounts
    return /fuel\s*usage\s*report\s*\(gensets?\)/i.test(name) || /fuel\s*usage\s*report\s*\(units?\)/i.test(name);
}
function isTrueVehicleTemplateName(name) {
    const n = normalizeTemplateName(name);
    const group = normalizeTemplateName(CANONICAL_FUEL_REPORTS.vehicle.group);
    const unit = normalizeTemplateName(CANONICAL_FUEL_REPORTS.vehicle.unit);
    if (n === group || n === unit)
        return true;
    return /fuel\s*report\s*\(group\)/i.test(name) || /fuel\s*report\s*\(units?\)/i.test(name);
}
/** Detect category support from Wialon templates + group membership (cached with fleet build). */
export async function detectFuelCategorySupport(client, scope, membership) {
    const templates = await WialonReportResolverService.findModuleTemplates(client, scope, 'fuel', {
        includeFallback: true,
    });
    let vehicleTemplates = false;
    let generatorTemplates = false;
    for (const t of templates) {
        const name = t.templateName || '';
        if (t.fuelFamily === 'generator' || isTrueGeneratorTemplateName(name)) {
            generatorTemplates = true;
        }
        if (t.fuelFamily === 'vehicle' || isTrueVehicleTemplateName(name)) {
            vehicleTemplates = true;
        }
    }
    // Any fuel template counts as vehicle-capable when genset-only accounts still need a tab
    if (!vehicleTemplates && !generatorTemplates && templates.length > 0) {
        vehicleTemplates = true;
    }
    const generatorGroups = membership.generatorUnitIds.size > 0;
    const machineryGroups = membership.machineryUnitIds.size > 0;
    const generator = generatorTemplates || generatorGroups;
    const machinery = machineryGroups;
    const unifiedFleet = !generator && !machinery;
    return {
        // Unified fleets (Mimito-style) and mixed fleets always have a Vehicles surface.
        vehicle: true,
        generator,
        machinery,
        unifiedFleet,
        reasons: {
            vehicleTemplates: vehicleTemplates || (!generatorTemplates && templates.length > 0),
            generatorTemplates,
            generatorGroups,
            machineryGroups,
        },
    };
}
export function categorySupported(support, category) {
    if (!support)
        return category === 'vehicle';
    return Boolean(support[category]);
}
export function supportedCategoriesList(support) {
    const out = [];
    if (support.vehicle)
        out.push('vehicle');
    if (support.generator)
        out.push('generator');
    if (support.machinery)
        out.push('machinery');
    return out.length ? out : ['vehicle'];
}
