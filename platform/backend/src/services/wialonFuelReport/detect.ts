import type { DetectedTable, FuelSection, FuelTank, ReportTableMeta, TankColumnMap } from './types.js';

/** Wialon system table names → fuel section (report/get_report_tables `name` field). */
const WIALON_AGGREGATE_TABLES = new Set(['unit_stats']);
const WIALON_GROUP_UNIT_SUMMARY = new Set(['unit_group_generic', 'unit_group_stats']);

const WIALON_TABLE_SECTION: Record<string, FuelSection> = {
  unit_trips: 'consumption',
  unit_stats: 'consumption',
  unit_fuel: 'consumption',
  unit_fuel_consumption: 'consumption',
  unit_engine_hours: 'consumption',
  unit_group_engine_hours: 'consumption',
  unit_group_generic: 'consumption',
  unit_group_stats: 'consumption',
  unit_fillings: 'filling',
  unit_group_fillings: 'filling',
  unit_thefts: 'theft',
  unit_group_thefts: 'theft',
};

/** Group tables whose top-level rows are per-unit period totals (children = events). */
const WIALON_GROUP_PERIOD_SUMMARY = new Set([
  'unit_group_generic',
  'unit_group_stats',
  'unit_group_engine_hours',
  'unit_group_fillings',
  'unit_group_thefts',
]);

const FUEL_TABLE_SCHEMAS: Record<
  FuelSection,
  { requiredGroups: string[][]; columnPatterns: Record<string, string[]>; columnExclusions?: Record<string, string[]> }
