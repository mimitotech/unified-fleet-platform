import type { DetectedTable, FuelSection, FuelTank, ReportTableMeta, TankColumnMap } from './types.js';

/** Wialon system table names → fuel section (report/get_report_tables `name` field). */
const WIALON_AGGREGATE_TABLES = new Set(['unit_stats']);

const WIALON_TABLE_SECTION: Record<string, FuelSection> = {
  unit_trips: 'consumption',
  unit_stats: 'consumption',
  unit_fuel: 'consumption',
  unit_fuel_consumption: 'consumption',
  unit_fillings: 'filling',
  unit_thefts: 'theft',
};

const FUEL_TABLE_SCHEMAS: Record<
  FuelSection,
  { requiredGroups: string[][]; columnPatterns: Record<string, string[]>; columnExclusions?: Record<string, string[]> }
> = {
  consumption: {
    requiredGroups: [
      ['fuel used', 'mileage', 'duration'],
      ['fuel consumed', 'mileage', 'duration'],
      ['consumed', 'distance', 'time'],
      ['fuel used'],
      ['fuel consumed'],
      ['consumed'],
      ['initial fuel', 'final fuel'],
      ['initial level', 'final level'],
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'start', 'date'],
      endTime: ['end time', 'finish', 'end'],
      location: ['location', 'address', 'position', 'place', 'departure from', 'where'],
      fuelUsed: [
        'fuel used',
        'fuel consumed',
        'consumed fuel',
        'total fuel',
        'total consumed',
        'consumption',
        'spent fuel',
        'used fuel',
        'consumed',
        'fuel consumption',
        'fuel spent',
        'used during',
        'fuel usage',
      ],
      mileage: ['mileage', 'distance', 'km', 'miles', 'odometer'],
      duration: ['duration', 'time spent', 'interval', 'engine hours'],
      avgConsumption: ['avg', 'average', 'consumption rate', 'l/100', 'mpg', 'km/l'],
      initialLevel: [
        'initial fuel',
        'initial fuel level',
        'initial level',
        'start level',
        'begin level',
        'level before',
        'before',
        'start fuel',
        'fuel at beginning',
        'fuel level at the beginning',
        'level at start',
        'fuel at start',
      ],
      finalLevel: [
        'final fuel',
        'final fuel level',
        'final level',
        'end level',
        'finish level',
        'level after',
        'after',
        'end fuel',
        'fuel at end',
        'fuel level at the end',
        'level at end',
        'fuel at finish',
      ],
      sensor: ['sensor', 'source', 'name'],
    },
    columnExclusions: {
      initialLevel: ['initial location', 'departure from', 'start address', 'begin location'],
      finalLevel: ['final location', 'arrival', 'end address', 'finish location'],
      fuelUsed: ['initial fuel', 'final fuel', 'fuel level', 'level before', 'level after'],
    },
  },
  filling: {
    requiredGroups: [
      ['filled', 'initial', 'final'],
      ['filled', 'initial fuel level', 'final fuel level'],
      ['refuel', 'before', 'after'],
      ['volume', 'start level', 'end level'],
      ['filled'],
      ['volume'],
      ['initial', 'final'],
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'start', 'date'],
      location: ['location', 'address', 'position', 'place', 'where'],
      filled: ['filled', 'volume', 'refuel', 'liters', 'litres', 'quantity', 'amount', 'filling'],
      initialLevel: ['initial fuel', 'initial level', 'start level', 'begin level', 'before', 'level before'],
      finalLevel: ['final fuel', 'final level', 'end level', 'finish level', 'after', 'level after'],
      sensor: ['sensor', 'source', 'name'],
      deviation: ['deviation', 'difference', 'diff'],
    },
    columnExclusions: {
      initialLevel: ['initial location', 'departure'],
      finalLevel: ['final location', 'arrival'],
    },
  },
  theft: {
    requiredGroups: [
      ['sudden fuel drop', 'count'],
      ['sudden drop', 'count'],
      ['fuel drop', 'quantity'],
      ['drain', 'count'],
      ['theft'],
      ['initial', 'final'],
      ['sudden fuel drop'],
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'start', 'date'],
      location: ['location', 'address', 'position', 'place', 'where'],
      suddenFuelDrop: [
        'sudden fuel drop',
        'sudden drop',
        'fuel drop',
        'drain',
        'theft',
        'stolen',
        'lost',
        'volume',
      ],
      count: ['count', 'quantity', 'times', 'events'],
      initialLevel: ['initial fuel', 'initial level', 'start level', 'before', 'level before'],
      finalLevel: ['final fuel', 'final level', 'end level', 'after', 'level after'],
      sensor: ['sensor', 'source', 'name'],
    },
    columnExclusions: {
      initialLevel: ['initial location'],
      finalLevel: ['final location'],
    },
  },
};

/** Wialon value_types: 50=volume (L), 54=fuel level (L). */
const HEADER_TYPE_VOLUME = 50;
const HEADER_TYPE_FUEL_LEVEL = 54;

const TANK_HEADER_PATTERNS: { tank: FuelTank; patterns: string[] }[] = [
  { tank: 'main', patterns: ['(main fuel level)', '(main tank)', '(main)'] },
  { tank: 'reserve', patterns: ['(reserve fuel level)', '(reserve tank)', '(reserve)', '(aux)', '(auxiliary)'] },
];

function headerMatchesPattern(header: string, patterns: string[]): boolean {
  const h = header.toLowerCase().trim();
  return patterns.some((p) => h.includes(p.toLowerCase()));
}

