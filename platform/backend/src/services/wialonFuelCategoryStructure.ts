import type { WialonClient } from '../adapters/wialonClient.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import type { FuelGroupMembership } from './wialonFuelAssetGroups.js';
import {
  CANONICAL_FUEL_REPORTS,
  type WialonReportScope,
} from './wialonFuelReport/templates.js';
import { WialonReportResolverService } from './WialonReportResolverService.js';

/**
 * Which Fuel tabs / category syncs this Wialon account actually supports.
 * Driven by report templates + dedicated unit groups — not unit name heuristics.
 */
export type FuelCategorySupport = {
  vehicle: boolean;
  generator: boolean;
  machinery: boolean;
  /** Only vehicle-family reports (e.g. Fuel Report Group/Unit); no genset templates or gen/mach groups. */
  unifiedFleet: boolean;
  reasons: {
    vehicleTemplates: boolean;
    generatorTemplates: boolean;
    generatorGroups: boolean;
    machineryGroups: boolean;
  };
};

function normalizeTemplateName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')');
}

function isTrueGeneratorTemplateName(name: string): boolean {
  const n = normalizeTemplateName(name);
  const group = normalizeTemplateName(CANONICAL_FUEL_REPORTS.generator.group);
  const unit = normalizeTemplateName(CANONICAL_FUEL_REPORTS.generator.unit);
  if (n === group || n === unit) return true;
  // Allow near-canonical genset titles used on some accounts
  return /fuel\s*usage\s*report\s*\(gensets?\)/i.test(name) || /fuel\s*usage\s*report\s*\(units?\)/i.test(name);
}

function isTrueVehicleTemplateName(name: string): boolean {
  const n = normalizeTemplateName(name);
  const group = normalizeTemplateName(CANONICAL_FUEL_REPORTS.vehicle.group);
  const unit = normalizeTemplateName(CANONICAL_FUEL_REPORTS.vehicle.unit);
  if (n === group || n === unit) return true;
  return /fuel\s*report\s*\(group\)/i.test(name) || /fuel\s*report\s*\(units?\)/i.test(name);
}

/** Detect category support from Wialon templates + group membership (cached with fleet build). */
export async function detectFuelCategorySupport(
  client: WialonClient,
  scope: WialonReportScope,
  membership: FuelGroupMembership,
): Promise<FuelCategorySupport> {
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

export function categorySupported(
  support: FuelCategorySupport | null | undefined,
  category: FuelAssetCategory,
): boolean {
  if (!support) return category === 'vehicle';
  return Boolean(support[category]);
}

export function supportedCategoriesList(support: FuelCategorySupport): FuelAssetCategory[] {
  const out: FuelAssetCategory[] = [];
  if (support.vehicle) out.push('vehicle');
  if (support.generator) out.push('generator');
  if (support.machinery) out.push('machinery');
  return out.length ? out : ['vehicle'];
}
