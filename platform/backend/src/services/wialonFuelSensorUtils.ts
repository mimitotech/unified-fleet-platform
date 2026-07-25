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

/** Wialon sensor type keys (API language is English regardless of UI labels). */
const FUEL_LEVEL_TYPE_RE = /fuel\s*level/i;

/**
 * True only for Wialon fuel LEVEL sensors (tank volume).
 * Prefers the Wialon type key (language-stable), then name heuristics.
 * Excludes FLS Battery, FLS Temperature, consumption/rate sensors, etc.
 * Custom display names never invent a reading — they only help match sensors.
 */
export function isFuelLevelSensor(name?: string, type?: string | number): boolean {
  const n = (name || '').toLowerCase().trim();
  const t = String(type ?? '').toLowerCase().trim();
  if (!n && !t) return false;
  if (EXCLUDE_NAME.test(n)) return false;
  if (NON_FUEL_SENSOR.test(n)) return false;

  // Canonical Wialon type first — works for every client locale.
  if (FUEL_LEVEL_TYPE_RE.test(t)) return true;

  if (/^fuel level\b/i.test(n)) return true;
  if (/^(?:fls|lls)\d*$/i.test(n)) return true;
  if (/fuel tank|tank level|diesel level|diesel tank|bowser level|level \(l\)|level\(l\)/i.test(n)) {
    return true;
  }
  if (/\btank\b/i.test(n) && /\b(level|fuel|diesel|lit)/i.test(n)) return true;
  // Multilingual level labels only when the unit looks like volume.
  if (/\b(?:nivel|niveau|nível|füllstand)\b/i.test(n) && /\b(?:combustible|carburant|diesel|tanque|tank|fuel)\b/i.test(n)) {
    return true;
  }

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
 * Match capacity fields by meaning, not one English spelling.
 * Covers Wialon custom fields (flds), profile fields (pflds), and property keys (prp).
 * Does NOT match cargo profile keys — those are excluded below.
 */
const CAPACITY_NAME_RE =
  /tank[_\s-]?cap(?:acity)?|fuel[_\s-]?(?:tank[_\s-]?)?cap(?:acity)?|(?:tank|fuel|diesel|bowser|fls)[_\s-]?(?:size|vol(?:ume)?|max|full|capacity)|(?:capacity|volume|size|vol|max|full)\b.*\b(?:tank|fuel|diesel|bowser|fls)|(?:capacidad|capacidade|capacit[eé]|volumen|ёмкост\w*|tankvolumen|tankgröße)\b.*\b(?:tanque|tank|fuel|combustible|carburant|diesel|réservoir|deposito)|(?:tanque|tank|combustible|carburant)\b.*\b(?:capacidad|capacidade|capacit[eé]|volumen|ёмкост\w*)|^\s*(?:capacity|volume|tank\s*size|fuel\s*capacity|full\s*tank|capacidad|capacidade)\s*$/i;

/** Wialon cargo / body profile fields — never treat as fuel tank capacity. */
const CAPACITY_NAME_EXCLUDE =
  /carrying_capacity|effective_capacity|gross_vehicle_weight|engine_displacement|\bcargo\b|\bpayload\b/i;

function parsePositiveLitres(raw: unknown): number | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 10) / 10;
}

function calibrationMaxLitres(tbl: unknown): number | undefined {
  const rows = parseTbl(tbl);
  if (!rows.length) return undefined;
  const cap = Math.max(...rows.map((e) => e.a * e.x + e.b));
  return cap > 0 ? cap : undefined;
}

/**
 * Which physical tank a capacity field refers to, so multi-tank declarations
 * ("MAIN TANK CAPACITY" + "RESERVE TANK CAPACITY") sum while synonyms for the
 * same tank ("MAIN TANK CAPACITY" + "TANK CAPACITY") do not double-count.
 * Only an explicit reserve/secondary tank is additive.
 */
function capacitySlotKey(name: string): string {
  return RESERVE_TANK_RE.test(name) ? 'reserve' : 'primary';
}