function headersMatchGroup(headers: string[], requiredGroup: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  return requiredGroup.every((requiredPattern) => {
    const pattern = requiredPattern.toLowerCase();
    return normalizedHeaders.some((header) => header.includes(pattern));
  });
}

function findBestColumnIndex(
  headers: string[],
  patterns: string[],
  exclude: string[] = [],
  headerTypes?: (string | number)[]
): number {
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (exclude.some((e) => h.includes(e.toLowerCase()))) continue;

    for (const p of patterns) {
      const pl = p.toLowerCase();
      if (!h.includes(pl)) continue;
      let score = pl.length;
      if (headerTypes?.[i] != null) {
        const t = Number(headerTypes[i]);
        if (t === HEADER_TYPE_VOLUME || t === HEADER_TYPE_FUEL_LEVEL) score += 20;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

function detectTableSection(table: ReportTableMeta): FuelSection | null {
  const sysName = (table.name || '').toLowerCase().trim();
  if (WIALON_TABLE_SECTION[sysName]) return WIALON_TABLE_SECTION[sysName];

  const headers = table.header;
  if (!headers?.length) return null;
  for (const [section, schema] of Object.entries(FUEL_TABLE_SCHEMAS)) {
    for (const requiredGroup of schema.requiredGroups) {
      if (headersMatchGroup(headers, requiredGroup)) return section as FuelSection;
    }
  }
  return null;
}

function buildColumnMap(headers: string[], section: FuelSection, headerTypes?: (string | number)[]): Record<string, number> {
  const schema = FUEL_TABLE_SCHEMAS[section];
  const columnMap: Record<string, number> = {};
  const exclusions = schema.columnExclusions ?? {};

  for (const [fieldName, patterns] of Object.entries(schema.columnPatterns)) {
    const exclude = exclusions[fieldName] ?? [];
    const index = findBestColumnIndex(headers, patterns, exclude, headerTypes);
    columnMap[fieldName] = index;
  }

  if (section === 'consumption' && columnMap.fuelUsed < 0 && headerTypes?.length) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (h.includes('initial') || h.includes('final') || h.includes('level before') || h.includes('level after')) {
        continue;
      }
      const t = Number(headerTypes[i]);
      if (t === HEADER_TYPE_VOLUME || t === HEADER_TYPE_FUEL_LEVEL) {
        if (h.includes('fuel') || h.includes('consum') || h.includes('used') || h.includes('spent')) {
          columnMap.fuelUsed = i;
          break;
        }
      }
    }
  }

  return columnMap;
}

function detectTankType(tableName: string, tableLabel: string): FuelTank {
  const combined = `${tableName} ${tableLabel}`.toLowerCase();
  if (/reserve|secondary|tank 2|tank2|aux|auxiliary|backup/.test(combined)) return 'reserve';
  if (/main|primary|tank 1|tank1/.test(combined)) return 'main';
  return 'main';
}

function isCombinedMultiTankTable(headers: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.toLowerCase());
  let hasMain = false;
  let hasReserve = false;
  for (const header of normalizedHeaders) {
    if (TANK_HEADER_PATTERNS[0].patterns.some((p) => header.includes(p))) hasMain = true;
    if (TANK_HEADER_PATTERNS[1].patterns.some((p) => header.includes(p))) hasReserve = true;
  }
  return hasMain && hasReserve;
}

function buildTankColumnMaps(headers: string[], _section: FuelSection): TankColumnMap[] {
  const tankMaps: TankColumnMap[] = [];
  const normalizedHeaders = headers.map((h) => h.toLowerCase());
  for (const { tank, patterns } of TANK_HEADER_PATTERNS) {
    const tankMap: TankColumnMap = { tank, fuelUsed: -1, avgConsumption: -1, initialLevel: -1, finalLevel: -1 };
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (!patterns.some((p) => header.includes(p))) continue;
      if (header.includes('fuel used') || header.includes('consumed')) tankMap.fuelUsed = i;
      else if (header.includes('avg') || header.includes('km/l')) tankMap.avgConsumption = i;
      else if (header.includes('initial') || header.includes('start level') || header.includes('before'))
        tankMap.initialLevel = i;
      else if (header.includes('final') || header.includes('end level') || header.includes('after'))
        tankMap.finalLevel = i;
    }
    if (tankMap.fuelUsed !== -1 || tankMap.initialLevel !== -1 || tankMap.finalLevel !== -1) tankMaps.push(tankMap);
  }
  return tankMaps;
}

export function detectFuelTables(tables: ReportTableMeta[]): DetectedTable[] {
  const detectedTables: DetectedTable[] = [];
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    const table = tables[tableIndex];
    const section = detectTableSection(table);
    if (!section) continue;
    const columnMap = buildColumnMap(table.header, section, table.headerTypes);
    const isCombined = isCombinedMultiTankTable(table.header);
    const tankColumnMaps = isCombined ? buildTankColumnMaps(table.header, section) : [];
    const tank = detectTankType(table.name, table.label);
    const sysName = (table.name || '').toLowerCase().trim();
    detectedTables.push({
      tableIndex,
      section,
      tank,
      tableName: table.name,
      tableLabel: table.label,
      rowCount: table.rows,
      headers: table.header,
      columnMap,
      isCombinedTable: isCombined,
      tankColumnMaps,
      isAggregateStats: WIALON_AGGREGATE_TABLES.has(sysName),
    });
  }
  return detectedTables;
}
