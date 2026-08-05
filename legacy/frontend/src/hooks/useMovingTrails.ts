import { useEffect, useMemo, useRef, useState } from 'react';
import { haversineMeters, isValidMapCoord } from '@/lib/mapGeo';

type Point = { id: string; lat: number; lng: number; motion: string };

const MAX_TRAIL_POINTS = 120;
const MIN_MOVE_M = 5;
const MAX_SEGMENT_M = 800;

/**
 * Live breadcrumb trails for moving units.
 * Feed RAW polled positions (not RAF-smoothed) so trails only follow real GPS.
 */
export function useMovingTrails(points: Point[]) {
  const [trails, setTrails] = useState<Map<string, [number, number][]>>(new Map());
  const lastRawRef = useRef(new Map<string, { lat: number; lng: number }>());

  useEffect(() => {
    setTrails((prev) => {
      const next = new Map(prev);
      let changed = false;
      const movingIds = new Set<string>();

      for (const p of points) {
        if (!isValidMapCoord(p.lat, p.lng)) continue;
        if (p.motion !== 'moving') {
          lastRawRef.current.delete(p.id);
          continue;
        }
        movingIds.add(p.id);

        const lastRaw = lastRawRef.current.get(p.id);
        if (lastRaw) {
          const d = haversineMeters(lastRaw.lat, lastRaw.lng, p.lat, p.lng);
          if (d < MIN_MOVE_M) continue;
        }
        lastRawRef.current.set(p.id, { lat: p.lat, lng: p.lng });

        const trail = next.get(p.id) || [];
        const last = trail[trail.length - 1];
        if (last) {
          const gap = haversineMeters(last[0], last[1], p.lat, p.lng);
          if (gap > MAX_SEGMENT_M) {
            next.set(p.id, [[p.lat, p.lng]]);
            changed = true;
            continue;
          }
          if (gap < MIN_MOVE_M) continue;
        }

        next.set(p.id, ([...trail, [p.lat, p.lng] as [number, number]] as [number, number][]).slice(-MAX_TRAIL_POINTS));
        changed = true;
      }

      for (const id of next.keys()) {
        if (!movingIds.has(id)) {
          next.delete(id);
          lastRawRef.current.delete(id);
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
