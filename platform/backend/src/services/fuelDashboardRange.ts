import type { FuelAssetCategory } from './wialonAssetCategory.js';

/** Default UI / warm fuel window — last 7 days (Wialon report friendly). */
export function defaultFuelDashboardRange(): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const to = fmt(today);
  const from = fmt(new Date(today.getTime() - 6 * 86400000));
  return { from, to };
}

export type FuelWarmProfile = {
  vehicles: number;
  generators: number;
  machinery: number;
};

/** Categories worth a dedicated background warm (template-specific fetches). */
export function warmCategoriesForProfile(profile: FuelWarmProfile): FuelAssetCategory[] {
  const cats: FuelAssetCategory[] = [];
  if (profile.vehicles > 0) cats.push('vehicle');
  if (profile.generators > 0) cats.push('generator');
  if (profile.machinery > 0) cats.push('machinery');
  return cats;
}
