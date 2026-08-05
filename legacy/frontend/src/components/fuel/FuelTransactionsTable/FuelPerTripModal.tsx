import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { X, Search, Fuel, Route, TrendingDown, Gauge, Calendar, Clock, Truck, Droplets, MapPin, Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { FuelTransaction } from '@/types/entities';
import { useTripSummaries } from '@/services/fleet';
import { useVehicles } from '@/services/fleet/hooks';
import { formatCurrency } from './utils';

interface FuelPerTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  fuelTransactions: FuelTransaction[];
}

interface AggregatedTripData {
  totalMileage: number;
  totalFuelUsed: number;
  totalFilledStation: number;
  totalCost: number;
  avgConsumption: number;
  tripCount: number;
  duration: string;
  totalDurationSec: number;
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;
  avgSpeed: number;
  maxSpeed: number;
  fuelVariance: number; // Difference between refilled and used (positive = surplus)
  variancePercent: number; // Variance as percentage of fuel used
}

export function FuelPerTripModal({
  isOpen,
  onClose,
  fuelTransactions: allFuelTransactions,
}: FuelPerTripModalProps) {
  const { data: vehicles = [] } = useVehicles();

  const vehicleOptions = useMemo(() => {
    const vehicleSet = new Set<string>();
    vehicles.forEach((v) => vehicleSet.add(v.name));
    allFuelTransactions.forEach((t) => {
      if (t.unitName) vehicleSet.add(t.unitName);
    });
    return Array.from(vehicleSet).sort();
  }, [vehicles, allFuelTransactions]);

  // Filter state
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // Date range state - default to last 7 days (matching TripSummaryView pattern)
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [fromDate, setFromDate] = useState<string>(weekAgo.toISOString().split('T')[0]);
  const [toDate, setToDate] = useState<string>(today.toISOString().split('T')[0]);
  // Time state - default 00:00 for start, 23:59 for end
  const [fromTime, setFromTime] = useState<string>('00:00');
  const [toTime, setToTime] = useState<string>('23:59');

  // Combine date and time for API calls (matching TripSummaryView pattern)
  const fromDateTime = `${fromDate}T${fromTime}:00`;
  const toDateTime = `${toDate}T${toTime}:59`;

  // Find the selected vehicle's Wialon unit ID
  const selectedUnitId = useMemo(() => {
    if (!selectedVehicle) return undefined;
    const vehicle = vehicles.find(v => v.name === selectedVehicle);
    return vehicle?.id;
  }, [selectedVehicle, vehicles]);

  // Check if this vehicle exists in Wialon
  const hasWialonData = !!selectedUnitId;

  // Fetch trip summaries from Wialon when filters are set AND vehicle exists in Wialon
  // Uses combined datetime strings (matching TripSummaryView pattern)
  const { data: tripSummaries, isLoading: isLoadingTrips } = useTripSummaries(
    selectedUnitId && fromDate && toDate ? {
      unitId: selectedUnitId,
      from: fromDateTime,
      to: toDateTime,
      includeRoute: false,
    } : undefined,
    { enabled: !!selectedUnitId && !!fromDate && !!toDate }
  );

  // Filter fuel transactions for the selected vehicle
  // (transactions are already fetched by parent - Fuel page)
  const fuelTransactions = useMemo(() => {
    if (!selectedUnitId) return [];
    return allFuelTransactions.filter(t => t.unitId === selectedUnitId);
  }, [allFuelTransactions, selectedUnitId]);

  // Auto-set times when dates change (matching TripSummaryView pattern)
  const handleFromDateChange = (newDate: string) => {
    setFromDate(newDate);
    setFromTime('00:00'); // Reset to start of day
  };

  const handleToDateChange = (newDate: string) => {
    setToDate(newDate);
    setToTime('23:59'); // Reset to end of day
  };

  // Filter vehicle options by search
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return vehicleOptions;
    const search = vehicleSearch.toLowerCase();
    return vehicleOptions.filter(v => v.toLowerCase().includes(search));
  }, [vehicleOptions, vehicleSearch]);

  // Helper function to normalize vehicle names for matching
  const normalizeVehicleName = (name: string) => name.trim().toLowerCase();

  // Aggregate trip summaries and fuel station data
  const aggregatedData = useMemo<AggregatedTripData | null>(() => {
    if (!selectedVehicle || !fromDateTime || !toDateTime) return null;

    const fromTs = new Date(fromDateTime).getTime();
    const toTs = new Date(toDateTime).getTime();

    // Filter trips by overlap with time range (not strict containment)
    // This includes trips that start before or end after the range
    const filteredTrips = (tripSummaries || []).filter(trip => {
      const depTime = new Date(trip.departureTime).getTime();
      const arrTime = new Date(trip.arrivalTime).getTime();
      // Include trip if it overlaps with the selected time range
      return depTime <= toTs && arrTime >= fromTs;
    });

    // Filter fuel transactions for refills (from Wialon)
    // Use filled > 0 or section === 'filling' to identify refills
    const filteredRefills = fuelTransactions.filter(t => {
      const txTs = t.timestamp * 1000; // Convert to milliseconds
      const inRange = txTs >= fromTs && txTs <= toTs;
      const isRefill = t.filled > 0 || t.section === 'filling';
      return inRange && isRefill;
    });

    // Return null if no data available
    if (filteredTrips.length === 0 && filteredRefills.length === 0) return null;

    // Aggregate trip data from Wialon
    let totalMileage = 0;
    let totalFuelUsed = 0;
    let totalDurationSec = 0;
    let totalAvgSpeed = 0;
    let maxSpeed = 0;

    filteredTrips.forEach(trip => {
      totalMileage += trip.mileage || 0;
      totalFuelUsed += trip.fuelUsed || 0;
      totalDurationSec += trip.duration || 0;
      totalAvgSpeed += trip.avgSpeed || 0;
      if (trip.maxSpeed > maxSpeed) maxSpeed = trip.maxSpeed;
    });

    // Aggregate refill data from Wialon fuel transactions
    let totalFilledStation = 0;
    filteredRefills.forEach(t => {
      totalFilledStation += t.filled || 0;
    });

    // Calculate average consumption (L/100km)
    const avgConsumption = totalMileage > 0 ? (totalFuelUsed / totalMileage) * 100 : 0;
    const avgSpeed = filteredTrips.length > 0 ? totalAvgSpeed / filteredTrips.length : 0;

    // Format duration
    const hours = Math.floor(totalDurationSec / 3600);
    const minutes = Math.floor((totalDurationSec % 3600) / 60);
    const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    // Get first and last trip for time info and locations
    const sortedTrips = [...filteredTrips].sort((a, b) =>
      new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime()
    );

    const firstTrip = sortedTrips[0];
    const lastTrip = sortedTrips[sortedTrips.length - 1];

    const startTime = firstTrip
      ? format(new Date(firstTrip.departureTime), 'MMM d, HH:mm')
      : format(new Date(fromDateTime), 'MMM d, HH:mm');
    const endTime = lastTrip
      ? format(new Date(lastTrip.arrivalTime), 'MMM d, HH:mm')
      : format(new Date(toDateTime), 'MMM d, HH:mm');

    // Extract locations from trip summaries (matching TripSummaryView pattern)
    // Use departureFrom.address and arrivedAt.address from first and last trips
    const startLocation = firstTrip?.departureFrom?.address || 'Unknown';
    const endLocation = lastTrip?.arrivedAt?.address || 'Unknown';

    console.log('[FuelPerTrip] Locations from trips:', {
      startLocation,
      endLocation,
      firstTripDeparture: firstTrip?.departureFrom,
      lastTripArrival: lastTrip?.arrivedAt,
    });

    // Calculate fuel variance (refilled - used)
    const fuelVariance = totalFilledStation - totalFuelUsed;
    const variancePercent = totalFuelUsed > 0 ? (fuelVariance / totalFuelUsed) * 100 : 0;

    return {
      totalMileage,
      totalFuelUsed,
      totalFilledStation,
      totalCost: 0, // Removed cost - no longer using Google Sheets
      avgConsumption,
      tripCount: filteredTrips.length,
      duration,
      totalDurationSec,
      startTime,
      endTime,
      startLocation,
      endLocation,
      avgSpeed,
      maxSpeed,
      fuelVariance,
      variancePercent,
    };
  }, [selectedVehicle, fromDateTime, toDateTime, tripSummaries, fuelTransactions]);

  const handleVehicleSelect = (vehicle: string) => {
    setSelectedVehicle(vehicle);
    setVehicleSearch(vehicle);
    setShowVehicleDropdown(false);
  };

  const clearFilters = () => {
    setSelectedVehicle('');
    setVehicleSearch('');
    // Reset to default 7-day range
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    setFromDate(weekAgo.toISOString().split('T')[0]);
    setToDate(today.toISOString().split('T')[0]);
    setFromTime('00:00');
    setToTime('23:59');
  };

  /**
   * Truncate location name to a reasonable length
   * Removes common prefixes and keeps just the essential part
   */
  const truncateLocation = (location: string, maxLength = 30): string => {
    if (!location || location === 'Unknown') return location;

    // Remove common prefixes like "Near ", "At ", etc.
    let cleaned = location.replace(/^(Near|At|On|Along)\s+/i, '');

    // If still too long, truncate with ellipsis
    if (cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength - 3) + '...';
    }
    return cleaned;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" />
            Fuel Per Trip Analysis
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="space-y-4 py-4">
          {/* Vehicle Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Truck className="w-4 h-4" />
              Select Vehicle
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search and select vehicle..."
                className="pl-9"
                value={vehicleSearch}
                onChange={(e) => {
                  setVehicleSearch(e.target.value);
                  setShowVehicleDropdown(true);
                }}
                onFocus={() => setShowVehicleDropdown(true)}
              />
              {showVehicleDropdown && filteredVehicles.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredVehicles.map((vehicle) => (
                    <button
                      key={vehicle}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors",
                        selectedVehicle === vehicle && "bg-primary/10 text-primary"
                      )}
                      onClick={() => handleVehicleSelect(vehicle)}
                    >
                      {vehicle}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date/Time Range - Separate inputs matching TripSummaryView pattern */}
          <div className="grid grid-cols-2 gap-4">
            {/* From Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                From Date
              </Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => handleFromDateChange(e.target.value)}
                max={toDate}
              />
            </div>
            {/* To Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                To Date
              </Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => handleToDateChange(e.target.value)}
                min={fromDate}
              />
            </div>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            {/* From Time */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                From Time
              </Label>
              <Input
                type="time"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
              />
            </div>
            {/* To Time */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                To Time
              </Label>
              <Input
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
              />
            </div>
          </div>

          {/* Clear button */}
          {(selectedVehicle || fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Results */}
        {isLoadingTrips && hasWialonData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading trip data...</span>
          </div>
        ) : aggregatedData ? (
          <div className="space-y-6 pt-4 border-t">
            {/* Time and Location banner */}
            <div className="space-y-2 text-sm bg-muted/50 rounded-lg px-4 py-3">
              {/* Time range */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{aggregatedData.startTime}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{aggregatedData.endTime}</span>
                </div>
                <div className="text-muted-foreground">
                  Duration: <span className="font-medium text-foreground">{aggregatedData.duration}</span>
                </div>
              </div>
              {/* Location range */}
              <div className="flex items-center gap-2 text-muted-foreground overflow-hidden">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate max-w-[140px]" title={aggregatedData.startLocation}>
                  {truncateLocation(aggregatedData.startLocation)}
                </span>
                <span className="flex-shrink-0">→</span>
                <span className="truncate max-w-[140px]" title={aggregatedData.endLocation}>
                  {truncateLocation(aggregatedData.endLocation)}
                </span>
              </div>
            </div>

            {/* KPI Cards - Removed cost card as requested */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Mileage */}
              <div className="bg-blue-500/10 rounded-lg p-4 text-center">
                <Route className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold">{aggregatedData.totalMileage.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Kilometers</div>
              </div>

              {/* Fuel Used */}
              <div className="bg-orange-500/10 rounded-lg p-4 text-center">
                <Droplets className="w-6 h-6 mx-auto mb-2 text-orange-500" />
                <div className="text-2xl font-bold">{aggregatedData.totalFuelUsed.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Liters Used</div>
              </div>

              {/* Liters Refilled (from fuel transactions) */}
              <div className="bg-green-500/10 rounded-lg p-4 text-center">
                <Fuel className="w-6 h-6 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold">{aggregatedData.totalFilledStation.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Liters Refilled</div>
              </div>

              {/* Consumption (L/100km) */}
              <div className="bg-amber-500/10 rounded-lg p-4 text-center">
                <Gauge className="w-6 h-6 mx-auto mb-2 text-amber-500" />
                <div className="text-2xl font-bold">{aggregatedData.avgConsumption.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">L/100km</div>
              </div>
            </div>

            {/* Trip Summary - Full Width */}
            <div className="text-sm">
              <div className="space-y-2">
                <h4 className="font-medium text-muted-foreground">Trip Summary</h4>
                <div className="grid grid-cols-3 gap-4 divide-x">
                  <div className="flex justify-between pr-4">
                    <span>Trips</span>
                    <span className="font-medium">{aggregatedData.tripCount}</span>
                  </div>
                  <div className="flex justify-between px-4">
                    <span>Avg Speed</span>
                    <span className="font-medium">{aggregatedData.avgSpeed.toFixed(1)} km/h</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span>Max Speed</span>
                    <span className="font-medium">{aggregatedData.maxSpeed.toFixed(1)} km/h</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            {!selectedVehicle ? (
              <div className="space-y-2">
                <Truck className="w-10 h-10 mx-auto opacity-30" />
                <p>Select a vehicle to start</p>
              </div>
            ) : !fromDateTime || !toDateTime ? (
              <div className="space-y-2">
                <Calendar className="w-10 h-10 mx-auto opacity-30" />
                <p>Select date/time range</p>
              </div>
            ) : (
              <div className="space-y-2">
                <TrendingDown className="w-10 h-10 mx-auto opacity-30" />
                <p>No trips found for the selected filters</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

