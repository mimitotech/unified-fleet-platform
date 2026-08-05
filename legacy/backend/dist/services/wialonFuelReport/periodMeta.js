/** Encode/decode Wialon report period on group-summary rows (no extra DB columns). */
const PERIOD_RE = /^__period:(\d+):(\d+)$/;
export function encodePeriodLocation(periodFromTs, periodToTs, location = '') {
    if (periodFromTs && periodToTs && periodFromTs > 0 && periodToTs > 0) {
        return `__period:${periodFromTs}:${periodToTs}`;
    }
    return location || '';
}
export function decodePeriodLocation(location) {
    const raw = String(location ?? '');
    const m = PERIOD_RE.exec(raw);
    if (!m)
        return { location: raw };
    return {
        location: '',
        periodFromTs: Number(m[1]),
        periodToTs: Number(m[2]),
    };
}
