import type { WialonClient } from '../adapters/wialonClient.js';
import { parseWialonLlsBlock } from './wialonFuel.js';

export type WialonUnitEventSlice = {
  tripState?: 0 | 1 | 2;
  tripStateLabel?: string;
  currSpeed?: number;
  maxSpeed?: number;
  avgSpeed?: number;
  course?: number;
  tripDistance?: number;
  ignitionOn?: boolean;
  fuelLls?: import('./wialonFuel.js').WialonLlsReading[];
  mileage?: number;
  engineHours?: number;
};

const TRIP_LABELS: Record<number, string> = {
  0: 'Parking',
  1: 'Trip',
  2: 'Stop',
};

function parseTripBlock(trips: unknown): Partial<WialonUnitEventSlice> | undefined {
  if (!trips || typeof trips !== 'object') return undefined;
  const t = trips as Record<string, unknown>;
  const block =
    'state' in t ? t : typeof t['0'] === 'object' && t['0'] ? (t['0'] as Record<string, unknown>) : undefined;
  if (!block || block.state == null) return undefined;

  const state = Number(block.state) as 0 | 1 | 2;
  return {
    tripState: state,
    tripStateLabel: TRIP_LABELS[state] || String(state),
    currSpeed: block.curr_speed != null ? Number(block.curr_speed) : undefined,
    maxSpeed: block.max_speed != null ? Number(block.max_speed) : undefined,
    avgSpeed: block.avg_speed != null ? Number(block.avg_speed) : undefined,
    course: block.course != null ? Number(block.course) : undefined,
    tripDistance: block.distance != null ? Number(block.distance) : undefined,
  };
}

function parseIgnition(ignition: unknown): boolean | undefined {
  if (!ignition || typeof ignition !== 'object') return undefined;
  for (const sensor of Object.values(ignition as Record<string, unknown>)) {
    if (!sensor || typeof sensor !== 'object') continue;
    const s = sensor as { value?: boolean | number; state?: number };
    if (s.value === true || s.value === 1 || s.state === 1) return true;
    if (s.value === false || s.value === 0 || s.state === 0) return false;
  }
  return undefined;
}

function parseCounters(counters: unknown): { mileage?: number; engineHours?: number } {
  if (!counters || typeof counters !== 'object') return {};
  const c = counters as Record<string, unknown>;
  return {
    mileage: c.mileage != null ? Number(c.mileage) : undefined,
    engineHours:
      c.engine_hours != null ? Number(c.engine_hours) : c.engineHours != null ? Number(c.engineHours) : undefined,
  };
}

/** Parse `events/check_updates` — keyed by unit id. */
export function parseEventsCheckUpdates(data: Record<string, unknown>): Map<number, WialonUnitEventSlice> {
  const out = new Map<number, WialonUnitEventSlice>();
  for (const [key, val] of Object.entries(data)) {
    const unitId = Number(key);
    if (!Number.isFinite(unitId) || unitId <= 0 || typeof val !== 'object' || !val) continue;
    const obj = val as Record<string, unknown>;
    const trip = parseTripBlock(obj.trips);
    const ignitionOn = parseIgnition(obj.ignition);
    const fuelLls = obj.lls ? parseWialonLlsBlock(obj.lls) : undefined;
    const counters = parseCounters(obj.counters);
    if (!trip && ignitionOn === undefined && !fuelLls?.length && counters.mileage == null) continue;
    out.set(unitId, { ...trip, ignitionOn, fuelLls, ...counters });
  }
  return out;
}

/** Subscribe fleet units to Wialon session events (trips, ignition, sensors, fuel). */
export async function subscribeFleetUnitsEvents(client: WialonClient, unitIds: number[]): Promise<void> {
  if (!unitIds.length) return;
  const units = unitIds.slice(0, 500).map((id) => ({
    id,
    detect: { trips: 0, lls: 0, sensors: 0, ignition: 0, counters: 0 },
  }));
  await client.request('events/update_units', { mode: 'add', units });
}

/** Poll Wialon real-time event detectors (trip state, speed, course, ignition). */
export async function fetchFleetEventsUpdates(client: WialonClient): Promise<Map<number, WialonUnitEventSlice>> {
  const raw = await client.request<Record<string, unknown>>('events/check_updates', {
    lang: 'en',
    measure: 0,
    detalization: 0x27,
  });
  return parseEventsCheckUpdates(raw || {});
}
