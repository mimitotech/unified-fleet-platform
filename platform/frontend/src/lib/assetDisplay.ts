import type { LucideIcon } from 'lucide-react';
import {
  Truck, Car, Bike, Bus, Zap, Video, Fuel, Magnet, Tag, Container, Wrench, Satellite, Cog,
} from 'lucide-react';
import type { VehicleStatus } from '@/types/status';
import { extractPlateFromName, UG_PLATE_RE } from '@/lib/plateUtils';
import { isWialonGenerator, isWialonVehicle } from '@/lib/wialonAssetCategory';

/** Visual icon kind — carrier asset (vehicle/trailer/generator) over device type (tracker/sensor). */
export type AssetDisplayKind =
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

const DISPLAY_ICONS: Record<AssetDisplayKind, LucideIcon> = {
  truck: Truck,
  van: Truck,
  car: Car,
  boda: Bike,
  bus: Bus,
  trailer: Container,
  generator: Zap,
  fuel_tank: Fuel,
  camera: Video,
  dashcam: Video,
  sensor: Magnet,
  tag: Tag,
  equipment: Wrench,
  tracker: Satellite,
};

/** Per-asset-type base colors (icon + soft background). */
export const ASSET_KIND_COLORS: Record<AssetDisplayKind, { bg: string; text: string; marker: string }> = {
  truck: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', marker: '#3b82f6' },
  van: { bg: 'bg-sky-500/15', text: 'text-sky-600 dark:text-sky-400', marker: '#0ea5e9' },
  car: { bg: 'bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400', marker: '#6366f1' },
  boda: { bg: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', marker: '#8b5cf6' },
  bus: { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', marker: '#06b6d4' },
  trailer: { bg: 'bg-indigo-500/14', text: 'text-indigo-700 dark:text-indigo-300', marker: '#4f46e5' },
  generator: { bg: 'bg-amber-500/18', text: 'text-amber-700 dark:text-amber-400', marker: '#f59e0b' },
  fuel_tank: { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', marker: '#f97316' },
  camera: { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400', marker: '#a855f7' },
  dashcam: { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-600 dark:text-fuchsia-400', marker: '#d946ef' },
  sensor: { bg: 'bg-stone-500/15', text: 'text-stone-600 dark:text-stone-400', marker: '#78716c' },
  tag: { bg: 'bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400', marker: '#14b8a6' },
  equipment: { bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400', marker: '#64748b' },
  tracker: { bg: 'bg-slate-500/12', text: 'text-slate-500 dark:text-slate-400', marker: '#94a3b8' },
};

export const STATUS_RING_COLORS: Record<VehicleStatus, string> = {
  moving: 'ring-status-moving shadow-[0_0_0_2px_hsl(var(--status-moving)/0.45)]',
  idle: 'ring-status-idle shadow-[0_0_0_2px_hsl(var(--status-idle)/0.45)]',
  stopped: 'ring-status-stopped shadow-[0_0_0_2px_hsl(var(--status-stopped)/0.45)]',
  offline: 'ring-status-offline shadow-[0_0_0_1px_hsl(var(--status-offline)/0.35)]',
};

export const STATUS_MARKER_COLORS: Record<VehicleStatus, string> = {
  moving: '#22c55e',
  idle: '#f59e0b',
  stopped: '#ef4444',
  offline: '#9ca3af',
};

export function assetDisplayIcon(kind: AssetDisplayKind): LucideIcon {
  return DISPLAY_ICONS[kind] || Cog;
}

export function assetDisplayLabel(kind: AssetDisplayKind): string {
  return kind.replace(/_/g, ' ');
}

/**
 * Resolve what icon to show — prefer host asset (truck, generator, trailer)
 * over device type (tracker, fuel sensor) when the unit name/plate indicates a carrier.
 */
export function resolveAssetDisplayKind(input: {
  kind?: string;
  name?: string;
  plate?: string;
  hardware?: string;
  engineHours?: number;
  mileage?: number;
  iconKind?: string;
  customFields?: Record<string, string>;
}): AssetDisplayKind {
  if (input.iconKind) {
    const k = input.iconKind as AssetDisplayKind;
    if (k in DISPLAY_ICONS && k !== 'generator') return k;
    if (k === 'generator' && isWialonGenerator({
      name: input.name || '',
      plate: input.plate,
      engineHours: input.engineHours,
      mileage: input.mileage,
      customFields: input.customFields,
    })) {
      return 'generator';
    }
  }

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
