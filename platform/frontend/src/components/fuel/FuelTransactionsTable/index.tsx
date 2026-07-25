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
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { buildReportCsv, downloadReportCsv } from '@/lib/reportCsv';
import { buildReportFilename } from '@/lib/reportFilename';

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
  const branding = useTenantBranding();
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
    const columns = [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'unitName', label: unitLabel },
      { key: 'unitId', label: `${unitLabel} ID` },
      { key: 'driver', label: 'Driver' },
      { key: 'location', label: 'Location' },
      { key: 'latitude', label: 'Latitude' },
      { key: 'longitude', label: 'Longitude' },
      { key: 'section', label: 'Section' },
      { key: 'tank', label: 'Tank' },
      { key: 'filledMain', label: 'Filled Main (L)' },
      { key: 'filledReserve', label: 'Filled Reserve (L)' },
      { key: 'filledStation', label: 'Filled Station (L)' },
      { key: 'variance', label: 'Variance (L)' },
      { key: 'usedMain', label: 'Used Main (L)' },
      { key: 'usedReserve', label: 'Used Reserve (L)' },
      { key: 'totalUsed', label: 'Total Used (L)' },
      { key: 'levelMain', label: 'Level Main (L)' },
      { key: 'levelReserve', label: 'Level Reserve (L)' },
      { key: 'totalLevel', label: 'Total Level (L)' },
      { key: 'dropMain', label: 'Drop Main (L)' },
      { key: 'dropReserve', label: 'Drop Reserve (L)' },
      { key: 'totalDrop', label: 'Total Drop (L)' },
      { key: 'mileage', label: 'Mileage (km)' },
      { key: 'duration', label: 'Duration' },
      { key: 'avgConsumption', label: 'Avg consumption' },
      { key: 'odometer', label: 'Odometer' },
      { key: 'fuelType', label: 'Fuel type' },
      { key: 'pricePerLiter', label: 'Price / L (UGX)' },
      { key: 'cost', label: 'Cost (UGX)' },
      { key: 'cardNo', label: 'Card No' },
      { key: 'sensor', label: 'Sensor' },
      { key: 'transactionId', label: 'Transaction ID' },
    ];

    const rows = filteredTransactions.map((t) => {
      const vals = getTransactionDisplayValues(t);
      return {
        date: format(new Date(t.timestamp * 1000), 'yyyy-MM-dd'),
        time: formatTransactionTime(t),
        unitName: t.unitName,
        unitId: t.unitId,
        driver: t.driverName || '',
        location: t.location || '',
        latitude: t.latitude ?? '',
        longitude: t.longitude ?? '',
        section: t.section || '',
        tank: t.tank || '',
        filledMain: vals.filledMain,
        filledReserve: vals.filledReserve,
        filledStation: vals.filledStation,
        variance: vals.variance,
        usedMain: vals.usedMain,
        usedReserve: vals.usedReserve,
        totalUsed: vals.totalUsed,
        levelMain: vals.levelMain,
        levelReserve: vals.levelReserve,
        totalLevel: vals.totalLevel,
        dropMain: vals.dropMain,
        dropReserve: vals.dropReserve,
        totalDrop: vals.totalDrop,
        mileage: t.mileage ?? '',
        duration: t.duration || '',
        avgConsumption: t.avgConsumption ?? '',
        odometer: t.odometer ?? '',
        fuelType: vals.fuelType || '',
        pricePerLiter: t.pricePerLiter ?? '',
        cost: vals.totalCost,
        cardNo: vals.cardNumber || '',
        sensor: t.sensor || '',
        transactionId: t.id,
      };
    });

    const totalFilled = rows.reduce((s, r) => s + (Number(r.filledMain) || 0) + (Number(r.filledReserve) || 0), 0);
    const totalUsed = rows.reduce((s, r) => s + (Number(r.totalUsed) || 0), 0);
    const totalDrop = rows.reduce((s, r) => s + (Number(r.totalDrop) || 0), 0);
    const totalCost = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);

    const csv = buildReportCsv({
      meta: {
        title: 'Fuel Transactions',
        moduleLabel: 'Fuel',
        clientName: branding.name,
        periodLabel: `${fromDate} → ${toDate}`,
        objectLabel: 'Filtered transactions',
        generatedAt: new Date(),
        filters: [
          { label: 'From', value: fromDate },
          { label: 'To', value: toDate },
          ...(searchTerm.trim() ? [{ label: 'Search', value: searchTerm.trim() }] : []),
        ],
        kpis: [
          { label: 'Transactions', value: rows.length },
          { label: 'Filled (L)', value: Number(totalFilled.toFixed(1)) },
          { label: 'Used (L)', value: Number(totalUsed.toFixed(1)) },
          { label: 'Drop / theft (L)', value: Number(totalDrop.toFixed(1)) },
          { label: 'Cost (UGX)', value: Math.round(totalCost) },
        ],
        notes: [`Exported ${rows.length} transaction row(s) matching current filters.`],
      },
      columns,
      rows,
    });

    downloadReportCsv(
      csv,
      `${buildReportFilename({
        clientName: branding.name,
        reportName: 'Fuel_Transactions',
        date: toDate || format(new Date(), 'yyyy-MM-dd'),
      })}.csv`,
    );
  };

  const tableMinWidth = useMemo(() => fuelTableMinWidthPx(visibleColumns), [visibleColumns]);

  return (
    <div className="fleet-card fuel-usage-panel branded-panel flex flex-col min-w-0 max-w-full">
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
