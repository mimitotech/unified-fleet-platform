import type { WialonPrm } from './wialonUnitMapper.js';
import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import {
  readFuelLevelSensors,
  totalLitersFromReadings,
  tankCapacityFromItem,
} from './wialonFuelSensorUtils.js';

export type SensorCalibrationPoint = { x: number; a: number; b: number };

export type WialonLlsReading = {
  sensorId: number;
  name?: string;
  value?: number;
  level?: number;
  filled?: number;
  valueFormatted?: string;
  filledFormatted?: string;
};

export type WialonFuelLevelParams = {
  flags?: number;
  ignoreStayTimeout?: number;
  minFillingVolume?: number;
  minTheftTimeout?: number;
  minTheftVolume?: number;
  filterQuality?: number;
  fillingsJoinInterval?: number;
  theftsJoinInterval?: number;
  extraFillingTimeout?: number;
};

export type WialonFuelSettings = {
  calcTypes?: number;
  calcTypeLabels: string[];
  fuelLevelParams?: WialonFuelLevelParams;
  fuelConsMath?: { idling?: number; urban?: number; suburban?: number };
  fuelConsRates?: {
    consSummer?: number;
    consWinter?: number;
    winterMonthFrom?: number;
    winterDayFrom?: number;
    winterMonthTo?: number;
    winterDayTo?: number;
  };
  fuelConsImpulse?: { maxImpulses?: number; skipZero?: number };
};

export type WialonFuelLive = {
  sensors: WialonLlsReading[];
  levelLiters?: number;
  levelFormatted?: string;
  filled?: number;
  filledFormatted?: string;
};

export type WialonFuelInfo = WialonFuelLive & {
  level?: number;
  tanks: Array<{ name: string; value: string; unit?: string; type?: string; sensorId?: number }>;
  consumption?: { idling?: number; urban?: number; suburban?: number };
  rates?: WialonFuelSettings['fuelConsRates'];
  settings?: WialonFuelSettings;
  minFillingVolume?: number;
  minTheftVolume?: number;
  filterQuality?: number;
};

const FUEL_KEY = /fuel|lls|tank|filling|consum/i;

const CALC_TYPE_BITS: Array<{ bit: number; label: string }> = [
  { bit: 0x01, label: 'Mathematical' },
  { bit: 0x02, label: 'Fuel level sensors' },
  { bit: 0x04, label: 'Replace invalid with math' },
  { bit: 0x08, label: 'Absolute fuel sensors' },
  { bit: 0x10, label: 'Impulse sensors' },
  { bit: 0x20, label: 'Instant sensors' },
  { bit: 0x40, label: 'Consumption by rates' },
];

export function decodeCalcTypes(calcTypes?: number): string[] {
  if (calcTypes == null) return [];
  return CALC_TYPE_BITS.filter((b) => (calcTypes & b.bit) !== 0).map((b) => b.label);
}

function parseCalibrationTable(tbl: unknown): SensorCalibrationPoint[] {
  if (!Array.isArray(tbl)) return [];
  return tbl
    .map((row) => {
      const r = row as { x?: number; a?: number; b?: number };
      if (r.x == null || r.a == null || r.b == null) return null;
      return { x: Number(r.x), a: Number(r.a), b: Number(r.b) };
    })
    .filter((r): r is SensorCalibrationPoint => r != null);
}

/** Piecewise-linear sensor calibration — same as MAMSv2 unitService. */
export function calculateSensorValue(rawValue: number, tbl?: SensorCalibrationPoint[]): number {
  if (!tbl?.length) return rawValue;
  const table = [...tbl].sort((a, b) => a.x - b.x);
  if (rawValue <= table[0].x) return table[0].a * rawValue + table[0].b;
  if (rawValue >= table[table.length - 1].x) {
    const last = table[table.length - 1];
    return last.a * rawValue + last.b;
  }
  for (let i = 0; i < table.length - 1; i++) {
    if (rawValue >= table[i].x && rawValue < table[i + 1].x) {
      return table[i].a * rawValue + table[i].b;
    }
  }
  return rawValue;
}

const FUEL_SENSOR_PATTERNS = ['fuel level', 'fuel', 'fls', 'tank'];

