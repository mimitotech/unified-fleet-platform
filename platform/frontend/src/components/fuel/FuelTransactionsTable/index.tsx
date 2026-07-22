import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Fuel, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FuelTransaction } from '@/types/entities';
import type { FuelTransactionsTableProps } from './types';
import { getTransactionDisplayValues, formatTransactionTime } from './utils';
import { useFuelTableData } from './useFuelTableData';
import { FuelTableHeader } from './FuelTableHeader';
import { FuelTableColumnHeaders } from './FuelTableColumnHeaders';
import { FuelTransactionRow } from './FuelTransactionRow';
import { VehicleGroupRow } from './VehicleGroupRow';
import { TransactionDetailModal } from '../TransactionDetailModal';
import { FuelPerTripModal } from './FuelPerTripModal';
import { fuelTableMinWidthPx } from './fuelTableCells';

export function FuelTransactionsTable({
  transactions,
  vehicleFuelLevels,
  vehicles = [],
  units: unitsProp,
  unitLabel = 'Vehicle',
  unitLabelPlural = 'vehicles',
  showFuelPerTrip = true,
  isLoading,
  onRefresh,
  isRefreshing,
  isBackgroundRefreshing,
  fromDate,
  toDate,
  todayStr,
  onFromDateChange,
  onToDateChange,
  visibleColumns,
}: FuelTransactionsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [selectedTransaction, setSelectedTransaction] = useState<FuelTransaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFuelPerTripOpen, setIsFuelPerTripOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const units = useMemo(
    () =>
      unitsProp ??
      vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        driver: v.driver ?? undefined,
      })),
    [unitsProp, vehicles],
  );

  const { vehicleGroups, filteredTransactions, hasMultipleVehicles } = useFuelTableData({
    transactions,
    units,
    filters: { searchTerm, fromDate, toDate },
    vehicleFuelLevels,
  });

  const totalVehicles = vehicleGroups.length;
  const totalPages = Math.ceil(totalVehicles / perPage);
  const paginatedVehicleGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * perPage;
    return vehicleGroups.slice(startIndex, startIndex + perPage);
  }, [vehicleGroups, currentPage, perPage]);

  const allVehicleNames = vehicleGroups.map((g) => g.unitName);
  const allExpanded = allVehicleNames.length > 0 && allVehicleNames.every((name) => expandedVehicles.has(name));

  const openTransactionDetail = (transaction: FuelTransaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  const toggleVehicle = (unitName: string) => {
    setExpandedVehicles((prev) => {
      const next = new Set(prev);
      if (next.has(unitName)) next.delete(unitName);
      else next.add(unitName);
      return next;
    });
  };

  const toggleAllVehicles = (expand: boolean) => {
    setExpandedVehicles(expand ? new Set(allVehicleNames) : new Set());
  };

  const exportToCSV = () => {
    const headers = [
      'Date',
      'Time',
      unitLabel,
      'Driver',
      'Location',
      'Filled (Main)',
      'Filled (Reserve)',
      'Filled (Station)',
      'Variance',
      'Used (Main)',
      'Used (Reserve)',
      'Level (Main)',
      'Level (Reserve)',
      'Total Level',
      'Drop (Main)',
      'Drop (Reserve)',
      'Total Drop',
      'Total Used',
      'Type',
      'Cost',
      'Card No',
    ];

    const rows = filteredTransactions.map((t) => {
      const vals = getTransactionDisplayValues(t);
      return [
        format(new Date(t.timestamp * 1000), 'yyyy-MM-dd'),
        formatTransactionTime(t),
        `"${t.unitName}"`,
        `"${t.driverName || ''}"`,
        `"${t.location}"`,
        vals.filledMain > 0 ? vals.filledMain.toFixed(1) : '',
        vals.filledReserve > 0 ? vals.filledReserve.toFixed(1) : '',
        vals.filledStation > 0 ? vals.filledStation.toFixed(1) : '',
        vals.variance !== 0 ? vals.variance.toFixed(1) : '',
        vals.usedMain > 0 ? vals.usedMain.toFixed(1) : '',
        vals.usedReserve > 0 ? vals.usedReserve.toFixed(1) : '',
        vals.levelMain > 0 ? vals.levelMain.toFixed(0) : '',
        vals.levelReserve > 0 ? vals.levelReserve.toFixed(0) : '',
        vals.totalLevel > 0 ? vals.totalLevel.toFixed(0) : '',
        vals.dropMain > 0 ? vals.dropMain.toFixed(1) : '',
        vals.dropReserve > 0 ? vals.dropReserve.toFixed(1) : '',
        vals.totalDrop > 0 ? vals.totalDrop.toFixed(1) : '',
        vals.totalUsed > 0 ? vals.totalUsed.toFixed(1) : '',
        vals.fuelType,
        vals.totalCost > 0 ? vals.totalCost.toFixed(0) : '',
        `"${vals.cardNumber}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableMinWidth = useMemo(() => fuelTableMinWidthPx(visibleColumns), [visibleColumns]);

  return (
    <div className="fleet-card fuel-usage-panel flex flex-col min-w-0 max-w-full">
      <FuelTableHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        fromDate={fromDate}
        toDate={toDate}
        todayStr={todayStr}
        onFromDateChange={onFromDateChange}
        onToDateChange={onToDateChange}
        hasMultipleVehicles={hasMultipleVehicles}
        totalUnits={totalVehicles}
        unitLabelPlural={unitLabelPlural}
        showFuelPerTrip={showFuelPerTrip}
        allExpanded={allExpanded}
        onToggleAllVehicles={toggleAllVehicles}
        onExport={exportToCSV}
        onOpenFuelPerTrip={() => setIsFuelPerTripOpen(true)}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        isBackgroundRefreshing={isBackgroundRefreshing}
      />

      <div className="fuel-usage-scroll mt-3 w-full max-w-full min-w-0">
        <table
          className="fuel-compact-table w-max"
          style={{ minWidth: tableMinWidth }}
        >
          <FuelTableColumnHeaders unitColumnLabel={unitLabel} visibleColumns={visibleColumns} />
          <tbody>
            {!hasMultipleVehicles &&
              filteredTransactions.map((t) => (
                <FuelTransactionRow
                  key={t.id}
                  transaction={t}
                  onClick={() => openTransactionDetail(t)}
                  visibleColumns={visibleColumns}
                />
              ))}

            {hasMultipleVehicles &&
              paginatedVehicleGroups.map((group) => (
                <VehicleGroupRow
                  key={group.unitName}
                  group={group}
                  isExpanded={expandedVehicles.has(group.unitName)}
                  onToggle={() => toggleVehicle(group.unitName)}
                  onTransactionClick={openTransactionDetail}
                  visibleColumns={visibleColumns}
                />
              ))}
          </tbody>
        </table>
      </div>

      {hasMultipleVehicles && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="capitalize">{unitLabelPlural} per page:</span>
            <Select
              value={String(perPage)}
              onValueChange={(value) => {
                setPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages} ({totalVehicles} {unitLabelPlural})
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1 || isLoading}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0"
                  >
                    {pageNum}
                  </Button>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages || isLoading}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && vehicleGroups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {searchTerm || fromDate || toDate ? (
            'No transactions found for the selected filters'
          ) : (
            <div className="space-y-2">
              <Fuel className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-medium">No fuel transactions detected</p>
              <p className="text-sm max-w-md mx-auto">
                Transactions are populated from fuel level sensors (auto-detected fillings, consumption, and
                sudden drops).
              </p>
            </div>
          )}
        </div>
      )}

      <TransactionDetailModal transaction={selectedTransaction} isOpen={isModalOpen} onClose={closeModal} />

      {showFuelPerTrip && (
        <FuelPerTripModal
          isOpen={isFuelPerTripOpen}
          onClose={() => setIsFuelPerTripOpen(false)}
          fuelTransactions={transactions}
        />
      )}
    </div>
  );
}

export type { FuelTransactionsTableProps, VehicleGroup } from './types';
