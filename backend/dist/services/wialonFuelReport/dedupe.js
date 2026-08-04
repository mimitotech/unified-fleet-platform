function round1(n) {
    return Math.round(n * 10) / 10;
}
/** Content fingerprint for near-identical Wialon fuel rows (overlapping groups / top+leaf). */
function contentKey(row) {
    return [
        row.unitId,
        row.section,
        row.tank ?? 'main',
        row.timestamp,
        round1(row.filled || 0),
        round1(row.fuelUsed || 0),
        round1(row.suddenFuelDrop || 0),
        round1(row.initialLevel || 0),
        round1(row.finalLevel || 0),
    ].join('|');
}
function preferRow(a, b) {
    const aSummary = a.sensor === 'wialon_group_summary' || a.sensor?.startsWith('wialon_group_summary');
    const bSummary = b.sensor === 'wialon_group_summary' || b.sensor?.startsWith('wialon_group_summary');
    // Prefer real event (leaf) over an identical group-summary clone for expand/alerts.
    if (aSummary && !bSummary)
        return b;
    if (bSummary && !aSummary)
        return a;
    return a;
}
/** Merge duplicate fuel rows from overlapping Wialon groups or report passes. */
export function dedupeFuelTransactions(rows) {
    const byId = new Map();
    for (const row of rows) {
        const existing = byId.get(row.id);
        if (!existing) {
            byId.set(row.id, row);
            continue;
        }
        if (row.section === 'consumption' && row.sensor === 'wialon_group_summary') {
            byId.set(row.id, row);
        }
    }
    // Second pass: collapse content-identical rows (summary + orphan-top leaf, multi-group).
    const byContent = new Map();
    for (const row of byId.values()) {
        const key = contentKey(row);
        const existing = byContent.get(key);
        if (!existing) {
            byContent.set(key, row);
            continue;
        }
        byContent.set(key, preferRow(existing, row));
    }
    return [...byContent.values()];
}