function sumDeclaredCapacity(fields: Array<{ n?: string; v?: unknown }>): number | undefined {
  const bySlot = new Map<string, number>();
  for (const f of fields) {
    const name = f?.n || '';
    if (!name || CAPACITY_NAME_EXCLUDE.test(name)) continue;
    if (!CAPACITY_NAME_RE.test(name)) continue;
    const litres = parsePositiveLitres(f?.v);
    if (litres == null) continue;
    const slot = capacitySlotKey(name);
    bySlot.set(slot, Math.max(bySlot.get(slot) ?? 0, litres));
  }
  if (!bySlot.size) return undefined;
  const total = [...bySlot.values()].reduce((sum, v) => sum + v, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Capacity the operator declared in Wialon (unit custom fields, then profile
 * fields, then unit properties). Each source is checked in isolation so a
 * higher-priority declaration is never mixed with a stale lower-priority one.
 */
function declaredTankCapacity(item: WialonSearchItem): number | undefined {
  const sources: Array<Array<{ n?: string; v?: unknown }>> = [
    item.flds ? Object.values(item.flds) : [],
    item.pflds ? Object.values(item.pflds) : [],
    Object.entries(item.prp || {}).map(([n, v]) => ({ n, v })),
  ];
  for (const source of sources) {
    const capacity = sumDeclaredCapacity(source);
    if (capacity != null) return capacity;
  }
  return undefined;
}

/** Summed calibration maxima of the unit's true fuel-level sensors. */
function calibratedTankCapacity(item: WialonSearchItem): number | undefined {
  if (!item.sens) return undefined;
  let maxCap = 0;
  for (const sensor of Object.values(item.sens)) {
    if (!sensor?.n || !isFuelLevelSensor(sensor.n, sensor.t)) continue;

    const fromTbl = calibrationMaxLitres(sensor.tbl);
    if (fromTbl != null) {
      maxCap += fromTbl;
      continue;
    }

    const sensorCap = parsePositiveLitres(sensor.max) ?? parsePositiveLitres(sensor.c);
    if (sensorCap != null) maxCap += sensorCap;
  }
  return maxCap > 0 ? Math.round(maxCap * 10) / 10 : undefined;
}

/**
 * Tank capacity (litres) exactly as configured in Wialon.
 *
 * The operator's declared capacity wins: an FLS calibration table only spans the
 * range the probe was calibrated over, which is routinely far short of the real
 * tank (a 10,000 L bowser probe calibrated to ~4,400 L would otherwise read full).
 * Calibration is the fallback for units with no declared field.
 */
export function tankCapacityFromItem(item: WialonSearchItem): number | undefined {
  const declared = declaredTankCapacity(item);
  const calibrated = calibratedTankCapacity(item);

  if (declared == null) return calibrated;
  if (calibrated == null) return declared;

  // A probe cannot be calibrated beyond the tank holding it, so a declaration far
  // below the calibration span is mis-scaled (wrong units, or one tank of several).
  return calibrated > declared * 2 ? calibrated : declared;
}

/**
 * Fuel percent from litres, or null when the pair cannot honestly produce one.
 *
 * Never clamps an over-capacity reading down to 100%: litres above the tank mean
 * the value is uncalibrated (raw ADC counts) or the capacity is wrong, and an
 * invented "100%" hides that. Callers show litres only when this returns null.
 */
export function fuelPercentFromLitres(litres: number, capacity: number): number | null {
  if (!(capacity > 0) || !Number.isFinite(litres) || litres < 0) return null;
  if (litres > capacity * 1.1) return null;
  return Math.min(100, Math.round((litres / capacity) * 100));
}

export function formatSensorSummary(readings: WialonUnitSensorReading[]): string {
  if (!readings.length) return '';
  return readings.map((r) => `${r.name}: ${formatSensorValue(r.value, r.unit)}`).join(' · ');
}

export function formatFuelSensorSummary(readings: FuelSensorReading[]): string {
  if (!readings.length) return '';
  return readings.map((r) => `${r.name}: ${r.liters} L`).join(' · ');
}
