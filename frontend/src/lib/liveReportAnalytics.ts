import { CHART, FLEET_STATUS, ALERT_SEVERITY } from '@/lib/chartColors';

export type ReportChartSeries = { key: string; label: string; color: string };

export type ReportChartSpec = {
  id: string;
  title: string;
  subtitle?: string;
  type: 'bar' | 'line' | 'pie' | 'area';
  data: Record<string, unknown>[];
  xKey: string;
  series: ReportChartSeries[];
  horizontal?: boolean;
  forecastNote?: string;
};

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function groupCount(rows: Record<string, unknown>[], key: string, colors: Record<string, string>) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = str(r[key]).toLowerCase() || 'unknown';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    fill: colors[name] || CHART.neutral,
  }));
}

function topByUnit(
  rows: Record<string, unknown>[],
  valueKey: string,
  labelKey = 'unitName',
  limit = 10
) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = str(r[labelKey]) || 'Unknown';
    const v = num(r[valueKey]);
    if (v == null) continue;
    map.set(label, (map.get(label) || 0) + v);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name: name.length > 18 ? `${name.slice(0, 18)}…` : name, value }));
}

function tripsByDay(rows: Record<string, unknown>[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const t = r.startTime ? new Date(String(r.startTime)) : null;
    if (!t || Number.isNaN(t.getTime())) continue;
    const day = t.toISOString().slice(0, 10);
    map.set(day, (map.get(day) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, trips]) => ({ day, trips }));
}

