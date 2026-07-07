import type { WialonFuelTransaction } from '@/lib/fuelTypes';
import type { FuelTransaction } from '@/types';

export function wialonFuelTransactionToFuelTransaction(tx: WialonFuelTransaction): FuelTransaction {
  return {
    id: tx.id,
    unitId: String(tx.unitId),
    unitName: tx.unitName,
    section: tx.section,
    tank: tx.tank,
    timestamp: tx.timestamp,
    time: tx.time,
    location: tx.location,
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
  };
}

export function wialonFuelTransactionsToFuelTransactions(
  rows: WialonFuelTransaction[],
): FuelTransaction[] {
  return rows.map(wialonFuelTransactionToFuelTransaction);
}
