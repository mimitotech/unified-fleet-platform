import { useMemo, useState } from 'react';
import { ModuleReportsShell } from '@/components/reports/ModuleReportsShell';
import { AlertsReportCharts } from '@/components/reports/AlertsReportCharts';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useFleetAssetProfile } from '@/hooks/useFleetAssetProfile';
import { useAlerts } from '@/hooks/useAlerts';
import { useDrivers, useWorkshopKpis, useInspections, useMaintenanceLogs, useBreakdowns } from '@/hooks/useDomain';
import { safeArray } from '@/lib/safeArray';
import { resolveTenantBranding } from '@/lib/tenantBranding';
import { loadBrandingCache } from '@/lib/tenantBrandingCache';
import type { DomainChartSpec } from '@/lib/domainReportCharts';
import { CHART } from '@/lib/chartColors';

function statusLabel(status: string, generatorOnly: boolean) {
  if (generatorOnly && (status === 'idle' || status === 'moving')) return 'Running';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function MonitoringModuleReports() {
  const { units, counts } = useFleetUnits();
  const profile = useFleetAssetProfile();
  const generatorOnly = profile.isGeneratorOnly;

  const assetNames = useMemo(() => units.map((u) => u.name).sort((a, b) => a.localeCompare(b)), [units]);

  const rows = useMemo(
    () =>
      units.map((u) => ({
        name: u.name,
        status: statusLabel(u.status || 'offline', generatorOnly),
        speed: generatorOnly ? '—' : `${Math.round(u.speed ?? 0)} km/h`,
        fuel: u.fuelLiters != null ? `${Math.round(u.fuelLiters)} L` : '—',
        fuelPct:
          u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel <= 100
            ? `${Math.round(u.fuelLevel)}%`
            : '—',
        odometer: u.mileage != null ? `${Math.round(u.mileage)} km` : '—',
        engineHours: u.engineHours != null ? `${Math.round(u.engineHours)} h` : '—',
        location:
          u.lat != null && u.lng != null ? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}` : '—',
        plate: u.plate || '—',
        fuelL: u.fuelLiters ?? 0,
        fuelPctN: u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel <= 100 ? u.fuelLevel : 0,
        engineH: u.engineHours ?? 0,
        odoKm: u.mileage ?? 0,
      })),
    [units, generatorOnly],
  );

  const charts: DomainChartSpec = {
    heading: 'Asset performance · monitoring analytics',
    categoryKey: 'name',
    bar: {
      title: 'Fuel & engine load by asset',
      subtitle: 'Standing bars — live fuel (L) and engine hours',
      metrics: [
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
      reports={[
        { id: 'executive', title: 'Live fleet executive', blurb: 'Status mix, fuel and positions.' },
        { id: 'status', title: 'Status roll-up', blurb: 'Running / moving / stopped / offline.' },
        { id: 'fuel', title: 'Live fuel focus', blurb: 'Levels and % where sensors report.' },
        { id: 'location', title: 'Location register', blurb: 'Coordinates and identity details.' },
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
      columns={[
        { key: 'name', label: 'Asset' },
        { key: 'plate', label: 'Plate / ID' },
        { key: 'status', label: 'Status' },
        { key: 'speed', label: 'Speed', align: 'right' },
        { key: 'fuel', label: 'Fuel', align: 'right' },
        { key: 'fuelPct', label: 'Fuel %', align: 'right' },
        { key: 'odometer', label: 'Odometer', align: 'right' },
        { key: 'engineHours', label: 'Engine h', align: 'right' },
        { key: 'location', label: 'Location' },
      ]}
      rows={rows}
      charts={charts}
    />
  );
}

export function DriversModuleReports() {
  const { data: drivers } = useDrivers();
  const list = safeArray<{
    name?: string;
    status?: string;
    licenseNumber?: string;
    phone?: string;
    assignedAssetName?: string;
    assignedAssetPlate?: string;
  }>(drivers);

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
      columns={[
        { key: 'name', label: 'Driver' },
        { key: 'status', label: 'Status' },
        { key: 'license', label: 'License' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Assigned' },
      ]}
      rows={rows}
      charts={charts}
    />
  );
}

export function AlertsModuleReports() {
  const branding = resolveTenantBranding(loadBrandingCache());
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(todayStr);
  const { data: alerts } = useAlerts(500, true, {
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
    return list.map((a) => {
      const title = a.title || 'Alert';
      const description = a.description || '';
      const severity = a.severity || 'warning';
      const type = a.type || 'event';
      const ts = a.timestamp ? new Date(a.timestamp) : null;
      const day =
        ts && !Number.isNaN(ts.getTime()) ? ts.toISOString().slice(0, 10) : '';
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
      rows = rows.filter((r) => r.severity === 'critical' || r.severity === 'emergency');
    } else if (reportId === 'fuel') {
      rows = rows.filter((r) => /fuel/.test(String(r.type)));
    } else if (reportId === 'open') {
      rows = rows.filter((r) => r.status === 'Open');
    } else if (reportId === 'safety') {
      rows = rows.filter((r) =>
        /harsh|speed|idle|eco|geofence|sos|corner|accel|brak/.test(String(r.type)),
      );
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
      { label: 'In view', value: filteredRows.length },
      {
        label: 'Critical',
        value: filteredRows.filter((r) => r.severity === 'critical' || r.severity === 'emergency')
          .length,
      },
      { label: 'Open', value: filteredRows.filter((r) => r.status === 'Open').length },
      {
        label: 'Fuel events',
        value: filteredRows.filter((r) => /fuel/.test(String(r.type))).length,
      },
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
      reports={[
        { id: 'executive', title: 'All alerts', blurb: 'Full inbox with severity, type and asset.' },
        { id: 'critical', title: 'Critical only', blurb: 'Critical and emergency events.' },
        { id: 'fuel', title: 'Fuel events', blurb: 'Fillings and sudden drops only.' },
        { id: 'safety', title: 'Safety & driving', blurb: 'Harsh events, idling, speeding, eco.' },
        { id: 'open', title: 'Open alerts', blurb: 'Not yet acknowledged.' },
      ]}
      kpis={kpis}
      columns={[
        { key: 'when', label: 'Time' },
        { key: 'asset', label: 'Asset' },
        { key: 'title', label: 'Alert' },
        { key: 'type', label: 'Type' },
        { key: 'severity', label: 'Severity' },
        { key: 'status', label: 'Status' },
        { key: 'source', label: 'Source' },
        { key: 'detail', label: 'Details' },
      ]}
      rows={filteredRows}
      emptyMessage="No alerts for this filter, asset and period."
      extraPreview={
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Asset performance · alert analytics
          </p>
          <AlertsReportCharts
            rows={filteredRows}
            fromDate={fromDate}
            toDate={toDate}
            primaryColor={branding.primaryColor}
          />
        </div>
      }
    />
  );
}

export function WorkshopReportsInline() {
  const { data: kpis } = useWorkshopKpis();
  const { data: maintenance } = useMaintenanceLogs();
  const { data: inspections } = useInspections();
  const { data: breakdowns } = useBreakdowns();
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

  const rows = [...byAsset.values()]
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
      assetNames={rows.map((r) => r.name)}
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
      columns={[
        { key: 'name', label: 'Asset' },
        { key: 'jobs', label: 'Jobs', align: 'right' },
        { key: 'inspections', label: 'Inspections', align: 'right' },
        { key: 'maintenance', label: 'Maintenance', align: 'right' },
        { key: 'breakdown', label: 'Breakdowns', align: 'right' },
        { key: 'total', label: 'Total', align: 'right' },
      ]}
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
