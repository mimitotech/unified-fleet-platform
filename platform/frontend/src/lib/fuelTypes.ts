/** Shared Fuel module types — mirrors backend Wialon fuel API. */

export type FuelSensorSlotValue = {
  sensorId: number;
  name: string;
  value: number;
  unit: string;
  param: string;
};

export type FuelSensorSlots = {
  fuelLevel: FuelSensorSlotValue | null;
  flsBattery: FuelSensorSlotValue | null;
  flsTemperature: FuelSensorSlotValue | null;
  other: FuelSensorSlotValue[];
};

export type FuelAssetFlags = {
  hasFuelLevelSensor: boolean;
  missingFuelLevel: boolean;
  hasStaleReading: boolean;
  isFilling: boolean;
};

export type FuelFleetSummary = {
  totalAssets: number;
  vehicles: number;
  generators: number;
  machinery: number;
  withFuelLevel: number;
  missingFuelLevel: number;
  staleReadings: number;
  lowTank: number;
  fillingNow: number;
};

export type FuelAssetCategory = 'vehicle' | 'generator' | 'machinery';

export type WialonAssetSensorReading = {
  sensorId: number;
  name: string;
  type: string;
  param: string;
  rawValue: number;
  value: number;
  unit: string;
  isFuelLevel: boolean;
};

export type WialonFuelAssetRow = {
  unitId: number;
  name: string;
  plate: string;
  assetType: FuelAssetCategory;
  status: string;
  fuelLiters: number | null;
  mainTankLiters?: number | null;
  reserveTankLiters?: number | null;
  tankCount?: number;
  fuelSensors: WialonAssetSensorReading[];
  sensors: WialonAssetSensorReading[];
  sensorSlots: FuelSensorSlots;
  flags: FuelAssetFlags;
  sensorSummary: string;
  fillingLiters: number | null;
  fuelPercent: number | null;
  engineHours: number | null;
  updatedAt: string | null;
};

export type WialonFuelAssetsResponse = {
  assets: WialonFuelAssetRow[];
  summary: FuelFleetSummary;
  fetchedAt: string;
  cachedAt?: string;
  fromCache?: boolean;
};

export type WialonFuelReportKpis = {
  totalFilled: number;
  totalConsumed: number;
  totalMileage: number;
  avgConsumption: number;
  theftEvents: number;
  vehiclesTracked: number;
  consumptionCount: number;
  fillingCount: number;
  theftCount: number;
};

export type WialonFuelTrendPoint = {
  month: string;
  filled: number;
  consumed: number;
};

export type WialonFuelTransaction = {
  id: string;
  unitId: number;
  unitName: string;
  section: 'consumption' | 'filling' | 'theft' | 'dispensed';
  tank: 'main' | 'reserve' | 'unknown';
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
  periodFromTs?: number;
  periodToTs?: number;
};

export type WialonFuelReportData = {
  transactions: WialonFuelTransaction[];
  kpis: WialonFuelReportKpis;
  trend: WialonFuelTrendPoint[];
  source?: string;
  needsRefresh?: boolean;
  warming?: boolean;
  fetchedAt?: string;
};

export type FuelPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export type FuelAnalyticsTimePoint = {
  key: string;
  label: string;
  filled: number;
  consumed: number;
  theft: number;
  mileage: number;
  cost: number;
  fillEvents: number;
  consumptionEvents: number;
  theftEvents: number;
};

export type FuelAnalyticsAssetRow = {
  unitId: number;
  unitName: string;
  filled: number;
  consumed: number;
  theft: number;
  mileage: number;
  cost: number;
  avgConsumption: number;
  fillEvents: number;
  theftEvents: number;
  sharePercent: number;
  remainingFuel: number | null;
  openingFuel: number | null;
};

/** Fuel ledger: Opening + Filled − Used − Lost = Remaining */
export type FuelLedgerSummary = {
  openingFuel: number;
  totalFilled: number;
  totalConsumed: number;
  totalLost: number;
  computedRemaining: number;
  liveRemaining: number | null;
  variance: number;
  balanced: boolean;
  confidence: 'high' | 'medium' | 'low';
};

export type FuelLedgerEntry = {
  id: string;
  unitId: number;
  unitName: string;
  timestamp: number;
  date: string;
  eventType: 'opening' | 'refill' | 'consumption' | 'theft' | 'balance';
  label: string;
  amountIn: number;
  amountOut: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  source: 'report' | 'trip' | 'balance' | 'sensor';
  mileage: number;
  location: string;
  referenceId: string;
};

export type FuelDailySummary = {
  unitId: number;
  unitName: string;
  date: string;
  openingFuel: number;
  filled: number;
  consumed: number;
  lost: number;
  closingFuel: number;
  mileage: number;
  tripCount: number;
  refillCount: number;
  theftCount: number;
};

export type FuelAnomaly = {
  id: string;
  unitId: number;
  unitName: string;
  type: 'theft' | 'sudden_drop' | 'high_consumption' | 'unusual_fill';
  severity: 'high' | 'medium' | 'low';
  message: string;
  timestamp: number;
  liters: number;
  initialLevel?: number;
  finalLevel?: number;
  deltaLiters?: number;
  location?: string;
};

export type FuelPrediction = {
  period: string;
  label: string;
  consumed: number;
  filled: number;
  confidence: 'low' | 'medium';
};

export type FuelAnalyticsComparison = {
  previousFrom: string;
  previousTo: string;
  previousMonth: string | null;
  kpis: {
    totalFilled: number;
    totalConsumed: number;
    totalTheft: number;
    totalCost: number;
    totalMileage: number;
    avgConsumption: number;
  };
  deltas: {
    consumedPct: number | null;
    filledPct: number | null;
    costPct: number | null;
    theftPct: number | null;
  };
};

export type FuelAnalyticsResult = {
  unitId: number | null;
  unitName: string | null;
  period: FuelPeriod;
  granularity: string;
  from: string;
  to: string;
  month: string | null;
  fuelPricePerLiter: number;
  kpis: {
    totalFilled: number;
    totalConsumed: number;
    totalTheft: number;
    totalCost: number;
    totalFillCost?: number;
    totalUsageCost?: number;
    totalLossCost?: number;
    totalMileage: number;
    avgConsumption: number;
    theftEvents: number;
    fillEvents: number;
    consumptionEvents: number;
    unitsTracked: number;
  };
  timeSeries: FuelAnalyticsTimePoint[];
  byAsset: FuelAnalyticsAssetRow[];
  sectionBreakdown: Array<{ name: string; liters: number; cost: number; count: number }>;
  anomalies: FuelAnomaly[];
  predictions: FuelPrediction[];
  comparison: FuelAnalyticsComparison | null;
  ledger: FuelLedgerSummary;
  dailySummaries: FuelDailySummary[];
  ledgerPreview: FuelLedgerEntry[];
  transactionCount: number;
  fetchedAt: string;
  source: string;
  isWarming: boolean;
  warmedMonths: string[];
};