function isFuelSensor(typeLower: string, nameLower: string): boolean {
  return FUEL_SENSOR_PATTERNS.some((p) => typeLower.includes(p) || nameLower.includes(p));
}

/** Per-tank calibrated levels from Wialon search_items sens + prms (MAMS getCombinedFuelLevel). */
export function collectFuelTanksFromItem(
  item: WialonSearchItem
): Array<{ sensorId: number; name: string; level: number }> {
  if (!item.sens) return [];
  const processedParams = new Set<string>();
  const tanks: Array<{ sensorId: number; name: string; level: number }> = [];

  for (const [id, sensor] of Object.entries(item.sens)) {
    if (!sensor?.n) continue;
    const typeLower = String(sensor.t ?? '').toLowerCase();
    const nameLower = sensor.n.toLowerCase();
    if (!isFuelSensor(typeLower, nameLower)) continue;

    const paramName = sensor.p;
    if (!paramName || processedParams.has(paramName)) continue;
    processedParams.add(paramName);

    const raw = item.prms?.[paramName]?.v ?? item.lmsg?.p?.[paramName];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;

    const tbl = parseCalibrationTable(sensor.tbl);
    const level = Math.round(calculateSensorValue(raw, tbl) * 10) / 10;
    if (level > 0) {
      tanks.push({ sensorId: Number(id) || 0, name: sensor.n, level });
    }
  }

  return tanks;
}

export function getCombinedFuelLitersFromItem(item: WialonSearchItem): number {
  const tanks = collectFuelTanksFromItem(item);
  let total = tanks.reduce((sum, t) => sum + t.level, 0);

  if (total === 0) {
    const direct =
      item.prms?.fuel?.v ??
      item.prms?.fuel_level?.v ??
      item.lmsg?.p?.fuel_level ??
      item.lmsg?.p?.fuel;
    if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
      total = direct;
    }
  }

  return Math.round(total * 10) / 10;
}

export function extractTankCapacityFromItem(item: WialonSearchItem): number | undefined {
  if (item.sens) {
    for (const sensor of Object.values(item.sens)) {
      const typeLower = String(sensor?.t ?? '').toLowerCase();
      const nameLower = sensor?.n?.toLowerCase() || '';
      if (!isFuelSensor(typeLower, nameLower)) continue;
      const tbl = parseCalibrationTable(sensor.tbl);
      if (tbl.length) {
        const maxCalibrated = Math.max(...tbl.map((entry) => entry.a * entry.x + entry.b));
        if (maxCalibrated > 0) return Math.round(maxCalibrated * 10) / 10;
      }
    }
  }

  const fldCap = item.flds
    ? Object.values(item.flds).find((f) => /tank|capacity|fuel/i.test(f?.n || ''))
    : undefined;
  if (fldCap?.v) {
    const n = parseFloat(String(fldCap.v));
    if (Number.isFinite(n) && n > 0) return n;
  }

  const prpCap = item.prp?.tank_capacity || item.prp?.fuel_tank_capacity;
  if (prpCap) {
    const n = parseFloat(prpCap);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return undefined;
}

/** Primary live fuel — strict fuel LEVEL sensors from core/search_items. */
export function fuelFromSearchItem(item: WialonSearchItem): {
  live: WialonFuelLive;
  fuelLevelPercent?: number;
} | undefined {
  const sensors = readFuelLevelSensors(item);
  if (!sensors.length) return undefined;

  const totalLiters = totalLitersFromReadings(sensors);
  const capacity = tankCapacityFromItem(item);
  const fuelLevelPercent =
    capacity && capacity > 0 ? Math.min(100, Math.round((totalLiters / capacity) * 100)) : undefined;

  return {
    live: {
      sensors: sensors.map((s) => ({
        sensorId: s.sensorId,
        name: s.name,
        level: s.liters,
        value: s.liters,
        valueFormatted: `${s.liters} L`,
      })),
      levelLiters: totalLiters,
      levelFormatted: `${totalLiters} L`,
    },
    fuelLevelPercent,
  };
}

function parseNumeric(raw: unknown): number | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (n > 0 && n <= 1) return Math.round(n * 100);
  if (n <= 100) return Math.round(n);
  return Math.round(n * 10) / 10;
}

