import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import type { WialonUnitSlice } from './wialonUnitMapper.js';

/** Rebuild minimal search_items shape from fleet snapshot (avoids duplicate Wialon search). */
export function unitSliceToSearchItem(unit: WialonUnitSlice): WialonSearchItem {
  const sens: NonNullable<WialonSearchItem['sens']> = {};
  for (const s of unit.sens) {
    if (!s.name) continue;
    sens[String(s.id)] = {
      n: s.name,
      t: s.type,
      p: s.param,
      u: s.unit,
      tbl: s.tbl,
    };
  }

  const prms: NonNullable<WialonSearchItem['prms']> = {};
  for (const p of unit.prms) {
    const n = parseFloat(p.value);
    if (Number.isFinite(n)) prms[p.key] = { v: n, ct: p.calcTime, at: p.actualTime };
  }

  // Preserve custom / property fields so tank capacity declarations
  // (TANK CAPACITY, MAIN TANK CAPACITY, Capacidad, …) stay available without
  // a second Wialon search. Never invent fields — only copy what the slice has.
  const flds: NonNullable<WialonSearchItem['flds']> = {};
  for (const f of unit.flds ?? []) {
    if (!f?.name) continue;
    flds[String(f.id ?? f.name)] = { id: f.id, n: f.name, v: String(f.value ?? '') };
  }

  const prp = unit.prp && Object.keys(unit.prp).length ? { ...unit.prp } : undefined;

  return {
    id: unit.id,
    nm: unit.name,
    sens: Object.keys(sens).length ? sens : undefined,
    prms: Object.keys(prms).length ? prms : undefined,
    flds: Object.keys(flds).length ? flds : undefined,
    prp,
    cnm: unit.counters?.mileage,
    cneh: unit.counters?.engineHours,
    pos: unit.position
      ? { x: unit.position.lng, y: unit.position.lat, s: unit.position.speed, t: unit.position.time, c: unit.position.course }
      : undefined,
  };
}

export function sliceHasFuelSensorData(unit: WialonUnitSlice): boolean {
  if (!unit.sens.length) return false;
  return unit.sens.some((s) => s.param && (s.tbl?.length || unit.prms.some((p) => p.key === s.param)));
}
