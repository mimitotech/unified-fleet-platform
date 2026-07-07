import type { WialonClient } from '../adapters/wialonClient.js';

export type WialonHwType = { id: number; name: string; uid?: string };

const cache = new Map<string, Map<number, WialonHwType>>();

/** Cached hardware type names from Wialon `core/get_hw_types`. */
export async function loadWialonHwTypes(client: WialonClient, cacheKey: string): Promise<Map<number, WialonHwType>> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const result = await client.request<{ types?: Array<{ id: number; name: string; uid?: string }> }>(
    'core/get_hw_types',
    { filterType: '', filterName: '', filterUid: '', flags: 1 }
  );

  const map = new Map<number, WialonHwType>();
  for (const t of result.types || []) {
    map.set(t.id, { id: t.id, name: t.name, uid: t.uid });
  }
  cache.set(cacheKey, map);
  return map;
}

export function resolveHwName(hwTypes: Map<number, WialonHwType>, hwId?: number): string | undefined {
  if (hwId == null) return undefined;
  return hwTypes.get(hwId)?.name;
}
