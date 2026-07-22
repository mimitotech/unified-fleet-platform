import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { calculateSensorValue } from './wialonFuel.js';

/** One live reading from a Wialon unit sensor (sens + prms), with the Wialon label. */
export type WialonUnitSensorReading = {
  sensorId: number;
  name: string;
  type: string;
  param: string;
  rawValue: number;
  value: number;
  unit: string;
  isFuelLevel: boolean;
};

/** @deprecated use WialonUnitSensorReading — kept for callers expecting liters-only fuel rows */
export type FuelSensorReading = {
  sensorId: number;
  name: string;
  param: string;
  liters: number;
  rawValue: number;
};

const EXCLUDE_NAME = /consum|consumption|rate|flow|used|economy|efficiency|mpg|l\/100|km\/l|distance|mileage/i;

/** FLS companion sensors — not fuel volume. */
const NON_FUEL_SENSOR = /battery|temperature|\btemp\b|volt|voltage|pressure|humidity|signal|rssi|gsm|acceler/i;

/**
 * True only for Wialon fuel LEVEL sensors (tank volume).
 * Excludes FLS Battery, FLS Temperature, consumption/rate sensors, etc.
 */
export function isFuelLevelSensor(name?: string, type?: string | number): boolean {
  const n = (name || '').toLowerCase().trim();
  const t = String(type ?? '').toLowerCase().trim();
  if (!n && !t) return false;
  if (EXCLUDE_NAME.test(n)) return false;
  if (NON_FUEL_SENSOR.test(n)) return false;

  if (t.includes('fuel level') || t === 'fuel level') return true;
  if (/^fuel level\b/i.test(n)) return true;
  if (/^fls$/i.test(n)) return true;
  if (/fuel tank|tank level|diesel level|diesel tank|level \(l\)|level\(l\)/i.test(n)) return true;
  if (/\btank\b/i.test(n) && /\b(level|fuel|diesel|lit)/i.test(n)) return true;

  return false;
}

/** Unit has at least one fuel LEVEL sensor (for totals / tank %). */
export function unitHasFuelLevelSensors(sens: Array<{ name: string; type: string }> = []): boolean {
  return sens.some((s) => isFuelLevelSensor(s.name, s.type));
}

/** Unit has any fuel-module-related sensor (fuel level, FLS cluster, tank, etc.). */
export function unitHasFuelModuleSensors(sens: Array<{ name: string; type: string }> = []): boolean {
  return sens.some((s) => {
    const n = (s.name || '').toLowerCase();
    const t = String(s.type ?? '').toLowerCase();
    return /fuel|fls|tank|diesel|lls/.test(n) || /fuel|fls|tank|lls/.test(t);
  });
}

function parseTbl(tbl: unknown) {
  if (!Array.isArray(tbl)) return [];
  return tbl
    .map((row) => {
      const r = row as { x?: number; a?: number; b?: number };
      if (r.x == null || r.a == null || r.b == null) return null;
      return { x: Number(r.x), a: Number(r.a), b: Number(r.b) };
    })
    .filter((r): r is { x: number; a: number; b: number } => r != null);
}

function defaultUnit(name: string, type: string | number | undefined, isFuel: boolean): string {
  if (isFuel) return 'L';
  const n = name.toLowerCase();
  if (/temperature|\btemp\b/.test(n)) return '°C';
  if (/battery|volt/.test(n)) return 'V';
  return '';
}

function formatSensorValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  return unit ? `${rounded} ${unit}` : String(rounded);
}

/** Read every configured sensor on a Wialon unit — actual Wialon names, calibrated values, units. */
export function readAllUnitSensors(item: WialonSearchItem): WialonUnitSensorReading[] {
  if (!item.sens) return [];
  const seenParams = new Set<string>();
  const readings: WialonUnitSensorReading[] = [];

  for (const [id, sensor] of Object.entries(item.sens)) {
    if (!sensor?.n) continue;

    const param = sensor.p;
    if (!param || seenParams.has(param)) continue;
    seenParams.add(param);

    const raw = item.prms?.[param]?.v;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;

    const typeStr = String(sensor.t ?? '');
    const isFuel = isFuelLevelSensor(sensor.n, sensor.t);
    const value = Math.round(calculateSensorValue(raw, parseTbl(sensor.tbl)) * 10) / 10;
    const unit = (sensor.u || defaultUnit(sensor.n, sensor.t, isFuel)).trim();

    readings.push({
      sensorId: Number(id) || 0,
      name: sensor.n,
      type: typeStr,
      param,
      rawValue: raw,
      value,
      unit,
      isFuelLevel: isFuel,
    });
  }

  return readings;
}

