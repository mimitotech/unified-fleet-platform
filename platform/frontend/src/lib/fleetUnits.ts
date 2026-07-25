import type { AssetStatusEntry } from '@/hooks/useAssets';
import { extractPlateFromName } from '@/lib/plateUtils';
import { isWialonGenerator } from '@/lib/wialonAssetCategory';

export type WialonFld = { id: number; name: string; value: string };
export type WialonSensDef = { id: number; name: string; type: string; param?: string; unit?: string };
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

export type FleetSnapshotUnit = {
  id: string;
  wialonId?: number;
  name: string;
  plate?: string;
  hw?: number;
  hwName?: string;
  uid?: string;
  ph?: string;
  netconn?: boolean;
  motionState?: string;
  status: string;
  assetCategory?: 'vehicle' | 'generator' | 'machinery';
  stationary?: boolean;
  fuelLevel?: number;
  tankCapacity?: number;
  iconUrl?: string;
  iconUgi?: number;
  iconUri?: string;
  engineHours?: number;
  mileage?: number;
  prp?: Record<string, string>;
  flds?: WialonFld[];
  sens?: WialonSensDef[];
  prms?: WialonPrm[];
  rtd?: WialonRtd;
  lmsg?: { time?: number; params?: Record<string, string | number> };
  fuel?: {
    levelLiters?: number;
    levelFormatted?: string;
    filled?: number;
    filledFormatted?: string;
    sensors?: Array<{
      sensorId: number;
      name?: string;
      value?: number;
      level?: number;
      filled?: number;
      valueFormatted?: string;
      filledFormatted?: string;
    }>;
  };
  trip?: {
    state?: 0 | 1 | 2;
    currSpeed?: number;
    maxSpeed?: number;
    avgSpeed?: number;
    course?: number;
    distance?: number;
    ignitionOn?: boolean;
  };
  position?: { lat: number; lng: number; speed: number; time: number; course?: number };
};

export type FleetSnapshot = {
  live: boolean;
  stale: boolean;
  fetchedAt: string;
  accountId?: number;
  accountName?: string;
  counts: {
    total: number;
    moving: number;
    idle: number;
    stopped: number;
    offline: number;
    withPosition: number;
    byHwName: Record<string, number>;
  };
  units: FleetSnapshotUnit[];
};

export type FleetUnit = {
  id: string;
  wialonId?: number;
  name: string;
  plate?: string;
  hw?: number;
  hwName?: string;
  uid?: string;
  ph?: string;
  netconn?: boolean;
  motionState?: string;
  status: 'moving' | 'idle' | 'stopped' | 'offline';
  assetCategory?: 'vehicle' | 'generator' | 'machinery';
  stationary?: boolean;
  speed?: number;
  fuelLevel?: number;
  fuelLiters?: number;
  tankCapacity?: number;
  fuelFormatted?: string;
  lat?: number;
  lng?: number;
  course?: number;
  iconUrl?: string;
  iconUgi?: number;
  lastUpdate?: Date;
  engineHours?: number;
  mileage?: number;
  prp?: Record<string, string>;
  flds?: WialonFld[];
  sens?: WialonSensDef[];
  prms?: WialonPrm[];
  rtd?: WialonRtd;
  lmsg?: { time?: number; params?: Record<string, string | number> };
};

export function hwDisplayLabel(unit: Pick<FleetUnit, 'hwName' | 'hw'>): string {
  if (unit.hwName) return unit.hwName;
  if (unit.hw != null) return `HW ${unit.hw}`;
  return '—';
}

/**
 * Secondary label under a unit name (plate/registration).
 * Returns empty when there's no real plate — never the raw Wialon unit ID,
 * and never a duplicate of the unit name.
 */
export function unitPlateLabel(unit: Pick<FleetUnit, 'name' | 'plate'>): string {
  const plate = (unit.plate ?? '').trim();
  if (!plate) return '';
  if (plate === (unit.name ?? '').trim()) return '';
  return plate;
}

/** Units with Wialon fuel LEVEL sensors configured. */
export function hasFuelSensors(
  unit: Pick<FleetUnit, 'sens' | 'fuelLiters' | 'fuelFormatted' | 'fuelLevel'>
): boolean {
  if (unit.fuelLiters != null || unit.fuelFormatted) return true;
  const EXCLUDE = /consum|consumption|rate|flow|used|economy|efficiency|mpg|mileage/i;
  return (
    unit.sens?.some((s) => {
      const n = s.name.toLowerCase();
      const t = s.type.toLowerCase();
      if (EXCLUDE.test(n)) return false;
      return (
        t.includes('fuel level') ||
        /^fuel level|^fls|fuel tank|tank level|diesel level|diesel tank/i.test(n) ||
        /\b(fls|fuel level|fuel tank)\b/i.test(n)
      );
    }) ?? false
  );
}

