export type WialonFuelEvent = {
  id: string;
  unitId: number;
  unitName?: string;
  type: 'filling' | 'theft' | 'fuel_event' | 'level_snapshot';
  volume: number;
  currentLevel?: number;
  mainLevel?: number;
  reserveLevel?: number;
  sensorId?: number;
  sensorName?: string;
  timestamp: string;
  markedFalse?: boolean;
};

const MAX_EVENTS = 2000;
const MAX_SNAPSHOTS_PER_UNIT = 48;

class FuelEventStore {
  private byTenant = new Map<string, WialonFuelEvent[]>();
  private sessionFilled = new Map<string, Map<number, number>>();

  private tenantKey(tenantId: string, unitId: number) {
    return `${tenantId}:${unitId}`;
  }

  append(tenantId: string, event: Omit<WialonFuelEvent, 'id'>): WialonFuelEvent | null {
    const list = this.byTenant.get(tenantId) ?? [];
    const id = `${event.unitId}-${event.type}-${event.timestamp}-${event.volume}-${event.sensorId ?? 0}`;
    if (list.some((e) => e.id === id)) return null;

    const row: WialonFuelEvent = { ...event, id };
    list.unshift(row);
    if (list.length > MAX_EVENTS) list.length = MAX_EVENTS;
    this.byTenant.set(tenantId, list);

    if (event.type === 'filling' && !event.markedFalse) {
      const byUnit = this.sessionFilled.get(tenantId) ?? new Map();
      byUnit.set(event.unitId, (byUnit.get(event.unitId) ?? 0) + event.volume);
      this.sessionFilled.set(tenantId, byUnit);
    }

    return row;
  }

  recordLevelSnapshots(
    tenantId: string,
    units: Array<{
      unitId: number;
      unitName?: string;
      levelLiters?: number;
      mainLiters?: number;
      reserveLiters?: number;
      sensors?: Array<{ sensorId: number; name?: string; level?: number; value?: number }>;
    }>
  ) {
    const now = new Date().toISOString();
    for (const u of units) {
      if (u.levelLiters == null && !u.sensors?.length) continue;
      this.append(tenantId, {
        unitId: u.unitId,
        unitName: u.unitName,
        type: 'level_snapshot',
        volume: u.levelLiters ?? 0,
        currentLevel: u.levelLiters,
        mainLevel: u.mainLiters,
        reserveLevel: u.reserveLiters,
        timestamp: now,
      });

      const list = this.byTenant.get(tenantId) ?? [];
      const snapCount = list.filter((e) => e.unitId === u.unitId && e.type === 'level_snapshot').length;
      if (snapCount > MAX_SNAPSHOTS_PER_UNIT) {
        const toRemove = snapCount - MAX_SNAPSHOTS_PER_UNIT;
        let removed = 0;
        for (let i = list.length - 1; i >= 0 && removed < toRemove; i--) {
          if (list[i].unitId === u.unitId && list[i].type === 'level_snapshot') {
            list.splice(i, 1);
            removed++;
          }
        }
      }
    }
  }

  ingestFromLive(
    tenantId: string,
    units: Array<{
      unitId: number;
      unitName?: string;
      fuel?: {
        filled?: number;
        levelLiters?: number;
        sensors?: Array<{ sensorId: number; name?: string; filled?: number; level?: number; value?: number }>;
      };
    }>
  ): WialonFuelEvent[] {
    const added: WialonFuelEvent[] = [];
    const now = new Date().toISOString();
    for (const u of units) {
      for (const s of u.fuel?.sensors ?? []) {
        const vol = s.filled ?? 0;
        if (vol <= 0) continue;
        const ev = this.append(tenantId, {
          unitId: u.unitId,
          unitName: u.unitName,
          type: 'filling',
          volume: Math.round(vol * 10) / 10,
          currentLevel: s.level ?? s.value ?? u.fuel?.levelLiters,
          sensorId: s.sensorId,
          sensorName: s.name,
          timestamp: now,
        });
        if (ev) added.push(ev);
      }
      const topFilled = u.fuel?.filled ?? 0;
      if (topFilled > 0 && !(u.fuel?.sensors?.length)) {
        const ev = this.append(tenantId, {
          unitId: u.unitId,
          unitName: u.unitName,
          type: 'filling',
          volume: Math.round(topFilled * 10) / 10,
          currentLevel: u.fuel?.levelLiters,
          timestamp: now,
        });
        if (ev) added.push(ev);
      }
    }
    return added;
  }

  sessionTotalsByUnit(tenantId: string): Map<number, { filled: number }> {
    const src = this.sessionFilled.get(tenantId) ?? new Map();
    const out = new Map<number, { filled: number }>();
    for (const [unitId, filled] of src) {
      out.set(unitId, { filled: Math.round(filled * 10) / 10 });
    }
    return out;
  }

  list(tenantId: string, limit = 200): WialonFuelEvent[] {
    return (this.byTenant.get(tenantId) ?? [])
      .filter((e) => e.type !== 'level_snapshot')
      .slice(0, limit);
  }

  listFillEvents(tenantId: string, limit = 200): WialonFuelEvent[] {
    return (this.byTenant.get(tenantId) ?? [])
      .filter((e) => e.type === 'filling' && !e.markedFalse)
      .slice(0, limit);
  }

  monthlyTrend(tenantId: string, days = 30): Array<{ month: string; filled: number; consumed: number }> {
    const cutoff = Date.now() - days * 86400000;
    const byDay = new Map<string, { filled: number; consumed: number }>();
    for (const e of this.byTenant.get(tenantId) ?? []) {
      const t = new Date(e.timestamp).getTime();
      if (t < cutoff) continue;
      const month = e.timestamp.slice(0, 7);
      const row = byDay.get(month) ?? { filled: 0, consumed: 0 };
      if (e.type === 'filling') row.filled += e.volume;
      if (e.type === 'theft') row.consumed += e.volume;
      byDay.set(month, row);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, filled: Math.round(v.filled * 10) / 10, consumed: Math.round(v.consumed * 10) / 10 }));
  }

  kpis(tenantId: string) {
    const events = this.byTenant.get(tenantId) ?? [];
    const fillings = events.filter((e) => e.type === 'filling' && !e.markedFalse);
    const thefts = events.filter((e) => e.type === 'theft' && !e.markedFalse);
    const totalFilled = fillings.reduce((a, e) => a + e.volume, 0);
    const totalLost = thefts.reduce((a, e) => a + e.volume, 0);
    return {
      totalFillings: fillings.length,
      totalFilled: Math.round(totalFilled * 10) / 10,
      totalThefts: thefts.length,
      totalLost: Math.round(totalLost * 10) / 10,
      netConsumption: Math.round((totalFilled - totalLost) * 10) / 10,
    };
  }

  markFalse(tenantId: string, eventId: string) {
    const list = this.byTenant.get(tenantId);
    if (!list) return false;
    const ev = list.find((e) => e.id === eventId);
    if (!ev) return false;
    ev.markedFalse = true;
    return true;
  }
}

export const wialonFuelEventStore = new FuelEventStore();
