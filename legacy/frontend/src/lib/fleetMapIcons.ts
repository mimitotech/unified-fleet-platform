import type { VehicleStatus } from '@/types/status';
import { FLEET_STATUS_COLORS } from '@/lib/fleetFontAwesome';

const MARKER_SHADOW = 'filter:drop-shadow(0 1px 3px rgba(0,0,0,0.45));';
const COURSE_ARROW_COLOR = '#22c55e';

function abbreviatePlate(plate: string): string {
  const parts = plate.split(/\s+/);
  if (parts.length >= 2) return parts[parts.length - 1];
  const match = plate.match(/\d+[A-Z]?$/i);
  return match ? match[0] : plate.slice(-4);
}

/** Course arrow — always high-contrast on the map. */
function courseArrowSvg(course: number, color: string, size: number): string {
  const half = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="${-half} ${-half} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="${MARKER_SHADOW}">
    <g transform="rotate(${course})">
      <path d="M0,${-half + 1} L${half - 2},${half - 1} L0,${half - 8} L${-(half - 2)},${half - 1} Z"
        fill="${color}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

function neutralIconPlaceholder(size: number, ringColor: string): string {
  return `<div style="width:${size}px;height:${size}px;border-radius:6px;background:#f8fafc;border:2px solid ${ringColor};display:flex;align-items:center;justify-content:center;font-size:10px;color:#64748b;">?</div>`;
}

/** Colored status ring — icon stays 100% visible; state is shown by ring color. */
function statusIconFrame(
  innerHtml: string,
  iconSize: number,
  statusColor: string,
  isMoving: boolean,
  isSelected: boolean
): string {
  const pad = 2;
  const ring = isSelected ? 3 : 2;
  const outer = iconSize + pad * 2 + ring * 2;
  const pulse = isMoving
    ? 'animation:fleet-marker-pulse 1.6s ease-in-out infinite;'
    : '';

  return `
    <div style="color:${statusColor};width:${outer}px;height:${outer}px;border-radius:${Math.round(outer * 0.22)}px;padding:${pad}px;background:${statusColor};box-shadow:0 0 0 2px #ffffff,0 2px 6px rgba(0,0,0,0.4);${pulse}">
      <div style="width:${iconSize}px;height:${iconSize}px;border-radius:6px;background:#ffffff;padding:2px;box-sizing:content-box;${MARKER_SHADOW}">
        ${innerHtml}
      </div>
    </div>`;
}

function plateLabelHtml(
  labelText: string,
  labelW: number,
  labelH: number,
  top: number,
  color: string,
  selected: boolean,
  extraClass = ''
): string {
  if (!labelText) return '';
  return `
    <div class="${extraClass}" style="position:absolute;top:${top}px;left:0;width:${labelW}px;height:${labelH}px;background:#ffffff;border:2px solid ${color};border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;">
      <span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:${selected ? 700 : 600};color:#0f172a;">${labelText}</span>
    </div>`;
}

function speedBadgeHtml(speed: number, labelW: number, top: number, color: string): string {
  const text = speed > 0 ? `${Math.round(speed)}` : '•';
  return `
    <div style="position:absolute;top:${top}px;left:0;width:${labelW}px;height:14px;display:flex;align-items:center;justify-content:center;">
      <span style="font-family:system-ui,sans-serif;font-size:9px;font-weight:700;color:#ffffff;background:${color};padding:0 5px;border-radius:3px;border:1px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${text}</span>
    </div>`;
}

function statusDotHtml(color: string, top: number, left: number): string {
  return `
    <div style="position:absolute;top:${top}px;left:${left}px;width:8px;height:8px;border-radius:50%;background:${color};border:1.5px solid #ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>`;
}

export type MapMarkerOptions = {
  status: VehicleStatus;
  plate?: string;
  name?: string;
  isSelected?: boolean;
  course?: number;
  speed?: number;
  wialonIconSrc?: string;
  imgRot?: boolean;
};

export type MapIconLayout = {
  html: string;
  width: number;
  height: number;
  anchorY: number;
};

/** Build marker HTML + layout metrics for Leaflet anchoring. */
export function buildFleetMapIcon(opts: MapMarkerOptions): MapIconLayout {
  const {
    status,
    plate = '',
    name = '',
    isSelected = false,
    course = 0,
    speed = 0,
    wialonIconSrc,
    imgRot = false,
  } = opts;

  const statusColor = FLEET_STATUS_COLORS[status] || FLEET_STATUS_COLORS.offline;
  const isMoving = status === 'moving';
  const iconSize = isSelected ? 22 : 18;
  const arrowSize = isSelected ? 14 : 12;
  const arrowOffset = 2;
  const framePad = 2;
  const frameRing = 2;
  const frameOuter = iconSize + framePad * 2 + frameRing * 2;

  const plateLabel = plate
    ? isSelected
      ? plate
      : abbreviatePlate(plate)
    : name
      ? name.slice(0, isSelected ? 18 : 14)
      : '';

  const showPlate = isSelected && !!plateLabel;
  const speedLabel = isMoving && isSelected;
  const labelText = showPlate ? plateLabel : '';
  const labelH = labelText ? 18 : 0;
  const speedH = speedLabel ? 18 : 0;
  const labelGap = labelText || speedLabel ? 5 : 0;

  const rot = imgRot && course && !isMoving ? `transform:rotate(${course}deg);` : '';
  const imgHtml = wialonIconSrc
    ? `<img src="${wialonIconSrc}" width="${iconSize}" height="${iconSize}" style="object-fit:contain;display:block;width:${iconSize}px;height:${iconSize}px;opacity:1;${rot}" alt="" />`
    : neutralIconPlaceholder(iconSize, statusColor);

  const framedIcon = statusIconFrame(imgHtml, iconSize, statusColor, isMoving, isSelected);

  const iconBlock = isMoving
    ? `
      <div style="position:relative;width:${frameOuter}px;height:${frameOuter}px;margin:0 auto;">
        <div style="position:absolute;left:50%;top:50%;width:0;height:0;z-index:3;pointer-events:none;">
          <div style="transform:rotate(${course}deg) translateY(-${frameOuter / 2 + arrowOffset}px);margin-left:-${arrowSize / 2}px;width:${arrowSize}px;height:${arrowSize}px;">
            ${courseArrowSvg(0, COURSE_ARROW_COLOR, arrowSize)}
          </div>
        </div>
        <div style="position:absolute;left:0;top:0;z-index:2;">
          ${framedIcon}
        </div>
      </div>`
    : `
      <div style="position:relative;width:${frameOuter}px;height:${frameOuter}px;margin:0 auto;">
        ${framedIcon}
        ${statusDotHtml(statusColor, -1, frameOuter - 8)}
      </div>`;

  const labelW = Math.max(
    labelText.length * 7 + 12,
    speedLabel ? 64 : 0,
    frameOuter + 12
  );
  const iconBlockH = frameOuter + (isMoving ? arrowSize / 2 + arrowOffset : 0);
  const totalH = iconBlockH + labelGap + speedH + labelH + (speedH && labelH ? 3 : 0);
  const cx = labelW / 2;
  const cy = iconBlockH / 2;

  let belowIcon = iconBlockH + labelGap;
  const speedHtml = speedLabel ? speedBadgeHtml(speed, labelW, belowIcon, statusColor) : '';
  if (speedLabel) belowIcon += speedH + 3;
  const plateHtml = plateLabelHtml(labelText, labelW, labelH, belowIcon, statusColor, isSelected);

  const html = `
    <div class="fleet-unit-marker-root${isMoving ? ' fleet-unit-marker-moving' : ''}" style="width:${labelW}px;height:${totalH}px;position:relative;opacity:1;">
      <div style="position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);">
        ${iconBlock}
      </div>
      ${speedHtml}
      ${plateHtml}
    </div>`;

  return { html, width: labelW, height: totalH, anchorY: cy };
}

/** @deprecated use buildFleetMapIcon */
export function buildFleetMapIconHtml(opts: MapMarkerOptions): string {
  return buildFleetMapIcon(opts).html;
}

export const buildWialonMapIconHtml = buildFleetMapIconHtml;
export const WIALON_STATUS_COLORS = FLEET_STATUS_COLORS;
