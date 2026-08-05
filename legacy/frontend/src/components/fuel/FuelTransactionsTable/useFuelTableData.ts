import { useMemo } from 'react';
import type { FuelTransaction } from '@/types/entities';
import type { FuelTableUnit, VehicleGroup, FuelTableFilters } from './types';
import { aggregateUnitFuelColumns } from '../fuelColumnMetrics';
import {
  filterFuelTransactionsByDate,
  hasMeaningfulFuelLeaf,
  isWialonGroupSummary,
} from '../fuelTransactionFilters';
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
    const allowedNames = new Set(
      units.map((u) => u.name.trim().toLowerCase()).filter(Boolean),
    );
    // When the category unit roster is known, never promote out-of-category
    // transaction names into this tab (e.g. excavator on Vehicles).
    const scopeToRoster = allowedNames.size > 0;

    const groupMap = new Map<string, FuelTransaction[]>();

    for (const t of filteredTransactions) {
      const key = t.unitName.trim();
      if (!key) continue;
      if (scopeToRoster && !allowedNames.has(key.toLowerCase())) continue;
      const list = groupMap.get(key) ?? [];
      list.push(t);
      groupMap.set(key, list);
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
        // Expanded rows match collapsed totals (no group summaries, no empty noise).
        transactions: plausibleTxs.filter(
          (t) => !isWialonGroupSummary(t) && t.sensor !== 'balance' && hasMeaningfulFuelLeaf(t),
        ),
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

    // Always list every unit in this category tab — even with no period events.
    for (const u of units) {
      if (groupMap.has(u.name)) continue;
      const liveLevel = vehicleFuelLevels?.get(u.name);
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
        levelMain: liveLevel && liveLevel > 0 ? liveLevel : 0,
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
