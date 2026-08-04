import { findLocationFromCells, getCellNumber, getCellTimeString, getCellTimestamp, getCellValue, getDurationSeconds, txId, } from './cells.js';
import { applySectionMetrics, deriveSuddenFuelDrop } from './metrics.js';
import { isFuelBowserName } from '../wialonAssetCategory.js';
function finalizeTransaction(tx) {
    return reclassLevelRiseAsFill(tx);
}
function resolveTimestamp(timeStr, cells, timeIdx, reportFromTs) {
    let timestamp = getCellTimestamp(cells, timeIdx);
    if (timestamp === 0) {
        try {
            timestamp = Math.floor(new Date(timeStr).getTime() / 1000);
            if (Number.isNaN(timestamp))
                timestamp = 0;
        }
        catch {
            timestamp = 0;
        }
    }
    if (timestamp === 0 && reportFromTs > 0) {
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
            const reportDate = new Date(reportFromTs * 1000);
            reportDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), parseInt(timeMatch[3] || '0', 10), 0);
            timestamp = Math.floor(reportDate.getTime() / 1000);
        }
    }
    return timestamp;
}
function isEmptyRow(section, m) {
    if (section === 'consumption') {
        const levelDelta = m.initialLevel > 0 && m.finalLevel >= 0 && m.initialLevel > m.finalLevel
            ? m.initialLevel - m.finalLevel
            : 0;
        return (m.fuelUsed === 0 &&
            levelDelta === 0);
    }
    if (section === 'filling') {
        const derived = applySectionMetrics('filling', {
            fuelUsed: 0,
            filled: m.filled,
            suddenFuelDrop: 0,
            initialLevel: m.initialLevel,
            finalLevel: m.finalLevel,
            mileage: 0,
            durationSeconds: 0,
        });
        return derived.filled === 0 && m.initialLevel === 0 && m.finalLevel === 0;
    }
    // theft + dispensed use suddenFuelDrop for the volume column
    return m.suddenFuelDrop === 0 && m.initialLevel === 0 && m.finalLevel === 0;
}
/** Bowser "Fuel Dispensed" often arrives as Wialon unit_thefts — reclass by unit name. */
export function resolveFuelSection(section, unitName) {
    if (section === 'theft' && isFuelBowserName(unitName))
        return 'dispensed';
    return section;
}
/**
 * Level-rise rows sometimes land in consumption (fuelUsed = rise).
 * Move them to filling so they show under Filled, not Used.
 */
