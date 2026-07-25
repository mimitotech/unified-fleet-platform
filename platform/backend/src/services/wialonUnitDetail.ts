import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { wialonObjectValues } from '../adapters/wialonUtils.js';
import { mapWialonSearchItem, type WialonUnitSlice } from './wialonUnitMapper.js';
import type { WialonHwType } from './wialonHwTypes.js';
import { parseWialonFuelSettings, type WialonFuelInfo, hasFuelData } from './wialonFuel.js';
import {
  isFuelLevelSensor,
  readAllUnitSensors,
  totalLitersFromReadings,
  tankCapacityFromItem,
} from './wialonFuelSensorUtils.js';

type CalcSensor = { n: string; v: string; u?: string; t?: number };

function formatAge(ts?: number): string | undefined {
  if (!ts) return undefined;
  const sec = Math.floor(Date.now() / 1000) - ts;
  if (sec < 60) return `${sec} s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}

function mapMaintenance(item: WialonSearchItem) {
  const si = item.si;
  if (!si) return [];
  return wialonObjectValues(si)
    .filter((s) => s?.n)
    .map((s) => {
      const overdue = s.cnm != null && s.nmt != null && s.cnm > s.nmt;
      const delta = overdue && s.cnm != null && s.nmt != null ? Math.round(s.cnm - s.nmt) : 0;
      const unit =
        s.n?.toLowerCase().includes('service') || s.n?.toLowerCase().includes('day') ? 'days' : 'km';
      return {
        id: (s as { id?: number }).id,
        name: s.n!,
        counter: s.cnm,
        threshold: s.nmt,
        detail: overdue ? `${delta} ${unit} overdue` : 'OK',
      };
    });
}

function mapCalcSensors(calcSensors: CalcSensor[]) {
  return calcSensors.map((s) => ({
    name: s.n,
    value: s.v,
    unit: s.u,
    type: s.t != null ? String(s.t) : undefined,
  }));
}

function mergeSensorValues(slice: WialonUnitSlice, calcSensors: CalcSensor[]) {
  const calcByName = new Map(calcSensors.map((s) => [s.n, s]));
  const params = slice.lmsg?.params || {};

  const paramFallback = (def: { name: string; param?: string }) => {
    if (def.param && params[def.param] != null && params[def.param] !== '') {
      return String(params[def.param]);
    }
    // Common Wialon param aliases on last message
    const aliases = [def.name, def.param, def.name?.toLowerCase()].filter(Boolean) as string[];
    for (const key of aliases) {
      if (key && params[key] != null && params[key] !== '') return String(params[key]);
    }
    return undefined;
  };

  const fromDefs = slice.sens.map((def) => {
    const calc = calcByName.get(def.name);
    const fallback = paramFallback(def);
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      param: def.param,
      value: calc?.v ?? fallback ?? '—',
      unit: calc?.u ?? def.unit,
    };
  });

  for (const calc of calcSensors) {
    if (!fromDefs.some((s) => s.name === calc.n)) {
      fromDefs.push({
        id: 0,
        name: calc.n,
        type: calc.t != null ? String(calc.t) : '',
        param: undefined,
        value: calc.v,
        unit: calc.u,
      });
    }
  }
  return fromDefs;
}

function parseHealthAndIo(lmsg?: { params?: Record<string, string | number> }, pos?: { sc?: number; z?: number }) {
  const params = lmsg?.params || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = params[k];
      if (v != null && v !== '' && v !== '—') return v;
    }
    return undefined;
  };

  const ioInputs: Array<{ key: string; label: string; state: string }> = [];
  const ioOutputs: Array<{ key: string; label: string; state: string }> = [];
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith('io_')) continue;
    const parts = key.split('_');
    const on = raw === 1 || raw === '1' || String(raw) === 'true';
    if (parts[1] === 'out') {
      ioOutputs.push({ key, label: `Output ${parts[2]}`, state: on ? 'ON' : 'OFF' });
    } else if (parts.length >= 3) {
      ioInputs.push({ key, label: `Input ${parts[2]}`, state: on ? 'High' : 'Low' });
    }
  }

  const battery = pick('battery', 'battery_voltage', 'pwr_ext', 'pwr_int');
  const hdop = pick('hdop');
  const satellites = pos?.sc ?? pick('satellites', 'sats');

  return {
    health: {
      battery: battery != null ? Number(battery) : undefined,
      hdop: hdop != null ? Number(hdop) : undefined,
      satellites: satellites != null ? Number(satellites) : undefined,
      altitude: pos?.z,
    },
    io: ioInputs.length || ioOutputs.length ? { inputs: ioInputs, outputs: ioOutputs } : undefined,
  };
}

export type WialonUnitDetail = WialonUnitSlice & {
  lastUpdate?: string;
  lastUpdateAge?: string;
  sensors: Array<{
    id: number;
    name: string;
    type: string;
    param?: string;
    value: string;
    unit?: string;
  }>;
  maintenance: Array<{
    id?: number;
    name: string;
    counter?: number;
    threshold?: number;
    detail: string;
  }>;
  video?: Record<string, unknown>;
  address?: string;
  health?: {
    battery?: number;
    hdop?: number;
    satellites?: number;
    altitude?: number;
  };
  io?: {
    inputs: Array<{ key: string; label: string; state: string }>;
    outputs: Array<{ key: string; label: string; state: string }>;
  };
  fuel?: WialonFuelInfo;
};

export function parseWialonUnitDetail(
  item: WialonSearchItem,
  hwTypes?: Map<number, WialonHwType>,
  calcSensors?: CalcSensor[],
  video?: Record<string, unknown>,
  fuelSettings?: Record<string, unknown>,
  liveLls?: import('./wialonFuel.js').WialonLlsReading[]
): WialonUnitDetail {
  const slice = mapWialonSearchItem(item, hwTypes, calcSensors);
  const pos = slice.position;
  const extras = parseHealthAndIo(slice.lmsg, item.pos);
  let sensors = mergeSensorValues(slice, calcSensors || []);

  // Prefer calibrated FLS readings (sensor.tbl) — calcSensors often returns raw ADC
  // (e.g. 2170) which must never be shown or monetised as litres.
  const calibrated = readAllUnitSensors(item);
  if (calibrated.length) {
    const byName = new Map(calibrated.map((r) => [r.name, r]));
    const byId = new Map(calibrated.map((r) => [r.sensorId, r]));
    sensors = sensors.map((s) => {
      const hit = (s.id ? byId.get(s.id) : undefined) || byName.get(s.name);
      if (!hit) return s;
      if (!isFuelLevelSensor(s.name, s.type) && !hit.isFuelLevel) return s;
      return {
        ...s,
        value: String(hit.value),
        unit: hit.unit || s.unit || (hit.isFuelLevel ? 'L' : undefined),
      };
    });
  }

  const fuel = parseWialonFuelSettings(fuelSettings, sensors, liveLls);
  const calibratedLiters = calibrated.length ? totalLitersFromReadings(calibrated) : 0;
  const capacity = tankCapacityFromItem(item);
  if (calibratedLiters > 0) {
    // Always trust calibration table over raw calcSensors for levelLiters.
    fuel.levelLiters = calibratedLiters;
    fuel.levelFormatted = `${calibratedLiters} L`;
    if (capacity && capacity > 0) {
      fuel.level = Math.min(100, Math.max(0, Math.round((calibratedLiters / capacity) * 100)));
    }
  }

  return {
    ...slice,
    ...extras,
    lastUpdate: pos?.time ? new Date(pos.time * 1000).toISOString() : undefined,
    lastUpdateAge: pos?.time ? formatAge(pos.time) : undefined,
    sensors,
    maintenance: mapMaintenance(item),
    video,
    fuel: hasFuelData(fuel) ? fuel : undefined,
    fuelLevel:
      (fuel.level != null ? fuel.level : undefined) ??
      slice.fuelLevel ??
      (fuel.levelLiters != null &&
      capacity &&
      capacity > 0 &&
      fuel.levelLiters <= capacity * 1.2
        ? Math.round((fuel.levelLiters / capacity) * 100)
        : fuel.levelLiters != null && fuel.levelLiters <= 100
          ? Math.round(fuel.levelLiters)
          : undefined),
  };
}
