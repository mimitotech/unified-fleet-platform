export function normalizePlate(plate) {
    if (!plate)
        return '';
    return plate.toUpperCase().replace(/[\s\-]+/g, '');
}
export function deduplicateAssets(assets) {
    const map = new Map();
    for (const asset of assets) {
        const src = asset.sources?.[0] || (asset.source ? { type: asset.source, id: asset.id } : null);
        if (!src)
            continue;
        // Only merge across systems when VIN or plate match intentionally.
        // Otherwise each external device stays a separate unified asset.
        const plate = normalizePlate(asset.registrationPlate);
        const vin = (asset.vin || '').toUpperCase();
        const key = vin ? `vin:${vin}` : plate ? `plate:${plate}` : `${src.type}:${src.id}`;
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
        }
        else {
            const existing = map.get(key);
            if (!existing.sources.find((s) => s.type === src.type && s.id === src.id)) {
                existing.sources.push(src);
            }
        }
    }
    return Array.from(map.values());
}