export function reclassLevelRiseAsFill(row) {
    if (row.section !== 'consumption')
        return row;
    const used = Number(row.fuelUsed) || 0;
    const filled = Number(row.filled) || 0;
    const initial = Number(row.initialLevel) || 0;
    const final = Number(row.finalLevel) || 0;
    if (used <= 0 || filled > 0 || initial <= 0 || final <= initial)
        return row;
    const rise = final - initial;
    if (Math.abs(used - rise) > 1)
        return row;
    return { ...row, section: 'filling', filled: used, fuelUsed: 0 };
}
export function processAggregateStatsRow(cells, columnMap, unit, reportToTs) {
    let fuelUsed = getCellNumber(cells, columnMap.fuelUsed ?? -1);
    let initialLevel = getCellNumber(cells, columnMap.initialLevel ?? -1);
    let finalLevel = getCellNumber(cells, columnMap.finalLevel ?? -1);
    const mileage = getCellNumber(cells, columnMap.mileage ?? -1);
    const durationStr = getCellValue(cells, columnMap.duration ?? -1);
    const durationSeconds = getDurationSeconds(cells, columnMap.duration ?? -1);
    const avgConsumption = getCellNumber(cells, columnMap.avgConsumption ?? -1);
    const metrics = applySectionMetrics('consumption', {
        fuelUsed,
        filled: 0,
        suddenFuelDrop: 0,
        initialLevel,
        finalLevel,
        mileage,
        durationSeconds,
    });
    fuelUsed = metrics.fuelUsed;
    initialLevel = metrics.initialLevel;
    finalLevel = metrics.finalLevel;
    if (isEmptyRow('consumption', metrics))
        return null;
    const timestamp = reportToTs > 0 ? reportToTs : Math.floor(Date.now() / 1000);
    return finalizeTransaction({
        id: txId(unit.id, 'consumption', 'main', timestamp, 'wialon_stats'),
        unitId: unit.id,
        unitName: unit.nm,
        section: 'consumption',
        tank: 'main',
        timestamp,
        time: new Date(timestamp * 1000).toISOString().slice(0, 10),
        location: '',
        initialLevel,
        finalLevel,
        filled: 0,
        sensor: 'wialon_stats',
        fuelUsed,
        mileage,
        duration: durationStr,
        durationSeconds,
        avgConsumption,
        suddenFuelDrop: 0,
        count: 0,
    });
}
function headerIndex(headers, pattern) {
    return headers.findIndex((h) => pattern.test(h.trim()));
}
export function processUnitGroupSummaryRow(cells, columnMap, headers, unit, reportToTs, section = 'consumption', reportFromTs) {
    const unitName = getCellValue(cells, columnMap.unit ?? -1) || unit.nm;
    const beginning = getCellTimeString(cells, columnMap.time ?? -1);
    if (!beginning && !unitName)
        return null;
    // Anchor period summaries to the report interval end so any date-range
    // query covering that interval keeps the Wialon period totals.
    let timestamp = reportToTs > 0 ? reportToTs : 0;
    if (!timestamp) {
        timestamp = getCellTimestamp(cells, columnMap.time ?? -1);
        if (!timestamp && beginning) {
            const parsed = Math.floor(new Date(beginning.replace(' ', 'T') + 'Z').getTime() / 1000);
            if (!Number.isNaN(parsed))
                timestamp = parsed;
        }
    }
    if (!timestamp)
        timestamp = Math.floor(Date.now() / 1000);
    const fuelUsed = getCellNumber(cells, columnMap.fuelUsed ?? -1);
    const mileage = getCellNumber(cells, columnMap.mileage ?? -1);
    const initialLevel = getCellNumber(cells, columnMap.initialLevel ?? -1);
    const finalLevel = getCellNumber(cells, columnMap.finalLevel ?? -1);
    const avgConsumption = getCellNumber(cells, columnMap.avgConsumption ?? -1);
    const durationStr = getCellValue(cells, columnMap.duration ?? -1);
    const durationSeconds = getDurationSeconds(cells, columnMap.duration ?? -1);
    // Prefer explicit filled-amount headers; fall back to mapped filling column if present.
    let filledAmountIdx = headerIndex(headers, /^filled amount$/i);
    if (filledAmountIdx < 0)
        filledAmountIdx = headerIndex(headers, /^filled$/i);
    if (filledAmountIdx < 0)
        filledAmountIdx = headerIndex(headers, /fuel filled|filled volume|filling volume/i);
    const mappedFilled = columnMap.filled != null && columnMap.filled >= 0 ? getCellNumber(cells, columnMap.filled) : 0;
    const periodFilled = filledAmountIdx >= 0 ? getCellNumber(cells, filledAmountIdx) : mappedFilled;
    let suddenFuelDrop = 0;
    const resolvedSection = resolveFuelSection(section, unitName);
    if (resolvedSection === 'theft' || resolvedSection === 'dispensed') {
        suddenFuelDrop =
            columnMap.suddenFuelDrop != null && columnMap.suddenFuelDrop >= 0
                ? getCellNumber(cells, columnMap.suddenFuelDrop)
                : 0;
        if (suddenFuelDrop <= 0) {
            const drainedIdx = headerIndex(headers, resolvedSection === 'dispensed'
                ? /^dispensed$|fuel dispensed|dispensed volume|dispensed amount/i
                : /^drained$|sudden fuel drop|fuel drain|drain/i);
            if (drainedIdx >= 0)
                suddenFuelDrop = getCellNumber(cells, drainedIdx);
        }
        suddenFuelDrop = deriveSuddenFuelDrop(suddenFuelDrop, initialLevel, finalLevel);
    }
    if (fuelUsed <= 0 &&
        mileage <= 0 &&
        initialLevel <= 0 &&
        finalLevel <= 0 &&
        periodFilled <= 0 &&
        suddenFuelDrop <= 0) {
        return null;
    }
    // Skip empty placeholder group rows (----- / Count=0).
    if ((resolvedSection === 'theft' || resolvedSection === 'dispensed') && suddenFuelDrop <= 0) {
        return null;
    }
    const periodFrom = reportFromTs && reportFromTs > 0 ? reportFromTs : timestamp;
    const periodTo = reportToTs > 0 ? reportToTs : timestamp;
    return finalizeTransaction({
        id: txId(unit.id, resolvedSection, 'main', periodTo, `wialon_group_summary:${resolvedSection}:${periodFrom}`),
        unitId: unit.id,
        unitName,
        section: resolvedSection,
        tank: 'main',
        timestamp: periodTo,
        time: beginning,
        location: '',
        initialLevel,
        finalLevel,
        filled: periodFilled,
        sensor: 'wialon_group_summary',
        fuelUsed,
        mileage,
        duration: durationStr,
        durationSeconds,
        avgConsumption,
        suddenFuelDrop,
        count: suddenFuelDrop > 0 ? 1 : 0,
        periodFromTs: periodFrom,
        periodToTs: periodTo,
    });
}
export function processRow(cells, columnMap, section, tank, unit, reportFromTs) {
    const timeStr = getCellTimeString(cells, columnMap.time ?? -1);
    if (!timeStr)
        return null;
    let initialLevel = getCellNumber(cells, columnMap.initialLevel ?? -1);
    let finalLevel = getCellNumber(cells, columnMap.finalLevel ?? -1);
    const sensor = getCellValue(cells, columnMap.sensor ?? -1);
    const locationData = findLocationFromCells(cells, columnMap);
    let filled = 0;
    let fuelUsed = 0;
    let mileage = 0;
    let durationStr = '';
    let durationSeconds = 0;
    let avgConsumption = 0;
    let suddenFuelDrop = 0;
    let count = 0;
    const resolvedSection = resolveFuelSection(section, unit.nm);
    switch (resolvedSection) {
        case 'consumption':
            fuelUsed = getCellNumber(cells, columnMap.fuelUsed ?? -1);
            mileage = getCellNumber(cells, columnMap.mileage ?? -1);
            durationStr = getCellValue(cells, columnMap.duration ?? -1);
            durationSeconds = getDurationSeconds(cells, columnMap.duration ?? -1);
            avgConsumption = getCellNumber(cells, columnMap.avgConsumption ?? -1);
            break;
        case 'filling':
            filled = getCellNumber(cells, columnMap.filled ?? -1);
            count = getCellNumber(cells, columnMap.count ?? -1);
            break;
        case 'theft':
        case 'dispensed':
            suddenFuelDrop = getCellNumber(cells, columnMap.suddenFuelDrop ?? -1);
            count = getCellNumber(cells, columnMap.count ?? -1);
            break;
    }
    const metrics = applySectionMetrics(resolvedSection, {
        fuelUsed,
        filled,
        suddenFuelDrop,
        initialLevel,
        finalLevel,
        mileage,
        durationSeconds,
    });
    fuelUsed = metrics.fuelUsed;
    filled = metrics.filled;
    suddenFuelDrop = metrics.suddenFuelDrop;
    initialLevel = metrics.initialLevel;
    finalLevel = metrics.finalLevel;
    if (isEmptyRow(resolvedSection, metrics))
        return null;
    const timestamp = resolveTimestamp(timeStr, cells, columnMap.time ?? -1, reportFromTs);
    return finalizeTransaction({
        id: txId(unit.id, resolvedSection, tank, timestamp, sensor),
        unitId: unit.id,
        unitName: unit.nm,
        section: resolvedSection,
        tank,
        timestamp,
        time: timeStr,
        location: locationData.location || sensor || '',
        initialLevel,
        finalLevel,
        filled,
        sensor,
        fuelUsed,
        mileage,
        duration: durationStr,
        durationSeconds,
        avgConsumption,
        suddenFuelDrop,
        count,
        latitude: locationData.lat || undefined,
        longitude: locationData.lng || undefined,
    });
}
export function processRowWithTankMap(cells, columnMap, tankMap, section, unit, reportFromTs) {
    const timeStr = getCellTimeString(cells, columnMap.time ?? -1);
    if (!timeStr)
        return null;
    const tank = tankMap.tank;
    let initialLevel = getCellNumber(cells, tankMap.initialLevel);
    let finalLevel = getCellNumber(cells, tankMap.finalLevel);
    let fuelUsed = getCellNumber(cells, tankMap.fuelUsed);
    const avgConsumption = getCellNumber(cells, tankMap.avgConsumption);
    const sensor = getCellValue(cells, columnMap.sensor ?? -1);
    const locationData = findLocationFromCells(cells, columnMap);
    const mileage = getCellNumber(cells, columnMap.mileage ?? -1);
    const durationStr = getCellValue(cells, columnMap.duration ?? -1);
    const durationSeconds = getDurationSeconds(cells, columnMap.duration ?? -1);
    // Dual-tank tables often put fill/theft volume in the tank-scoped column
    // mapped to fuelUsed — route it into the right metric for the section.
    const volumeFromTankCol = fuelUsed;
    const metrics = applySectionMetrics(section, {
        fuelUsed: section === 'consumption' ? volumeFromTankCol : 0,
        filled: section === 'filling' ? volumeFromTankCol : 0,
        suddenFuelDrop: section === 'theft' || section === 'dispensed' ? volumeFromTankCol : 0,
        initialLevel,
        finalLevel,
        mileage,
        durationSeconds,
    });
    fuelUsed = metrics.fuelUsed;
    initialLevel = metrics.initialLevel;
    finalLevel = metrics.finalLevel;
    const filled = metrics.filled;
    const suddenFuelDrop = metrics.suddenFuelDrop;
    if (section === 'consumption' &&
        metrics.fuelUsed === 0 &&
        initialLevel === 0 &&
        finalLevel === 0) {
        return null;
    }
    if (section === 'filling' && filled === 0 && initialLevel === 0 && finalLevel === 0) {
        return null;
    }
    if ((section === 'theft' || section === 'dispensed') &&
        suddenFuelDrop === 0 &&
        initialLevel === 0 &&
        finalLevel === 0) {
        return null;
    }
    const timestamp = resolveTimestamp(timeStr, cells, columnMap.time ?? -1, reportFromTs);
    const resolvedSection = resolveFuelSection(section, unit.nm);
    return finalizeTransaction({
        id: txId(unit.id, resolvedSection, tank, timestamp, sensor),
        unitId: unit.id,
        unitName: unit.nm,
        section: resolvedSection,
        tank,
        timestamp,
        time: timeStr,
        location: locationData.location,
        initialLevel,
        finalLevel,
        filled,
        sensor,
        fuelUsed,
        mileage,
        duration: durationStr,
        durationSeconds,
        avgConsumption,
        suddenFuelDrop,
        count: 0,
        latitude: locationData.lat || undefined,
        longitude: locationData.lng || undefined,
    });
}
