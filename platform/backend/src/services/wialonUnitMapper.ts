import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { wialonObjectValues } from '../adapters/wialonUtils.js';
import { fleetUnitIconProxyPath } from './wialonIcon.js';
import { extractPlateFromName } from './unitPlateUtils.js';
import { extractFuelLevel, fuelLiveFromLls, fuelFromSearchItem, mergeLlsWithSensorNames, extractTankCapacityFromItem, type WialonFuelLive } from './wialonFuel.js';
import { deriveWialonHostingStatus, type WialonHostingStatus } from './wialonUnitStatus.js';
import { deriveStatusFromWialonEvents } from './wialonTripStatus.js';
import type { WialonUnitEventSlice } from './wialonEventsService.js';
import type { WialonHwType } from './wialonHwTypes.js';
import { resolveHwName } from './wialonHwTypes.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import { resolveFuelAssetCategory } from './wialonAssetCategory.js';

export type WialonFld = { id: number; name: string; value: string };
export type WialonSensDef = {
  id: number;
  name: string;
  type: string;
  param?: string;
  unit?: string;
  tbl?: Array<{ x: number; a: number; b: number }>;
};
export type WialonPrm = { key: string; value: string; calcTime?: number; actualTime?: number };
export type WialonRtd = {
  type?: number;
  gpsCorrection?: boolean;
  minSat?: number;
  minMovingSpeed?: number;
  minStayTime?: number;
  maxMessagesDistance?: number;
  minTripTime?: number;
  minTripDistance?: number;
};

export type WialonUnitSlice = {
  id: number;
  name: string;
  accountId?: number;
  plate?: string;
  uid?: string;
  ph?: string;
  hw?: number;
  hwName?: string;
  iconUri?: string;
  iconUgi?: number;
  iconUrl?: string;
  netconn?: boolean;
  prp: Record<string, string>;
  flds: WialonFld[];
  sens: WialonSensDef[];
  prms: WialonPrm[];
  rtd?: WialonRtd;
  position?: { lat: number; lng: number; speed: number; time: number; course?: number; satellites?: number; altitude?: number };
  lmsg?: { time?: number; params?: Record<string, string | number> };
  counters?: { mileage?: number; engineHours?: number };
  status: WialonHostingStatus['status'];
  motionState?: string;
  /** vehicle | generator | machinery — drives Running vs Moving labels */
  assetCategory?: FuelAssetCategory;
  /** True for generators / machinery (no GPS "moving") */
  stationary?: boolean;
  trip?: {
    state?: 0 | 1 | 2;
    currSpeed?: number;
    maxSpeed?: number;
    avgSpeed?: number;
    course?: number;
    distance?: number;
    ignitionOn?: boolean;
  };
  fuelLevel?: number;
  /** Tank capacity in litres (calibration max / custom field). */
  tankCapacity?: number;
  fuel?: WialonFuelLive;
};

function mapFlds(item: WialonSearchItem): WialonFld[] {
  return wialonObjectValues(item.flds)
    .filter((f) => f?.n)
    .map((f) => ({ id: f.id ?? 0, name: f.n!, value: String(f.v ?? '') }));
}

function mapSens(item: WialonSearchItem): WialonSensDef[] {
  if (!item.sens) return [];
  return Object.entries(item.sens)
    .filter(([, s]) => s?.n)
    .map(([id, s]) => {
      const tbl = Array.isArray(s.tbl)
        ? s.tbl
            .map((row) => {
              const r = row as { x?: number; a?: number; b?: number };
              if (r.x == null || r.a == null || r.b == null) return null;
              return { x: Number(r.x), a: Number(r.a), b: Number(r.b) };
            })
            .filter((r): r is { x: number; a: number; b: number } => r != null)
        : undefined;
      return {
        id: Number(id) || 0,
        name: s.n!,
        type: String(s.t ?? ''),
        param: s.p,
        unit: s.u,
        tbl: tbl?.length ? tbl : undefined,
      };
    });
}

function mapPrms(item: WialonSearchItem): WialonPrm[] {
  if (!item.prms) return [];
  return Object.entries(item.prms).map(([key, p]) => ({
    key,
    value: String(p?.v ?? ''),
    calcTime: p?.ct,
    actualTime: p?.at,
  }));
}

function mapRtd(item: WialonSearchItem): WialonRtd | undefined {
  const rtd = (item as { rtd?: Record<string, unknown> }).rtd;
  if (!rtd) return undefined;
  return {
    type: rtd.type as number | undefined,
    gpsCorrection: rtd.gpsCorrection as boolean | undefined,
    minSat: rtd.minSat as number | undefined,
    minMovingSpeed: rtd.minMovingSpeed as number | undefined,
    minStayTime: rtd.minStayTime as number | undefined,
    maxMessagesDistance: rtd.maxMessagesDistance as number | undefined,
    minTripTime: rtd.minTripTime as number | undefined,
    minTripDistance: rtd.minTripDistance as number | undefined,
  };
}

function mapLmsg(item: WialonSearchItem) {
  const lmsg = item.lmsg;
  if (!lmsg) return undefined;
  const params: Record<string, string | number> = {};
  if (lmsg.p) {
    for (const [k, v] of Object.entries(lmsg.p)) {
      params[k] = typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number);
    }
  }
  return { time: lmsg.t, params: Object.keys(params).length ? params : undefined };
}

