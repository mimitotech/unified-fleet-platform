import { CANONICAL_FUEL_REPORTS, } from '../wialonReportTemplateRegistry.js';
import { WialonReportResolverService, wialonReportScopeKey, } from '../WialonReportResolverService.js';
export { CANONICAL_FUEL_REPORTS };
/** @deprecated Use WialonReportResolverService.invalidate */
export function invalidateFuelReportCaches(scope) {
    WialonReportResolverService.invalidate(scope);
}
function toFuelTemplate(resolved) {
    if (!resolved)
        return null;
    return {
        resourceId: resolved.resourceId,
        templateId: resolved.templateId,
        templateName: resolved.templateName,
        isGroupReport: resolved.isGroupReport,
    };
}
function normalizeTemplateName(name) {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Exact / near-exact match against a canonical report title. */
function matchesCanonical(name, canonical) {
    const n = normalizeTemplateName(name);
    const c = normalizeTemplateName(canonical);
    if (n === c)
        return true;
    // Allow optional spaces around parentheses: "Fuel Report (Group)" vs "Fuel Report(Group)"
    const loose = (s) => s.replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')');
    return loose(n) === loose(c);
}
function fuelFamilyForCategory(category) {
    if (category === 'generator' || category === 'machinery')
        return 'generator';
    return 'vehicle';
}
/**
 * Score a template for the requested group/unit + asset category.
 * Prefer exact canonical names; then same family; never cross family when better exists.
 */
function scoreFuelTemplate(template, opts) {
    if (template.isGroupReport !== opts.isGroupReport)
        return -1;
    const name = template.templateName;
    const family = fuelFamilyForCategory(opts.assetCategory);
    const canonical = CANONICAL_FUEL_REPORTS[family][opts.isGroupReport ? 'group' : 'unit'];
    const otherFamily = family === 'vehicle' ? 'generator' : 'vehicle';
    const otherCanonical = CANONICAL_FUEL_REPORTS[otherFamily][opts.isGroupReport ? 'group' : 'unit'];
    let score = 0;
    if (matchesCanonical(name, canonical)) {
        score += 200;
    }
    else if (matchesCanonical(name, otherCanonical)) {
        // Wrong family for this request — last resort only
        score += 10;
    }
    else if (family === 'vehicle') {
        if (/fuel report\s*\(group\)/i.test(name) && opts.isGroupReport)
            score += 100;
        else if (/fuel report\s*\(unit\)/i.test(name) && !opts.isGroupReport)
            score += 100;
        else if (/fuel fillings report\s*\(group\)/i.test(name) && opts.isGroupReport)
            score += 70;
        else if (/fuel fillings report\s*\(units?\)/i.test(name) && !opts.isGroupReport)
            score += 65;
        else if (/fuel/i.test(name) && !/usage|genset|generator/i.test(name))
            score += 35;
    }
    else {
        // generator / machinery
        if (/fuel usage report\s*\(gensets?\)/i.test(name) && opts.isGroupReport)
            score += 100;
        else if (/fuel usage report\s*\(units?\)/i.test(name) && !opts.isGroupReport)
            score += 100;
        else if (/fuel fillings report\s*\(group\)/i.test(name) && opts.isGroupReport)
            score += 68;
        else if (/fuel fillings report\s*\(units?\)/i.test(name) && !opts.isGroupReport)
            score += 65;
        else if (/genset|generator|bowser/i.test(name) && /fuel/i.test(name))
            score += 55;
        else if (/fuel usage/i.test(name))
            score += 40;
    }
    if (template.fuelFamily === family)
        score += 25;
    if (template.fuelFamily === otherFamily)
        score -= 40;
    if (template.fallback)
        score -= 25;
    if (template.canonicalName && matchesCanonical(name, template.canonicalName))
        score += 15;
    return score;
}
function pickFuelTemplate(templates, opts) {
    let best = null;
    let bestScore = -1;
    for (const t of templates) {
        const score = scoreFuelTemplate(t, opts);
        if (score > bestScore) {
            bestScore = score;
            best = t;
        }
    }
    return bestScore > 25 ? best : null;
}
export async function findFuelReportTemplates(client, scope, opts) {
    const family = fuelFamilyForCategory(opts?.assetCategory);
    const expected = CANONICAL_FUEL_REPORTS[family];
    // Prefer admin-selected report templates for this tenant (Fuel module config)
    if (opts?.tenantId) {
        try {
            const { TenantFuelModuleConfigService } = await import('../TenantFuelModuleConfigService.js');
            const cfg = await TenantFuelModuleConfigService.getConfig(opts.tenantId);
            const selected = cfg.selectedReports ?? [];
            const pickSelected = (wantGroup) => {
                const match = selected.find((s) => {
                    if (s.resourceId == null || s.templateId == null)
                        return false;
                    if (s.isGroupReport != null)
                        return Boolean(s.isGroupReport) === wantGroup;
                    // Infer from name when flag missing
                    const n = String(s.templateName || '').toLowerCase();
                    const looksGroup = /group|gensets?/.test(n) && !/unit/.test(n);
                    return looksGroup === wantGroup;
                });
                if (!match)
                    return null;
                return {
                    resourceId: Number(match.resourceId),
                    templateId: Number(match.templateId),
                    templateName: String(match.templateName || ''),
                    isGroupReport: wantGroup,
                };
            };
            const selectedGroup = pickSelected(true);
            const selectedUnit = pickSelected(false);
            if (selectedGroup || selectedUnit) {
                // Fill gaps with auto-discovered templates
                const templates = await WialonReportResolverService.findModuleTemplates(client, scope, 'fuel', {
                    includeFallback: true,
                });
                let groupTemplate = selectedGroup ||
                    toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: true, assetCategory: opts?.assetCategory }));
                let unitTemplate = selectedUnit ||
                    toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: false, assetCategory: opts?.assetCategory }));
                if (family !== 'vehicle' && (!groupTemplate || !unitTemplate)) {
                    if (!groupTemplate)
                        groupTemplate = toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: true, assetCategory: undefined }));
                    if (!unitTemplate)
                        unitTemplate = toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: false, assetCategory: undefined }));
                }
                return { groupTemplate, unitTemplate, family, expected };
            }
        }
        catch {
            // Fall through to auto discovery
        }
    }
    const templates = await WialonReportResolverService.findModuleTemplates(client, scope, 'fuel', {
        includeFallback: true,
    });
    let groupTemplate = toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: true, assetCategory: opts?.assetCategory }));
    let unitTemplate = toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: false, assetCategory: opts?.assetCategory }));
    // Fallback: accounts that only have generic "Fuel Report(Group)/(Unit)" templates
    // (no genset-specific ones) should still resolve for machinery/generator. The generic
    // FLS reports work for any unit type, so fall back to them instead of throwing.
    if (family !== 'vehicle' && (!groupTemplate || !unitTemplate)) {
        if (!groupTemplate) {
            groupTemplate = toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: true, assetCategory: undefined }));
        }
        if (!unitTemplate) {
            unitTemplate = toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: false, assetCategory: undefined }));
        }
    }
    return {
        groupTemplate,
        unitTemplate,
        family,
        expected,
    };
}
/**
 * Resolve all four canonical fuel slots for capability / onboarding surfaces.
 */
