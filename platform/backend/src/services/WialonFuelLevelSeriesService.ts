/**
 * Continuous fuel-level series from Wialon unit messages.
 * Minute-resolution (native message times) with fill / drain event markers.
 */

import type { WialonClient } from '../adapters/wialonClient.js';
import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { calculateSensorValue } from './wialonFuel.js';
import { isFuelLevelSensor } from './wialonFuelSensorUtils.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';

const BATCH = 500;
const MAX_MESSAGES = 20_000;

export type FuelLevelSeriesPoint = {
  t: number;
  liters: number;
  /** Median-filtered / processed fuel level (Wialon-style). */
  processed: number;
  main: number | null;
  reserve: number | null;
  /** Engine / genset digital state 0|1 when detectable. */
  engineOn: number | null;
  event: 'level' | 'refill' | 'drain';
  delta: number;
};

export type FuelLevelSeriesResult = {
  unitId: number;
  unitName: string;
  from: number;
  to: number;
  pointCount: number;
  fillCount: number;
  drainCount: number;
  points: FuelLevelSeriesPoint[];
  fetchedAt: string;
};

type FuelSensorDef = {
  id: number;
  name: string;
  param: string;
  tank: 'main' | 'reserve';
  tbl: Array<{ x: number; a: number; b: number }>;
};

function parseTbl(tbl: unknown): Array<{ x: number; a: number; b: number }> {
  if (!Array.isArray(tbl)) return [];
  return tbl
    .map((row) => {
      const r = row as { x?: number; a?: number; b?: number };
      if (r.x == null || r.a == null || r.b == null) return null;
      return { x: Number(r.x), a: Number(r.a), b: Number(r.b) };
    })
    .filter((r): r is { x: number; a: number; b: number } => r != null);
}

function fuelSensorsFromItem(item: WialonSearchItem): FuelSensorDef[] {
  if (!item.sens) return [];
  const MAIN_RE = /\bmain\b|primary|tank\s*1|tank\s*a\b/i;
  const RESERVE_RE = /reserve|secondary|aux|backup|tank\s*2|tank\s*b\b/i;
  const defs: FuelSensorDef[] = [];
  for (const [id, sensor] of Object.entries(item.sens)) {
    if (!sensor?.n || !sensor.p) continue;
    if (!isFuelLevelSensor(sensor.n, sensor.t)) continue;
    const tank: 'main' | 'reserve' = RESERVE_RE.test(sensor.n)
      ? 'reserve'
      : MAIN_RE.test(sensor.n)
        ? 'main'
        : defs.some((d) => d.tank === 'main')
          ? 'reserve'
          : 'main';
    defs.push({
      id: Number(id) || 0,
      name: sensor.n,
      param: sensor.p,
      tank,
      tbl: parseTbl(sensor.tbl),
    });
  }
  if (defs.length === 1) defs[0].tank = 'main';
  return defs;
}

function litersFromParams(
  params: Record<string, unknown> | undefined,
  sensors: FuelSensorDef[],
): { main: number | null; reserve: number | null; total: number | null } {
  if (!params) return { main: null, reserve: null, total: null };
  let main: number | null = null;
  let reserve: number | null = null;

  if (sensors.length) {
    for (const s of sensors) {
      const raw = params[s.param];
      if (raw == null) continue;
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(n)) continue;
      const liters = Math.round(calculateSensorValue(n, s.tbl) * 10) / 10;
      if (!(liters > 0 && liters < 50000)) continue;
      if (s.tank === 'reserve') reserve = liters;
      else main = liters;
    }
  }

  if (main == null && reserve == null) {
    const keys = [
      'fuel',
      'fuel_level',
      'fuel1',
      'fuel2',
      'lls',
      'lls1',
      'lls2',
      'can_fuel',
      'Fuel Level',
      'tank',
    ];
    for (const key of keys) {
      const raw = params[key];
      if (raw == null) continue;
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n) && n > 0 && n < 50000) {
        main = Math.round(n * 10) / 10;
        break;
      }
    }
    if (main == null) {
      for (const [key, val] of Object.entries(params)) {
        if (!/fuel|lls|tank/i.test(key)) continue;
        const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n) && n > 0 && n < 50000) {
          main = Math.round(n * 10) / 10;
          break;
        }
      }
    }
  }

  const total =
    main == null && reserve == null
      ? null
      : Math.round(((main ?? 0) + (reserve ?? 0)) * 10) / 10;
  return { main, reserve, total };
}

async function loadMessages(
  client: WialonClient,
  unitId: number,
  fromTs: number,
  toTs: number,
): Promise<Array<{ t: number; p?: Record<string, unknown> }>> {
  try {
    const load = await client.request<{ count?: number }>('messages/load_interval', {
      itemId: unitId,
      timeFrom: fromTs,
      timeTo: toTs,
      flags: 1,
      flagsMask: 65281,
      loadCount: BATCH,
    });
    const total = Math.min(load.count ?? 0, MAX_MESSAGES);
    if (!total) {
      await client.request('messages/unload', {}).catch(() => undefined);
      return [];
    }

    const out: Array<{ t: number; p?: Record<string, unknown> }> = [];
    let indexFrom = 0;
    while (indexFrom < total) {
      const indexTo = Math.min(indexFrom + BATCH - 1, total - 1);
      const batch = await client.request<{
        messages?: Array<Record<string, unknown>>;
      }>('messages/get_messages', { indexFrom, indexTo });
      for (const msg of batch.messages ?? []) {
        const t = Number(msg.t);
        if (!Number.isFinite(t)) continue;
        out.push({
          t,
          p: (msg.p as Record<string, unknown> | undefined) ?? undefined,
        });
      }
      indexFrom = indexTo + 1;
    }
    await client.request('messages/unload', {}).catch(() => undefined);
    return out.sort((a, b) => a.t - b.t);
  } catch {
    await client.request('messages/unload', {}).catch(() => undefined);
    return [];
  }
}

