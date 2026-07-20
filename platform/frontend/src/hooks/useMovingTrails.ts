import { useEffect, useMemo, useState } from 'react';

type Point = { id: string; lat: number; lng: number; motion: string };

const MAX_TRAIL_POINTS = 200;

/** Live breadcrumb trails for moving units between fleet polls. */
export function useMovingTrails(points: Point[]) {
  const [trails, setTrails] = useState<Map<string, [number, number][]>>(new Map());

  useEffect(() => {
    setTrails((prev) => {
      const next = new Map(prev);
      let changed = false;
      const movingIds = new Set<string>();

      for (const p of points) {
        if (p.motion !== 'moving') continue;
        movingIds.add(p.id);
        const trail = next.get(p.id) || [];
        const last = trail[trail.length - 1];
        const moved =
          !last ||
          Math.abs(last[0] - p.lat) > 0.00002 ||
          Math.abs(last[1] - p.lng) > 0.00002;
        if (moved) {
          next.set(p.id, [...trail, [p.lat, p.lng]].slice(-MAX_TRAIL_POINTS));
          changed = true;
        }
      }

      for (const id of next.keys()) {
        if (!movingIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [points]);

  return useMemo(() => {
    const list: Array<{ id: string; positions: [number, number][] }> = [];
    trails.forEach((positions, id) => {
      if (positions.length > 1) list.push({ id, positions });
    });
    return list;
  }, [trails]);
}
