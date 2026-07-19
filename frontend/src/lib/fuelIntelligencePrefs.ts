import { getTenantSlug } from '@/lib/api';

export type FuelAnomalyThresholds = {
  /** Flag when loss/theft ÷ filled exceeds this (e.g. 0.15 = 15%). */
  theftRatio: number;
  /** Flag when consumed liters per runtime hour exceed this. */
  runtimeLitersPerHour: number;
  /** Flag when L/100km exceeds this (vehicles). */
  avgLitersPer100km: number;
};

export type FuelViewPresetId = 'all' | 'theft_watch' | 'generator_runtime' | 'fleet_efficiency';

export type FuelViewPreset = {
  id: FuelViewPresetId;
  label: string;
  description: string;
  /** Preferred sort for the performance table. */
  sortBy: 'consumed' | 'runtime' | 'efficiency' | 'avg';
  /** Optional category filter when parent tab allows. */
  preferCategory?: 'vehicle' | 'generator' | 'machinery';
  periodMode?: 'daily' | 'weekly' | 'monthly';
};

export const DEFAULT_THRESHOLDS: FuelAnomalyThresholds = {
  theftRatio: 0.15,
  runtimeLitersPerHour: 10,
  avgLitersPer100km: 35,
};

export const FUEL_VIEW_PRESETS: FuelViewPreset[] = [
  {
    id: 'all',
    label: 'All insights',
    description: 'Full intelligence view with no preset focus.',
    sortBy: 'consumed',
    periodMode: 'daily',
  },
  {
    id: 'theft_watch',
    label: 'Theft Watch',
    description: 'Prioritize loss/theft ratios and drain risk.',
    sortBy: 'efficiency',
    periodMode: 'daily',
  },
  {
    id: 'generator_runtime',
    label: 'Generator Runtime',
    description: 'Focus on runtime hours and L/h efficiency.',
    sortBy: 'runtime',
    preferCategory: 'generator',
    periodMode: 'weekly',
  },
  {
    id: 'fleet_efficiency',
    label: 'Fleet Efficiency',
    description: 'Rank by L/100km and efficiency score.',
    sortBy: 'avg',
    preferCategory: 'vehicle',
    periodMode: 'weekly',
  },
];

function storageKey(suffix: string): string {
  const slug = getTenantSlug() || 'default';
  return `mams_fuel_intel_${suffix}_${slug}`;
}

export function loadAnomalyThresholds(): FuelAnomalyThresholds {
  try {
    const raw = localStorage.getItem(storageKey('thresholds'));
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    const parsed = JSON.parse(raw) as Partial<FuelAnomalyThresholds>;
    return {
      theftRatio:
        typeof parsed.theftRatio === 'number' && parsed.theftRatio >= 0
          ? parsed.theftRatio
          : DEFAULT_THRESHOLDS.theftRatio,
      runtimeLitersPerHour:
        typeof parsed.runtimeLitersPerHour === 'number' && parsed.runtimeLitersPerHour >= 0
          ? parsed.runtimeLitersPerHour
          : DEFAULT_THRESHOLDS.runtimeLitersPerHour,
      avgLitersPer100km:
        typeof parsed.avgLitersPer100km === 'number' && parsed.avgLitersPer100km >= 0
          ? parsed.avgLitersPer100km
          : DEFAULT_THRESHOLDS.avgLitersPer100km,
    };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function saveAnomalyThresholds(next: FuelAnomalyThresholds): void {
  try {
    localStorage.setItem(storageKey('thresholds'), JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadActivePresetId(): FuelViewPresetId {
  try {
    const v = localStorage.getItem(storageKey('preset')) as FuelViewPresetId | null;
    if (v && FUEL_VIEW_PRESETS.some((p) => p.id === v)) return v;
  } catch {
    /* ignore */
  }
  return 'all';
}

export function saveActivePresetId(id: FuelViewPresetId): void {
  try {
    localStorage.setItem(storageKey('preset'), id);
  } catch {
    /* ignore */
  }
}

export function classifyAnomaly(
  metrics: { theftRatio: number; runtimeEfficiency: number; avgConsumption: number },
  thresholds: FuelAnomalyThresholds,
): { flagged: boolean; reason: string; action: string; severityScore: number } {
  const { theftRatio, runtimeEfficiency, avgConsumption } = metrics;
  const severityScore =
    runtimeEfficiency * 0.7 + theftRatio * 100 * 0.3 + Math.max(0, avgConsumption - thresholds.avgLitersPer100km) * 0.1;

  if (theftRatio > thresholds.theftRatio) {
    return {
      flagged: true,
      reason: `High loss ratio (${(theftRatio * 100).toFixed(1)}%) vs filled fuel (threshold ${(thresholds.theftRatio * 100).toFixed(0)}%).`,
      action: 'Audit drain events and verify fuel security.',
      severityScore,
    };
  }
  if (runtimeEfficiency > thresholds.runtimeLitersPerHour) {
    return {
      flagged: true,
      reason: `High consumption per runtime hour (${runtimeEfficiency.toFixed(2)} L/h; threshold ${thresholds.runtimeLitersPerHour}).`,
      action: 'Check idling/load profile and engine tuning.',
      severityScore,
    };
  }
  if (avgConsumption > thresholds.avgLitersPer100km) {
    return {
      flagged: true,
      reason: `High liters per 100km (${avgConsumption.toFixed(1)}; threshold ${thresholds.avgLitersPer100km}).`,
      action: 'Inspect route, tire pressure, and driving behavior.',
      severityScore,
    };
  }
  return {
    flagged: false,
    reason: 'Within configured thresholds.',
    action: 'Continue monitoring.',
    severityScore,
  };
}