export function parseWialonLlsBlock(lls: unknown): WialonLlsReading[] {
  if (!lls || typeof lls !== 'object') return [];
  const out: WialonLlsReading[] = [];
  for (const [sensorId, raw] of Object.entries(lls as Record<string, unknown>)) {
    const id = Number(sensorId);
    if (!Number.isFinite(id) || !raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const format = d.format as Record<string, string> | undefined;
    out.push({
      sensorId: id,
      value: d.value != null ? Number(d.value) : undefined,
      level: d.level != null ? Number(d.level) : undefined,
      filled: d.filled != null ? Number(d.filled) : undefined,
      valueFormatted: format?.value,
      filledFormatted: format?.filled,
    });
  }
  return out;
}

export function mergeLlsWithSensorNames(
  readings: WialonLlsReading[],
  sensDefs: Array<{ id: number; name: string }> = []
): WialonLlsReading[] {
  const byId = new Map(sensDefs.map((s) => [s.id, s.name]));
  return readings.map((r) => ({ ...r, name: byId.get(r.sensorId) || `Sensor ${r.sensorId}` }));
}

export function fuelLiveFromCalcSensors(
  calcSensors: Array<{ n: string; v: string; u?: string; t?: number }>,
  sensDefs: Array<{ id: number; name: string }> = []
): WialonFuelLive | undefined {
  const fuelSensors = calcSensors.filter(
    (s) => FUEL_KEY.test(s.n) || s.t === 1 || /fuel level|lls/i.test(String(s.t))
  );
  if (!fuelSensors.length) return undefined;

  const readings: WialonLlsReading[] = fuelSensors.map((s, i) => {
    const def = sensDefs.find((d) => d.name === s.n);
    const value = parseNumeric(s.v);
    return {
      sensorId: def?.id ?? i + 1,
      name: s.n,
      value,
      level: value,
      valueFormatted: `${s.v}${s.u ? ` ${s.u}` : ''}`,
    };
  });

  return fuelLiveFromLls(readings, sensDefs);
}

export function hasFuelData(info?: Partial<WialonFuelInfo> | WialonFuelLive): boolean {
  if (!info) return false;
  const fuelInfo = info as Partial<WialonFuelInfo>;
  return Boolean(
    info.levelLiters != null ||
      info.levelFormatted ||
      fuelInfo.level != null ||
      (info.sensors && info.sensors.length > 0) ||
      (fuelInfo.tanks && fuelInfo.tanks.length > 0) ||
      fuelInfo.consumption
  );
}

export function fuelLiveFromLls(
  readings: WialonLlsReading[],
  sensDefs: Array<{ id: number; name: string }> = []
): WialonFuelLive | undefined {
  const merged = mergeLlsWithSensorNames(readings, sensDefs);
  if (!merged.length) return undefined;
  const totalLiters = merged.reduce((sum, r) => sum + (r.level ?? r.value ?? 0), 0);
  const primary = merged[0];
  const levelLiters = totalLiters > 0 ? Math.round(totalLiters * 10) / 10 : primary.level ?? primary.value;
  return {
    sensors: merged,
    levelLiters,
    levelFormatted:
      levelLiters != null
        ? `${levelLiters} L`
        : primary.valueFormatted || undefined,
    filled: merged.find((r) => (r.filled ?? 0) > 0)?.filled,
    filledFormatted: merged.find((r) => r.filledFormatted)?.filledFormatted,
  };
}

/** Legacy percent-oriented lookup — prefer fuelFromSearchItem for live fleet fuel. */
export function extractFuelLevel(
  prp: Record<string, string> = {},
  prms: WialonPrm[] = [],
  lmsgParams?: Record<string, string | number>,
  calcSensors?: Array<{ n: string; v: string; t?: number }>,
  liveLls?: WialonLlsReading[],
  fuelLiters?: number,
  tankCapacity?: number
): number | undefined {
  if (fuelLiters != null && fuelLiters > 0 && tankCapacity && tankCapacity > 0) {
    return Math.min(100, Math.round((fuelLiters / tankCapacity) * 100));
  }

  if (liveLls?.length) {
    const liters = liveLls[0].level ?? liveLls[0].value;
    if (liters != null && liters > 0) {
      if (tankCapacity && tankCapacity > 0) return Math.min(100, Math.round((liters / tankCapacity) * 100));
      if (liters <= 100) return Math.round(liters);
    }
  }

  const keys = [
    'fuel_level',
    'fuel',
    'can_fuel',
    'fuel_percent',
    'lls',
    'lls1',
    'lls2',
    'Fuel Level',
    'fuel1',
    'fuel2',
  ];

  for (const key of keys) {
    const raw = prp[key] ?? prms.find((p) => p.key === key)?.value ?? lmsgParams?.[key];
    const n = parseNumeric(raw);
    if (n != null) return n <= 100 ? n : undefined;
  }

  if (lmsgParams) {
    for (const [key, val] of Object.entries(lmsgParams)) {
      if (!FUEL_KEY.test(key)) continue;
      const n = parseNumeric(val);
      if (n != null && n <= 100) return n;
    }
  }

  if (calcSensors?.length) {
    for (const s of calcSensors) {
      if (!FUEL_KEY.test(s.n) && s.t !== 1) continue;
      const n = parseNumeric(s.v);
      if (n != null) return n <= 100 ? n : undefined;
    }
  }

  return undefined;
}

export function parseWialonFuelSettingsRaw(settings: Record<string, unknown> | undefined): WialonFuelSettings {
  const calcTypes = settings?.calcTypes != null ? Number(settings.calcTypes) : undefined;
  const fuelLevelParams = (settings?.fuelLevelParams || settings?.fuel_level_params) as
    | WialonFuelLevelParams
    | undefined;
  const fuelConsMath = (settings?.fuelConsMath || settings?.fuel_cons_math) as
    | { idling?: number; urban?: number; suburban?: number }
    | undefined;
  const fuelConsRates = (settings?.fuelConsRates || settings?.fuel_cons_rates) as
    | WialonFuelSettings['fuelConsRates']
    | undefined;
  const fuelConsImpulse = (settings?.fuelConsImpulse || settings?.fuel_cons_impulse) as
    | { maxImpulses?: number; skipZero?: number }
    | undefined;

  return {
    calcTypes,
    calcTypeLabels: decodeCalcTypes(calcTypes),
    fuelLevelParams,
    fuelConsMath,
    fuelConsRates,
    fuelConsImpulse,
  };
}

export function parseWialonFuelSettings(
  settings: Record<string, unknown> | undefined,
  sensors: Array<{ id?: number; name: string; type: string; value: string; unit?: string }>,
  liveLls?: WialonLlsReading[]
): WialonFuelInfo {
  const parsed = parseWialonFuelSettingsRaw(settings);
  const tanks = sensors
    .filter(
      (s) => FUEL_KEY.test(s.name) || FUEL_KEY.test(s.type) || /fuel level|lls/i.test(s.type)
    )
    .map((t) => ({
      name: t.name,
      value: t.value,
      unit: t.unit,
      type: t.type,
      sensorId: t.id,
    }));

  const live = liveLls?.length ? fuelLiveFromLls(liveLls) : undefined;
  const primary = tanks[0];
  const levelFromSensor = primary ? parseNumeric(primary.value) : undefined;

  const levelLiters = live?.levelLiters ?? (levelFromSensor != null && levelFromSensor > 100 ? levelFromSensor : undefined);
  const levelPercent =
    live?.levelLiters != null && live.levelLiters <= 100
      ? Math.round(live.levelLiters)
      : levelFromSensor != null && levelFromSensor <= 100
        ? levelFromSensor
        : undefined;

  return {
    level: levelPercent,
    levelLiters,
    levelFormatted:
      live?.levelFormatted ||
      (primary?.value && primary.value !== '—'
        ? `${primary.value}${primary.unit ? ` ${primary.unit}` : ''}`
        : levelLiters != null
          ? `${levelLiters} L`
          : undefined),
    filled: live?.filled,
    filledFormatted: live?.filledFormatted,
    sensors: live?.sensors || [],
    tanks,
    consumption: parsed.fuelConsMath,
    rates: parsed.fuelConsRates,
    settings: parsed,
    minFillingVolume: parsed.fuelLevelParams?.minFillingVolume,
    minTheftVolume: parsed.fuelLevelParams?.minTheftVolume,
    filterQuality: parsed.fuelLevelParams?.filterQuality,
  };
}
