import {
  findLocationFromCells,
  getCellNumber,
  getCellTimestamp,
  getCellValue,
  getDurationSeconds,
  parseDurationToSeconds,
  txId,
} from './cells.js';
import { applySectionMetrics } from './metrics.js';
import type { FuelSection, FuelTank, FuelTransaction, TankColumnMap, WialonCell } from './types.js';

function resolveTimestamp(timeStr: string, cells: WialonCell[], timeIdx: number, reportFromTs: number): number {
  let timestamp = getCellTimestamp(cells, timeIdx);
  if (timestamp === 0) {
    try {
      timestamp = Math.floor(new Date(timeStr).getTime() / 1000);
      if (Number.isNaN(timestamp)) timestamp = 0;
    } catch {
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

function isEmptyRow(
  section: FuelSection,
  m: {
    fuelUsed: number;
    filled: number;
    suddenFuelDrop: number;
    initialLevel: number;
    finalLevel: number;
    mileage: number;
    durationSeconds: number;
  }
): boolean {
  if (section === 'consumption') {
    const levelDelta =
      m.initialLevel > 0 && m.finalLevel >= 0 && m.initialLevel > m.finalLevel
        ? m.initialLevel - m.finalLevel
        : 0;
    return (
      m.fuelUsed === 0 &&
      levelDelta === 0 &&
      m.mileage === 0 &&
      m.durationSeconds === 0
    );
  }
  if (section === 'filling') {
    return m.filled === 0 && m.initialLevel === 0 && m.finalLevel === 0;
  }
  return m.suddenFuelDrop === 0 && m.initialLevel === 0 && m.finalLevel === 0;
}

export function processAggregateStatsRow(
  cells: WialonCell[],
  columnMap: Record<string, number>,
  unit: { id: number; nm: string },
  reportToTs: number
): FuelTransaction | null {
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

  if (isEmptyRow('consumption', metrics)) return null;

  const timestamp = reportToTs > 0 ? reportToTs : Math.floor(Date.now() / 1000);
  return {
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
  };
}

export function processRow(
  cells: WialonCell[],
  columnMap: Record<string, number>,
  section: FuelSection,
  tank: FuelTank,
  unit: { id: number; nm: string },
  reportFromTs: number
): FuelTransaction | null {
  const timeStr = getCellValue(cells, columnMap.time ?? -1);
  if (!timeStr) return null;

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

  switch (section) {
    case 'consumption':
      fuelUsed = getCellNumber(cells, columnMap.fuelUsed ?? -1);
      mileage = getCellNumber(cells, columnMap.mileage ?? -1);
      durationStr = getCellValue(cells, columnMap.duration ?? -1);
      durationSeconds = getDurationSeconds(cells, columnMap.duration ?? -1);
      avgConsumption = getCellNumber(cells, columnMap.avgConsumption ?? -1);
      break;
    case 'filling':
      filled = getCellNumber(cells, columnMap.filled ?? -1);
      break;
    case 'theft':
      suddenFuelDrop = getCellNumber(cells, columnMap.suddenFuelDrop ?? -1);
      count = getCellNumber(cells, columnMap.count ?? -1);
      break;
  }

  const metrics = applySectionMetrics(section, {
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

  if (isEmptyRow(section, metrics)) return null;

  const timestamp = resolveTimestamp(timeStr, cells, columnMap.time ?? -1, reportFromTs);
  return {
    id: txId(unit.id, section, tank, timestamp, sensor),
    unitId: unit.id,
    unitName: unit.nm,
    section,
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
    count,
    latitude: locationData.lat || undefined,
    longitude: locationData.lng || undefined,
  };
}

export function processRowWithTankMap(
  cells: WialonCell[],
  columnMap: Record<string, number>,
  tankMap: TankColumnMap,
  section: FuelSection,
  unit: { id: number; nm: string },
  reportFromTs: number
): FuelTransaction | null {
  const timeStr = getCellValue(cells, columnMap.time ?? -1);
  if (!timeStr) return null;

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

  const metrics = applySectionMetrics(section, {
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

  if (
    section === 'consumption' &&
    metrics.fuelUsed === 0 &&
    initialLevel === 0 &&
    finalLevel === 0 &&
    mileage === 0 &&
    durationSeconds === 0
  ) {
    return null;
  }

  const timestamp = resolveTimestamp(timeStr, cells, columnMap.time ?? -1, reportFromTs);
  return {
    id: txId(unit.id, section, tank, timestamp, sensor),
    unitId: unit.id,
    unitName: unit.nm,
    section,
    tank,
    timestamp,
    time: timeStr,
    location: locationData.location,
    initialLevel,
    finalLevel,
    filled: 0,
    sensor,
    fuelUsed,
    mileage,
    duration: durationStr,
    durationSeconds,
    avgConsumption,
    suddenFuelDrop: 0,
    count: 0,
    latitude: locationData.lat || undefined,
    longitude: locationData.lng || undefined,
  };
}
