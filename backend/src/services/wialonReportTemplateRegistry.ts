/**
 * Wialon report template patterns by MAMS module.
 * Templates live on avl_resource objects scoped to a billing account.
 *
 * Fuel module canonical reports (uniform across tenants):
 *   Vehicles:   Fuel Report(Group)  ·  Fuel Report(Unit)
 *   Generators: Fuel Usage Report(Gensets)  ·  Fuel Usage Report(Units)
 * Tenants missing these should create them in Wialon with these exact names.
 */

export type WialonReportModule =
  | 'fuel'
  | 'engineHours'
  | 'trips'
  | 'geofence'
  | 'driver'
  | 'events'
  | 'emissions';

export type FuelReportFamily = 'vehicle' | 'generator';

export type ReportTemplatePattern = {
  /** Lowercase substring patterns matched against template name */
  patterns: readonly string[];
  module: WialonReportModule;
  /** Group report runs against avl_unit_group; unit report against avl_unit */
  isGroupReport?: boolean;
  /** Fuel family this slot belongs to (vehicles vs gensets) */
  fuelFamily?: FuelReportFamily;
  /** Canonical exact display name we expect tenants to create */
  canonicalName?: string;
  /** Secondary match when primary module templates are absent */
  fallback?: boolean;
};

/** Exact preferred names — also used by capability UI and onboarding hints. */
export const CANONICAL_FUEL_REPORTS = {
  vehicle: {
    group: 'Fuel Report(Group)',
    unit: 'Fuel Report(Unit)',
  },
  generator: {
    group: 'Fuel Usage Report(Gensets)',
    unit: 'Fuel Usage Report(Units)',
  },
} as const;

/** Ordered — first match wins per pattern slot */
export const REPORT_TEMPLATE_PATTERNS: ReportTemplatePattern[] = [
  // ── Fuel · Vehicles (canonical) ──────────────────────────────────────────
  {
    module: 'fuel',
    fuelFamily: 'vehicle',
    isGroupReport: true,
    canonicalName: CANONICAL_FUEL_REPORTS.vehicle.group,
    patterns: ['fuel report(group)', 'fuel report (group)'],
  },
  {
    module: 'fuel',
    fuelFamily: 'vehicle',
    isGroupReport: false,
    canonicalName: CANONICAL_FUEL_REPORTS.vehicle.unit,
    patterns: ['fuel report(unit)', 'fuel report (unit)'],
  },

  // ── Fuel · Generators (canonical) ────────────────────────────────────────
  // Gensets report is a GROUP report (runs on generator unit groups).
  {
    module: 'fuel',
    fuelFamily: 'generator',
    isGroupReport: true,
    canonicalName: CANONICAL_FUEL_REPORTS.generator.group,
    patterns: [
      'fuel usage report(gensets)',
      'fuel usage report (gensets)',
      'fuel usage report(genset)',
      'fuel usage report (genset)',
    ],
  },
  {
    module: 'fuel',
    fuelFamily: 'generator',
    isGroupReport: false,
    canonicalName: CANONICAL_FUEL_REPORTS.generator.unit,
    patterns: [
      'fuel usage report(units)',
      'fuel usage report (units)',
      'fuel usage report(unit)',
      'fuel usage report (unit)',
    ],
  },

  // ── Fuel · Legacy aliases (keep working while tenants rename) ────────────
  {
    module: 'fuel',
    fuelFamily: 'vehicle',
    isGroupReport: true,
    fallback: true,
    patterns: ['fuel fillings report(group)', 'fuel fillings report (group)'],
  },
  {
    module: 'fuel',
    fuelFamily: 'generator',
    isGroupReport: true,
    fallback: true,
    patterns: [
      'fuel fillings report(gensets)',
      'fuel fillings report (gensets)',
      'fuel fillings report(genset)',
    ],
  },
  {
    module: 'fuel',
    fuelFamily: 'generator',
    isGroupReport: false,
    fallback: true,
    patterns: [
      'fuel fillings report(units)',
      'fuel fillings report (units)',
      'fuel fillings report(genset units)',
    ],
  },

  // Engine hours (generators / stationary)
  {
    module: 'engineHours',
    isGroupReport: true,
    patterns: ['engine hours report(group)', 'engine hours report (group)'],
  },
  {
    module: 'engineHours',
    isGroupReport: false,
    patterns: ['engine hours report', 'engine hour report'],
  },
  {
    module: 'engineHours',
    isGroupReport: true,
    fallback: true,
    patterns: ['fuel report(group)', 'fuel report (group)'],
  },
  // Trips — reserved for Phase 3+
  {
    module: 'trips',
    isGroupReport: false,
    patterns: ['list of trips', 'trips'],
  },
  {
    module: 'trips',
    isGroupReport: true,
    patterns: ['grouped trips'],
  },
  // Geofence visits
  {
    module: 'geofence',
    isGroupReport: false,
    patterns: ['geofence', 'geozone', 'zone visits'],
  },
  // Driver performance
  {
    module: 'driver',
    isGroupReport: false,
    patterns: ['driver', 'drivers'],
  },
  // Events / safety (eco-driving, violations)
  {
    module: 'events',
    isGroupReport: false,
    patterns: ['eco driving', 'violations', 'events'],
  },
  // Emissions / consumption summaries
  {
    module: 'emissions',
    isGroupReport: true,
    patterns: ['fuel consumption', 'consumption'],
  },
];

export function patternsForModule(
  module: WialonReportModule,
  opts?: { includeFallback?: boolean },
): ReportTemplatePattern[] {
  const includeFallback = opts?.includeFallback ?? true;
  return REPORT_TEMPLATE_PATTERNS.filter(
    (p) => p.module === module && (includeFallback || !p.fallback),
  );
}
