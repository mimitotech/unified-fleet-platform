import type { WialonFuelTransaction } from '@/lib/fuelTypes';
import type { FuelTransaction } from '@/types';

const PERIOD_RE = /^__period:(\d+):(\d+)$/;

function decodePeriod(location: string | undefined, tx: WialonFuelTransaction): {
  location: string;
  periodFromTs?: number;
  periodToTs?: number;
} {
  if (tx.periodFromTs && tx.periodToTs) {
    return {
      location: location && !PERIOD_RE.test(location) ? location : '',
      periodFromTs: tx.periodFromTs,
      periodToTs: tx.periodToTs,
    };
  }
  const raw = location ?? '';
  const m = PERIOD_RE.exec(raw);
  if (!m) return { location: raw };
  return {
    location: '',
    periodFromTs: Number(m[1]),
    periodToTs: Number(m[2]),
  };
}

export function wialonFuelTransactionToFuelTransaction(tx: WialonFuelTransaction): FuelTransaction {
  const period = decodePeriod(tx.location, tx);
  return {
    id: tx.id,
    unitId: String(tx.unitId),
    unitName: tx.unitName,
    section: tx.section,
    tank: tx.tank,
    timestamp: tx.timestamp,
    time: tx.time,
    location: period.location,
    initialLevel: tx.initialLevel ?? 0,
    finalLevel: tx.finalLevel ?? 0,
    sensor: tx.sensor || '',
    filled: tx.filled ?? 0,
    fuelUsed: tx.fuelUsed ?? 0,
    mileage: tx.mileage ?? 0,
    duration: tx.duration || '',
    durationSeconds: tx.durationSeconds ?? 0,
    avgConsumption: tx.avgConsumption ?? 0,
    suddenFuelDrop: tx.suddenFuelDrop ?? 0,
    count: tx.count ?? 0,
    latitude: tx.latitude,
    longitude: tx.longitude,
    mainTankLevel: tx.mainTankLevel,
    reserveTankLevel: tx.reserveTankLevel,
    periodFromTs: period.periodFromTs,
    periodToTs: period.periodToTs,
  };
}

export function wialonFuelTransactionsToFuelTransactions(
  rows: WialonFuelTransaction[],
): FuelTransaction[] {
  return rows.map(wialonFuelTransactionToFuelTransaction);
}
