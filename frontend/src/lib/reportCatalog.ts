import { LIVE_POLL } from '@/lib/liveRefresh';

export type ReportColumn = { key: string; label: string; align?: 'left' | 'right' };

export type LiveReportDef = {
  id: string;
  label: string;
  description: string;
  category: string;
  /** fleet = all assets table; unit = requires unit selection; both = works either way */
  scope: 'fleet' | 'unit' | 'both';
  needsPeriod: boolean;
  columns: ReportColumn[];
  pollMs: number;
};

export const LIVE_REPORT_CATEGORIES = [
  'Fleet — All Assets',
  'Single Asset',
  'Trips & Movement',
  'Fuel',
  'Safety & Events',
] as const;

export const LIVE_REPORTS: LiveReportDef[] = [
  {
    id: 'fleet-status',
    label: 'Live Fleet Status',
    description: 'Real-time Wialon status, speed, fuel (FLS), position and connectivity for every unit.',
    category: 'Fleet — All Assets',
    scope: 'fleet',
    needsPeriod: false,
    pollMs: LIVE_POLL.fleet,
    columns: [
      { key: 'unitName', label: 'Unit' },
      { key: 'plate', label: 'Plate' },
      { key: 'status', label: 'Status' },
      { key: 'motionState', label: 'Motion' },
      { key: 'speedKmh', label: 'Speed (km/h)', align: 'right' },
      { key: 'fuelLive', label: 'Fuel (Wialon)' },
      { key: 'fuelPercent', label: 'Fuel %', align: 'right' },
      { key: 'odometerKm', label: 'Odometer (km)', align: 'right' },
      { key: 'engineHours', label: 'Engine hrs', align: 'right' },
      { key: 'online', label: 'Online' },
      { key: 'lastUpdate', label: 'Last update' },
    ],
  },
  {
    id: 'fleet-positions',
    label: 'Live Positions',
    description: 'GPS coordinates and last message time for the full fleet.',
    category: 'Fleet — All Assets',
    scope: 'fleet',
    needsPeriod: false,
    pollMs: LIVE_POLL.fleet,
    columns: [
      { key: 'unitName', label: 'Unit' },
      { key: 'plate', label: 'Plate' },
      { key: 'status', label: 'Status' },
      { key: 'speedKmh', label: 'Speed', align: 'right' },
      { key: 'latitude', label: 'Latitude', align: 'right' },
      { key: 'longitude', label: 'Longitude', align: 'right' },
      { key: 'lastUpdate', label: 'Last update' },
    ],
  },
  {
    id: 'fleet-fuel',
    label: 'Live Fuel Levels',
    description: 'Accurate Wialon FLS tank readings — live value, filtered level, fill events and sensor source.',
    category: 'Fuel',
    scope: 'fleet',
    needsPeriod: false,
    pollMs: LIVE_POLL.fuel,
    columns: [
      { key: 'unitName', label: 'Unit' },
      { key: 'plate', label: 'Plate' },
      { key: 'status', label: 'Status' },
      { key: 'fuelLive', label: 'Live fuel' },
      { key: 'fuelFiltered', label: 'Filtered (L)' },
      { key: 'fuelPercent', label: 'Fuel %', align: 'right' },
      { key: 'fuelLiters', label: 'Liters', align: 'right' },
      { key: 'filledLiters', label: 'Last fill (L)', align: 'right' },
      { key: 'sensorName', label: 'Tank sensor' },
      { key: 'method', label: 'Source' },
    ],
  },
  {
    id: 'trip-history',
    label: 'Trip History',
    description: 'Wialon unit/get_trips — start, end, distance, speeds and fuel used per trip.',
    category: 'Trips & Movement',
    scope: 'both',
    needsPeriod: true,
    pollMs: LIVE_POLL.routes,
    columns: [
      { key: 'unitName', label: 'Unit' },
      { key: 'plate', label: 'Plate' },
      { key: 'startTime', label: 'Start' },
      { key: 'endTime', label: 'End' },
      { key: 'durationMin', label: 'Duration (min)', align: 'right' },
      { key: 'distanceKm', label: 'Distance (km)', align: 'right' },
      { key: 'maxSpeedKmh', label: 'Max speed', align: 'right' },
      { key: 'avgSpeedKmh', label: 'Avg speed', align: 'right' },
      { key: 'fuelUsedLiters', label: 'Fuel used (L)', align: 'right' },
      { key: 'driver', label: 'Driver' },
    ],
  },
  {
    id: 'unit-detail',
    label: 'Unit Live Snapshot',
    description: 'Single asset — same fleet status columns filtered to one unit.',
    category: 'Single Asset',
    scope: 'unit',
    needsPeriod: false,
    pollMs: LIVE_POLL.unitDetail,
    columns: [
      { key: 'unitName', label: 'Unit' },
      { key: 'plate', label: 'Plate' },
      { key: 'status', label: 'Status' },
      { key: 'speedKmh', label: 'Speed', align: 'right' },
      { key: 'fuelLive', label: 'Fuel (Wialon)' },
      { key: 'fuelPercent', label: 'Fuel %', align: 'right' },
      { key: 'odometerKm', label: 'Odometer', align: 'right' },
      { key: 'latitude', label: 'Latitude', align: 'right' },
      { key: 'longitude', label: 'Longitude', align: 'right' },
      { key: 'lastUpdate', label: 'Last update' },
    ],
  },
  {
    id: 'unit-sensors',
    label: 'Sensors & Parameters',
    description: 'Live Wialon sensors, parameters and custom fields for one unit.',
    category: 'Single Asset',
    scope: 'unit',
    needsPeriod: false,
    pollMs: LIVE_POLL.unitDetail,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
      { key: 'category', label: 'Type' },
    ],
  },
  {
    id: 'events',
    label: 'Alerts & Violations',
    description: 'Live alerts, eco violations and video events from Wialon integrations.',
    category: 'Safety & Events',
    scope: 'fleet',
    needsPeriod: false,
    pollMs: LIVE_POLL.alerts,
    columns: [
      { key: 'occurredAt', label: 'Time' },
      { key: 'category', label: 'Type' },
      { key: 'title', label: 'Event' },
      { key: 'unitName', label: 'Unit' },
      { key: 'driverName', label: 'Driver' },
      { key: 'severity', label: 'Severity' },
    ],
  },
];

export function getLiveReport(id: string): LiveReportDef | undefined {
  return LIVE_REPORTS.find((r) => r.id === id);
}

export function reportsByCategory(): Map<string, LiveReportDef[]> {
  const map = new Map<string, LiveReportDef[]>();
  for (const cat of LIVE_REPORT_CATEGORIES) {
    map.set(
      cat,
      LIVE_REPORTS.filter((r) => r.category === cat)
    );
  }
  return map;
}
