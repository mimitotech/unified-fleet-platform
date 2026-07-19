import { config } from '@fortawesome/fontawesome-svg-core';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBolt,
  faBus,
  faCamera,
  faCar,
  faGasPump,
  faLocationDot,
  faMotorcycle,
  faSatelliteDish,
  faScrewdriverWrench,
  faTag,
  faTruck,
  faTruckRampBox,
  faVanShuttle,
  faVideo,
} from '@fortawesome/free-solid-svg-icons';
import type { AssetDisplayKind } from '@/lib/assetDisplay';
import type { VehicleStatus } from '@/types/status';

config.autoAddCss = false;

/** Font Awesome solid icon per fleet asset type. */
export const FLEET_FA_ICONS: Record<AssetDisplayKind, IconDefinition> = {
  car: faCar,
  truck: faTruck,
  van: faVanShuttle,
  bus: faBus,
  boda: faMotorcycle,
  trailer: faTruckRampBox,
  generator: faBolt,
  fuel_tank: faGasPump,
  camera: faCamera,
  dashcam: faVideo,
  sensor: faSatelliteDish,
  tag: faTag,
  equipment: faScrewdriverWrench,
  tracker: faLocationDot,
};

export function fleetFaIcon(kind: AssetDisplayKind): IconDefinition {
  return FLEET_FA_ICONS[kind] || FLEET_FA_ICONS.tracker;
}

/** SVG path data from a Font Awesome icon definition. */
export function faIconPath(def: IconDefinition): string {
  const data = def.icon[4];
  return typeof data === 'string' ? data : data.join(' ');
}

/** Telematics status colors (map markers) — high contrast on light/dark map tiles */
export const FLEET_STATUS_COLORS: Record<VehicleStatus, string> = {
  moving: '#16a34a',
  idle: '#ea580c',
  stopped: '#dc2626',
  offline: '#64748b',
};

/** List / table status tints (Tailwind). */
export const UNIT_LIST_STATUS_STYLES: Record<
  VehicleStatus,
  { bg: string; text: string; dot: string }
> = {
  moving: { bg: 'bg-status-moving/10', text: 'text-status-moving', dot: 'bg-status-moving' },
  idle: { bg: 'bg-status-idle/10', text: 'text-status-idle', dot: 'bg-status-idle' },
  stopped: { bg: 'bg-status-stopped/10', text: 'text-status-stopped', dot: 'bg-status-stopped' },
  offline: { bg: 'bg-status-offline/10', text: 'text-status-offline', dot: 'bg-status-offline' },
};

export const FA_ICON_PX = { sm: 14, md: 16, lg: 20, map: 15, mapSelected: 17 };
