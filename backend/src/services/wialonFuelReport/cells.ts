import { createHash } from 'crypto';
import type { WialonCell } from './types.js';

export function getCellValue(cells: WialonCell[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return '';
  const cell = cells[idx];
  if (typeof cell === 'string') return cell;
  if (cell && typeof cell === 'object') {
    if ('t' in cell && cell.t !== undefined) return String(cell.t);
    if ('v' in cell && cell.v !== undefined) return String(cell.v);
  }
  return '';
}

export function getCellNumber(cells: WialonCell[], idx: number): number {
  if (idx < 0 || idx >= cells.length) return 0;
  const cell = cells[idx];
  if (cell && typeof cell === 'object' && 'v' in cell) {
    if (typeof cell.v === 'number' && !Number.isNaN(cell.v)) return cell.v;
    if (typeof cell.v === 'string' && cell.v !== '') {
      const n = parseFloat(cell.v);
      if (!Number.isNaN(n)) return n;
    }
  }
  const value = getCellValue(cells, idx);
  if (!value) return 0;
  const num = parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isNaN(num) ? 0 : num;
}

export function getCellTimestamp(cells: WialonCell[], idx: number): number {
  if (idx < 0 || idx >= cells.length) return 0;
  const cell = cells[idx];
  if (cell && typeof cell === 'object' && 'v' in cell && typeof cell.v === 'number') return cell.v;
  return 0;
}

/** Time column as display string — handles Wialon text and Unix timestamp cells. */
export function getCellTimeString(cells: WialonCell[], idx: number): string {
  const text = getCellValue(cells, idx).trim();
  if (text) return text;
  const ts = getCellTimestamp(cells, idx);
  if (ts > 0) {
    return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
  }
  return '';
}

export function getCellCoordinates(cells: WialonCell[], idx: number): { lat: number; lng: number } | null {
  if (idx < 0 || idx >= cells.length) return null;
  const cell = cells[idx];
  if (cell && typeof cell === 'object' && 'y' in cell && 'x' in cell) {
    const lat = typeof cell.y === 'number' ? cell.y : 0;
    const lng = typeof cell.x === 'number' ? cell.x : 0;
    if (lat !== 0 || lng !== 0) return { lat, lng };
  }
  return null;
}

export function findLocationFromCells(
  cells: WialonCell[],
  columnMap: Record<string, number>
): { location: string; lat: number; lng: number } {
  let location = '';
  let lat = 0;
  let lng = 0;
  if (columnMap.location >= 0) {
    location = getCellValue(cells, columnMap.location);
    const coords = getCellCoordinates(cells, columnMap.location);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }
  if (!location) {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell && typeof cell === 'object' && 't' in cell) {
        const text = String(cell.t);
        if (text.includes(',') && text.length > 10 && !text.includes(':')) {
          location = text;
          const coords = getCellCoordinates(cells, i);
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
          break;
        }
      }
    }
  }
  return { location, lat, lng };
}

export function getDurationSeconds(cells: WialonCell[], idx: number): number {
  if (idx < 0 || idx >= cells.length) return 0;
  const cell = cells[idx];
  if (cell && typeof cell === 'object' && 'v' in cell && typeof cell.v === 'number' && cell.v > 0) {
    return cell.v;
  }
  return parseDurationToSeconds(getCellValue(cells, idx));
}

export function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  const trimmed = durationStr.trim();
  // Wialon sometimes returns raw seconds as a plain number string
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const hmsMatch = durationStr.match(/(\d+)\s*h(?:ours?)?/i);
  const minMatch = durationStr.match(/(\d+)\s*m(?:in(?:utes?)?)?/i);
  const secMatch = durationStr.match(/(\d+)\s*s(?:ec(?:onds?)?)?/i);
  let seconds = 0;
  if (hmsMatch) seconds += parseInt(hmsMatch[1], 10) * 3600;
  if (minMatch) seconds += parseInt(minMatch[1], 10) * 60;
  if (secMatch) seconds += parseInt(secMatch[1], 10);
  if (seconds > 0) return seconds;
  const colonMatch = durationStr.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    seconds = parseInt(colonMatch[1], 10) * 3600 + parseInt(colonMatch[2], 10) * 60;
    if (colonMatch[3]) seconds += parseInt(colonMatch[3], 10);
    return seconds;
  }
  return 0;
}

export function txId(unitId: number, section: string, tank: string, timestamp: number, sensor: string): string {
  const raw = [unitId, section, tank, timestamp, sensor || 'default'].join('-');
  return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}
