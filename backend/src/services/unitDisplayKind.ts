import type { WialonUnitKind } from './wialonUnitClassify.js';
import { extractPlateFromName, UG_PLATE_RE } from './unitPlateUtils.js';
import { isWialonGenerator, isWialonVehicle } from './wialonAssetCategory.js';

export type UnitDisplayKind =
  | 'truck'
  | 'van'
  | 'car'
  | 'boda'
  | 'bus'
  | 'trailer'
  | 'generator'
  | 'fuel_tank'
  | 'camera'
  | 'dashcam'
  | 'sensor'
  | 'tag'
  | 'equipment'
  | 'tracker';

/** Map icon kind for labels/filters — conservative; never use tank capacity alone. */
export function resolveUnitDisplayKind(input: {
  kind: WialonUnitKind | string;
  name: string;
  plate?: string;
  hardware?: string;
  engineHours?: number;
  mileage?: number;
  customFields?: Record<string, string>;
}): UnitDisplayKind {
  const name = (input.name || '').trim();
  const nameLower = name.toLowerCase();
  const plate = (input.plate || extractPlateFromName(name) || '').trim();
  const kind = (input.kind || '').toLowerCase();
  const hay = `${nameLower} ${(input.hardware || '').toLowerCase()}`;

  if (
    isWialonGenerator({
      name,
      plate,
      customFields: input.customFields,
      engineHours: input.engineHours,
      mileage: input.mileage,
    })
  ) {
    return 'generator';
  }

  if (/trailer|semi|reefer|flatbed/i.test(hay) || kind === 'trailer') return 'trailer';
  if (/\bbus\b|coach|minibus|psv/i.test(hay)) return 'bus';
  if (/\bboda\b|motor\s*cycle|motorbike|okada/i.test(hay)) return 'boda';
  if (/\bvan\b|pickup|suv|minivan/i.test(hay)) return 'van';
  if (/\bcar\b|sedan|saloon/i.test(hay)) return 'car';

  if (
    isWialonVehicle({ name, plate, mileage: input.mileage }) ||
    plate ||
    UG_PLATE_RE.test(name) ||
    kind === 'vehicle'
  ) {
    return /\bvan\b|pickup/i.test(hay) ? 'van' : 'truck';
  }

  if (kind === 'dashcam' || /dash\s*cam|mdvr|dvr/i.test(hay)) return 'dashcam';
  if (kind === 'camera' || /camera|cctv/i.test(hay)) return 'camera';
  if (kind === 'fuel_sensor') return 'fuel_tank';
  if (kind === 'driver_tag' || /ibutton|rfid|driver\s*tag/i.test(hay)) return 'tag';
  if (kind === 'magnetic' || /magnet|door sensor/i.test(hay)) return 'sensor';
  if (kind === 'equipment') return 'equipment';

  return 'equipment';
}
