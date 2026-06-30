import type { UnifiedAsset } from '@ufp/shared';
import type { SourceType } from '@ufp/shared';

export function normalizePlate(plate?: string): string {
  if (!plate) return '';
  return plate.toUpperCase().replace(/[\s\-]+/g, '');
}

export function deduplicateAssets(
  assets: Array<UnifiedAsset & { source?: SourceType }>
): UnifiedAsset[] {
  const map = new Map<string, UnifiedAsset>();

  for (const asset of assets) {
    const key =
      normalizePlate(asset.registrationPlate) ||
      (asset.vin || '').toUpperCase() ||
      `${asset.name}-${asset.sources?.[0]?.id || asset.id}`;

    const src = asset.sources?.[0] || (asset.source ? { type: asset.source, id: asset.id } : null);
    if (!src) continue;

    if (!map.has(key)) {
      map.set(key, {
        id: asset.id,
        name: asset.name,
        registrationPlate: asset.registrationPlate,
        vin: asset.vin,
        make: asset.make,
        model: asset.model,
        year: asset.year,
        tenantId: asset.tenantId,
        sources: [src],
      });
    } else {
      const existing = map.get(key)!;
      if (!existing.sources.find((s) => s.type === src.type && s.id === src.id)) {
        existing.sources.push(src);
      }
    }
  }

  return Array.from(map.values());
}
