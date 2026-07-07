import { useMemo } from 'react';
import type { FuelTransaction } from '@/types/entities';
import type { FuelTableUnit, VehicleGroup, FuelTableFilters } from './types';

interface UseFuelTableDataProps {
  transactions: FuelTransaction[];
  units: FuelTableUnit[];
  filters: FuelTableFilters;
  vehicleFuelLevels?: Map<string, number>;
}

interface UseFuelTableDataResult {
  vehicleGroups: VehicleGroup[];
  filteredTransactions: FuelTransaction[];
  hasMultipleVehicles: boolean;
}

export function useFuelTableData({
  transactions,
  units,
  filters,
  vehicleFuelLevels,
}: UseFuelTableDataProps): UseFuelTableDataResult {
  const { searchTerm } = filters;

  const filteredTransactions = useMemo(() => {
    if (searchTerm === '') return transactions;
    return transactions.filter((t) => {
      return (
        t.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.driverName && t.driverName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });
  }, [transactions, searchTerm]);

  const vehicleGroups = useMemo((): VehicleGroup[] => {
    const groupMap = new Map<string, VehicleGroup>();
    const latestMainTs = new Map<string, number>();
    const latestReserveTs = new Map<string, number>();

    for (const t of filteredTransactions) {
      const isMainTank = t.tank === 'main';
      const isReserveTank = t.tank === 'reserve';
      const hasTheftAlert = t.suddenFuelDrop > 0;

      let group = groupMap.get(t.unitName);
      if (!group) {
        group = {
          unitName: t.unitName,
          driverName: t.driverName,
          transactions: [],
          filledMain: 0,
          filledReserve: 0,
          filledStation: 0,
          variance: 0,
          usedMain: 0,
          usedReserve: 0,
          levelMain: 0,
          levelReserve: 0,
          dropMain: 0,
          dropReserve: 0,
          totalCost: 0,
          alertCount: 0,
        };
        groupMap.set(t.unitName, group);
      }

      group.transactions.push(t);

      if (isMainTank) {
        group.filledMain += t.filled > 0 ? t.filled : 0;
        group.usedMain += t.fuelUsed > 0 ? t.fuelUsed : 0;
        const prevTs = latestMainTs.get(t.unitName) ?? -1;
        if (t.timestamp > prevTs) {
          group.levelMain = t.finalLevel;
          latestMainTs.set(t.unitName, t.timestamp);
        }
        group.dropMain += t.suddenFuelDrop > 0 ? t.suddenFuelDrop : 0;
      }
      if (isReserveTank) {
        group.filledReserve += t.filled > 0 ? t.filled : 0;
        group.usedReserve += t.fuelUsed > 0 ? t.fuelUsed : 0;
        const prevTs = latestReserveTs.get(t.unitName) ?? -1;
        if (t.timestamp > prevTs) {
          group.levelReserve = t.finalLevel;
          latestReserveTs.set(t.unitName, t.timestamp);
        }
        group.dropReserve += t.suddenFuelDrop > 0 ? t.suddenFuelDrop : 0;
      }
      if (hasTheftAlert) group.alertCount++;
      group.filledStation += t.filledStation ?? 0;
      group.totalCost += t.totalCost ?? 0;
    }

    const groups = Array.from(groupMap.values());

    for (const group of groups) {
      const flsFilled = group.filledMain + group.filledReserve;
      group.variance = flsFilled > 0 || group.filledStation > 0 ? flsFilled - group.filledStation : 0;
    }

    groups.sort((a, b) => a.unitName.localeCompare(b.unitName));

    for (const group of groups) {
      group.transactions.sort((a, b) => b.timestamp - a.timestamp);
    }

    if (vehicleFuelLevels && vehicleFuelLevels.size > 0) {
      for (const group of groups) {
        const live = vehicleFuelLevels.get(group.unitName);
        if (live !== undefined && live > 0) {
          group.liveLevel = live;
        }
      }

      for (const u of units) {
        if (groupMap.has(u.name)) continue;
        const liveLevel = vehicleFuelLevels.get(u.name);
        groups.push({
          unitName: u.name,
          driverName: u.driver,
          transactions: [],
          filledMain: 0,
          filledReserve: 0,
          filledStation: 0,
          variance: 0,
          usedMain: 0,
          usedReserve: 0,
          levelMain: 0,
          levelReserve: 0,
          dropMain: 0,
          dropReserve: 0,
          totalCost: 0,
          alertCount: 0,
          liveLevel: liveLevel && liveLevel > 0 ? liveLevel : undefined,
        });
      }

      groups.sort((a, b) => a.unitName.localeCompare(b.unitName));
    }

    return groups;
  }, [filteredTransactions, vehicleFuelLevels, units]);

  const hasMultipleVehicles = vehicleGroups.length > 1;

  return {
    vehicleGroups,
    filteredTransactions,
    hasMultipleVehicles,
  };
}
