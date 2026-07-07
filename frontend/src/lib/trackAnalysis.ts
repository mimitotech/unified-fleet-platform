export type TrackPoint = { lat: number; lng: number; speed: number; course?: number; time: number };

export type TrackMotionStatus = 'moving' | 'idle' | 'stopped';

export type TrackStatusSegment = {
  status: TrackMotionStatus;
  positions: [number, number][];
  color: string;
};

export type TrackStopEvent = {
  lat: number;
  lng: number;
  status: 'stopped' | 'idle' | 'parked';
  from: number;
  to: number;
  durationSec: number;
  label: string;
};

const COLORS: Record<TrackMotionStatus, string> = {
  moving: '#16a34a',
  idle: '#f59e0b',
  stopped: '#dc2626',
};

const STOP_SPEED = 3;
const IDLE_MIN_SEC = 90;
const STOP_MIN_SEC = 180;

export function motionFromSpeed(speed: number): TrackMotionStatus {
  if (speed <= 0) return 'stopped';
  if (speed < STOP_SPEED) return 'idle';
  return 'moving';
}

export function formatTrackDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function tripWindow(trip: Record<string, unknown>): { from: number; to: number; endLat?: number; endLng?: number } | null {
  const from = Number(trip.t1 ?? trip.from ?? trip.tm ?? trip.begin ?? trip.time_begin);
  const to = Number(trip.t2 ?? trip.to ?? trip.end ?? trip.time_end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  const end = trip.to as { y?: number; x?: number; lat?: number; lng?: number } | undefined;
  const endLat = end?.y ?? end?.lat;
  const endLng = end?.x ?? end?.lng;
  return { from, to, endLat, endLng };
}

/** Parking gaps between Wialon trips. */
export function parkingStopsFromTrips(trips: Array<Record<string, unknown>>): TrackStopEvent[] {
  const windows = trips
    .map(tripWindow)
    .filter((w): w is NonNullable<ReturnType<typeof tripWindow>> => w != null)
    .sort((a, b) => a.from - b.from);

  const stops: TrackStopEvent[] = [];
  for (let i = 0; i < windows.length - 1; i++) {
    const cur = windows[i];
    const next = windows[i + 1];
    const gap = next.from - cur.to;
    if (gap >= IDLE_MIN_SEC && cur.endLat != null && cur.endLng != null) {
      stops.push({
        lat: cur.endLat,
        lng: cur.endLng,
        status: gap >= STOP_MIN_SEC ? 'parked' : 'idle',
        from: cur.to,
        to: next.from,
        durationSec: gap,
        label: gap >= STOP_MIN_SEC ? 'Parked' : 'Idle',
      });
    }
  }
  return stops;
}

/** Detect stop/idle clusters from GPS points. */
export function stopsFromPoints(points: TrackPoint[]): TrackStopEvent[] {
  if (points.length < 2) return [];

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const stops: TrackStopEvent[] = [];
  let clusterStart = 0;

  const flush = (endIdx: number) => {
    if (endIdx <= clusterStart) return;
    const start = sorted[clusterStart];
    const end = sorted[endIdx];
    const duration = end.time - start.time;
    const status = motionFromSpeed(Math.max(start.speed, end.speed));
    if (status === 'moving') return;
    const minSec = status === 'stopped' ? STOP_MIN_SEC : IDLE_MIN_SEC;
    if (duration < minSec) return;

    const mid = sorted[Math.floor((clusterStart + endIdx) / 2)];
    stops.push({
      lat: mid.lat,
      lng: mid.lng,
      status: status === 'stopped' ? 'stopped' : 'idle',
      from: start.time,
      to: end.time,
      durationSec: duration,
      label: status === 'stopped' ? 'Stopped' : 'Idle',
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const prev = motionFromSpeed(sorted[i - 1].speed);
    const cur = motionFromSpeed(sorted[i].speed);
    if (prev !== cur && prev !== 'moving') {
      flush(i - 1);
      clusterStart = i;
    } else if (cur === 'moving' && prev !== 'moving') {
      flush(i - 1);
      clusterStart = i;
    }
  }
  flush(sorted.length - 1);
  return stops;
}

export function mergeStopEvents(a: TrackStopEvent[], b: TrackStopEvent[]): TrackStopEvent[] {
  const all = [...a, ...b].sort((x, y) => x.from - y.from);
  const merged: TrackStopEvent[] = [];
  for (const s of all) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.lat - s.lat) < 0.0003 &&
      Math.abs(last.lng - s.lng) < 0.0003 &&
      s.from - last.to < 120
    ) {
      last.to = Math.max(last.to, s.to);
      last.durationSec = last.to - last.from;
      if (s.durationSec > last.durationSec) last.status = s.status;
      continue;
    }
    merged.push({ ...s });
  }
  return merged;
}

/** Color-coded route segments by motion status. */
export function buildStatusSegments(points: TrackPoint[]): TrackStatusSegment[] {
  if (points.length < 2) return [];

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const segments: TrackStatusSegment[] = [];
  let currentStatus = motionFromSpeed(sorted[0].speed);
  let positions: [number, number][] = [[sorted[0].lat, sorted[0].lng]];

  const push = () => {
    if (positions.length > 1) {
      segments.push({ status: currentStatus, positions: [...positions], color: COLORS[currentStatus] });
    }
    positions = [positions[positions.length - 1]];
  };

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const status = motionFromSpeed(p.speed);
    if (status !== currentStatus) {
      positions.push([p.lat, p.lng]);
      push();
      currentStatus = status;
    }
    positions.push([p.lat, p.lng]);
  }
  push();

  if (!segments.length && sorted.length > 1) {
    return [
      {
        status: 'moving',
        positions: sorted.map((p) => [p.lat, p.lng] as [number, number]),
        color: COLORS.moving,
      },
    ];
  }
  return segments;
}

export function buildTripColoredSegments(
  points: TrackPoint[],
  trips: Array<Record<string, unknown>>
): { tripIndex: number; color: string; positions: [number, number][] }[] {
  const TRIP_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04'];
  const windows = trips
    .map((t, i) => {
      const w = tripWindow(t);
      return w ? { i, ...w } : null;
    })
    .filter((w): w is { i: number; from: number; to: number } => w != null);

  if (!windows.length) {
    return buildStatusSegments(points).map((s, i) => ({
      tripIndex: i,
      color: s.color,
      positions: s.positions,
    }));
  }

  const segments: { tripIndex: number; color: string; positions: [number, number][] }[] = [];
  for (const w of windows) {
    const seg = points
      .filter((p) => p.time >= w.from && p.time <= w.to)
      .map((p) => [p.lat, p.lng] as [number, number]);
    if (seg.length > 1) {
      segments.push({ tripIndex: w.i, color: TRIP_COLORS[w.i % TRIP_COLORS.length], positions: seg });
    }
  }
  if (!segments.length && points.length > 1) {
    return [{ tripIndex: 0, color: TRIP_COLORS[0], positions: points.map((p) => [p.lat, p.lng]) }];
  }
  return segments;
}

export const TRACK_STATUS_COLORS = COLORS;
