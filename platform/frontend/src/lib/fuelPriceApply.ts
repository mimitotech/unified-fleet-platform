import type { FuelAnalyticsResult } from '@/lib/fuelTypes';

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function fuelCosts(filled: number, consumed: number, lost: number, price: number) {
  if (price <= 0) {
    return { fillCost: 0, usageCost: 0, lossCost: 0, totalCost: 0 };
  }
  return {
    fillCost: round1(filled * price),
    usageCost: round1(consumed * price),
    lossCost: round1(lost * price),
    totalCost: round1(filled * price),
  };
}

/** Recompute spend columns from volumes when price/L changes — no API call needed. */
export function applyFuelPriceToAnalytics(
  data: FuelAnalyticsResult,
  pricePerLiter: number
): FuelAnalyticsResult {
  const price = pricePerLiter > 0 ? pricePerLiter : 0;
  if (price === data.fuelPricePerLiter) return data;

  const fleet = fuelCosts(
    data.kpis.totalFilled,
    data.kpis.totalConsumed,
    data.kpis.totalTheft,
    price
  );

  return {
    ...data,
    fuelPricePerLiter: price,
    kpis: {
      ...data.kpis,
      totalCost: fleet.totalCost,
      totalFillCost: fleet.fillCost,
      totalUsageCost: fleet.usageCost,
      totalLossCost: fleet.lossCost,
    },
    timeSeries: data.timeSeries.map((p) => {
      const c = fuelCosts(p.filled, p.consumed, p.theft, price);
      return { ...p, cost: c.fillCost };
    }),
    byAsset: data.byAsset.map((a) => {
      const c = fuelCosts(a.filled, a.consumed, a.theft, price);
      return { ...a, cost: c.fillCost };
    }),
    sectionBreakdown: data.sectionBreakdown.map((s) => {
      if (s.name === 'Fillings') return { ...s, cost: fleet.fillCost };
      if (s.name === 'Consumption') return { ...s, cost: fleet.usageCost };
      if (s.name.includes('Theft')) return { ...s, cost: fleet.lossCost };
      return s;
    }),
    comparison: data.comparison
      ? {
          ...data.comparison,
          kpis: {
            ...data.comparison.kpis,
            totalCost: data.comparison.kpis.totalFilled * price,
            totalFillCost: round1(data.comparison.kpis.totalFilled * price),
          },
        }
      : null,
  };
}
