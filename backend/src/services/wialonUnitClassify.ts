import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { extractPlateFromName } from './unitPlateUtils.js';
import { isWialonGenerator } from './wialonAssetCategory.js';

/** Broad MAMS unit kinds aligned with Wialon avl_unit + hardware profiles. */
export type WialonUnitKind =
  | 'vehicle'
  | 'tracker'
  | 'fuel_sensor'
  | 'camera'
  | 'dashcam'
  | 'magnetic'
  | 'driver_tag'
  | 'trailer'
  | 'generator'
  | 'equipment'
  | 'other';

const DEVICE_PATTERNS: Array<{ kind: WialonUnitKind; patterns: RegExp[] }> = [
  { kind: 'trailer', patterns: [/trailer/i, /semi/i, /reefer/i, /flatbed/i] },
  { kind: 'dashcam', patterns: [/dash\s*cam/i, /dascam/i, /mdvr/i, /dvr/i] },
  { kind: 'camera', patterns: [/camera/i, /cctv/i, /ipc/i] },
  { kind: 'magnetic', patterns: [/magnet/i, /door/i, /cargo/i] },
  { kind: 'driver_tag', patterns: [/ibutton/i, /i-button/i, /driver\s*tag/i, /rfid/i, /tachograph/i] },
  {
    kind: 'vehicle',
    patterns: [
      /\btruck\b/i, /\blorry\b/i, /\bbus\b/i, /\bvan\b/i, /\bcar\b/i, /\bpickup\b/i,
      /\bboda\b/i, /motor\s*cycle/i, /tipper/i, /tanker/i, /haulage/i,
    ],
  },
];

function mapCustomFields(flds?: Record<string, { n?: string; v?: string }>) {
  const out: Record<string, string> = {};
  if (!flds) return out;
  for (const f of Object.values(flds)) {
    if (f?.n) out[f.n] = String(f.v ?? '');
  }
  return out;
}

export function classifyWialonUnit(item: WialonSearchItem): WialonUnitKind {
  const prp = item.prp || {};
  const plate = prp.registration_plate || prp.plate || extractPlateFromName(item.nm);
  const customFields = mapCustomFields(item.flds);
  const mileage = item.cnm;
  const engineHours = item.cneh;

  if (
    isWialonGenerator({
      name: item.nm,
      plate,
      customFields,
      flds: item.flds,
      engineHours,
      mileage,
    })
  ) {
    return 'generator';
  }

  const hay = [item.nm, prp.hw_type, prp.hw, prp.HW, prp.vehicle_class, prp.vehicle_type]
    .filter(Boolean)
    .join(' ');

  for (const { kind, patterns } of DEVICE_PATTERNS) {
    if (kind === 'vehicle') continue;
    if (patterns.some((re) => re.test(hay))) return kind;
  }

  if (plate || extractPlateFromName(item.nm) || (mileage ?? 0) > 1000) {
    return 'vehicle';
  }

  if (/\bfuel\b/i.test(hay) && /\bsensor\b/i.test(hay)) return 'fuel_sensor';

  return 'tracker';
}

export function wialonUnitModules(kind: WialonUnitKind): string[] {
  const base = ['monitoring', 'commands'];
  switch (kind) {
    case 'fuel_sensor':
      return [...base, 'fuel', 'sensors'];
    case 'camera':
    case 'dashcam':
      return [...base, 'surveillance', 'sensors'];
    case 'driver_tag':
      return [...base, 'drivers'];
    case 'trailer':
      return [...base, 'trailers', 'geofencing'];
    case 'generator':
      return [...base, 'fuel', 'sensors'];
    case 'vehicle':
      return [...base, 'fuel', 'routes', 'drivers', 'geofencing', 'surveillance', 'sensors'];
    default:
      return [...base, 'sensors'];
  }
}