export async function resolveCanonicalFuelSlots(client, scope) {
    const templates = await WialonReportResolverService.findModuleTemplates(client, scope, 'fuel', {
        includeFallback: true,
    });
    return {
        vehicle: {
            group: toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: true, assetCategory: 'vehicle' })),
            unit: toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: false, assetCategory: 'vehicle' })),
        },
        generator: {
            group: toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: true, assetCategory: 'generator' })),
            unit: toFuelTemplate(pickFuelTemplate(templates, { isGroupReport: false, assetCategory: 'generator' })),
        },
        expected: CANONICAL_FUEL_REPORTS,
    };
}
const FLEET_GROUP_RE = /vehicle|truck|fleet|lorry|bus|\[veh\]|cars?/i;
const GENSET_GROUP_RE = /generator|genset|gen\s*set|gensets?|stationary|power\s*unit|sites?|branches?/i;
const MACHINERY_GROUP_RE = /machiner|plant|excav|crane|loader|bulldozer|roller|paver|fork\s*lift|forklift|compressor|equip/i;
const STATIONARY_GROUP_RE = /generator|genset|gen\s*set|bowser|machinery|plant|power|stationary|gensets?/i;
export async function findFleetGroups(client, scope, opts) {
    const all = await WialonReportResolverService.listUnitGroups(client, scope, { limit: 200 });
    if (!all.length)
        return [];
    if (opts?.assetCategory === 'generator') {
        // Prefer true genset groups so bowser-named groups don't replace Fuel Usage Report(Gensets).
        const gensets = all.filter((g) => GENSET_GROUP_RE.test(g.nm));
        if (gensets.length)
            return gensets;
        const stationary = all.filter((g) => STATIONARY_GROUP_RE.test(g.nm) && !MACHINERY_GROUP_RE.test(g.nm));
        return stationary.length ? stationary : all.filter((g) => STATIONARY_GROUP_RE.test(g.nm));
    }
    if (opts?.assetCategory === 'machinery') {
        const machinery = all.filter((g) => MACHINERY_GROUP_RE.test(g.nm));
        if (machinery.length)
            return machinery;
        // Prefer non-genset stationary groups; never fall back to the whole account (mixes vehicles).
        const stationary = all.filter((g) => STATIONARY_GROUP_RE.test(g.nm) && !GENSET_GROUP_RE.test(g.nm));
        return stationary.length ? stationary : [];
    }
    if (opts?.assetCategory === 'vehicle') {
        const fleet = all.filter((g) => FLEET_GROUP_RE.test(g.nm));
        // Prefer non-genset groups when both exist
        const nonGenset = fleet.filter((g) => !STATIONARY_GROUP_RE.test(g.nm));
        if (nonGenset.length)
            return nonGenset;
        if (fleet.length)
            return fleet;
        const withoutStationary = all.filter((g) => !STATIONARY_GROUP_RE.test(g.nm));
        return withoutStationary.length ? withoutStationary : all;
    }
    const fleet = all.filter((g) => FLEET_GROUP_RE.test(g.nm) && !STATIONARY_GROUP_RE.test(g.nm));
    if (fleet.length)
        return fleet;
    const stationary = all.filter((g) => STATIONARY_GROUP_RE.test(g.nm));
    if (stationary.length)
        return stationary;
    return all;
}
export async function listAllUnits(client, scope, maxUnits = 500) {
    return WialonReportResolverService.listUnits(client, scope, maxUnits);
}
export function fuelScopeKey(scope) {
    return wialonReportScopeKey(scope);
}
