import type { FuelTransaction } from '@/types';
import type { WialonReportTable } from '@/lib/reportUtils';

function colIndex(table: WialonReportTable, patterns: RegExp[]): number {
  const cols = table.columns || [];
  for (let i = 0; i < cols.length; i++) {
    const label = String(cols[i]?.label || cols[i]?.key || '').toLowerCase().trim();
    if (patterns.some((p) => p.test(label))) return i;
  }
  return -1;
}

function cellAt(row: Record<string, unknown>, table: WialonReportTable, idx: number): string {
  if (idx < 0) return '';
  const key = table.columns[idx]?.key;
  if (key && row[key] != null) return String(row[key]);
  const vals = Object.values(row);
  return vals[idx] != null ? String(vals[idx]) : '';
}

function parseLiters(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s || s === '-----' || s === '—' || s === '-') return null;
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseTime(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s || s === '-----' || s === '—' || s === '-') return null;
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return null;
}

function emptyTx(
  partial: Pick<
    FuelTransaction,
    'id' | 'unitId' | 'unitName' | 'section' | 'tank' | 'timestamp' | 'time' | 'location'
  > &
    Partial<FuelTransaction>,
): FuelTransaction {
  return {
    sensor: '',
    filled: 0,
    fuelUsed: 0,
    mileage: 0,
    duration: '',
    durationSeconds: 0,
    avgConsumption: 0,
    suddenFuelDrop: 0,
    count: 0,
    initialLevel: 0,
    finalLevel: 0,
    ...partial,
  };
}

/**
 * Carry-forward main/reserve levels per asset (same pattern as backend enrich).
 * Ensures consumption rows still plot a continuous fuel-level line.
 */
export function enrichFuelGraphLevels(transactions: FuelTransaction[]): FuelTransaction[] {
  const byUnit = new Map<string, FuelTransaction[]>();
  for (const tx of transactions) {
    const key = (tx.unitName || String(tx.unitId) || '').trim() || 'Asset';
    const list = byUnit.get(key) ?? [];
    list.push(tx);
    byUnit.set(key, list);
  }

  const out: FuelTransaction[] = [];
  for (const [, unitTxs] of byUnit) {
    const sorted = [...unitTxs].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    let lastMain = 0;
    let lastReserve = 0;

    for (const tx of sorted) {
      const final = Number(tx.finalLevel) || 0;
      const initial = Number(tx.initialLevel) || 0;
      const levelHint = final > 0 ? final : initial > 0 ? initial : 0;

      if (tx.mainTankLevel != null && tx.mainTankLevel > 0) lastMain = tx.mainTankLevel;
      else if (tx.tank !== 'reserve' && levelHint > 0) lastMain = levelHint;

      if (tx.reserveTankLevel != null && tx.reserveTankLevel > 0) lastReserve = tx.reserveTankLevel;
      else if (tx.tank === 'reserve' && levelHint > 0) lastReserve = levelHint;

      out.push({
        ...tx,
        mainTankLevel: lastMain > 0 ? lastMain : tx.mainTankLevel,
        reserveTankLevel: lastReserve > 0 ? lastReserve : tx.reserveTankLevel,
      });
    }
  }

  return out.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
}

/**
 * Build chart transactions from the report tables already on screen
 * (Consumption / Fillings / Sudden Drops). Instant — no extra API.
 */
