import { query } from '../config/database.js';
import { normalizePlateKey } from './FuelStationSheetService.js';
import { extractPlateFromName } from './unitPlateUtils.js';

export type StationTotalRow = {
  key: string;
  registration: string;
  unitId: string | null;
  unitName: string | null;
  stationLiters: number;
  fillCount: number;
};

export type VarianceAssetRow = {
  key: string;
  registration: string;
  unitId: string | null;
  unitName: string;
  stationLiters: number;
  flsLiters: number;
  /** FLS − station (station is the reference fill volume). */
  variance: number;
  stationFills: number;
  flsFills: number;
};

export type VarianceDetailRow = {
  id: string;
  filledAt: string;
  registration: string;
  unitName: string | null;
  product: string;
  stationLiters: number;
  unitPrice: number | null;
  amount: number | null;
  cardNumber: string | null;
  receiptNumber: string | null;
  matchedFlsLiters: number | null;
  variance: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function unitMatchKeys(unitName: string, plate?: string | null): string[] {
  const keys = new Set<string>();
  const p = normalizePlateKey(plate || '');
  if (p) keys.add(p);
  const fromName = normalizePlateKey(extractPlateFromName(unitName) || '');
  if (fromName) keys.add(fromName);
  const nameKey = normalizePlateKey(unitName);
  if (nameKey) keys.add(nameKey);
  return [...keys];
}

export class FuelVarianceService {
  static async getFlsTotalsByUnit(
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Array<{ unitId: string; unitName: string; flsLiters: number; flsFills: number }>> {
    const { rows } = await query(
      `SELECT
         unit_id,
         unit_name,
         COALESCE(SUM(filled), 0)::float AS fls_liters,
         COUNT(*)::int AS fls_fills
       FROM fuel_transactions
       WHERE tenant_id = $1
         AND section = 'filling'
         AND timestamp >= EXTRACT(EPOCH FROM ($2::date))
         AND timestamp < EXTRACT(EPOCH FROM (($3::date) + INTERVAL '1 day'))
         AND COALESCE(filled, 0) > 0
         AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
         AND COALESCE(sensor, '') <> 'balance'
       GROUP BY unit_id, unit_name`,
      [tenantId, fromDate, toDate],
    );
    return rows.map((r) => ({
      unitId: String(r.unit_id ?? ''),
      unitName: String(r.unit_name ?? ''),
      flsLiters: round1(Number(r.fls_liters || 0)),
      flsFills: Number(r.fls_fills || 0),
    }));
  }

  /** Station liters keyed by registration_key for a period. */
  static async getStationTotalsByKey(
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, StationTotalRow>> {
    const { rows } = await query(
      `SELECT
         registration_key as key,
         MAX(registration) as registration,
         MAX(unit_id) as unit_id,
         MAX(unit_name) as unit_name,
         COALESCE(SUM(quantity), 0)::float as station_liters,
         COUNT(*)::int as fill_count
       FROM fuel_station_fills
       WHERE tenant_id = $1
         AND filled_at >= ($2::date)
         AND filled_at < (($3::date) + INTERVAL '1 day')
         AND registration_key <> ''
       GROUP BY registration_key`,
      [tenantId, fromDate, toDate],
    );
    const map = new Map<string, StationTotalRow>();
    for (const r of rows) {
      const key = String(r.key || '');
      if (!key) continue;
      map.set(key, {
        key,
        registration: String(r.registration || ''),
        unitId: r.unit_id != null ? String(r.unit_id) : null,
        unitName: r.unit_name != null ? String(r.unit_name) : null,
        stationLiters: round1(Number(r.station_liters || 0)),
        fillCount: Number(r.fill_count || 0),
      });
    }
    return map;
  }

  /**
   * Map of unitName → station liters for enriching the fuel usage table.
   * Also keyed by unitId string when known.
   */
  static async getStationLitersByUnitName(
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, number>> {
    const byKey = await this.getStationTotalsByKey(tenantId, fromDate, toDate);
    const out = new Map<string, number>();
    for (const row of byKey.values()) {
      if (row.unitName) {
        out.set(row.unitName, (out.get(row.unitName) || 0) + row.stationLiters);
      }
      if (row.registration) {
        out.set(row.registration, (out.get(row.registration) || 0) + row.stationLiters);
      }
      if (row.unitId) {
        out.set(row.unitId, (out.get(row.unitId) || 0) + row.stationLiters);
      }
    }
    return out;
  }

  static async getVarianceReport(
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<{
    fromDate: string;
    toDate: string;
    summary: {
      stationLiters: number;
      flsLiters: number;
      variance: number;
      assets: number;
      stationFills: number;
    };
    assets: VarianceAssetRow[];
    details: VarianceDetailRow[];
  }> {
    const stationByKey = await this.getStationTotalsByKey(tenantId, fromDate, toDate);
    const flsByKey = new Map<string, { liters: number; count: number; unitId: string; unitName: string }>();
    const flsTotals = await this.getFlsTotalsByUnit(tenantId, fromDate, toDate);
    for (const t of flsTotals) {
      const keys = unitMatchKeys(t.unitName, undefined);
      if (!keys.length) keys.push(normalizePlateKey(t.unitName) || t.unitName);
      const liters = t.flsLiters || 0;
      for (const key of keys) {
        if (!key) continue;
        const cur = flsByKey.get(key) || {
          liters: 0,
          count: 0,
          unitId: String(t.unitId),
          unitName: t.unitName,
        };
        cur.liters += liters;
        cur.count += t.flsFills;
        flsByKey.set(key, cur);
      }
    }

    const flsByUnit = new Map<string, { liters: number; count: number; unitId: string; keys: string[] }>();
    for (const t of flsTotals) {
      const name = t.unitName;
      const cur = flsByUnit.get(name) || {
        liters: 0,
        count: 0,
        unitId: String(t.unitId),
        keys: unitMatchKeys(name),
      };
      cur.liters += t.flsLiters || 0;
      cur.count += t.flsFills || 0;
      flsByUnit.set(name, cur);
    }

    const usedStationKeys = new Set<string>();
    const assets: VarianceAssetRow[] = [];

    for (const [unitName, fls] of flsByUnit) {
      let stationLiters = 0;
      let stationFills = 0;
      let registration = '';
      for (const key of fls.keys) {
        const st = stationByKey.get(key);
        if (!st) continue;
        stationLiters += st.stationLiters;
        stationFills += st.fillCount;
        registration = registration || st.registration;
        usedStationKeys.add(key);
      }
      if (stationLiters <= 0 && fls.liters <= 0) continue;
      // Only include rows that have station data OR both — prefer showing matched variance pairs
      if (stationLiters <= 0) continue;
      assets.push({
        key: fls.keys[0] || normalizePlateKey(unitName),
        registration: registration || unitName,
        unitId: fls.unitId,
        unitName,
        stationLiters: round1(stationLiters),
        flsLiters: round1(fls.liters),
        variance: round1(fls.liters - stationLiters),
        stationFills,
        flsFills: fls.count,
      });
    }

    for (const [key, st] of stationByKey) {
      if (usedStationKeys.has(key)) continue;
      assets.push({
        key,
        registration: st.registration,
        unitId: st.unitId,
        unitName: st.unitName || st.registration || 'Unmatched',
        stationLiters: st.stationLiters,
        flsLiters: 0,
        variance: round1(0 - st.stationLiters),
        stationFills: st.fillCount,
        flsFills: 0,
      });
    }

    assets.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || a.unitName.localeCompare(b.unitName));

    const { rows: detailRows } = await query(
      `SELECT id, filled_at, registration, unit_name, product, quantity, unit_price, amount,
              card_number, receipt_number, registration_key
       FROM fuel_station_fills
       WHERE tenant_id = $1
         AND filled_at >= ($2::date)
         AND filled_at < (($3::date) + INTERVAL '1 day')
       ORDER BY filled_at DESC
       LIMIT 2000`,
      [tenantId, fromDate, toDate],
    );

    const details: VarianceDetailRow[] = detailRows.map((r) => {
      const stationLiters = round1(Number(r.quantity || 0));
      const key = String(r.registration_key || '');
      const fls = key ? flsByKey.get(key) : undefined;
      // Per-row matched FLS is approximate; show null unless single fill same day — keep station-only detail
      return {
        id: String(r.id),
        filledAt: new Date(r.filled_at as string).toISOString(),
        registration: String(r.registration || ''),
        unitName: r.unit_name != null ? String(r.unit_name) : null,
        product: String(r.product || ''),
        stationLiters,
        unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
        amount: r.amount != null ? Number(r.amount) : null,
        cardNumber: r.card_number != null ? String(r.card_number) : null,
        receiptNumber: r.receipt_number != null ? String(r.receipt_number) : null,
        matchedFlsLiters: null,
        variance: null,
      };
    });

    const stationLiters = round1(assets.reduce((s, a) => s + a.stationLiters, 0));
    const flsLiters = round1(assets.reduce((s, a) => s + a.flsLiters, 0));

    return {
      fromDate,
      toDate,
      summary: {
        stationLiters,
        flsLiters,
        variance: round1(flsLiters - stationLiters),
        assets: assets.length,
        stationFills: assets.reduce((s, a) => s + a.stationFills, 0),
      },
      assets,
      details,
    };
  }
}