/** MDVR / camera hardware — exclude from fuel generator and vehicle tabs. */
export function isFleetVideoDevice(
  unit: Pick<FleetUnit, 'name' | 'sens' | 'prp' | 'hwName'>
): boolean {
  return hasVideoCapability(unit);
}

function fldsToCustomFields(flds?: WialonFld[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of flds ?? []) {
    if (f.name) out[f.name] = String(f.value ?? '');
  }
  return out;
}

/** Generator/genset per Wialon naming and custom fields — never cameras or MDVR. */
export function isFleetGenerator(
  unit: Pick<FleetUnit, 'name' | 'plate' | 'engineHours' | 'mileage' | 'flds' | 'sens' | 'prp' | 'hwName'>
): boolean {
  if (isFleetVideoDevice(unit)) return false;
  return isWialonGenerator({
    name: unit.name,
    plate: unit.plate,
    engineHours: unit.engineHours,
    mileage: unit.mileage,
    customFields: fldsToCustomFields(unit.flds),
  });
}

/** Units with engine-hours counter or genset/engine sensors from Wialon. */
export function hasEngineHoursData(unit: Pick<FleetUnit, 'engineHours' | 'sens' | 'flds'>): boolean {
  if (unit.engineHours != null && unit.engineHours > 0) return true;
  if (unit.sens?.some((s) => /engine|genset|hours/i.test(s.name))) return true;
  if (unit.flds?.some((f) => /engine|genset|hours/i.test(f.name))) return true;
  return false;
}

/** Units with Wialon video settings or video-related sensors. */
export function hasVideoCapability(
  unit: Pick<FleetUnit, 'name' | 'sens' | 'prp' | 'hwName'>,
  detailVideo?: Record<string, unknown> | null
): boolean {
  if (detailVideo && Object.keys(detailVideo).length > 0) return true;
  if (/mdvr|dash\s*cam|dascam|dvr|cctv|ipc|video|camera/i.test(unit.name || '')) return true;
  if (unit.hwName && /mdvr|camera|dvr|cctv/i.test(unit.hwName)) return true;
  if (unit.prp?.video || unit.prp?.camera) return true;
  if (unit.sens?.some((s) => /camera|video|mdvr|cctv/i.test(s.name))) return true;
  return false;
}

export function formatFuelDisplay(
  unit: Pick<FleetUnit, 'fuelLevel' | 'fuelLiters' | 'fuelFormatted' | 'tankCapacity'>,
): string {
  const litres = unit.fuelLiters;
  const capacity = unit.tankCapacity;
  const pctFromCapacity =
    litres != null && capacity != null && capacity > 0
      ? Math.min(100, Math.max(0, Math.round((litres / capacity) * 100)))
      : null;
  // Never treat raw litres ≤100 as % when capacity is known.
  const pct =
    pctFromCapacity ??
    (capacity == null && unit.fuelLevel != null && unit.fuelLevel > 0 && unit.fuelLevel <= 100
      ? Math.round(unit.fuelLevel)
      : null);

  if (unit.fuelFormatted && pctFromCapacity == null) return unit.fuelFormatted;
  if (litres != null) {
    return pct != null ? `${litres} L (${pct}%)` : `${litres} L`;
  }
  if (pct != null) return `${pct}%`;
  if (unit.fuelFormatted) return unit.fuelFormatted;
  return '—';
}

function normalizeStatus(raw?: string): FleetUnit['status'] {
  const s = (raw || 'offline').toLowerCase();
  if (s === 'moving' || s === 'idle' || s === 'stopped' || s === 'offline') return s;
  if (s.includes('move')) return 'moving';
  if (s.includes('idle')) return 'idle';
  if (s.includes('stop')) return 'stopped';
  return 'offline';
}

