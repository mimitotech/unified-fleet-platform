import { useEffect, useState } from 'react';
import {
  getFleetUnitIconCached,
  loadFleetUnitIconBlob,
  subscribeFleetIconCache,
} from '@/lib/fleetIconCache';

/** Stable Wialon unit icon URL — one canonical fetch size, shared cache. */
export function useFleetUnitIcon(wialonId?: number, iconUgi = 1) {
  const [, bump] = useState(0);

  useEffect(() => subscribeFleetIconCache(() => bump((n) => n + 1)), []);

  const src = wialonId ? getFleetUnitIconCached(wialonId, iconUgi) : undefined;

  useEffect(() => {
    if (!wialonId || src) return;

    let cancelled = false;
    void loadFleetUnitIconBlob(wialonId, iconUgi).then((url) => {
      if (!cancelled && url) bump((n) => n + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [wialonId, iconUgi, src]);

  return src;
}