function resolveUnitCategory(
  item: WialonSearchItem,
  prp: Record<string, string>,
): FuelAssetCategory {
  const flds = item.flds;
  const customFields: Record<string, string> = { ...prp };
  if (flds) {
    for (const f of Object.values(flds)) {
      if (f?.n) customFields[f.n] = String(f.v ?? '');
    }
  }
  const sensorNames = item.sens
    ? Object.values(item.sens).map((s) => s?.n || '').filter(Boolean)
    : [];
  return resolveFuelAssetCategory({
    name: item.nm || '',
    plate: prp.registration_plate || prp.plate || extractPlateFromName(item.nm),
    customFields,
    flds,
    engineHours: item.cneh,
    mileage: item.cnm,
    unitId: item.id,
    sensorNames,
  });
}

function isStationaryUnit(item: WialonSearchItem, prp: Record<string, string>): boolean {
  const category = resolveUnitCategory(item, prp);
  return category === 'generator' || category === 'machinery';
}

export function mapWialonSearchItem(
  item: WialonSearchItem,
  hwTypes?: Map<number, WialonHwType>,
  calcSensors?: Array<{ n: string; v: string; t?: number }>
): WialonUnitSlice {
  const prp = item.prp || {};
  const plate = prp.registration_plate || prp.plate || extractPlateFromName(item.nm);
  const pos = item.pos;
  const assetCategory = resolveUnitCategory(item, prp);
  const stationary = assetCategory === 'generator' || assetCategory === 'machinery';
  const hosting = deriveWialonHostingStatus(item, calcSensors, { stationary });
  const hw = item.hw;
  const prmsList = mapPrms(item);
  const lmsg = mapLmsg(item);
  const fromSearch = fuelFromSearchItem(item);
  const tankCapacity = fromSearch?.tankCapacity ?? extractTankCapacityFromItem(item);
  const fuelLevel =
    fromSearch?.fuelLevelPercent ??
    extractFuelLevel(
      prp,
      prmsList,
      lmsg?.params,
      calcSensors,
      undefined,
      fromSearch?.live.levelLiters,
      tankCapacity,
    );

  return {
    id: item.id,
    name: item.nm,
    accountId: item.bact,
    plate,
    uid: item.uid || prp.uid,
    ph: item.ph || prp.phone,
    hw,
    hwName: resolveHwName(hwTypes || new Map(), hw) || prp.hw_type,
    iconUri: item.uri,
    iconUgi: item.ugi ?? 1,
    iconUrl: fleetUnitIconProxyPath(item.id, item.ugi ?? 1, 48),
    netconn: (item as { netconn?: boolean }).netconn,
    prp: { ...prp },
    flds: mapFlds(item),
    sens: mapSens(item),
    prms: prmsList,
    rtd: mapRtd(item),
    position: pos
      ? {
          lat: pos.y,
          lng: pos.x,
          speed: pos.s,
          time: pos.t,
          course: pos.c,
          satellites: pos.sc,
          altitude: pos.z,
        }
      : undefined,
    lmsg,
    counters: {
      mileage: item.cnm,
      engineHours:
        item.cneh != null && Number.isFinite(item.cneh) && item.cneh > 0
          ? item.cneh >= 100_000
            ? Math.round((item.cneh / 3600) * 10) / 10
            : Math.round(item.cneh * 10) / 10
          : item.cneh,
    },
    status: hosting.status,
    motionState: hosting.motionState,
    assetCategory,
    stationary,
    fuelLevel,
    tankCapacity,
    fuel: fromSearch?.live,
  };
}

export function applyUnitEvents(
  slice: WialonUnitSlice,
  item: WialonSearchItem,
  events?: WialonUnitEventSlice
): WialonUnitSlice {
  if (!events) return slice;
  const stationary = isStationaryUnit(item, item.prp || {});
  const hosting = deriveStatusFromWialonEvents(item, events, { stationary });
  const liveFuel = events.fuelLls?.length
    ? fuelLiveFromLls(mergeLlsWithSensorNames(events.fuelLls, slice.sens))
    : undefined;

  // FLS updates fill events only — keep level from calibrated sensors (snapshot)
  const fuel = slice.fuel
    ? {
        ...slice.fuel,
        filled: liveFuel?.filled ?? slice.fuel.filled,
        filledFormatted: liveFuel?.filledFormatted ?? slice.fuel.filledFormatted,
      }
    : slice.fuel;

  return {
    ...slice,
    status: hosting.status,
    motionState: hosting.motionState || events.tripStateLabel,
    stationary,
    assetCategory: resolveUnitCategory(item, item.prp || {}),
    fuelLevel: slice.fuelLevel,
    fuel,
    position: slice.position
      ? {
          ...slice.position,
          speed: events.currSpeed ?? slice.position.speed,
          course: events.course ?? slice.position.course,
        }
      : slice.position,
    trip: {
      state: events.tripState,
      currSpeed: events.currSpeed,
      maxSpeed: events.maxSpeed,
      avgSpeed: events.avgSpeed,
      course: events.course,
      distance: events.tripDistance,
      ignitionOn: events.ignitionOn,
    },
  };
}
