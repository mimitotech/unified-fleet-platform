/** Convert snake_case DB row keys to camelCase for API responses. */
export function toCamelCase(row) {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        out[camel] = value;
    }
    return out;
}
export function toCamelRows(rows) {
    return rows.map((r) => toCamelCase(r));
}