export function fuelTransactionsFromReportTables(
  tables: WialonReportTable[],
  fallbackUnitName = 'Asset',
): FuelTransaction[] {
  const out: FuelTransaction[] = [];
  let n = 0;

  for (const table of tables) {
    const label = `${table.label || ''} ${table.name || ''}`.toLowerCase();
    const isFill = /fill|refuel|charg/.test(label);
    const isTheft = /theft|drain|sudden|drop|drainag/.test(label);
    const section: FuelTransaction['section'] = isTheft
      ? 'theft'
      : isFill
        ? 'filling'
        : 'consumption';

    const timeIdx = colIndex(table, [/^time$/, /^date$/, /time$/]);
    const beginIdx = colIndex(table, [/beginning/, /period start/, /^from$/, /start time/]);
    const endIdx = colIndex(table, [/^end$/, /period end/, /^to$/, /finish/, /end time/]);
    const groupIdx = colIndex(table, [/grouping/, /unit/, /object/, /asset/, /^name$/, /vehicle/]);
    const locIdx = colIndex(table, [/location/, /address/, /place/]);
    const filledIdx = colIndex(table, [/^filled$/, /filled amount/, /fuel filled/, /refuel/]);
    const dropIdx = colIndex(table, [/sudden/, /drop/, /theft/, /drain/, /drained/]);
    const initialIdx = colIndex(table, [
      /initial/,
      /start level/,
      /before/,
      /fuel level at the beginning/,
    ]);
    const finalIdx = colIndex(table, [
      /final/,
      /end level/,
      /after/,
      /fuel level at the end/,
      /^fuel level$/,
    ]);
    const consumedIdx = colIndex(table, [/consumed/, /fuel used/, /^used$/, /consumption/]);
    const mainLevelIdx = colIndex(table, [/main.*level/, /main tank/, /\(main\)/]);
    const reserveLevelIdx = colIndex(table, [/reserve.*level/, /reserve tank/, /\(reserve\)/, /aux/]);

    const isReserveTable = /reserve|secondary|tank\s*2|aux/.test(label);

    for (const row of table.rows || []) {
      const unitName = cellAt(row, table, groupIdx).trim() || fallbackUnitName;
      if (!unitName || unitName === '-----') continue;

      const filled = parseLiters(cellAt(row, table, filledIdx)) ?? 0;
      const drop = parseLiters(cellAt(row, table, dropIdx)) ?? 0;
      const initial = parseLiters(cellAt(row, table, initialIdx));
      const final = parseLiters(cellAt(row, table, finalIdx));
      const used = parseLiters(cellAt(row, table, consumedIdx)) ?? 0;
      const mainLvl = parseLiters(cellAt(row, table, mainLevelIdx));
      const reserveLvl = parseLiters(cellAt(row, table, reserveLevelIdx));
      const location = cellAt(row, table, locIdx) || '';

      const tank: FuelTransaction['tank'] =
        isReserveTable || (reserveLvl != null && mainLvl == null) ? 'reserve' : 'main';

      const eventTime =
        parseTime(cellAt(row, table, timeIdx)) ??
        parseTime(cellAt(row, table, endIdx)) ??
        parseTime(cellAt(row, table, beginIdx));
      const beginTs = parseTime(cellAt(row, table, beginIdx));
      const endTs = parseTime(cellAt(row, table, endIdx));

      if (
        !(
          filled > 0 ||
          drop > 0 ||
          used > 0 ||
          initial != null ||
          final != null ||
          mainLvl != null ||
          reserveLvl != null
        )
      ) {
        continue;
      }

      const resolveMain = (lvl: number | null | undefined) =>
        tank === 'main' ? (lvl ?? mainLvl ?? undefined) : mainLvl ?? undefined;
      const resolveReserve = (lvl: number | null | undefined) =>
        tank === 'reserve' ? (lvl ?? reserveLvl ?? undefined) : reserveLvl ?? undefined;

      // Period row: beginning → end with levels / consumed
      if (beginTs != null && endTs != null && beginTs !== endTs) {
        if (initial != null || mainLvl != null || reserveLvl != null) {
          n += 1;
          const lvl = initial ?? mainLvl ?? reserveLvl ?? 0;
          out.push(
            emptyTx({
              id: `rpt-${table.index}-${n}-b`,
              unitId: unitName,
              unitName,
              section,
              tank,
              timestamp: beginTs,
              time: cellAt(row, table, beginIdx),
              location,
              initialLevel: lvl,
              finalLevel: lvl,
              mainTankLevel: resolveMain(lvl),
              reserveTankLevel: resolveReserve(lvl),
            }),
          );
        }
        n += 1;
        const endLvl = final ?? mainLvl ?? reserveLvl ?? initial ?? 0;
        out.push(
          emptyTx({
            id: `rpt-${table.index}-${n}-e`,
            unitId: unitName,
            unitName,
            section,
            tank,
            timestamp: endTs,
            time: cellAt(row, table, endIdx),
            location,
            filled: filled > 0 ? filled : 0,
            suddenFuelDrop: drop > 0 ? drop : 0,
            fuelUsed: used > 0 ? used : 0,
            initialLevel: initial ?? 0,
            finalLevel: endLvl,
            mainTankLevel: resolveMain(endLvl),
            reserveTankLevel: resolveReserve(endLvl),
          }),
        );
        continue;
      }

      if (eventTime == null) continue;

      n += 1;
      const baseId = `rpt-${table.index}-${n}`;
      const level = final ?? initial ?? mainLvl ?? reserveLvl;

      if (initial != null && final != null && initial !== final) {
        out.push(
          emptyTx({
            id: `${baseId}-a`,
            unitId: unitName,
            unitName,
            section,
            tank,
            timestamp: Math.max(0, eventTime - 1),
            time: cellAt(row, table, timeIdx) || String(eventTime),
            location,
            initialLevel: initial,
            finalLevel: initial,
            mainTankLevel: resolveMain(initial),
            reserveTankLevel: resolveReserve(initial),
          }),
        );
      }

      out.push(
        emptyTx({
          id: baseId,
          unitId: unitName,
          unitName,
          section,
          tank,
          timestamp: eventTime,
          time: cellAt(row, table, timeIdx) || String(eventTime),
          location,
          filled: filled > 0 ? filled : 0,
          suddenFuelDrop: drop > 0 ? drop : 0,
          fuelUsed: used > 0 ? used : 0,
          initialLevel: initial ?? 0,
          finalLevel: final ?? level ?? 0,
          mainTankLevel: resolveMain(final ?? level),
          reserveTankLevel: resolveReserve(final ?? level),
        }),
      );
    }
  }

  return enrichFuelGraphLevels(out);
}

/** Merge report-derived points with cached fuel ledger rows (same client assets). */
export function mergeFuelGraphTransactions(
  primary: FuelTransaction[],
  secondary: FuelTransaction[],
): FuelTransaction[] {
  const key = (t: FuelTransaction) =>
    `${t.unitName}|${t.timestamp}|${t.section}|${Number(t.filled) || 0}|${Number(t.fuelUsed) || 0}|${Number(t.suddenFuelDrop) || 0}`;
  const map = new Map<string, FuelTransaction>();
  for (const t of secondary) map.set(key(t), t);
  // Report rows win on collision (exact table the user just ran).
  for (const t of primary) map.set(key(t), t);
  return enrichFuelGraphLevels([...map.values()]);
}
