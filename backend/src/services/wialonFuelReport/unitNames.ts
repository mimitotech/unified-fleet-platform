/** Case-insensitive unit name lookup for Wialon group report rows. */
export function normalizeUnitName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '');
}

export type UnitNameIndex = {
  resolve: (name: string) => number;
};

export function buildUnitNameIndex(units: Array<{ id: number; nm: string }>): UnitNameIndex {
  const exact = new Map<string, number>();
  const normalized = new Map<string, number>();
  for (const u of units) {
    exact.set(u.nm, u.id);
    normalized.set(normalizeUnitName(u.nm), u.id);
  }
  return {
    resolve(name: string): number {
      const trimmed = name.trim();
      if (!trimmed) return 0;
      return exact.get(trimmed) ?? normalized.get(normalizeUnitName(trimmed)) ?? 0;
    },
  };
}

export function patchTransactionUnitIds<T extends { unitId: number; unitName: string }>(
  rows: T[],
  index: UnitNameIndex,
): T[] {
  for (const row of rows) {
    if (row.unitId > 0) continue;
    const id = index.resolve(row.unitName);
    if (id > 0) row.unitId = id;
  }
  return rows;
}
