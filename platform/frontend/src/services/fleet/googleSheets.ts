/** Re-export for MAMSv2 fuel components that import from this path. */
export {
  fetchFuelTransactions,
  getFuelCostAnalysis,
  type SheetFuelTransaction,
  type FuelCostAnalysis,
  type VehicleFuelSummary,
} from '@/services/googleSheetsService';