function engineOnFromParams(params: Record<string, unknown> | undefined): number | null {
  if (!params) return null;
  const keys = [
    'ignition',
    'io_ignition',
    'engine',
    'engine_operation',
    'engine_on',
    'gen_status',
    'genset',
    'on_off',
    'pwr_ext',
    'digital',
    'avs',
    'io_1',
    'io1',
  ];
  for (const key of keys) {
    const raw = params[key];
    if (raw == null) continue;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n)) continue;
    return n > 0 ? 1 : 0;
  }
  for (const [key, val] of Object.entries(params)) {
    if (!/ignition|engine.?on|genset|on.?off|gen.?status/i.test(key)) continue;
    const n = typeof val === 'number' ? val : parseFloat(String(val));
    if (!Number.isFinite(n)) continue;
    return n > 0 ? 1 : 0;
  }
  return null;
}

/** Rolling median — approximates Wialon processed fuel level smoothing. */
function medianFilter(values: number[], window: number): number[] {
  if (window < 3 || values.length < 3) return [...values];
  const half = Math.floor(window / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    const slice = values.slice(from, to).sort((a, b) => a - b);
    out.push(slice[Math.floor(slice.length / 2)]);
  }
  return out;
}

/** Build continuous series from every fuel-bearing message (full detail). */
function buildSeries(
  messages: Array<{ t: number; p?: Record<string, unknown> }>,
  sensors: FuelSensorDef[],
  fillThreshold: number,
  drainThreshold: number,
): FuelLevelSeriesPoint[] {
  const draft: Array<Omit<FuelLevelSeriesPoint, 'processed' | 'event' | 'delta'> & { liters: number }> =
    [];

  for (const msg of messages) {
    const { main, reserve, total } = litersFromParams(msg.p, sensors);
    if (total == null) continue;
    draft.push({
      t: msg.t,
      liters: total,
      main,
      reserve,
      engineOn: engineOnFromParams(msg.p),
    });
  }

  if (!draft.length) return [];

  // Wialon smoothed window ≈ points/100 (min 3, max 21)
  const win = Math.min(21, Math.max(3, Math.round(draft.length / 100) | 1));
  const processed = medianFilter(
    draft.map((d) => d.liters),
    win % 2 === 0 ? win + 1 : win,
  );

  const out: FuelLevelSeriesPoint[] = [];
  let prevProcessed: number | null = null;
  for (let i = 0; i < draft.length; i++) {
    const d = draft[i];
    const proc = processed[i];
    const delta = prevProcessed == null ? 0 : proc - prevProcessed;
    let event: FuelLevelSeriesPoint['event'] = 'level';
    if (prevProcessed != null) {
      if (delta >= fillThreshold) event = 'refill';
      else if (delta <= -drainThreshold) event = 'drain';
    }
    out.push({
      t: d.t,
      liters: d.liters,
      processed: Math.round(proc * 100) / 100,
      main: d.main,
      reserve: d.reserve,
      engineOn: d.engineOn,
      event,
      delta: Math.round(delta * 10) / 10,
    });
    prevProcessed = proc;
  }
  return out;
}

export class WialonFuelLevelSeriesService {
  static async getSeries(
    tenantId: string,
    input: { unitId: number; from: number; to: number },
  ): Promise<FuelLevelSeriesResult> {
    const unitId = Number(input.unitId);
    const from = Number(input.from);
    const to = Number(input.to);
    if (!Number.isFinite(unitId) || unitId <= 0) throw new Error('unitId is required');
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      throw new Error('Valid from/to unix range is required');
    }

    const creds = await loadTenantWialonCreds(tenantId);
    return withWialonClient(creds, async (client) => {
      const result = await client.request<{ item?: WialonSearchItem }>('core/search_item', {
        id: unitId,
        flags: 4097, // base props + sensors
      });
      const item = result.item;
      if (!item) throw new Error('Unit not found');

      const sensors = fuelSensorsFromItem(item);
      const messages = await loadMessages(client, unitId, from, to);

      let fillThreshold = 5;
      let drainThreshold = 5;
      try {
        const settings = (await client.request<Record<string, unknown>>('unit/get_fuel_settings', {
          itemId: unitId,
        })) as Record<string, unknown>;
        const nested = (settings.fuelLevelParams || settings.fuel_level_params || settings) as Record<
          string,
          unknown
        >;
        const fillings = (nested.fillings || settings.fillings) as
          | { minFillingsVolume?: number }
          | undefined;
        const thefts = (nested.thefts || settings.thefts) as { minTheftVolume?: number } | undefined;
        const fill = Number(fillings?.minFillingsVolume);
        const drain = Number(thefts?.minTheftVolume);
        if (Number.isFinite(fill) && fill > 0) fillThreshold = fill;
        if (Number.isFinite(drain) && drain > 0) drainThreshold = drain;
      } catch {
        /* defaults */
      }

      const points = buildSeries(messages, sensors, fillThreshold, drainThreshold);
      const fillCount = points.filter((p) => p.event === 'refill').length;
      const drainCount = points.filter((p) => p.event === 'drain').length;

      return {
        unitId,
        unitName: String(item.nm || `Unit ${unitId}`),
        from,
        to,
        pointCount: points.length,
        fillCount,
        drainCount,
        points,
        fetchedAt: new Date().toISOString(),
      };
    });
  }
}
