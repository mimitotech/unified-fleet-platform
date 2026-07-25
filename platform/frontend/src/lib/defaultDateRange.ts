/**
 * Shared calendar defaults for the client portal.
 * Modules (Dashboard, Fuel, Alerts inbox, Monitoring, …) → last 7 days.
 * Report builders / report tabs → today only.
 */

export function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftLocalDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateIso(dt);
}

/** Default operational window: today and the previous 6 days (7 days total). */
export function getDefaultModuleDateRange(now = new Date()): {
  fromDate: string;
  toDate: string;
  todayStr: string;
} {
  const todayStr = localDateIso(now);
  return {
    fromDate: shiftLocalDays(todayStr, -6),
    toDate: todayStr,
    todayStr,
  };
}

/** Default for report builders / report tabs only. */
export function getDefaultReportDateRange(now = new Date()): {
  fromDate: string;
  toDate: string;
  todayStr: string;
} {
  const todayStr = localDateIso(now);
  return { fromDate: todayStr, toDate: todayStr, todayStr };
}
