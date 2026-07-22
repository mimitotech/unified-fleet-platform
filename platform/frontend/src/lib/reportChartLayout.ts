/** Shared Recharts layout so axis labels stay fully visible on screen and in print/PDF. */

export type AxisLayout = {
  margin: { top: number; right: number; left: number; bottom: number };
  xAngle: number;
  xHeight: number;
  xTextAnchor: 'end' | 'middle';
  tickMargin: number;
};

/** Standing bar charts with category names on X. */
export function standingBarAxisLayout(categoryCount: number, angled = categoryCount > 3): AxisLayout {
  if (!angled) {
    return {
      margin: { top: 10, right: 14, left: 10, bottom: 28 },
      xAngle: 0,
      xHeight: 28,
      xTextAnchor: 'middle',
      tickMargin: 6,
    };
  }
  return {
    margin: { top: 10, right: 14, left: 12, bottom: 64 },
    xAngle: -35,
    xHeight: 64,
    xTextAnchor: 'end',
    tickMargin: 8,
  };
}

export function lineChartAxisLayout(): AxisLayout {
  return {
    margin: { top: 10, right: 16, left: 10, bottom: 28 },
    xAngle: 0,
    xHeight: 28,
    xTextAnchor: 'middle',
    tickMargin: 6,
  };
}

/** Dynamic Y-axis width from numeric magnitudes. */
export function yAxisWidth(...values: number[]): number {
  const max = Math.max(0, ...values.map((v) => Math.abs(Number(v) || 0)));
  const digits = String(Math.round(max)).length;
  return Math.min(72, Math.max(40, 12 + digits * 7));
}
