/** Wialon fuel calcTypes and fuelLevelParams flag decoders (Remote API). */
export const CALC_TYPE_FLAGS = [
    { bit: 0x01, label: 'Mathematical' },
    { bit: 0x02, label: 'Fuel level sensors' },
    { bit: 0x04, label: 'Replace invalid with math' },
    { bit: 0x08, label: 'Absolute fuel sensors' },
    { bit: 0x10, label: 'Impulse sensors' },
    { bit: 0x20, label: 'Instant sensors' },
    { bit: 0x40, label: 'Consumption by rates' },
];
export const FUEL_LEVEL_PARAM_FLAGS = [
    { bit: 0x01, label: 'Merge same-name FLS sensors' },
    { bit: 0x02, label: 'Filter FLS values' },
    { bit: 0x04, label: 'Merge same-name consumption sensors' },
    { bit: 0x08, label: 'Detect fillings only while stopped' },
    { bit: 0x10, label: 'Time-based consumption' },
    { bit: 0x40, label: 'Ignore filtration for filling volume' },
    { bit: 0x80, label: 'Ignore filtration for theft volume' },
    { bit: 0x100, label: 'Detect theft in motion' },
];
export function decodeBitFlags(value, defs) {
    if (value == null || !Number.isFinite(value))
        return [];
    return defs.filter((d) => (value & d.bit) !== 0).map((d) => d.label);
}
export function normalizeFuelLevelParams(raw) {
    if (!raw)
        return {};
    return {
        flags: raw.flags != null ? Number(raw.flags) : undefined,
        ignoreStayTimeout: raw.ignoreStayTimeout != null ? Number(raw.ignoreStayTimeout) : Number(raw.ignore_stay_timeout) || undefined,
        minFillingVolume: raw.minFillingVolume != null ? Number(raw.minFillingVolume) : Number(raw.min_filling_volume) || undefined,
        minTheftTimeout: raw.minTheftTimeout != null ? Number(raw.minTheftTimeout) : Number(raw.min_theft_timeout) || undefined,
        minTheftVolume: raw.minTheftVolume != null ? Number(raw.minTheftVolume) : Number(raw.min_theft_volume) || undefined,
        filterQuality: raw.filterQuality != null ? Number(raw.filterQuality) : Number(raw.filter_quality) || undefined,
        fillingsJoinInterval: raw.fillingsJoinInterval != null ? Number(raw.fillingsJoinInterval) : Number(raw.fillings_join_interval) || undefined,
        theftsJoinInterval: raw.theftsJoinInterval != null ? Number(raw.theftsJoinInterval) : Number(raw.thefts_join_interval) || undefined,
        extraFillingTimeout: raw.extraFillingTimeout != null ? Number(raw.extraFillingTimeout) : Number(raw.extra_filling_timeout) || undefined,
    };
}