> = {
  consumption: {
    requiredGroups: [
      ['fuel used', 'mileage', 'duration'],
      ['fuel consumed', 'mileage', 'duration'],
      ['consumed', 'distance', 'time'],
      ['engine hours', 'consumed'],
      ['consumed', 'avg litres'],
      ['consumed', 'avg liters'],
      ['fuel used'],
      ['fuel consumed'],
      ['consumed'],
      // Do NOT match on initial/final fuel alone — that steals Fillings tables.
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'beginning', 'start', 'date'],
      endTime: ['end time', 'finish', 'end'],
      location: ['location', 'address', 'position', 'place', 'departure from', 'where'],
      fuelUsed: [
        'fuel used',
        'fuel consumed',
        'consumed fuel',
        'total consumed',
        'spent fuel',
        'used fuel',
        'fuel consumption',
        'fuel spent',
        'used during',
        'fuel usage',
        'consumed by',
        'consumed',
      ],
      mileage: ['mileage', 'distance', 'odometer'],
      duration: ['duration', 'time spent', 'interval', 'engine hours'],
      avgConsumption: [
        'avg litres/hr',
        'avg liters/hr',
        'avg consumption',
        'average consumption',
        'consumption rate',
        'l/100',
        'l/h',
        'mpg',
        'km/l',
        'avg',
      ],
      initialLevel: [
        'initial fuel level',
        'fuel level at the beginning',
        'initial fuel',
        'initial level',
        'start level',
        'begin level',
        'level before',
        'start fuel',
        'fuel at beginning',
        'level at start',
        'fuel at start',
      ],
      finalLevel: [
        'final fuel level',
        'fuel level at the end',
        'final fuel',
        'final level',
        'end level',
        'finish level',
        'level after',
        'end fuel',
        'fuel at end',
        'level at end',
        'fuel at finish',
      ],
      sensor: ['sensor name', 'fuel sensor', 'sensor', 'fls'],
    },
    columnExclusions: {
      initialLevel: ['initial location', 'departure from', 'start address', 'begin location', 'before filling'],
      finalLevel: ['final location', 'arrival', 'end address', 'finish location', 'after filling'],
      fuelUsed: [
        'initial fuel',
        'final fuel',
        'fuel level',
        'level before',
        'level after',
        'avg',
        'average',
        'filled',
        'filling',
        'theft',
        'drain',
        'drop',
        'dispensed',
      ],
      avgConsumption: ['fuel consumed', 'fuel used', 'total consumed'],
      sensor: ['unit name', 'object name', 'group name', 'driver name', 'grouping'],
      unit: ['sensor', 'driver'],
      mileage: ['time', 'duration'],
    },
  },
  dispensed: {
    requiredGroups: [
      ['dispensed'],
      ['dispensed', 'initial fuel level', 'final fuel level'],
      ['fuel dispensed'],
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'beginning', 'start', 'date'],
      endTime: ['end time', 'finish', 'end'],
      location: [
        'final location',
        'initial location',
        'location',
        'address',
        'position',
        'place',
        'where',
      ],
      suddenFuelDrop: [
        'dispensed',
        'fuel dispensed',
        'dispensed volume',
        'dispensed amount',
        'dispensing',
      ],
      count: ['count', 'times', 'events'],
      initialLevel: [
        'initial fuel level',
        'initial fuel',
        'initial level',
        'start level',
        'level before',
      ],
      finalLevel: [
        'final fuel level',
        'final fuel',
        'final level',
        'end level',
        'level after',
      ],
      sensor: ['sensor name', 'fuel sensor', 'sensor', 'fls'],
    },
    columnExclusions: {
      initialLevel: ['initial location'],
      finalLevel: ['final location'],
      suddenFuelDrop: ['count', 'filled', 'filling', 'consumed', 'used', 'level', 'initial', 'final'],
      count: ['quantity of fuel', 'fuel quantity', 'volume'],
      sensor: ['unit name', 'object name', 'group name', 'driver name', 'grouping'],
      unit: ['sensor', 'driver'],
    },
  },
  filling: {
    requiredGroups: [
      ['filled', 'initial', 'final'],
      ['filled', 'initial fuel level', 'final fuel level'],
      ['refuel', 'before', 'after'],
      ['filled amount'],
      ['fuel filled'],
      ['filled'],
      ['volume', 'start level', 'end level'],
      ['volume', 'initial', 'final'],
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'start', 'date'],
      location: [
        'final location',
        'initial location',
        'location',
        'address',
        'position',
        'place',
        'where',
      ],
      filled: [
        'filled amount',
        'fuel filled',
        'filling volume',
        'filled volume',
        'refuel volume',
        'filled',
        'refuel',
        'filling',
        // last-resort patterns — scoring + exclusions avoid stealing level columns
        'volume',
        'amount',
      ],
      initialLevel: [
        'initial fuel level',
        'initial fuel',
        'initial level',
        'start level',
        'begin level',
        'level before',
      ],
      finalLevel: [
        'final fuel level',
        'final fuel',
        'final level',
        'end level',
        'finish level',
        'level after',
      ],
      sensor: ['sensor name', 'fuel sensor', 'sensor', 'fls'],
      deviation: ['deviation', 'difference', 'diff'],
      count: ['filling count', 'fillings count', 'fill count', 'charge count', 'count'],
    },
    columnExclusions: {
      initialLevel: ['initial location', 'departure'],
      finalLevel: ['final location', 'arrival'],
      filled: [
        'count',
        'fillings count',
        'filling count',
        'drains count',
        'drained',
        'consumed',
        'used',
        'theft',
        'drop',
        'initial',
        'final',
        'level',
        'dispensed',
      ],
      count: ['filled', 'volume', 'amount', 'quantity of fuel'],
      sensor: ['unit name', 'object name', 'group name', 'driver name', 'grouping'],
      unit: ['sensor', 'driver'],
    },
  },
  theft: {
    requiredGroups: [
      ['sudden fuel drop', 'count'],
      ['sudden drop', 'count'],
      ['fuel drop', 'quantity'],
      ['drain', 'count'],
      ['theft'],
      ['sudden fuel drop'],
      ['drained'],
    ],
    columnPatterns: {
      unit: ['unit', 'vehicle', 'object', 'asset', 'grouping'],
      time: ['time', 'begin', 'start', 'date'],
      location: [
        'final location',
        'initial location',
        'location',
        'address',
        'position',
        'place',
        'where',
        'departure from',
      ],
      suddenFuelDrop: [
        'sudden fuel drop',
        'sudden drop',
        'fuel theft',
        'fuel drain',
        'drained',
        'stolen',
        'theft volume',
        'fuel drop',
        'drain volume',
        'theft',
        'drain',
        'drop',
      ],
      count: ['count', 'times', 'events'],
      initialLevel: [
        'initial fuel level',
        'initial fuel',
        'initial level',
        'start level',
        'level before',
      ],
      finalLevel: ['final fuel level', 'final fuel', 'final level', 'end level', 'level after'],
      sensor: ['sensor name', 'fuel sensor', 'sensor', 'fls'],
    },
    columnExclusions: {
      initialLevel: ['initial location'],
      finalLevel: ['final location'],
      suddenFuelDrop: ['count', 'filled', 'filling', 'consumed', 'used', 'level', 'initial', 'final'],
      count: ['quantity of fuel', 'fuel quantity', 'volume'],
      sensor: ['unit name', 'object name', 'group name', 'driver name', 'grouping'],
      unit: ['sensor', 'driver'],
    },
  },
};

