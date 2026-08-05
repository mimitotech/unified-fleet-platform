/** Case-insensitive unit name lookup for Wialon group report rows. */
export function normalizeUnitName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '');
}
export function buildUnitNameIndex(units) {
    const exact = new Map();
    const normalized = new Map();
    for (const u of units) {
        exact.set(u.nm, u.id);
        normalized.set(normalizeUnitName(u.nm), u.id);
    }
    return {
        resolve(name) {
            const trimmed = name.trim();
            if (!trimmed)
                return 0;
            return exact.get(trimmed) ?? normalized.get(normalizeUnitName(trimmed)) ?? 0;
        },
    };
}
export function patchTransactionUnitIds(rows, index) {
    for (const row of rows) {
        if (row.unitId > 0)
            continue;
        const id = index.resolve(row.unitName);
        if (id > 0)
            row.unitId = id;
    }
    return rows;
}
