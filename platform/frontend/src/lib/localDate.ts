/** Calendar date in the browser's local timezone (YYYY-MM-DD). */
export function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar date for a unix timestamp (seconds). */
export function localDateFromTs(ts: number): string {
  return localDateIso(new Date(ts * 1000));
}

/** Shift a YYYY-MM-DD calendar date by N days without UTC day-boundary drift. */
export function shiftLocalDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}
