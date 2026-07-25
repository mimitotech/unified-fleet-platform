import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { wialonObjectValues } from '../adapters/wialonUtils.js';
import { mapWialonSearchItem, type WialonUnitSlice } from './wialonUnitMapper.js';
import type { WialonHwType } from './wialonHwTypes.js';
import { parseWialonFuelSettings, type WialonFuelInfo, hasFuelData } from './wialonFuel.js';
import {
  tankCapacityFromItem,
  fuelPercentFromLitres,
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

/**
 * Build the sensor list exactly as Wialon Hosting does:
 * `unit/calc_last_message` value when present, else the configured parameter
 * from the last message only (exact `def.param` key — no name aliases).
 * Never invent a placeholder value.
 */
function mergeSensorValues(slice: WialonUnitSlice, calcSensors: CalcSensor[]) {
  const calcByName = new Map(calcSensors.map((s) => [s.n, s]));
  const params = slice.lmsg?.params || {};

  const fromDefs = slice.sens.map((def) => {
    const calc = calcByName.get(def.name);
    const paramVal =
      def.param && params[def.param] != null && params[def.param] !== ''
        ? String(params[def.param])
        : undefined;
    const value = calc?.v != null && calc.v !== '' ? String(calc.v) : paramVal ?? '';
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      param: def.param,
      value,
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
        value: calc.v != null ? String(calc.v) : '',
        unit: calc.u,
      });
    }
  }
  return fromDefs;
}

function mapProfileFields(item: WialonSearchItem): Array<{ id: number; name: string; value: string }> {
  if (!item.pflds) return [];
  return wialonObjectValues(item.pflds)
    .filter((f) => f?.n)
    .map((f) => ({ id: f.id ?? 0, name: f.n!, value: String(f.v ?? '') }));
}

/** Last-message parameters exactly as Wialon sent them on `lmsg.p`. */
function mapLastMessageParams(
  lmsg?: { params?: Record<string, string | number> },
): Array<{ key: string; value: string }> {
  if (!lmsg?.params) return [];
  return Object.entries(lmsg.params).map(([key, value]) => ({
    key,
    value: value == null ? '' : String(value),
  }));
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
  /** Profile fields (`pflds`) exactly as configured on the unit in Wialon. */
  profileFields?: Array<{ id: number; name: string; value: string }>;
  /** Raw last-message parameters (`lmsg.p`) — current device payload. */
  messageParams?: Array<{ key: string; value: string }>;
  maintenance: Array<{
    id?: number;
    name: string;
    counter?: number;
    threshold?: number;
    detail: string;
  }>;
  video?: Record<string, unknown>;
  address?: string;
  addressParts?: string[];
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

  // Sensors = Wialon calc_last_message (+ exact configured param). Do not overwrite
  // with our calibration tables — Monitoring must mirror Hosting as it is now.
  const sensors = mergeSensorValues(slice, calcSensors || []);
  const fuel = parseWialonFuelSettings(fuelSettings, sensors, liveLls);
  const capacity = tankCapacityFromItem(item);

  // Percent only when litres and declared capacity are both present — never invent %.
  if (
    fuel.levelLiters != null &&
    fuel.levelLiters > 0 &&
    capacity &&
    capacity > 0 &&
    fuel.level == null
  ) {
    fuel.level = fuelPercentFromLitres(fuel.levelLiters, capacity) ?? undefined;
  }

  return {
    ...slice,
    ...extras,
    lastUpdate: pos?.time ? new Date(pos.time * 1000).toISOString() : undefined,
    lastUpdateAge: pos?.time ? formatAge(pos.time) : undefined,
    sensors,
    profileFields: mapProfileFields(item),
    messageParams: mapLastMessageParams(slice.lmsg),
    maintenance: mapMaintenance(item),
    video,
    fuel: hasFuelData(fuel) ? fuel : undefined,
    fuelLevel:
      (fuel.level != null ? fuel.level : undefined) ??
      slice.fuelLevel ??
      (fuel.levelLiters != null && capacity && capacity > 0
        ? (fuelPercentFromLitres(fuel.levelLiters, capacity) ?? undefined)
        : undefined),
  };
}
