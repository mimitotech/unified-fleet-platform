import { BRAND } from '@/lib/branding';

/** Mimito brand palette — primary green is always #004225 (same as landing MAMS) */
export const CHART = {
  brand: BRAND.primary,
  brandAccent: BRAND.accent,
  brandLight: BRAND.surfaceTintStrong,
  brandMuted: '#c5ddd0',
  success: BRAND.primary,
  failed: '#dc2626',
  neutral: '#64748b',
  neutralLight: '#e2e8f0',
} as const;

/** Wialon-standard fleet status (not brand UI green) */
export const FLEET_STATUS = {
  moving: '#22c55e',
  idle: '#eab308',
  stopped: '#ef4444',
  offline: '#94a3b8',
} as const;

export const ALERT_SEVERITY = {
  critical: '#dc2626',
  emergency: '#b91c1c',
  warning: '#d97706',
  info: '#2563eb',
} as const;

export const INTEGRATION_SOURCE = {
  wialon: '#1d4ed8',
  loconav: '#0d9488',
  tracksolid: BRAND.accent,
} as const;

export const FLEET_CHART_COLORS: Record<string, string> = { ...FLEET_STATUS };
export const SEVERITY_CHART_COLORS: Record<string, string> = { ...ALERT_SEVERITY };
export const SOURCE_CHART_COLORS: Record<string, string> = { ...INTEGRATION_SOURCE };

export const CHART_COLORS = {
  primary: CHART.brand,
  accent: CHART.brandAccent,
  emerald: CHART.brand,
  sky: ALERT_SEVERITY.info,
  violet: CHART.brandAccent,
  amber: ALERT_SEVERITY.warning,
  rose: CHART.failed,
  indigo: '#1d4ed8',
  teal: INTEGRATION_SOURCE.loconav,
  orange: ALERT_SEVERITY.warning,
};