function fuelLevelRows(rows: Record<string, unknown>[]) {
  return rows
    .map((r) => {
      const pct = num(r.fuelPercent) ?? num(r.fuelLevel);
      const liters = num(r.fuelLiters);
      const level = pct != null && pct <= 100 ? pct : liters;
      if (level == null) return null;
      const name = str(r.unitName) || 'Unit';
      return {
        name: name.length > 16 ? `${name.slice(0, 16)}…` : name,
        level: Math.round(level * 10) / 10,
        fill:
          pct != null && pct <= 100
            ? pct >= 50
              ? FLEET_STATUS.moving
              : pct >= 25
                ? FLEET_STATUS.idle
                : FLEET_STATUS.stopped
            : CHART.brand,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.level - b.level)
    .slice(-12);
}

function lowFuelForecast(rows: Record<string, unknown>[]): string | undefined {
  const low = rows.filter((r) => {
    const pct = num(r.fuelPercent) ?? num(r.fuelLevel);
    return pct != null && pct <= 100 && pct < 25;
  });
  if (!low.length) return undefined;
  return `${low.length} unit(s) below 25% — schedule refuel to avoid downtime.`;
}

function tripTrendForecast(rows: Record<string, unknown>[]): string | undefined {
  const byDay = tripsByDay(rows);
  if (byDay.length < 3) return undefined;
  const recent = byDay.slice(-3).map((d) => d.trips);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const last = recent[recent.length - 1];
  if (last > avg * 1.2) return 'Trip activity trending up — expect higher fleet utilization.';
  if (last < avg * 0.8) return 'Trip activity slowing — utilization may drop if trend continues.';
  return 'Trip activity stable over the last 3 days.';
}

export function buildReportCharts(reportId: string, rows: Record<string, unknown>[]): ReportChartSpec[] {
  switch (reportId) {
    case 'fleet-status': {
      const statusColors: Record<string, string> = {
        moving: FLEET_STATUS.moving,
        idle: FLEET_STATUS.idle,
        stopped: FLEET_STATUS.stopped,
        offline: FLEET_STATUS.offline,
      };
      return [
        {
          id: 'status-mix',
          title: 'Fleet status mix',
          subtitle: 'Live Wialon hosting status',
          type: 'pie',
          data: groupCount(rows, 'status', statusColors),
          xKey: 'name',
          series: [{ key: 'value', label: 'Units', color: CHART.brand }],
        },
        {
          id: 'top-speed',
          title: 'Highest speeds now',
          subtitle: 'km/h — accountability view',
          type: 'bar',
          data: [...rows]
            .map((r) => ({ name: str(r.unitName).slice(0, 14), value: num(r.speedKmh) ?? 0 }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10),
          xKey: 'name',
          series: [{ key: 'value', label: 'Speed', color: ALERT_SEVERITY.info }],
          horizontal: true,
        },
        {
          id: 'fuel-levels',
          title: 'Fuel levels',
          subtitle: '% or liters from Wialon FLS',
          type: 'bar',
          data: fuelLevelRows(rows),
          xKey: 'name',
          series: [{ key: 'level', label: 'Fuel', color: CHART.brand }],
          horizontal: true,
          forecastNote: lowFuelForecast(rows),
        },
        {
          id: 'connectivity',
          title: 'Connectivity',
          type: 'pie',
          data: groupCount(rows, 'online', { online: FLEET_STATUS.moving, offline: FLEET_STATUS.offline }),
          xKey: 'name',
          series: [{ key: 'value', label: 'Units', color: CHART.brandAccent }],
        },
      ];
    }

    case 'fleet-positions':
      return [
        {
          id: 'status-mix',
          title: 'Units by status',
          type: 'pie',
          data: groupCount(rows, 'status', FLEET_STATUS),
          xKey: 'name',
          series: [{ key: 'value', label: 'Units', color: CHART.brand }],
        },
        {
          id: 'speed-dist',
          title: 'Speed distribution',
          type: 'bar',
          data: [
            { name: '0', value: rows.filter((r) => (num(r.speedKmh) ?? 0) === 0).length },
            { name: '1–30', value: rows.filter((r) => { const s = num(r.speedKmh) ?? 0; return s > 0 && s <= 30; }).length },
            { name: '31–60', value: rows.filter((r) => { const s = num(r.speedKmh) ?? 0; return s > 30 && s <= 60; }).length },
            { name: '60+', value: rows.filter((r) => (num(r.speedKmh) ?? 0) > 60).length },
          ],
          xKey: 'name',
          series: [{ key: 'value', label: 'Units', color: ALERT_SEVERITY.info }],
        },
        {
          id: 'gps-coverage',
          title: 'GPS coverage',
          type: 'pie',
          data: [
            { name: 'With position', value: rows.filter((r) => r.latitude != null).length, fill: FLEET_STATUS.moving },
            { name: 'No fix', value: rows.filter((r) => r.latitude == null).length, fill: FLEET_STATUS.offline },
          ],
          xKey: 'name',
          series: [{ key: 'value', label: 'Units', color: CHART.brand }],
        },
        {
          id: 'top-speed-pos',
          title: 'Fastest units',
          type: 'bar',
          data: [...rows]
            .map((r) => ({ name: str(r.unitName).slice(0, 14), value: num(r.speedKmh) ?? 0 }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
          xKey: 'name',
          series: [{ key: 'value', label: 'Speed', color: CHART.brandAccent }],
          horizontal: true,
        },
      ];

    case 'fleet-fuel':
      return [
        {
          id: 'fuel-bars',
          title: 'Tank levels by unit',
          subtitle: 'Wialon FLS live readings',
          type: 'bar',
          data: fuelLevelRows(rows),
          xKey: 'name',
          series: [{ key: 'level', label: 'Fuel', color: CHART.brand }],
          horizontal: true,
          forecastNote: lowFuelForecast(rows),
        },
        {
          id: 'low-fuel',
          title: 'Low fuel alert (<25%)',
          type: 'bar',
          data: rows
            .filter((r) => {
              const pct = num(r.fuelPercent);
              return pct != null && pct < 25;
            })
            .map((r) => ({
              name: str(r.unitName).slice(0, 14),
              value: num(r.fuelPercent) ?? 0,
              fill: FLEET_STATUS.stopped,
            })),
          xKey: 'name',
          series: [{ key: 'value', label: '%', color: FLEET_STATUS.stopped }],
        },
        {
          id: 'fill-events',
          title: 'Recent fill events',
          type: 'bar',
          data: rows
            .filter((r) => (num(r.filledLiters) ?? 0) > 0)
            .map((r) => ({
              name: str(r.unitName).slice(0, 14),
              value: num(r.filledLiters) ?? 0,
              fill: FLEET_STATUS.moving,
            })),
          xKey: 'name',
          series: [{ key: 'value', label: 'Liters filled', color: FLEET_STATUS.moving }],
          horizontal: true,
        },
        {
          id: 'fuel-method',
          title: 'Data source',
          type: 'pie',
          data: groupCount(rows, 'method', {
            'wialon fls': CHART.brand,
            'wialon calc': ALERT_SEVERITY.info,
            'wialon sensor': CHART.brandAccent,
          }),
          xKey: 'name',
          series: [{ key: 'value', label: 'Units', color: CHART.brand }],
        },
      ];

    case 'trip-history': {
      const byDay = tripsByDay(rows);
      const withForecast =
        byDay.length >= 2
          ? [
              ...byDay,
              {
                day: '→ forecast',
                trips: Math.round(
                  (byDay.slice(-3).reduce((a, d) => a + d.trips, 0) / Math.min(3, byDay.length)) * 10
                ) / 10,
              },
            ]
          : byDay;
      return [
        {
          id: 'distance-by-unit',
          title: 'Distance by unit (km)',
          type: 'bar',
          data: topByUnit(rows, 'distanceKm'),
          xKey: 'name',
          series: [{ key: 'value', label: 'km', color: CHART.brand }],
          horizontal: true,
        },
        {
          id: 'trips-timeline',
          title: 'Trips per day',
          subtitle: 'Trend + simple forecast',
          type: 'line',
          data: withForecast,
          xKey: 'day',
          series: [{ key: 'trips', label: 'Trips', color: ALERT_SEVERITY.info }],
          forecastNote: tripTrendForecast(rows),
        },
        {
          id: 'avg-speed',
          title: 'Avg speed comparison',
          type: 'bar',
          data: topByUnit(rows, 'avgSpeedKmh', 'unitName', 10),
          xKey: 'name',
          series: [{ key: 'value', label: 'km/h', color: CHART.brandAccent }],
        },
        {
          id: 'duration',
          title: 'Drive time (minutes)',
          type: 'bar',
          data: topByUnit(rows, 'durationMin', 'unitName', 10),
          xKey: 'name',
          series: [{ key: 'value', label: 'min', color: ALERT_SEVERITY.warning }],
          horizontal: true,
        },
      ];
    }

    case 'unit-detail':
      return [
        {
          id: 'snapshot',
          title: 'Live snapshot',
          type: 'bar',
          data: rows.length
            ? [{ name: str(rows[0].unitName), value: num(rows[0].speedKmh) ?? 0 }]
            : [],
          xKey: 'name',
          series: [{ key: 'value', label: 'Speed km/h', color: ALERT_SEVERITY.info }],
        },
        {
          id: 'fuel-gauge',
          title: 'Fuel level',
          type: 'bar',
          data: rows.length
            ? [{ name: 'Fuel', value: num(rows[0].fuelPercent) ?? num(rows[0].fuelLiters) ?? 0 }]
            : [],
          xKey: 'name',
          series: [{ key: 'value', label: 'Level', color: CHART.brand }],
        },
        {
          id: 'odometer',
          title: 'Odometer (km)',
          type: 'bar',
          data: rows.length ? [{ name: 'Odometer', value: num(rows[0].odometerKm) ?? 0 }] : [],
          xKey: 'name',
          series: [{ key: 'value', label: 'km', color: CHART.brandAccent }],
        },
        {
          id: 'status',
          title: 'Status',
          type: 'pie',
          data: rows.length
            ? [{ name: str(rows[0].status), value: 1, fill: FLEET_STATUS[str(rows[0].status) as keyof typeof FLEET_STATUS] || CHART.neutral }]
            : [],
          xKey: 'name',
          series: [{ key: 'value', label: '', color: CHART.brand }],
        },
      ];

    case 'unit-sensors': {
      const numeric = rows
        .map((r) => ({ name: str(r.name).slice(0, 12), value: num(r.value) }))
        .filter((r): r is { name: string; value: number } => r.value != null)
        .slice(0, 12);
      return [
        {
          id: 'sensor-values',
          title: 'Numeric readings',
          type: 'bar',
          data: numeric,
          xKey: 'name',
          series: [{ key: 'value', label: 'Value', color: CHART.brand }],
          horizontal: true,
        },
        {
          id: 'by-category',
          title: 'By category',
          type: 'pie',
          data: groupCount(rows, 'category', {
            sensor: CHART.brand,
            parameter: ALERT_SEVERITY.info,
            field: CHART.brandAccent,
          }),
          xKey: 'name',
          series: [{ key: 'value', label: 'Count', color: CHART.brand }],
        },
        {
          id: 'top-values',
          title: 'Highest values',
          type: 'bar',
          data: [...numeric].sort((a, b) => b.value - a.value).slice(0, 8),
          xKey: 'name',
          series: [{ key: 'value', label: 'Value', color: CHART.brandAccent }],
        },
        {
          id: 'reading-count',
          title: 'Reading types',
          type: 'bar',
          data: [
            { name: 'Sensors', value: rows.filter((r) => str(r.category).toLowerCase() === 'sensor').length },
            { name: 'Parameters', value: rows.filter((r) => str(r.category).toLowerCase() === 'parameter').length },
            { name: 'Fields', value: rows.filter((r) => str(r.category).toLowerCase() === 'field').length },
          ],
          xKey: 'name',
          series: [{ key: 'value', label: 'Count', color: ALERT_SEVERITY.info }],
        },
      ];
    }

    case 'events': {
      const sevColors: Record<string, string> = {
        critical: ALERT_SEVERITY.critical,
        emergency: ALERT_SEVERITY.emergency,
        warning: ALERT_SEVERITY.warning,
        info: ALERT_SEVERITY.info,
      };
      const byHour = new Map<string, number>();
      for (const r of rows) {
        const t = r.occurredAt ? new Date(String(r.occurredAt)) : null;
        if (!t || Number.isNaN(t.getTime())) continue;
        const h = `${t.toISOString().slice(0, 13)}:00`;
        byHour.set(h, (byHour.get(h) || 0) + 1);
      }
      return [
        {
          id: 'severity',
          title: 'By severity',
          type: 'pie',
          data: groupCount(rows, 'severity', sevColors),
          xKey: 'name',
          series: [{ key: 'value', label: 'Events', color: CHART.failed }],
        },
        {
          id: 'timeline',
          title: 'Events over time',
          type: 'area',
          data: [...byHour.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([hour, count]) => ({ hour: hour.slice(11, 16), count })),
          xKey: 'hour',
          series: [{ key: 'count', label: 'Events', color: CHART.failed }],
        },
        {
          id: 'by-unit',
          title: 'Events by unit',
          type: 'bar',
          data: topByUnit(rows, 'count', 'unitName').length
            ? topByUnit(
                rows.map((r) => ({ ...r, count: 1 })),
                'count',
                'unitName',
                8
              )
            : [],
          xKey: 'name',
          series: [{ key: 'value', label: 'Events', color: ALERT_SEVERITY.warning }],
          horizontal: true,
        },
        {
          id: 'by-type',
          title: 'By category',
          type: 'bar',
          data: groupCount(rows, 'category', {}).map((d) => ({ name: d.name, value: d.value })),
          xKey: 'name',
          series: [{ key: 'value', label: 'Events', color: ALERT_SEVERITY.critical }],
        },
      ];
    }

    default:
      return [];
  }
}

export type ReportKpi = { label: string; value: string | number; tone?: 'good' | 'warn' | 'bad' | 'neutral' };

export function buildReportKpis(reportId: string, rows: Record<string, unknown>[]): ReportKpi[] {
  const n = rows.length;
  switch (reportId) {
    case 'fleet-status':
      return [
        { label: 'Total units', value: n, tone: 'neutral' },
        { label: 'Moving', value: rows.filter((r) => str(r.status) === 'moving').length, tone: 'good' },
        { label: 'Low fuel (<25%)', value: rows.filter((r) => (num(r.fuelPercent) ?? 100) < 25).length, tone: 'warn' },
        { label: 'Offline', value: rows.filter((r) => str(r.online) === 'Offline').length, tone: 'bad' },
      ];
    case 'fleet-fuel':
      return [
        { label: 'Reporting', value: rows.filter((r) => r.fuelLive).length, tone: 'good' },
        { label: 'Low fuel', value: rows.filter((r) => (num(r.fuelPercent) ?? 100) < 25).length, tone: 'warn' },
        { label: 'Fill events', value: rows.filter((r) => (num(r.filledLiters) ?? 0) > 0).length, tone: 'good' },
        { label: 'FLS sensors', value: rows.filter((r) => str(r.method) === 'Wialon FLS').length, tone: 'neutral' },
      ];
    case 'trip-history': {
      const km = rows.reduce((a, r) => a + (num(r.distanceKm) ?? 0), 0);
      return [
        { label: 'Trips', value: n, tone: 'neutral' },
        { label: 'Total km', value: Math.round(km), tone: 'good' },
        { label: 'Avg trip km', value: n ? Math.round((km / n) * 10) / 10 : 0, tone: 'neutral' },
        { label: 'Units', value: new Set(rows.map((r) => r.unitId)).size, tone: 'neutral' },
      ];
    }
    case 'events':
      return [
        { label: 'Total events', value: n, tone: 'neutral' },
        { label: 'Critical', value: rows.filter((r) => /critical|emergency/i.test(str(r.severity))).length, tone: 'bad' },
        { label: 'Warnings', value: rows.filter((r) => /warn/i.test(str(r.severity))).length, tone: 'warn' },
        { label: 'Units affected', value: new Set(rows.map((r) => r.unitName)).size, tone: 'neutral' },
      ];
    default:
      return [{ label: 'Rows', value: n, tone: 'neutral' }];
  }
}
