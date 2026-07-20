import { useEffect, useRef, useState } from 'react';
import { LIVE_POLL } from '@/lib/liveRefresh';

type AnimPoint = { id: string; lat: number; lng: number; motion?: string };

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

/** Interpolate marker positions between fleet polls — keeps moving units gliding in real time. */
export function useSmoothMapPositions<T extends AnimPoint>(
  points: T[],
  pollMs = LIVE_POLL.fleet
): T[] {
  const durationMs = Math.max(900, pollMs - 150);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const targetsRef = useRef(new Map<string, { lat: number; lng: number }>());
  const currentRef = useRef(new Map<string, { lat: number; lng: number }>());
  const animRef = useRef(
    new Map<string, { from: { lat: number; lng: number }; to: { lat: number; lng: number }; start: number }>()
  );
  const [rendered, setRendered] = useState<T[]>(points);

  useEffect(() => {
    const now = performance.now();
    for (const p of points) {
      const prev = targetsRef.current.get(p.id);
      targetsRef.current.set(p.id, { lat: p.lat, lng: p.lng });

      if (p.motion !== 'moving') {
        currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
        animRef.current.delete(p.id);
        continue;
      }

      if (!prev) {
        currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
        continue;
      }

      const cur = currentRef.current.get(p.id) ?? prev;
      const moved = Math.abs(prev.lat - p.lat) > 0.000001 || Math.abs(prev.lng - p.lng) > 0.000001;
      if (moved) {
        animRef.current.set(p.id, { from: cur, to: { lat: p.lat, lng: p.lng }, start: now });
      }
    }
  }, [points]);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const latest = pointsRef.current;
      const now = performance.now();

      const next = latest.map((p) => {
        if (p.motion !== 'moving') return p;

        const anim = animRef.current.get(p.id);
        if (!anim) {
          currentRef.current.set(p.id, { lat: p.lat, lng: p.lng });
          return p;
        }

        const t = Math.min(1, (now - anim.start) / durationMs);
        const e = EASE(t);
        const lat = anim.from.lat + (anim.to.lat - anim.from.lat) * e;
        const lng = anim.from.lng + (anim.to.lng - anim.from.lng) * e;
        currentRef.current.set(p.id, { lat, lng });

        if (t >= 1) {
          animRef.current.delete(p.id);
          return p;
        }
        return { ...p, lat, lng };
      });

      setRendered(next);

      if (latest.some((p) => p.motion === 'moving' && animRef.current.has(p.id))) {
        raf = requestAnimationFrame(tick);
      }
    };

    if (points.some((p) => p.motion === 'moving' && animRef.current.has(p.id))) {
      raf = requestAnimationFrame(tick);
    } else {
      setRendered(points);
    }

    return () => cancelAnimationFrame(raf);
  }, [points, durationMs]);

  return rendered;
}
