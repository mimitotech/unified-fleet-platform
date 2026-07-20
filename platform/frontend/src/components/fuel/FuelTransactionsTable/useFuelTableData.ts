import { useMemo } from 'react';
import type { FuelTransaction } from '@/types/entities';
import type { FuelTableUnit, VehicleGroup, FuelTableFilters } from './types';
import { aggregateUnitFuelColumns } from '../fuelColumnMetrics';
import { filterFuelTransactionsByDate, isWialonGroupSummary } from '../fuelTransactionFilters';
import { filterPlausibleFuelEvents } from '../fuelEventPlausibility';

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
  const { searchTerm, fromDate, toDate } = filters;

  /** Rows that fall inside the selected date range (period scope for totals). */
  const periodTransactions = useMemo(
    () => filterFuelTransactionsByDate(transactions, fromDate, toDate),
    [transactions, fromDate, toDate],
  );

  const filteredTransactions = useMemo(() => {
    if (searchTerm === '') return periodTransactions;
    return periodTransactions.filter((t) => {
      return (
        t.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.driverName && t.driverName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });
  }, [periodTransactions, searchTerm]);

  const vehicleGroups = useMemo((): VehicleGroup[] => {
    const groupMap = new Map<string, FuelTransaction[]>();

    for (const t of filteredTransactions) {
      const list = groupMap.get(t.unitName) ?? [];
      list.push(t);
      groupMap.set(t.unitName, list);
    }

    const groups: VehicleGroup[] = [];

    for (const [unitName, unitTxs] of groupMap) {
      const driverName = unitTxs.find((t) => t.driverName)?.driverName;
      const liveLevel = vehicleFuelLevels?.get(unitName);
      const plausibleTxs = filterPlausibleFuelEvents(unitTxs, liveLevel);
      const cols = aggregateUnitFuelColumns(plausibleTxs, { fromDate, toDate, liveLevel });

      groups.push({
        unitName,
        driverName,
        // Expanded rows match collapsed totals (no group summaries, no FLS noise).
        transactions: plausibleTxs.filter((t) => !isWialonGroupSummary(t) && t.sensor !== 'balance'),
        filledMain: cols.filledMain,
        filledReserve: cols.filledReserve,
        filledStation: cols.filledStation,
        variance: cols.variance,
        usedMain: cols.usedMain,
        usedReserve: cols.usedReserve,
        levelMain: cols.levelMain,
        levelReserve: cols.levelReserve,
        dropMain: cols.dropMain,
        dropReserve: cols.dropReserve,
        totalCost: cols.totalCost,
        alertCount: cols.alertCount,
        liveLevel: liveLevel && liveLevel > 0 ? liveLevel : undefined,
        fuelType: cols.fuelType,
        cardNumber: cols.cardNumber,
      });
    }

    if (vehicleFuelLevels && vehicleFuelLevels.size > 0) {
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
          fuelType: '',
          cardNumber: '',
        });
      }
    }

    groups.sort((a, b) => a.unitName.localeCompare(b.unitName));
    for (const group of groups) {
      group.transactions.sort((a, b) => b.timestamp - a.timestamp);
    }

    return groups;
  }, [filteredTransactions, vehicleFuelLevels, units, fromDate, toDate]);

  const hasMultipleVehicles = vehicleGroups.length > 1;

  return {
    vehicleGroups,
    filteredTransactions,
    hasMultipleVehicles,
  };
}
