import { useEffect, useRef, useState } from 'react';
import { LIVE_POLL } from '@/lib/liveRefresh';
import { haversineMeters, isValidMapCoord } from '@/lib/mapGeo';

type AnimPoint = { id: string; lat: number; lng: number; motion?: string; speed?: number };

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);
/** Hold "moving" briefly so idle flicker does not snap the marker. */
const MOTION_STICKY_MS = 4500;
/** Beyond this, snap instead of gliding (avoids map-crossing rubber-band). */
const MAX_GLIDE_M = 550;
const MIN_MOVE_M = 1.5;

/**
 * Interpolate marker positions between fleet polls for steady realtime movement.
 * Large GPS jumps snap; brief idle flicker keeps the last glide running.
 */
export function useSmoothMapPositions<T extends AnimPoint>(
  points: T[],
  pollMs = LIVE_POLL.fleet,
): T[] {
  const baseDurationMs = Math.max(1400, pollMs - 150);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const targetsRef = useRef(new Map<string, { lat: number; lng: number }>());
  const currentRef = useRef(new Map<string, { lat: number; lng: number }>());
  const animRef = useRef(
    new Map<
      string,
      { from: { lat: number; lng: number }; to: { lat: number; lng: number }; start: number; duration: number }
    >(),
  );
  const lastMovingAtRef = useRef(new Map<string, number>());
  const [rendered, setRendered] = useState<T[]>(points);

  const isEffectivelyMoving = (p: T, now: number) => {
    if (p.motion === 'moving') {
      lastMovingAtRef.current.set(p.id, now);
      return true;
    }
    const last = lastMovingAtRef.current.get(p.id) ?? 0;
    return now - last < MOTION_STICKY_MS;
  };

  useEffect(() => {
    const now = performance.now();
    const alive = new Set(points.map((p) => p.id));

    for (const id of [...targetsRef.current.keys()]) {
      if (!alive.has(id)) {
        targetsRef.current.delete(id);
        currentRef.current.delete(id);
        animRef.current.delete(id);
        lastMovingAtRef.current.delete(id);
      }
    }

    for (const p of points) {
      if (!isValidMapCoord(p.lat, p.lng)) continue;

      const prevTarget = targetsRef.current.get(p.id);
      targetsRef.current.set(p.id, { lat: p.lat, lng: p.lng });
      const moving = isEffectivelyMoving(p, now);

      if (!moving) {
        currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
        animRef.current.delete(p.id);
        continue;
      }

      if (!prevTarget) {
        currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
        continue;
      }

      const jump = haversineMeters(prevTarget.lat, prevTarget.lng, p.lat, p.lng);
      if (jump < MIN_MOVE_M) continue;

      const cur = currentRef.current.get(p.id) ?? prevTarget;

      if (jump > MAX_GLIDE_M) {
        currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
        animRef.current.delete(p.id);
        continue;
      }

      const speed = typeof p.speed === 'number' && Number.isFinite(p.speed) ? p.speed : 0;
      const speedFactor = speed > 5 ? Math.max(0.7, Math.min(1, 35 / (speed + 8))) : 1;
      const duration = Math.round(baseDurationMs * speedFactor);

      animRef.current.set(p.id, {
        from: cur,
        to: { lat: p.lat, lng: p.lng },
        start: now,
        duration,
      });
    }
  }, [points, baseDurationMs]);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const latest = pointsRef.current;
      const now = performance.now();

      const next = latest.map((p) => {
        if (!isValidMapCoord(p.lat, p.lng)) return p;
        const moving = isEffectivelyMoving(p, now);
        if (!moving) {
          currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
          return p;
        }

        const anim = animRef.current.get(p.id);
        if (!anim) {
          const cur = currentRef.current.get(p.id);
          if (cur) return { ...p, lat: cur.lat, lng: cur.lng, motion: 'moving' as T['motion'] };
          currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
          return { ...p, motion: 'moving' as T['motion'] };
        }

        const t = Math.min(1, (now - anim.start) / anim.duration);
        const e = EASE(t);
        const lat = anim.from.lat + (anim.to.lat - anim.from.lat) * e;
        const lng = anim.from.lng + (anim.to.lng - anim.from.lng) * e;
        currentRef.current.set(p.id, { lat, lng });

        if (t >= 1) {
          animRef.current.delete(p.id);
          return { ...p, lat: anim.to.lat, lng: anim.to.lng, motion: 'moving' as T['motion'] };
        }
        return { ...p, lat, lng, motion: 'moving' as T['motion'] };
      });

      setRendered(next);

      // Keep the loop alive while any unit is still in a moving sticky window —
      // so the next GPS fix can start a glide without a visible stall.
      if (
        latest.some(
          (p) =>
            (isEffectivelyMoving(p, now) && animRef.current.has(p.id)) ||
            isEffectivelyMoving(p, now),
        )
      ) {
        raf = requestAnimationFrame(tick);
      }
    };

    const now = performance.now();
    if (points.some((p) => isEffectivelyMoving(p, now))) {
      raf = requestAnimationFrame(tick);
    } else {
      setRendered(points);
    }

    return () => cancelAnimationFrame(raf);
  }, [points, baseDurationMs]);

  return rendered;
}