/** Fuel LEVEL sensors only — for tank totals. */
export function readFuelLevelSensors(item: WialonSearchItem): FuelSensorReading[] {
  return readAllUnitSensors(item)
    .filter((r) => r.isFuelLevel)
    .map((r) => ({
      sensorId: r.sensorId,
      name: r.name,
      param: r.param,
      liters: r.value,
      rawValue: r.rawValue,
    }));
}

export function totalLitersFromReadings(readings: FuelSensorReading[] | WialonUnitSensorReading[]): number {
  const fuel = readings.filter((r) =>
    'isFuelLevel' in r ? r.isFuelLevel : true
  ) as Array<{ value?: number; liters?: number }>;
  if (!fuel.length) return 0;
  return Math.round(fuel.reduce((s, r) => s + (r.liters ?? r.value ?? 0), 0) * 10) / 10;
}

const MAIN_TANK_RE = /\bmain\b|primary|tank\s*1|tank\s*a\b/i;
const RESERVE_TANK_RE = /reserve|secondary|aux|backup|tank\s*2|tank\s*b\b/i;

export function splitFuelTankLevels(readings: WialonUnitSensorReading[]): {
  mainLiters: number | null;
  reserveLiters: number | null;
  tankCount: number;
} {
  const levels = readings.filter((r) => r.isFuelLevel);
  if (!levels.length) return { mainLiters: null, reserveLiters: null, tankCount: 0 };

  let main = levels.find((r) => MAIN_TANK_RE.test(r.name));
  let reserve = levels.find((r) => RESERVE_TANK_RE.test(r.name));

  if (!main && levels.length === 1) main = levels[0];
  if (!main && levels.length >= 2) main = levels[0];
  if (!reserve && levels.length >= 2) {
    reserve = levels.find((r) => r !== main) ?? levels[1];
  }

  return {
    mainLiters: main ? main.value : null,
    reserveLiters: reserve ? reserve.value : null,
    tankCount: levels.length,
  };
}

/**
 * Tank capacity (litres) from Wialon calibration max, custom fields, or unit props.
 * Sums multi-tank calibration maxima when several fuel-level sensors exist.
 */
export function tankCapacityFromItem(item: WialonSearchItem): number | undefined {
  let maxCap = 0;
  if (item.sens) {
    for (const sensor of Object.values(item.sens)) {
      if (!sensor?.n || !isFuelLevelSensor(sensor.n, sensor.t)) continue;
      const tbl = parseTbl(sensor.tbl);
      if (!tbl.length) continue;
      const cap = Math.max(...tbl.map((e) => e.a * e.x + e.b));
      if (cap > 0) maxCap += cap;
    }
  }
  if (maxCap > 0) return Math.round(maxCap * 10) / 10;

  const fldCap = item.flds
    ? Object.values(item.flds).find((f) =>
        /tank[_\s-]?capacity|fuel[_\s-]?tank|capacity/i.test(f?.n || ''),
      )
    : undefined;
  if (fldCap?.v) {
    const n = parseFloat(String(fldCap.v).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10) / 10;
  }

  const prp = item.prp || {};
  for (const key of ['tank_capacity', 'fuel_tank_capacity', 'tankCapacity', 'fuel_capacity']) {
    const raw = prp[key];
    if (!raw) continue;
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10) / 10;
  }

  return undefined;
}

export function formatSensorSummary(readings: WialonUnitSensorReading[]): string {
  if (!readings.length) return '';
  return readings.map((r) => `${r.name}: ${formatSensorValue(r.value, r.unit)}`).join(' · ');
}

export function formatFuelSensorSummary(readings: FuelSensorReading[]): string {
  if (!readings.length) return '';
  return readings.map((r) => `${r.name}: ${r.liters} L`).join(' · ');
}
