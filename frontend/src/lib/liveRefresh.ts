/** Client live polling intervals (ms) — tuned for near-real-time Wialon fleet data. */
export const LIVE_POLL = {
  /** Single fleet snapshot — powers map, list, sidebar, KPI counts */
  fleet: 8_000,
  statuses: 8_000,
  assets: 10_000,
  kpis: 10_000,
  alerts: 10_000,
  video: 30_000,
  integrations: 30_000,
  fuel: 15_000,
  workshop: 20_000,
  drivers: 15_000,
  routes: 15_000,
  geofences: 30_000,
  unitDetail: 10_000,
  unitTrack: 10_000,
  reports: 60_000,
} as const;

/** Pause polling when browser tab is hidden to save resources */
export function pollWhenVisible(intervalMs: number): () => number | false {
  return () => (typeof document !== 'undefined' && document.hidden ? false : intervalMs);
}

export function livePollLabel(ms: number): string {
  if (ms < 15_000) return 'every few seconds';
  if (ms < 45_000) return 'about every 15 seconds';
  if (ms < 90_000) return 'about every 30 seconds';
  return 'about every minute';
}
