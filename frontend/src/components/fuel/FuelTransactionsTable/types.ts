import type { FuelTransaction } from '@/types/entities';
import type { Vehicle } from '@/types';

/** Minimal unit row for fuel usage table grouping */
export interface FuelTableUnit {
  id: string;
  name: string;
  driver?: string;
}

/** Group of transactions for a single vehicle */
export interface VehicleGroup {
  unitName: string;
  driverName?: string;
  transactions: FuelTransaction[];
  filledMain: number;
  filledReserve: number;
  filledStation: number;
  variance: number;
  usedMain: number;
  usedReserve: number;
  levelMain: number;
  levelReserve: number;
  dropMain: number;
  dropReserve: number;
  totalCost: number;
  alertCount: number;
  liveLevel?: number;
  fuelType?: string;
  cardNumber?: string;
}

export interface FuelTransactionsTableProps {
  transactions: FuelTransaction[];
  vehicleFuelLevels: Map<string, number>;
  /** @deprecated Prefer `units` — kept for vehicles tab */
  vehicles?: Vehicle[];
  units?: FuelTableUnit[];
  unitLabel?: string;
  unitLabelPlural?: string;
  showFuelPerTrip?: boolean;
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isBackgroundRefreshing?: boolean;
  fromDate: string;
  toDate: string;
  todayStr: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  /** Visible metric columns configured per tenant */
  visibleColumns?: string[];
}

export interface TransactionDisplayValues {
  filledMain: number;
  filledReserve: number;
  filledStation: number;
  variance: number;
  usedMain: number;
  usedReserve: number;
  levelMain: number;
  levelReserve: number;
  dropMain: number;
  dropReserve: number;
  totalLevel: number;
  totalDrop: number;
  totalUsed: number;
  totalFilledFls: number;
  fuelType: string;
  totalCost: number;
  cardNumber: string;
}

export interface FuelTableFilters {
  searchTerm: string;
  fromDate: string;
  toDate: string;
}

export interface PaginationState {
  currentPage: number;
  perPage: number;
  totalPages: number;
  totalVehicles: number;
}
