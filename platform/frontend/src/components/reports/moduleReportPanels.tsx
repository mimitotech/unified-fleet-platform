import { useMemo, useState } from 'react';
import { ModuleReportsShell } from '@/components/reports/ModuleReportsShell';
import { AlertsReportCharts } from '@/components/reports/AlertsReportCharts';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useFleetAssetProfile } from '@/hooks/useFleetAssetProfile';
import { useAlerts } from '@/hooks/useAlerts';
import { useDrivers, useWorkshopKpis, useInspections, useMaintenanceLogs, useBreakdowns } from '@/hooks/useDomain';
import { safeArray } from '@/lib/safeArray';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import type { DomainChartSpec } from '@/lib/domainReportCharts';
import { CHART } from '@/lib/chartColors';
import { useBatchWialonGeocode } from '@/hooks/useBatchWialonGeocode';
import { tankPercentFromLiters, usablePercent } from '@/lib/fuelLevel';
import { localDateIso } from '@/lib/localDate';
import { getDefaultReportDateRange } from '@/lib/defaultDateRange';
import type { FleetUnit } from '@/lib/fleetUnits';

function statusLabel(status: string, stationary: boolean) {
  if (stationary && (status === 'idle' || status === 'moving')) return 'Running';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function isStationaryUnit(u: Pick<FleetUnit, 'stationary' | 'assetCategory'>): boolean {
  return (
    u.stationary === true ||
    u.assetCategory === 'generator' ||
    u.assetCategory === 'machinery'
  );
}

function fuelPct(u: FleetUnit): number | null {
  return tankPercentFromLiters(u.fuelLiters, u.tankCapacity) ?? usablePercent(u.fuelLevel);
}

function fuelPctDisplay(u: FleetUnit): string {
  const pct = fuelPct(u);
  return pct == null ? '—' : `${Math.round(pct)}%`;
}

function fuelPctNumber(u: FleetUnit): number {
  return fuelPct(u) ?? 0;
}

type MonitoringKind = 'executive' | 'status' | 'fuel' | 'location';

export function MonitoringModuleReports() {
  const { units, counts, refetch, isFetching } = useFleetUnits();
  const profile = useFleetAssetProfile();
  const generatorOnly = profile.isGeneratorOnly;
  const [kind, setKind] = useState<MonitoringKind>('executive');
  const [runTick, setRunTick] = useState(0);

  const assetNames = useMemo(() => units.map((u) => u.name).sort((a, b) => a.localeCompare(b)), [units]);

  const geocodePoints = useMemo(
    () =>
      units
        .filter((u) => u.lat != null && u.lng != null)
        .map((u) => ({ key: u.id, lat: u.lat!, lng: u.lng! })),
    [units],
  );
  const addresses = useBatchWialonGeocode(geocodePoints, kind === 'location' || kind === 'executive');

  const baseRows = useMemo(
    () =>
      units.map((u) => {
        const stationary = isStationaryUnit(u);
        const coords =
          u.lat != null && u.lng != null ? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}` : '—';
        const address = addresses.get(u.id);
        return {
          name: u.name,
          status: statusLabel(u.status || 'offline', stationary),
          speed: stationary ? '—' : `${Math.round(u.speed ?? 0)} km/h`,
          fuel: u.fuelLiters != null ? `${Math.round(u.fuelLiters)} L` : '—',
          fuelPct: fuelPctDisplay(u),
          odometer: stationary
            ? '—'
            : u.mileage != null
              ? `${Math.round(u.mileage)} km`
              : '—',
          engineHours: u.engineHours != null ? `${Math.round(u.engineHours)} h` : '—',
          location: address || coords,
          coords,
          address: address || '—',
          fuelL: u.fuelLiters ?? 0,
          fuelPctN: fuelPctNumber(u),
          engineH: u.engineHours ?? 0,
          odoKm: stationary ? 0 : u.mileage ?? 0,
          _stationary: stationary ? 1 : 0,
        };
      }),
    // runTick forces remap after explicit Run
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, addresses, runTick],
  );

  const columns = useMemo(() => {
    if (kind === 'status') {
      return [
        { key: 'name', label: 'Asset' },
        { key: 'status', label: 'Status' },
        { key: 'engineHours', label: 'Engine h', align: 'right' as const },
        ...(generatorOnly
          ? []
          : [{ key: 'speed', label: 'Speed', align: 'right' as const }]),
      ];
    }
    if (kind === 'fuel') {
      return [
        { key: 'name', label: 'Asset' },
        { key: 'fuel', label: 'Fuel', align: 'right' as const },
        { key: 'fuelPct', label: 'Fuel %', align: 'right' as const },
        { key: 'status', label: 'Status' },
        { key: 'engineHours', label: 'Engine h', align: 'right' as const },
      ];
    }
    if (kind === 'location') {
      return [
        { key: 'name', label: 'Asset' },
        { key: 'location', label: 'Address' },
        { key: 'coords', label: 'Coordinates' },
        { key: 'status', label: 'Status' },
      ];
    }
    // executive — Asset only (no Plate / ID duplicate)
    const cols = [
      { key: 'name', label: 'Asset' },
      { key: 'status', label: 'Status' },
      { key: 'fuel', label: 'Fuel', align: 'right' as const },
      { key: 'fuelPct', label: 'Fuel %', align: 'right' as const },
      { key: 'engineHours', label: 'Engine h', align: 'right' as const },
      { key: 'location', label: 'Location' },
    ];
    if (!generatorOnly) {
      cols.splice(2, 0, { key: 'speed', label: 'Speed', align: 'right' as const });
      cols.splice(5, 0, { key: 'odometer', label: 'Odometer', align: 'right' as const });
    }
    return cols;
  }, [kind, generatorOnly]);

  const rows = useMemo(() => {
    if (kind === 'status') {
      return [...baseRows].sort((a, b) => String(a.status).localeCompare(String(b.status)));
    }
    if (kind === 'fuel') {
      return [...baseRows]
        .filter((r) => r.fuelL > 0 || r.fuelPctN > 0)
        .sort((a, b) => b.fuelL - a.fuelL);
    }
    if (kind === 'location') {
      return [...baseRows].filter((r) => r.coords !== '—');
    }
    return baseRows;
  }, [baseRows, kind]);

  const charts: DomainChartSpec = {
    heading: 'Asset performance · monitoring analytics',
    categoryKey: 'name',
    bar: {
      title: kind === 'fuel' ? 'Fuel by asset' : 'Fuel & engine load by asset',
      subtitle:
        kind === 'fuel'
          ? 'Standing bars — live fuel (L) and fill %'
          : 'Standing bars — live fuel (L) and engine hours',
      metrics:
        kind === 'fuel'
          ? [
              { key: 'fuelL', label: 'Fuel (L)', color: CHART.brand },
              { key: 'fuelPctN', label: 'Fuel %', color: '#2563eb' },
            ]
          : [
              { key: 'fuelL', label: 'Fuel (L)', color: CHART.brand },
              { key: 'engineH', label: 'Engine h', color: '#0d9488' },
            ],
      topN: 8,
    },
    secondary: {
      type: 'category',
      title: 'Fleet status mix',
      subtitle: 'Share of assets by live status',
      groupKey: 'status',
      as: 'pie',
    },
  };

  return (
    <ModuleReportsShell
      moduleLabel="Monitoring"
      assetNames={assetNames}
      selectedReportId={kind}
      onSelectedReportIdChange={(id) => setKind(id as MonitoringKind)}
      onRun={async () => {
        await refetch();
        setRunTick((t) => t + 1);
      }}
      running={isFetching}
      reports={[
        { id: 'executive', title: 'Live fleet executive', blurb: 'Status mix, fuel and positions.' },
        { id: 'status', title: 'Status roll-up', blurb: 'Running / moving / stopped / offline.' },
        { id: 'fuel', title: 'Live fuel focus', blurb: 'Levels and % where sensors report.' },
        { id: 'location', title: 'Location register', blurb: 'Addresses and coordinates.' },
      ]}
      kpis={[
        { label: profile.primaryLabel, value: counts.total },
        {
          label: generatorOnly ? 'Running' : 'Moving',
          value: generatorOnly ? counts.idle + counts.moving : counts.moving,
        },
        { label: 'Stopped', value: counts.stopped },
        { label: 'Offline', value: counts.offline },
      ]}
      columns={columns}
      rows={rows}
      charts={charts}
    />
  );
}

export function DriversModuleReports() {
  const { data: drivers, refetch, isFetching } = useDrivers();
  const list = safeArray<{
    name?: string;
    status?: string;
    licenseNumber?: string;
    phone?: string;
    assignedAssetName?: string;
    assignedAssetPlate?: string;
  }>(drivers);
  const [kind, setKind] = useState('roster');

  const rows = list.map((d) => {
    const assigned = d.assignedAssetPlate || d.assignedAssetName || '';
    return {
      name: d.name || '—',
      status: d.status || '—',
      license: d.licenseNumber || '—',
      phone: d.phone || '—',
      vehicle: assigned || '—',
      assignment: assigned ? 'Assigned' : 'Unassigned',
      count: 1,
    };
  });

  const filteredRows = useMemo(() => {
    if (kind === 'availability') {
      return rows.filter((r) => /available|driving|on.?duty/i.test(String(r.status)));
    }
    if (kind === 'assignment') {
      return rows.filter((r) => r.assignment === 'Assigned');
    }
    return rows;
  }, [rows, kind]);

  const columns = useMemo(() => {
    if (kind === 'availability') {
      return [
        { key: 'name', label: 'Driver' },
        { key: 'status', label: 'Status' },
        { key: 'phone', label: 'Phone' },
      ];
    }
    if (kind === 'assignment') {
      return [
        { key: 'name', label: 'Driver' },
        { key: 'vehicle', label: 'Assigned' },
        { key: 'status', label: 'Status' },
        { key: 'license', label: 'License' },
      ];
    }
    return [
      { key: 'name', label: 'Driver' },
      { key: 'status', label: 'Status' },
      { key: 'license', label: 'License' },
      { key: 'phone', label: 'Phone' },
      { key: 'vehicle', label: 'Assigned' },
    ];
  }, [kind]);

  const charts: DomainChartSpec = {
    heading: 'Driver performance · roster analytics',
    categoryKey: 'status',
    bar: {
      title: 'Drivers by status',
      subtitle: 'Standing bars — roster headcount per duty status',
      metrics: [{ key: 'count', label: 'Drivers', color: CHART.brand }],
      topN: 8,
    },
    secondary: {
      type: 'category',
      title: 'Assignment mix',
      subtitle: 'Assigned vs unassigned drivers',
      groupKey: 'assignment',
      as: 'pie',
    },
  };

  return (
    <ModuleReportsShell
      moduleLabel="Drivers"
      assetNames={rows.map((r) => String(r.name)).filter((n) => n !== '—')}
      assetKey="name"
      selectedReportId={kind}
      onSelectedReportIdChange={setKind}
      onRun={() => void refetch()}
      running={isFetching}
      reports={[
        { id: 'roster', title: 'Driver roster', blurb: 'Full roster with licenses and assignments.' },
        { id: 'availability', title: 'Availability', blurb: 'Status snapshot for planning.' },
        { id: 'assignment', title: 'Assignments', blurb: 'Drivers linked to assets.' },
      ]}
      kpis={[
        { label: 'Drivers', value: list.length },
        { label: 'Available', value: list.filter((d) => d.status === 'available').length },
        { label: 'Driving', value: list.filter((d) => d.status === 'driving').length },
        { label: 'Off duty', value: list.filter((d) => d.status === 'off-duty').length },
      ]}
      columns={columns}
      rows={filteredRows}
      charts={charts}
    />
  );
}

export function AlertsModuleReports() {
  const branding = useTenantBranding();
  const todayStr = localDateIso();
  const reportDefault = getDefaultReportDateRange();
  const [fromDate, setFromDate] = useState(reportDefault.fromDate);
  const [toDate, setToDate] = useState(reportDefault.toDate);
  const { data: alerts, refetch, isFetching } = useAlerts(500, true, {
    from: `${fromDate}T00:00:00`,
    to: `${toDate}T23:59:59`,
  });
  const { units } = useFleetUnits();
  const [reportId, setReportId] = useState('executive');
  const [asset, setAsset] = useState('all');

  const fleetNames = useMemo(
    () => units.map((u) => u.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [units],
  );

  const list = safeArray<{
    id?: string;
    title?: string;
    severity?: string;
    type?: string;
    timestamp?: string;
    sourceType?: string;
    description?: string;
    acknowledged?: boolean;
  }>(alerts);

  const resolveAsset = (title: string, description: string) => {
    const blob = `${title} ${description}`.toLowerCase();
    const hit = [...fleetNames]
      .sort((a, b) => b.length - a.length)
      .find((name) => blob.includes(name.toLowerCase()));
    if (hit) return hit;
    const m = title.match(/·\s*([^·(+]+?)(?:\s*[\(+−-]|$)/);
    return m ? m[1].trim() : '—';
  };

  const baseRows = useMemo(() => {
    const now = Date.now() + 60_000;
    return list
      .filter((a) => {
        const desc = String(a.description || '');
        // Period-summary fuel alerts are purged server-side; hide any leftovers.
        if (/for this period/i.test(desc)) return false;
        const t = a.timestamp ? new Date(a.timestamp).getTime() : NaN;
        if (Number.isFinite(t) && t > now) return false;
        return true;
      })
      .map((a) => {
      const title = a.title || 'Alert';
      const description = a.description || '';
      const severity = a.severity || 'warning';
      const type = a.type || 'event';
      const ts = a.timestamp ? new Date(a.timestamp) : null;
      // Local calendar day — UTC ISO day put EOD stamps on the wrong report day.
      const day =
        ts && !Number.isNaN(ts.getTime())
          ? `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`
          : '';
      const typeLabel = type
        .replace(/^wialon[_-]?/i, '')
        .replace(/_/g, ' ')
        .trim() || 'event';
      const src = (a.sourceType || '').toLowerCase();
      const sourceLabel =
        !src || src === 'wialon'
          ? 'Fleet'
          : src === 'tracksolid'
            ? 'Device'
            : src === 'loconav'
              ? 'Video'
              : src.replace(/_/g, ' ');
      return {
        asset: resolveAsset(title, description),
        title: title.replace(/\bWialon\b/gi, '').replace(/\s{2,}/g, ' ').trim(),
        type: typeLabel,
        severity,
        status: a.acknowledged ? 'Acknowledged' : 'Open',
        source: sourceLabel,
        detail: (description || '—').replace(/\bWialon\b/gi, '').replace(/\s{2,}/g, ' ').trim(),
        when: ts && !Number.isNaN(ts.getTime()) ? ts.toLocaleString() : '—',
        _day: day,
        _ts: ts && !Number.isNaN(ts.getTime()) ? ts.getTime() : 0,
        _severityRank:
          severity === 'critical' || severity === 'emergency'
            ? 0
            : severity === 'warning'
              ? 1
              : 2,
      };
    });
  }, [list, fleetNames]);

  const filteredRows = useMemo(() => {
    let rows = [...baseRows];
    if (reportId === 'critical') {
      rows = rows.filter(
        (r) =>
          r.status === 'Open' &&
          (r.severity === 'critical' || r.severity === 'emergency'),
      );
    } else if (reportId === 'fuel') {
      rows = rows.filter((r) => /fuel/.test(String(r.type)));
    } else if (reportId === 'open') {
      rows = rows.filter((r) => r.status === 'Open');
    } else if (reportId === 'acked') {
      rows = rows.filter((r) => r.status === 'Acknowledged');
    }
    rows = rows.filter((r) => {
      if (!r._day) return true;
      return String(r._day) >= fromDate && String(r._day) <= toDate;
    });
    if (asset !== 'all') {
      rows = rows.filter((r) => r.asset === asset);
    }
    return rows.sort((a, b) => {
      if (a._severityRank !== b._severityRank) return a._severityRank - b._severityRank;
      return Number(b._ts) - Number(a._ts);
    });
  }, [baseRows, reportId, fromDate, toDate, asset]);

  const assetNames = useMemo(() => {
    const fromRows = baseRows.map((r) => String(r.asset)).filter((n) => n && n !== '—');
    return [...new Set([...fleetNames, ...fromRows])].sort((a, b) => a.localeCompare(b));
  }, [fleetNames, baseRows]);

  const kpis = useMemo(
    () => [
      {
        label: 'Open',
        value: filteredRows.filter((r) => r.status === 'Open').length,
      },
      {
        label: 'Open critical',
        value: filteredRows.filter(
          (r) =>
            r.status === 'Open' &&
            (r.severity === 'critical' || r.severity === 'emergency'),
        ).length,
      },
      {
        label: 'Fuel events',
        value: filteredRows.filter((r) => /fuel/.test(String(r.type))).length,
      },
      { label: 'In period', value: filteredRows.length },
    ],
    [filteredRows],
  );

  return (
    <ModuleReportsShell
      moduleLabel="Alerts"
      selectedReportId={reportId}
      onSelectedReportIdChange={setReportId}
      assetNames={assetNames}
      assetKey="asset"
      controlledFrom={fromDate}
      controlledTo={toDate}
      controlledAsset={asset}
      onFromChange={setFromDate}
      onToChange={setToDate}
      onAssetChange={setAsset}
      todayStr={todayStr}
      onRun={() => void refetch()}
      running={isFetching}
      reports={[
        {
          id: 'executive',
          title: 'Inbox (period)',
          blurb: 'Same live events as the inbox for the selected dates.',
        },
        {
          id: 'open',
          title: 'Open only',
          blurb: 'Still waiting for acknowledgement.',
        },
        {
          id: 'critical',
          title: 'Open critical',
          blurb: 'Open critical and emergency only.',
        },
        {
          id: 'fuel',
          title: 'Fuel fill & drop',
          blurb: 'Sensor fill and sudden-drop leaf events.',
        },
        {
          id: 'acked',
          title: 'Acknowledged',
          blurb: 'Already handled in this period.',
        },
      ]}
      kpis={kpis}
      columns={[
        { key: 'when', label: 'Time' },
        { key: 'asset', label: 'Asset' },
        { key: 'title', label: 'Alert' },
        { key: 'detail', label: 'Details' },
        { key: 'type', label: 'Type' },
        { key: 'severity', label: 'Severity' },
        { key: 'status', label: 'Status' },
      ]}
      rows={filteredRows}
      emptyMessage="No alerts for this filter, asset and period."
      extraPreview={
        filteredRows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Alert analytics
            </p>
            <AlertsReportCharts
              rows={filteredRows}
              fromDate={fromDate}
              toDate={toDate}
              primaryColor={branding.primaryColor}
            />
          </div>
        ) : null
      }
    />
  );
}

export function WorkshopReportsInline() {
  const { data: kpis, refetch: refetchKpis, isFetching: fetchingKpis } = useWorkshopKpis();
  const { data: maintenance, refetch: refetchMaint, isFetching: fetchingMaint } = useMaintenanceLogs();
  const { data: inspections, refetch: refetchInsp, isFetching: fetchingInsp } = useInspections();
  const { data: breakdowns, refetch: refetchBrk, isFetching: fetchingBrk } = useBreakdowns();
  const [kind, setKind] = useState('executive');
  const maint = safeArray<{
    vehicleName?: string;
    totalCost?: number;
    maintenanceType?: string;
    status?: string;
    priority?: string;
  }>(maintenance);
  const insp = safeArray<{ vehicleName?: string; overallStatus?: string; inspectionType?: string }>(inspections);
  const brk = safeArray<{
    vehicleName?: string;
    totalCost?: number;
    severity?: string;
    status?: string;
  }>(breakdowns);

  const byAsset = new Map<
    string,
    { name: string; maintenance: number; breakdown: number; jobs: number; inspections: number }
  >();
  for (const m of maint) {
    const name = m.vehicleName || 'Unknown';
    const row = byAsset.get(name) ?? { name, maintenance: 0, breakdown: 0, jobs: 0, inspections: 0 };
    row.maintenance += Number(m.totalCost) || 0;
    row.jobs += 1;
    byAsset.set(name, row);
  }
  for (const b of brk) {
    const name = b.vehicleName || 'Unknown';
    const row = byAsset.get(name) ?? { name, maintenance: 0, breakdown: 0, jobs: 0, inspections: 0 };
    row.breakdown += Number(b.totalCost) || 0;
    byAsset.set(name, row);
  }
  for (const i of insp) {
    const name = i.vehicleName || 'Unknown';
    const row = byAsset.get(name) ?? { name, maintenance: 0, breakdown: 0, jobs: 0, inspections: 0 };
    row.inspections += 1;
    byAsset.set(name, row);
  }

  const allRows = [...byAsset.values()]
    .map((r) => ({
      name: r.name,
      maintenance: r.maintenance.toLocaleString(),
      breakdown: r.breakdown.toLocaleString(),
      total: (r.maintenance + r.breakdown).toLocaleString(),
      jobs: r.jobs,
      inspections: r.inspections,
      maintenanceN: r.maintenance,
      breakdownN: r.breakdown,
      totalN: r.maintenance + r.breakdown,
      _sort: r.maintenance + r.breakdown,
    }))
    .sort((a, b) => b._sort - a._sort);

  const rows = useMemo(() => {
    if (kind === 'cost') {
      return allRows.filter((r) => r.totalN > 0);
    }
    if (kind === 'workload') {
      return [...allRows].sort((a, b) => b.jobs + b.inspections - (a.jobs + a.inspections));
    }
    return allRows;
  }, [allRows, kind]);

  const columns = useMemo(() => {
    if (kind === 'cost') {
      return [
        { key: 'name', label: 'Asset' },
        { key: 'maintenance', label: 'Maintenance', align: 'right' as const },
        { key: 'breakdown', label: 'Breakdowns', align: 'right' as const },
        { key: 'total', label: 'Total', align: 'right' as const },
      ];
    }
    if (kind === 'workload') {
      return [
        { key: 'name', label: 'Asset' },
        { key: 'jobs', label: 'Jobs', align: 'right' as const },
        { key: 'inspections', label: 'Inspections', align: 'right' as const },
      ];
    }
    return [
      { key: 'name', label: 'Asset' },
      { key: 'jobs', label: 'Jobs', align: 'right' as const },
      { key: 'inspections', label: 'Inspections', align: 'right' as const },
      { key: 'maintenance', label: 'Maintenance', align: 'right' as const },
      { key: 'breakdown', label: 'Breakdowns', align: 'right' as const },
      { key: 'total', label: 'Total', align: 'right' as const },
    ];
  }, [kind]);

  const charts: DomainChartSpec = {
    heading: 'Asset performance · workshop analytics',
    categoryKey: 'name',
    bar: {
      title: 'Cost by asset',
      subtitle: 'Standing bars — maintenance vs breakdown spend',
      metrics: [
        { key: 'maintenanceN', label: 'Maintenance', color: CHART.brand },
        { key: 'breakdownN', label: 'Breakdowns', color: '#dc2626' },
      ],
      topN: 8,
    },
    secondary: {
      type: 'bars',
      title: 'Workload by asset',
      subtitle: 'Standing bars — jobs and inspections',
      metrics: [
        { key: 'jobs', label: 'Jobs', color: '#2563eb' },
        { key: 'inspections', label: 'Inspections', color: '#d97706' },
      ],
      topN: 8,
    },
  };

  return (
    <ModuleReportsShell
      moduleLabel="Workshop"
      assetNames={allRows.map((r) => r.name)}
      selectedReportId={kind}
      onSelectedReportIdChange={setKind}
      onRun={async () => {
        await Promise.all([refetchKpis(), refetchMaint(), refetchInsp(), refetchBrk()]);
      }}
      running={fetchingKpis || fetchingMaint || fetchingInsp || fetchingBrk}
      reports={[
        { id: 'executive', title: 'Workshop executive', blurb: 'Jobs, costs and open risk.' },
        { id: 'cost', title: 'Cost by asset', blurb: 'Maintenance and breakdown spend.' },
        { id: 'workload', title: 'Workload', blurb: 'Jobs and inspections per asset.' },
      ]}
      kpis={[
        { label: 'Pending', value: kpis?.pendingMaintenance ?? 0 },
        { label: 'Open breakdowns', value: kpis?.openBreakdowns ?? 0 },
        { label: 'Inspections', value: insp.length },
        { label: 'Total cost', value: Number(kpis?.totalMaintenanceCost ?? 0).toLocaleString() },
      ]}
      columns={columns}
      rows={rows}
      charts={charts}
    />
  );
}

export function GenericModuleReports({
  moduleLabel,
  title,
  blurb,
  kpis,
  columns,
  rows,
  extraReports,
  charts,
  dateKey,
  onRun,
  running,
}: {
  moduleLabel: string;
  title: string;
  blurb: string;
  kpis: Array<{ label: string; value: string | number }>;
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, string | number>>;
  extraReports?: Array<{ id: string; title: string; blurb: string }>;
  charts?: DomainChartSpec;
  dateKey?: string;
  onRun?: () => void | Promise<void>;
  running?: boolean;
}) {
  const assetNames = useMemo(() => {
    return [
      ...new Set(
        rows
          .map((r) => String(r.name || r.unit || r.asset || r.title || ''))
          .filter((n) => n && n !== '—'),
      ),
    ].sort();
  }, [rows]);

  const assetKey =
    rows[0]?.name != null
      ? 'name'
      : rows[0]?.unit != null
        ? 'unit'
        : rows[0]?.asset != null
          ? 'asset'
          : 'title';

  return (
    <ModuleReportsShell
      moduleLabel={moduleLabel}
      assetNames={assetNames}
      assetKey={assetKey}
      dateKey={dateKey}
      onRun={onRun}
      running={running}
      reports={[
        { id: 'executive', title, blurb },
        { id: 'detail', title: `${moduleLabel} detail`, blurb: 'Full row breakdown with sorting and search.' },
        { id: 'summary', title: `${moduleLabel} summary`, blurb: 'KPI-focused executive view.' },
        ...(extraReports || []),
      ]}
      kpis={kpis}
      columns={columns}
      rows={rows}
      charts={charts}
    />
  );
}