/** Wialon value_types: 50=volume (L), 54=fuel level (L). */
const HEADER_TYPE_VOLUME = 50;
const HEADER_TYPE_FUEL_LEVEL = 54;

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
  headerTypes?: (string | number)[],
): number {
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (exclude.some((e) => h.includes(e.toLowerCase()))) continue;

    for (const p of patterns) {
      const pl = p.toLowerCase();
      if (!h.includes(pl)) continue;
      // Prefer longer / more specific patterns; exact header match wins.
      let score = pl.length * 10;
      if (h === pl) score += 100;
      else if (h.startsWith(pl) || h.endsWith(pl)) score += 25;
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
  const label = (table.label || '').toLowerCase().trim();

  // Bowser / Fuel Dispensed tables — never treat as theft (Wialon often uses unit_thefts).
  if (/dispens/.test(label) || /bowser\s*activ/.test(label) || /dispens/.test(sysName)) {
    return 'dispensed';
  }

  if (WIALON_TABLE_SECTION[sysName]) return WIALON_TABLE_SECTION[sysName];

  const headers = table.header;
  if (!headers?.length) return null;

  // Prefer filling / dispensed / theft before consumption so Initial+Final headers
  // on fillings tables are not stolen by the consumption schema.
  const order: FuelSection[] = ['filling', 'dispensed', 'theft', 'consumption'];
  for (const section of order) {
    const schema = FUEL_TABLE_SCHEMAS[section];
    if (!schema) continue;
    for (const requiredGroup of schema.requiredGroups) {
      if (headersMatchGroup(headers, requiredGroup)) return section;
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

  // Filling tables: prefer volume-typed columns when "filled" pattern missed a liters column.
  if (section === 'filling' && columnMap.filled < 0 && headerTypes?.length) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (h.includes('initial') || h.includes('final') || h.includes('level') || h.includes('count')) continue;
      const t = Number(headerTypes[i]);
      if (t === HEADER_TYPE_VOLUME && (h.includes('fill') || h.includes('refuel') || h.includes('volume') || h.includes('amount'))) {
        columnMap.filled = i;
        break;
      }
    }
  }

  if (
    (section === 'theft' || section === 'dispensed') &&
    columnMap.suddenFuelDrop < 0 &&
    headerTypes?.length
  ) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (h.includes('initial') || h.includes('final') || h.includes('level') || h.includes('count')) continue;
      const t = Number(headerTypes[i]);
      if (
        t === HEADER_TYPE_VOLUME &&
        (h.includes('drop') ||
          h.includes('drain') ||
          h.includes('theft') ||
          h.includes('stolen') ||
          h.includes('dispens'))
      ) {
        columnMap.suddenFuelDrop = i;
        break;
      }
    }
  }

  // Never let sensor latch onto the unit/name column.
  if (columnMap.sensor >= 0 && columnMap.unit >= 0 && columnMap.sensor === columnMap.unit) {
    columnMap.sensor = -1;
  }

  return columnMap;
}

const TANK_HEADER_PATTERNS: { tank: FuelTank; patterns: string[] }[] = [
  {
    tank: 'main',
    patterns: [
      '(main fuel level)',
      '(main tank)',
      '(main)',
      'main fuel',
      'main tank',
      'tank 1',
      'tank1',
      'primary tank',
      'primary fuel',
    ],
  },
  {
    tank: 'reserve',
    patterns: [
      '(reserve fuel level)',
      '(reserve tank)',
      '(reserve)',
      '(aux)',
      '(auxiliary)',
      'reserve fuel',
      'reserve tank',
      'tank 2',
      'tank2',
      'secondary tank',
      'secondary fuel',
      'aux tank',
      'auxiliary tank',
      'backup tank',
    ],
  },
];

function detectTankType(tableName: string, tableLabel: string): FuelTank {
  const combined = `${tableName} ${tableLabel}`.toLowerCase();
  if (/reserve|secondary|tank\s*2|tank2|aux(?:iliary)?|backup/.test(combined)) return 'reserve';
  if (/main|primary|tank\s*1|tank1/.test(combined)) return 'main';
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
      else if (
        tankMap.fuelUsed === -1 &&
        (header.includes('filled') ||
          header.includes('filling') ||
          header.includes('drop') ||
          header.includes('theft') ||
          header.includes('drain'))
      ) {
        tankMap.fuelUsed = i;
      }
    }
    if (tankMap.fuelUsed !== -1 || tankMap.initialLevel !== -1 || tankMap.finalLevel !== -1) tankMaps.push(tankMap);
  }
  return tankMaps;
}

function isPerUnitPeriodSummaryTable(headers: string[], section: FuelSection): boolean {
  if (section !== 'consumption' && section !== 'filling' && section !== 'theft' && section !== 'dispensed') {
    return false;
  }
  const norm = headers.map((h) => h.toLowerCase().trim());
  const hasUnit = norm.some(
    (h) =>
      /^(unit|object|grouping|vehicle|generator|genset)$/.test(h) ||
      h.includes('unit name') ||
      h.includes('object name') ||
      h === 'name',
  );
  const hasPeriod =
    (norm.some((h) => /beginning|begin|period start|^from$/.test(h)) &&
      norm.some((h) => /^end$|end time|period end|^to$|finish/.test(h))) ||
    norm.some((h) => /^time$|date/.test(h));
  const hasFuelMetric = norm.some((h) =>
    /fuel used|fuel consumed|consumed|filled amount|fuel filled|filled|drained|sudden fuel|drain|final fuel|initial fuel|fuel level/.test(
      h,
    ),
  );
  return hasUnit && hasPeriod && hasFuelMetric;
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
      isGroupUnitSummary:
        WIALON_GROUP_UNIT_SUMMARY.has(sysName) ||
        WIALON_GROUP_PERIOD_SUMMARY.has(sysName) ||
        isPerUnitPeriodSummaryTable(table.header, section),
    });
  }
  return detectedTables;
}
