export const FUEL_TABLE_COLUMN_DEFS = [
  { key: 'filledMain', label: 'Filled(Main)', description: 'Liters refilled into the main tank (Wialon fillings)' },
  { key: 'filledReserve', label: 'Filled(Reserve)', description: 'Liters refilled into the reserve tank' },
  { key: 'filledStation', label: 'Filled(Station)', description: 'Liters from fuel-station / card records' },
  { key: 'variance', label: 'Variance', description: 'FLS filled minus station filled' },
  { key: 'usedMain', label: 'Used(Main)', description: 'Main-tank consumption for the period' },
  { key: 'usedReserve', label: 'Used(Reserve)', description: 'Reserve-tank consumption for the period' },
  { key: 'levelMain', label: 'Level(Main)', description: 'Latest main-tank level from reports' },
  { key: 'levelReserve', label: 'Level(Reserve)', description: 'Latest reserve-tank level from reports' },
  { key: 'totalLevel', label: 'Total Level', description: 'Live sensor level or sum of tank levels' },
  { key: 'dropMain', label: 'Drop(Main)', description: 'Sudden fuel drop / drain on main tank' },
  { key: 'dropReserve', label: 'Drop(Reserve)', description: 'Sudden fuel drop / drain on reserve tank' },
  { key: 'totalDrop', label: 'Total Drop', description: 'Sum of main and reserve drops' },
  { key: 'totalUsed', label: 'Total Used', description: 'Sum of main and reserve consumption' },
  { key: 'fuelType', label: 'Type', description: 'Fuel product type when recorded' },
  { key: 'cost', label: 'Cost', description: 'Transaction cost when available' },
  { key: 'cardNo', label: 'Card No', description: 'Fuel card number when available' },
] as const;

export type FuelTableColumnKey = (typeof FUEL_TABLE_COLUMN_DEFS)[number]['key'];

/** Fallback when tenant config has not loaded yet — matches backend default (all columns). */
export const DEFAULT_FUEL_VISIBLE_COLUMNS: FuelTableColumnKey[] = FUEL_TABLE_COLUMN_DEFS.map((c) => c.key);
