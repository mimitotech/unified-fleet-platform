const cache = new Map();
/** Cached hardware type names from Wialon `core/get_hw_types`. */
export async function loadWialonHwTypes(client, cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit)
        return hit;
    const result = await client.request('core/get_hw_types', { filterType: '', filterName: '', filterUid: '', flags: 1 });
    const map = new Map();
    for (const t of result.types || []) {
        map.set(t.id, { id: t.id, name: t.name, uid: t.uid });
    }
    cache.set(cacheKey, map);
    return map;
}
export function resolveHwName(hwTypes, hwId) {
    if (hwId == null)
        return undefined;
    return hwTypes.get(hwId)?.name;
}
