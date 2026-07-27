import type { FuelTransaction } from '@/types';
import type { WialonReportTable } from '@/lib/reportUtils';

function colIndex(table: WialonReportTable, patterns: RegExp[]): number {
  const cols = table.columns || [];
  for (let i = 0; i < cols.length; i++) {
    const label = String(cols[i]?.label || cols[i]?.key || '').toLowerCase();
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
  const m = String(raw).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseTime(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s || s === '-----' || s === '—' || s === '-') return null;
  const t = Date.parse(s.replace(' ', 'T'));
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
 * Build FuelLevelChart transactions from Wialon report tables
 * (fillings / thefts / consumption with level + time columns).
 * Emits level points so the chart can draw fuel level vs time with
 * green fill / red drain markers (Wialon-style).
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
    const isTheft = /theft|drain|drop|drainag/.test(label);
    const section: FuelTransaction['section'] = isTheft
      ? 'theft'
      : isFill
        ? 'filling'
        : 'consumption';

    const timeIdx = colIndex(table, [/^time$/, /beginning/, /start/, /date/]);
    const groupIdx = colIndex(table, [/grouping/, /unit/, /object/, /asset/, /^name$/]);
    const locIdx = colIndex(table, [/location/, /address/, /place/]);
    const filledIdx = colIndex(table, [/^filled$/, /filled amount/, /filling/, /refuel/]);
    const dropIdx = colIndex(table, [/sudden/, /drop/, /theft/, /drain/]);
    const initialIdx = colIndex(table, [/initial/, /start level/, /before/]);
    const finalIdx = colIndex(table, [/final/, /end level/, /after/, /fuel level/, /^level$/]);
    const consumedIdx = colIndex(table, [/consumed/, /fuel used/, /^used$/]);
    const mainLevelIdx = colIndex(table, [/main.*level/, /main tank/, /\(main\)/]);
    const reserveLevelIdx = colIndex(table, [/reserve.*level/, /reserve tank/, /\(reserve\)/, /aux/]);

    const isReserveTable = /reserve|secondary|tank\s*2|aux/.test(label);

    for (const row of table.rows || []) {
      const timeStr = cellAt(row, table, timeIdx);
      const ts = parseTime(timeStr);
      if (ts == null) continue;

      const unitName = cellAt(row, table, groupIdx).trim() || fallbackUnitName;
      const filled = parseLiters(cellAt(row, table, filledIdx)) ?? 0;
      const drop = parseLiters(cellAt(row, table, dropIdx)) ?? 0;
      const initial = parseLiters(cellAt(row, table, initialIdx));
      const final = parseLiters(cellAt(row, table, finalIdx));
      const used = parseLiters(cellAt(row, table, consumedIdx)) ?? 0;
      const mainLvl = parseLiters(cellAt(row, table, mainLevelIdx));
      const reserveLvl = parseLiters(cellAt(row, table, reserveLevelIdx));
      const level = final ?? initial ?? mainLvl ?? reserveLvl;

      if (!(filled > 0 || drop > 0 || used > 0 || level != null)) continue;

      const tank: FuelTransaction['tank'] =
        isReserveTable || (reserveLvl != null && mainLvl == null) ? 'reserve' : 'main';

      n += 1;
      const baseId = `rpt-${table.index}-${n}`;
      const location = cellAt(row, table, locIdx) || '';

      // Pre-event level (so the line shows the jump at fill/drain time)
      if (initial != null && final != null && initial !== final) {
        out.push(
          emptyTx({
            id: `${baseId}-a`,
            unitId: unitName,
            unitName,
            section,
            tank,
            timestamp: Math.max(0, ts - 1),
            time: timeStr,
            location,
            initialLevel: initial,
            finalLevel: initial,
            mainTankLevel: tank === 'main' ? initial : mainLvl ?? undefined,
            reserveTankLevel: tank === 'reserve' ? initial : reserveLvl ?? undefined,
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
          timestamp: ts,
          time: timeStr,
          location,
          filled: filled > 0 ? filled : 0,
          suddenFuelDrop: drop > 0 ? drop : 0,
          fuelUsed: used > 0 ? used : 0,
          initialLevel: initial ?? 0,
          finalLevel: final ?? level ?? 0,
          mainTankLevel:
            tank === 'main'
              ? (final ?? level ?? mainLvl ?? undefined)
              : mainLvl ?? undefined,
          reserveTankLevel:
            tank === 'reserve'
              ? (final ?? level ?? reserveLvl ?? undefined)
              : reserveLvl ?? undefined,
        }),
      );
    }
  }

  return out.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
}
