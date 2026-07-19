import type { FuelTransaction } from '@/types/entities';

/**
 * Derive period fuel used when Wialon only provides fillings:
 * opening level + filled − closing level − losses.
 * Opening/closing must be near the live tank so FLS noise cannot invent huge "Used".
 */
export function derivePeriodFuelUsed(
  transactions: FuelTransaction[],
  filled: number,
  lost: number,
  liveLevel?: number,
): number {
  if (!transactions.length && liveLevel == null) return 0;

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const plausible = (level: number) => {
    if (level <= 0) return false;
    if (liveLevel == null || liveLevel <= 0) return level <= 50_000;
    return level <= liveLevel * 2.5 || level <= liveLevel + 500;
  };

  let opening = 0;
  for (const t of sorted) {
    const candidate = t.initialLevel > 0 ? t.initialLevel : t.finalLevel > 0 ? t.finalLevel : 0;
    if (plausible(candidate)) {
      opening = candidate;
      break;
    }
  }

  let closing = liveLevel ?? 0;
  if (closing <= 0) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const candidate =
        sorted[i].finalLevel > 0 ? sorted[i].finalLevel : sorted[i].initialLevel > 0 ? sorted[i].initialLevel : 0;
      if (plausible(candidate)) {
        closing = candidate;
        break;
      }
    }
  }

  if (!plausible(opening) && !(liveLevel != null && liveLevel > 0)) return 0;
  if (!plausible(opening)) return 0;

  if (opening <= 0 && filled <= 0 && closing <= 0) return 0;
  const derived = Math.max(0, Math.round((opening + filled - closing - lost) * 10) / 10);
  const tankRef = liveLevel && liveLevel > 0 ? liveLevel : closing;
  if (tankRef > 0 && derived > tankRef * 3 && derived > 500) return 0;
  return derived;
}