function snapshotUnitToFleetUnit(u: FleetSnapshotUnit): FleetUnit {
  const plate = u.plate || extractPlateFromName(u.name);
  const fuelLiters = u.fuel?.levelLiters;
  const tankCapacity = u.tankCapacity;
  const fuelLevel =
    fuelLiters != null && tankCapacity != null && tankCapacity > 0
      ? Math.min(100, Math.max(0, Math.round((fuelLiters / tankCapacity) * 100)))
      : u.fuelLevel;
  return {
    id: u.id,
    wialonId: u.wialonId ?? (Number.isFinite(Number(u.id)) ? Number(u.id) : undefined),
    name: u.name,
    plate,
    hw: u.hw,
    hwName: u.hwName,
    uid: u.uid,
    ph: u.ph,
    netconn: u.netconn,
    motionState: u.motionState,
    status: normalizeStatus(u.status),
    assetCategory: u.assetCategory,
    stationary:
      u.stationary === true ||
      u.assetCategory === 'generator' ||
      u.assetCategory === 'machinery' ||
      isFleetGenerator({
        name: u.name,
        plate,
        engineHours: u.engineHours,
        mileage: u.mileage,
        flds: u.flds,
        sens: u.sens,
        prp: u.prp,
        hwName: u.hwName,
      }),
    speed: u.position?.speed,
    fuelLevel,
    fuelLiters,
    tankCapacity,
    fuelFormatted: u.fuel?.levelFormatted,
    lat: u.position?.lat,
    lng: u.position?.lng,
    course: u.position?.course,
    iconUrl: u.iconUrl,
    iconUgi: u.iconUgi,
    lastUpdate: u.position?.time ? new Date(u.position.time * 1000) : undefined,
    engineHours: u.engineHours,
    mileage: u.mileage,
    prp: u.prp,
    flds: u.flds,
    sens: u.sens,
    prms: u.prms,
    rtd: u.rtd,
    lmsg: u.lmsg,
  };
}

export function snapshotToUnits(snapshot?: FleetSnapshot | null): FleetUnit[] {
  const raw = snapshot?.units;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map(snapshotUnitToFleetUnit);
}

export function snapshotToStatuses(snapshot?: FleetSnapshot | null, mergedUnits?: FleetUnit[]): AssetStatusEntry[] {
  const raw = snapshot?.units;
  if (!Array.isArray(raw) || !raw.length) return [];
  const unitById = new Map((mergedUnits || []).map((u) => [u.id, u]));
  return raw.map((u) => {
    const merged = unitById.get(u.id);
    const plate = u.plate || extractPlateFromName(u.name);
    const fuelLevel = merged?.fuelLevel ?? u.fuelLevel;
    const fuelFormatted = merged?.fuelFormatted ?? u.fuel?.levelFormatted;
    const fuelLiters = merged?.fuelLiters ?? u.fuel?.levelLiters;
    return {
      assetId: u.id,
      asset: { id: u.id, name: u.name, registrationPlate: plate },
      status: u.position
        ? {
            status: u.status,
            fuelLevel,
            fuelFormatted,
            fuelLiters,
            location: {
              latitude: u.position.lat,
              longitude: u.position.lng,
              speed: u.trip?.currSpeed ?? u.position.speed,
              course: u.trip?.course ?? u.position.course,
              timestamp: new Date(u.position.time * 1000),
            },
          }
        : { status: u.status, fuelLevel, fuelFormatted, fuelLiters },
      wialon: {
        wialonId: u.wialonId ?? (Number.isFinite(Number(u.id)) ? Number(u.id) : undefined),
        hwName: u.hwName,
        hw: u.hw,
        motionState: u.motionState,
        netconn: u.netconn,
        iconUrl: u.iconUrl,
        iconUgi: u.iconUgi,
        trip: u.trip,
        course: u.position?.course,
        fuel: u.fuel,
        fuelFormatted,
        fuelLiters,
        flds: u.flds,
        sens: u.sens,
        engineHours: u.engineHours,
        mileage: u.mileage,
      },
    };
  });
}

export function buildFleetUnits(statuses: AssetStatusEntry[]): FleetUnit[] {
  return statuses.map((row) => {
    const wialon = row.wialon;
    const loc = row.status?.location;
    const name = String(row.asset?.name || `Unit ${row.assetId}`);
    const plate = row.asset?.registrationPlate || extractPlateFromName(name);

    return {
      id: row.assetId,
      wialonId: wialon?.wialonId ?? (Number.isFinite(Number(row.assetId)) ? Number(row.assetId) : undefined),
      name,
      plate,
      hw: wialon?.hw,
      hwName: wialon?.hwName,
      motionState: wialon?.motionState,
      netconn: wialon?.netconn,
      status: normalizeStatus(row.status?.status),
      fuelLevel: row.status?.fuelLevel,
      speed: loc?.speed,
      lat: loc?.latitude,
      lng: loc?.longitude,
      course: loc?.course ?? wialon?.course,
      iconUrl: wialon?.iconUrl,
      iconUgi: wialon?.iconUgi,
      engineHours: wialon?.engineHours,
      mileage: wialon?.mileage,
      flds: wialon?.flds,
      sens: wialon?.sens,
      lastUpdate: loc?.timestamp ? new Date(loc.timestamp) : undefined,
    };
  });
}
