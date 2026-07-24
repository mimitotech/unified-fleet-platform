export type FuelSection = 'consumption' | 'filling' | 'theft' | 'dispensed';
export type FuelTank = 'main' | 'reserve' | 'unknown';

export type FuelTransaction = {
  id: string;
  unitId: number;
  unitName: string;
  section: FuelSection;
  tank: FuelTank;
  timestamp: number;
  time: string;
  location: string;
  initialLevel: number;
  finalLevel: number;
  filled: number;
  sensor: string;
  fuelUsed: number;
  mileage: number;
  duration: string;
  durationSeconds: number;
  avgConsumption: number;
  suddenFuelDrop: number;
  count: number;
  latitude?: number;
  longitude?: number;
  mainTankLevel?: number;
  reserveTankLevel?: number;
  /** Exact Wialon report interval (group period totals). Unix seconds. */
  periodFromTs?: number;
  periodToTs?: number;
  /** Station-sheet enrich (read path) — not from Wialon FLS tables. */
  filledStation?: number;
  totalCost?: number;
  cardNumber?: string;
  fuelType?: string;
};

export type FuelReportTemplate = {
  resourceId: number;
  templateId: number;
  templateName: string;
  isGroupReport: boolean;
};

export type WialonCell = string | { v?: number | string; t?: string; y?: number; x?: number };

export type ReportTableMeta = {
  name: string;
  label: string;
  rows: number;
  header: string[];
  /** Wialon report/value_types codes per column (e.g. 50=liters, 54=fuel level). */
  headerTypes?: (string | number)[];
};

export type DetectedTable = {
  tableIndex: number;
  section: FuelSection;
  tank: FuelTank;
  tableName: string;
  tableLabel: string;
  rowCount: number;
  headers: string[];
  columnMap: Record<string, number>;
  isCombinedTable: boolean;
  tankColumnMaps: TankColumnMap[];
  /** Wialon unit_stats — one summary row per unit, no trip timestamps */
  isAggregateStats?: boolean;
  /** Wialon unit_group_generic — per-unit period summary (Beginning/End, not trip Time) */
  isGroupUnitSummary?: boolean;
};

export type TankColumnMap = {
  tank: FuelTank;
  fuelUsed: number;
  avgConsumption: number;
  initialLevel: number;
  finalLevel: number;
};

export type WialonReportRow = {
  n?: number;
  c: WialonCell[];
  d?: number;
};
