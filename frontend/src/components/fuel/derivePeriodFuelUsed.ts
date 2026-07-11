import type { FuelTransaction } from '@/types/entities';

/**
 * Derive period fuel used when Wialon only provides fillings:
 * opening level + filled − closing level − losses.
 */
export function derivePeriodFuelUsed(
  transactions: FuelTransaction[],
  filled: number,
  lost: number,
  liveLevel?: number,
): number {
  if (!transactions.length && liveLevel == null) return 0;

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  let opening = 0;
  for (const t of sorted) {
    if (t.initialLevel > 0) {
      opening = t.initialLevel;
      break;
    }
    if (t.finalLevel > 0) {
      opening = t.finalLevel;
      break;
    }
  }

  let closing = liveLevel ?? 0;
  if (closing <= 0) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].finalLevel > 0) {
        closing = sorted[i].finalLevel;
        break;
      }
      if (sorted[i].initialLevel > 0) {
        closing = sorted[i].initialLevel;
        break;
      }
    }
  }

  if (opening <= 0 && filled <= 0 && closing <= 0) return 0;
  return Math.max(0, Math.round((opening + filled - closing - lost) * 10) / 10);
}
