import type { FuelSensorSlotValue } from '@/lib/fuelTypes';

export function fmtSlot(slot: FuelSensorSlotValue | null | undefined, fallback = '—'): string {
  if (!slot) return fallback;
  const v = Math.round(slot.value * 10) / 10;
  return slot.unit ? `${v} ${slot.unit}` : String(v);
}

export function fmtLiters(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n * 10) / 10} L`;
}

export function fuelTone(pct?: number | null): string {
  if (pct == null) return '';
  if (pct >= 50) return 'text-status-moving font-semibold';
  if (pct >= 25) return 'text-status-idle font-semibold';
  return 'text-status-stopped font-semibold';
}
