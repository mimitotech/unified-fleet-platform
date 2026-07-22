/** Shared fuel table cell classes — padding in globals.css `.fuel-compact-table`. */

export const fuelTh =
  'fuel-cell text-xs font-bold text-muted-foreground uppercase whitespace-nowrap';
export const fuelTd = 'fuel-cell text-xs';
export const fuelTdMuted = 'fuel-cell text-xs text-muted-foreground';
export const fuelTdNested = 'fuel-cell text-xs';

/** Sticky identity columns so Date / Unit stay visible while scrolling metrics. */
export const fuelStickyDateTh =
  `${fuelTh} fuel-sticky-col fuel-sticky-date bg-card`;
export const fuelStickyUnitTh =
  `${fuelTh} fuel-sticky-col fuel-sticky-unit bg-card`;
export const fuelStickyDateTd =
  `${fuelTd} fuel-sticky-col fuel-sticky-date bg-card`;
export const fuelStickyUnitTd =
  `${fuelTd} fuel-sticky-col fuel-sticky-unit bg-card`;
export const fuelStickyDateTdMuted =
  `${fuelTd} fuel-sticky-col fuel-sticky-date bg-muted/40`;
export const fuelStickyUnitTdMuted =
  `${fuelTd} fuel-sticky-col fuel-sticky-unit bg-muted/40`;

/** Approximate column widths for dynamic table min-width (px). */
export const FUEL_COL_WIDTHS: Record<string, number> = {
  date: 88,
  unit: 140,
  location: 120,
  filledMain: 92,
  filledReserve: 100,
  filledStation: 100,
  variance: 84,
  usedMain: 88,
  usedReserve: 96,
  levelMain: 88,
  levelReserve: 96,
  totalLevel: 92,
  dropMain: 88,
  dropReserve: 96,
  totalDrop: 88,
  totalUsed: 88,
  fuelType: 72,
  cost: 72,
  cardNo: 88,
};

export function fuelTableMinWidthPx(visibleColumns?: string[]): number {
  const metricKeys = visibleColumns?.length
    ? visibleColumns
    : Object.keys(FUEL_COL_WIDTHS).filter((k) => !['date', 'unit', 'location'].includes(k));
  let width = FUEL_COL_WIDTHS.date + FUEL_COL_WIDTHS.unit + FUEL_COL_WIDTHS.location;
  for (const key of metricKeys) {
    width += FUEL_COL_WIDTHS[key] ?? 88;
  }
  return Math.max(720, width);
}
