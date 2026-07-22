/**
 * Workshop / Maintenance Tracking Page
 *
 * Fleet-centric view of vehicle maintenance, inspections, and breakdowns.
 * Costing & Reports tabs preserved from UFP integrations.
 */

import { useState, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Wrench, AlertTriangle, FileText } from 'lucide-react';
import {
  WorkshopKpiCards,
  FleetMaintenanceTable,
  InspectionTimeline,
  MaintenanceLogList,
  BreakdownAlerts,
  MaintenanceCostChart,
  PreDeliveryInspectionModal,
  MaintenanceLogModal,
  BreakdownReportModal,
  InspectionDetailModal,
  WorkshopCostingPanel,
} from '@/components/workshop';
import { WorkshopReportsInline } from '@/components/reports/moduleReportPanels';
import {
  useInspections,
  useCreateInspection,
  useUpdateInspection,
  useDeleteInspection,
  useMaintenanceLogs,
  useCreateMaintenance,
  useUpdateMaintenance,
  useDeleteMaintenance,
  useBreakdowns,
  useCreateBreakdown,
  useUpdateBreakdown,
  useDeleteBreakdown,
  useWorkshopKpis,
  useDrivers,
} from '@/hooks/useDomain';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { notify } from '@/lib/notify';
import { workshopUnitFields, sanitizeWorkshopAssetCategory } from '@/lib/workshopUnit';
import { flattenChecklistSections } from '@/lib/workshopChecklists';
import { safeArray } from '@/lib/safeArray';
import type {
  VehicleInspection,
  MaintenanceLog,
  BreakdownReport,
  InspectionStatus,
  VehicleMaintenanceSummary,
} from '@/types/workshop';
import type { InspectionFormData } from '@/components/workshop/PreDeliveryInspectionModal';
import type { MaintenanceLogFormData } from '@/components/workshop/MaintenanceLogModal';
import type { BreakdownReportFormData } from '@/components/workshop/BreakdownReportModal';

type MaintLike = {
  vehicleName?: string;
  totalCost?: number | string;
  maintenanceType?: string;
  status?: string;
};
type BreakLike = {
  vehicleName?: string;
  totalCost?: number | string;
  severity?: string;
  status?: string;
};

function asInspection(row: Record<string, unknown>): VehicleInspection {
  const assetCategory = sanitizeWorkshopAssetCategory(row.assetCategory);
  const checklistSections = Array.isArray(row.checklistSections)
    ? (row.checklistSections as VehicleInspection['checklistSections'])
    : undefined;
  return {
    id: String(row.id ?? ''),
    vehicleId: String(row.vehicleId ?? ''),
    vehicleName: String(row.vehicleName ?? ''),
    vehiclePlate: String(row.vehiclePlate ?? ''),
    assetCategory,
    driverId: (row.driverId as string | null) ?? null,
    driverName: (row.driverName as string | null) ?? null,
    inspectionType: (row.inspectionType as VehicleInspection['inspectionType']) || 'scheduled',
    inspectionDate: String(row.inspectionDate ?? new Date().toISOString()),
    odometerReading: Number(row.odometerReading ?? 0),
    engineHours: row.engineHours != null ? Number(row.engineHours) : null,
    nextServiceMileage: row.nextServiceMileage != null ? Number(row.nextServiceMileage) : undefined,
    checklistSections,
    truckHeadChecklist: Array.isArray(row.truckHeadChecklist) ? (row.truckHeadChecklist as VehicleInspection['truckHeadChecklist']) : [],
    trailerChecklist: Array.isArray(row.trailerChecklist) ? (row.trailerChecklist as VehicleInspection['trailerChecklist']) : [],
    overallStatus: (row.overallStatus as InspectionStatus) || 'pass',
    notes: row.notes as string | undefined,
    inspectorName: row.inspectorName as string | undefined,
    createdAt: String(row.createdAt ?? ''),
  };
}

function asMaintenanceLog(row: Record<string, unknown>): MaintenanceLog {
  return {
    id: String(row.id ?? ''),
    vehicleId: String(row.vehicleId ?? ''),
    vehicleName: String(row.vehicleName ?? ''),
    vehiclePlate: String(row.vehiclePlate ?? ''),
    assetCategory: sanitizeWorkshopAssetCategory(row.assetCategory),
    driverId: (row.driverId as string | null) ?? null,
    driverName: row.driverName as string | undefined,
    inspectionId: row.inspectionId as string | undefined,
    breakdownId: row.breakdownId as string | undefined,
    maintenanceType: (row.maintenanceType as MaintenanceLog['maintenanceType']) || 'repair',
    priority: (row.priority as MaintenanceLog['priority']) || 'medium',
    description: String(row.description ?? ''),
    mechanicName: String(row.mechanicName ?? ''),
    startDate: String(row.startDate ?? new Date().toISOString()),
    endDate: row.endDate as string | undefined,
    laborHours: Number(row.laborHours ?? 0),
    laborCost: Number(row.laborCost ?? 0),
    partsCost: Number(row.partsCost ?? 0),
    totalCost: Number(row.totalCost ?? 0),
    partsUsed: Array.isArray(row.partsUsed) ? (row.partsUsed as MaintenanceLog['partsUsed']) : [],
    status: (row.status as MaintenanceLog['status']) || 'pending',
    notes: row.notes as string | undefined,
    odometerReading: row.odometerReading != null ? Number(row.odometerReading) : undefined,
    engineHours: row.engineHours != null ? Number(row.engineHours) : null,
    nextServiceKm: row.nextServiceKm != null ? Number(row.nextServiceKm) : undefined,
    nextServiceHours: row.nextServiceHours != null ? Number(row.nextServiceHours) : undefined,
    nextServiceDays: row.nextServiceDays != null ? Number(row.nextServiceDays) : undefined,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  };
}

function asBreakdown(row: Record<string, unknown>): BreakdownReport {
  const location = (row.location as BreakdownReport['location']) || { lat: 0, lng: 0, address: '' };
  return {
    id: String(row.id ?? ''),
    vehicleId: String(row.vehicleId ?? ''),
    vehicleName: String(row.vehicleName ?? ''),
    vehiclePlate: String(row.vehiclePlate ?? ''),
    assetCategory: sanitizeWorkshopAssetCategory(row.assetCategory),
    failureSystem: (row.failureSystem as string | null) ?? null,
    driverId: (row.driverId as string | null) ?? null,
    driverName: (row.driverName as string | null) ?? null,
    tripId: row.tripId as string | undefined,
    location: {
      lat: Number(location.lat ?? 0),
      lng: Number(location.lng ?? 0),
      address: location.address || '',
    },
    breakdownTime: String(row.breakdownTime ?? new Date().toISOString()),
    resolutionTime: row.resolutionTime as string | undefined,
    severity: (row.severity as BreakdownReport['severity']) || 'minor',
    description: String(row.description ?? ''),
    cause: row.cause as string | undefined,
    resolution: row.resolution as string | undefined,
    downtimeHours: Number(row.downtimeHours ?? 0),
    towingCost: Number(row.towingCost ?? 0),
    repairCost: Number(row.repairCost ?? 0),
    totalCost: Number(row.totalCost ?? 0),
    createdAt: String(row.createdAt ?? ''),
  };
}

const maintenanceLogToFormData = (log: MaintenanceLog): MaintenanceLogFormData => ({
  vehicleId: log.vehicleId,
  vehicleName: log.vehicleName,
  vehiclePlate: log.vehiclePlate,
  assetCategory: log.assetCategory || 'vehicle',
  driverId: log.driverId || null,
  driverName: log.driverName || '',
  inspectionId: log.inspectionId,
  breakdownId: log.breakdownId,
  maintenanceType: log.maintenanceType,
  priority: log.priority,
  description: log.description,
  mechanicName: log.mechanicName,
  startDate: log.startDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  endDate: log.endDate,
  laborHours: log.laborHours,
  laborCost: log.laborCost,
  partsCost: log.partsCost,
  totalCost: log.totalCost,
  partsUsed: log.partsUsed ?? [],
  status: log.status,
  notes: log.notes || '',
  odometerReading: log.odometerReading,
  engineHours: log.engineHours ?? undefined,
  nextServiceKm: log.nextServiceKm,
  nextServiceHours: log.nextServiceHours,
  nextServiceDays: log.nextServiceDays,
});

const breakdownToFormData = (brk: BreakdownReport): BreakdownReportFormData => ({
  vehicleId: brk.vehicleId,
  vehicleName: brk.vehicleName,
  vehiclePlate: brk.vehiclePlate,
  assetCategory: brk.assetCategory || 'vehicle',
  failureSystem: brk.failureSystem || '',
  driverId: brk.driverId,
  driverName: brk.driverName || '',
  tripId: brk.tripId,
  location: {
    lat: brk.location.lat,
    lng: brk.location.lng,
    address: brk.location.address || '',
  },
  breakdownTime: brk.breakdownTime?.slice(0, 16) || new Date().toISOString().slice(0, 16),
  resolutionTime: brk.resolutionTime,
  severity: brk.severity,
  description: brk.description,
  cause: brk.cause || '',
  resolution: brk.resolution || '',
  downtimeHours: brk.downtimeHours,
  towingCost: brk.towingCost,
  repairCost: brk.repairCost,
  totalCost: brk.totalCost,
});

function resolveUnitPayload(data: {
  unit?: Parameters<typeof workshopUnitFields>[0];
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
}) {
  if (data.unit) return workshopUnitFields(data.unit);
  return {
    vehicleId: data.vehicleId,
    vehicleName: data.vehicleName,
    vehiclePlate: data.vehiclePlate,
  };
}

export default function Workshop() {
  const [activeTab, setActiveTab] = useState('overview');

  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [inspectionDetailModalOpen, setInspectionDetailModalOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();

  const [editingInspection, setEditingInspection] = useState<VehicleInspection | null>(null);
  const [editingMaintenanceLog, setEditingMaintenanceLog] = useState<MaintenanceLog | null>(null);
  const [editingBreakdown, setEditingBreakdown] = useState<BreakdownReport | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<VehicleInspection | null>(null);

  const { data: kpisData, isLoading: kpisLoading } = useWorkshopKpis();
  const { data: inspectionsRaw, isLoading: inspectionsLoading } = useInspections();
  const { data: maintenanceRaw, isLoading: maintenanceLoading } = useMaintenanceLogs();
  const { data: breakdownsRaw, isLoading: breakdownsLoading } = useBreakdowns();
  const { data: driversRaw } = useDrivers();
  const { units } = useFleetUnits();

  const inspections = useMemo(
    () => safeArray(inspectionsRaw).map((r) => asInspection(r as Record<string, unknown>)),
    [inspectionsRaw]
  );
  const maintenanceLogs = useMemo(
    () => safeArray(maintenanceRaw).map((r) => asMaintenanceLog(r as Record<string, unknown>)),
    [maintenanceRaw]
  );
  const breakdowns = useMemo(
    () => safeArray(breakdownsRaw).map((r) => asBreakdown(r as Record<string, unknown>)),
    [breakdownsRaw]
  );

  const driverOptions = useMemo(
    () =>
      safeArray<{ id: string; name: string }>(driversRaw).map((d) => ({
        id: String(d.id),
        name: String(d.name),
      })),
    [driversRaw]
  );

  const isLoading = inspectionsLoading || maintenanceLoading || breakdownsLoading || kpisLoading;

  const fleetSummary: VehicleMaintenanceSummary[] = useMemo(() => {
    const byKey = new Map<string, VehicleMaintenanceSummary>();

    const ensure = (key: string, name: string, plate: string, mileage = 0, type = 'truck') => {
      if (!byKey.has(key)) {
        byKey.set(key, {
          vehicleId: key,
          vehicleName: name,
          vehiclePlate: plate,
          vehicleType: type,
          lastInspectionDate: null,
          lastInspectionStatus: null,
          nextServiceDue: null,
          currentMileage: mileage,
          totalMaintenanceCost: 0,
          pendingMaintenanceCount: 0,
          breakdownCount: 0,
          avgRepairTime: 0,
          healthScore: 100,
        });
      }
      return byKey.get(key)!;
    };

    for (const unit of units) {
      const key = unit.wialonId ? String(unit.wialonId) : unit.id;
      ensure(
        key,
        unit.name,
        unit.plate || '',
        unit.mileage || 0,
        unit.assetCategory || 'vehicle'
      );
    }

    for (const insp of inspections) {
      const row = ensure(insp.vehicleId, insp.vehicleName, insp.vehiclePlate, insp.odometerReading);
      if (
        !row.lastInspectionDate ||
        new Date(insp.inspectionDate).getTime() > new Date(row.lastInspectionDate).getTime()
      ) {
        row.lastInspectionDate = insp.inspectionDate;
        row.lastInspectionStatus = insp.overallStatus;
        row.nextServiceDue = insp.nextServiceMileage ?? row.nextServiceDue;
        if (insp.odometerReading > 0) row.currentMileage = insp.odometerReading;
      }
    }

    for (const log of maintenanceLogs) {
      const row = ensure(log.vehicleId, log.vehicleName, log.vehiclePlate);
      row.totalMaintenanceCost += log.totalCost || 0;
      if (log.status === 'pending' || log.status === 'in-progress') row.pendingMaintenanceCount += 1;
    }

    for (const brk of breakdowns) {
      const row = ensure(brk.vehicleId, brk.vehicleName, brk.vehiclePlate);
      row.breakdownCount += 1;
    }

    for (const row of byKey.values()) {
      const completed = maintenanceLogs.filter(
        (m) => m.vehicleId === row.vehicleId && m.status === 'completed'
      );
      row.avgRepairTime =
        completed.length > 0
          ? Math.round(
              (completed.reduce((sum, m) => {
                const start = new Date(m.startDate).getTime();
                const end = m.endDate ? new Date(m.endDate).getTime() : start;
                return sum + (end - start) / (1000 * 60 * 60);
              }, 0) /
                completed.length) *
                10
            ) / 10
          : 0;

      let health = 100;
      if (row.lastInspectionStatus === 'fail') health -= 30;
      if (row.lastInspectionStatus === 'needs-attention') health -= 15;
      health -= row.pendingMaintenanceCount * 5;
      health -= row.breakdownCount * 10;
      row.healthScore = Math.max(0, Math.min(100, health));
    }

    return Array.from(byKey.values());
  }, [units, inspections, maintenanceLogs, breakdowns]);

  const createInspectionMutation = useCreateInspection();
  const updateInspectionMutation = useUpdateInspection();
  const deleteInspectionMutation = useDeleteInspection();
  const createMaintenanceMutation = useCreateMaintenance();
  const updateMaintenanceMutation = useUpdateMaintenance();
  const deleteMaintenanceMutation = useDeleteMaintenance();
  const createBreakdownMutation = useCreateBreakdown();
  const updateBreakdownMutation = useUpdateBreakdown();
  const deleteBreakdownMutation = useDeleteBreakdown();

  const handleVehicleClick = useCallback((vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const vehicle = fleetSummary.find((v) => v.vehicleId === vehicleId);
    notify.info(`Selected: ${vehicle?.vehicleName || vehicleId}`);
  }, [fleetSummary]);

  const handleViewInspection = useCallback((inspection: VehicleInspection) => {
    setSelectedInspection(inspection);
    setInspectionDetailModalOpen(true);
  }, []);

  const handleEditInspection = useCallback((inspection: VehicleInspection) => {
    setEditingInspection(inspection);
    setInspectionModalOpen(true);
  }, []);

  const handleDeleteInspection = useCallback(async (inspectionId: string) => {
    try {
      await deleteInspectionMutation.mutateAsync(inspectionId);
      notify.success('Inspection deleted');
      setInspectionDetailModalOpen(false);
      setSelectedInspection(null);
      setEditingInspection(null);
    } catch (e) {
      notify.error('Failed to delete inspection', e instanceof Error ? e.message : undefined);
    }
  }, [deleteInspectionMutation]);

  const handleSaveInspection = useCallback(async (data: InspectionFormData) => {
    const allItems = flattenChecklistSections(data.checklistSections?.length
      ? data.checklistSections
      : [
          { id: 'legacy-a', title: 'A', items: data.truckHeadChecklist || [] },
          { id: 'legacy-b', title: 'B', items: data.trailerChecklist || [] },
        ]);
    const hasIssues = allItems.some((item) => item.status === 'issue');
    const hasFails = allItems.filter((i) => i.status === 'issue').length > 3;
    const overallStatus: InspectionStatus = hasFails ? 'fail' : hasIssues ? 'needs-attention' : 'pass';
    const unitPayload = resolveUnitPayload(data);
    const assetCategory =
      data.assetCategory ||
      sanitizeWorkshopAssetCategory((unitPayload as { assetCategory?: string }).assetCategory);

    const payload = {
      ...unitPayload,
      assetCategory,
      driverId: data.driverId,
      driverName: data.driverName,
      inspectionType: data.inspectionType,
      odometerReading: data.odometerReading,
      engineHours: data.engineHours || null,
      nextServiceMileage: data.nextServiceMileage || null,
      checklistSections: data.checklistSections,
      truckHeadChecklist: data.truckHeadChecklist,
      trailerChecklist: data.trailerChecklist,
      overallStatus,
      notes: data.notes,
      inspectorName: data.inspectorName,
    };

    try {
      if (editingInspection) {
        await updateInspectionMutation.mutateAsync({
          id: editingInspection.id,
          data: payload,
        });
        notify.success('Inspection updated');
      } else {
        await createInspectionMutation.mutateAsync({
          ...payload,
          inspectionDate: new Date().toISOString(),
        });
        notify.success('Inspection created');
      }
      setEditingInspection(null);
    } catch (e) {
      notify.error('Failed to save inspection', e instanceof Error ? e.message : undefined);
      throw e;
    }
  }, [editingInspection, createInspectionMutation, updateInspectionMutation]);

  const handleEditMaintenanceLog = useCallback((log: MaintenanceLog) => {
    setEditingMaintenanceLog(log);
    setMaintenanceModalOpen(true);
  }, []);

  const handleCompleteMaintenanceLog = useCallback(async (logId: string) => {
    try {
      await updateMaintenanceMutation.mutateAsync({
        id: logId,
        data: { status: 'completed', endDate: new Date().toISOString() },
      });
      notify.success('Maintenance job marked as complete');
    } catch (e) {
      notify.error('Failed to complete maintenance job', e instanceof Error ? e.message : undefined);
    }
  }, [updateMaintenanceMutation]);

  const handleDeleteMaintenanceLog = useCallback(async (logId: string) => {
    try {
      await deleteMaintenanceMutation.mutateAsync(logId);
      notify.success('Maintenance log deleted');
      if (editingMaintenanceLog?.id === logId) {
        setEditingMaintenanceLog(null);
        setMaintenanceModalOpen(false);
      }
    } catch (e) {
      notify.error('Failed to delete maintenance log', e instanceof Error ? e.message : undefined);
    }
  }, [deleteMaintenanceMutation, editingMaintenanceLog?.id]);

  const handleSaveMaintenanceLog = useCallback(async (data: MaintenanceLogFormData) => {
    const unitPayload = resolveUnitPayload(data);
    const assetCategory =
      data.assetCategory ||
      sanitizeWorkshopAssetCategory((unitPayload as { assetCategory?: string }).assetCategory);
    const payload = {
      ...unitPayload,
      assetCategory,
      driverId: data.driverId,
      driverName: data.driverName,
      inspectionId: data.inspectionId,
      breakdownId: data.breakdownId,
      maintenanceType: data.maintenanceType,
      priority: data.priority,
      description: data.description,
      mechanicName: data.mechanicName,
      startDate: data.startDate,
      endDate: data.endDate,
      laborHours: data.laborHours,
      laborCost: data.laborCost,
      partsCost: data.partsCost,
      totalCost: data.totalCost,
      partsUsed: data.partsUsed,
      status: data.status,
      notes: data.notes,
      odometerReading: data.odometerReading,
      engineHours: data.engineHours ?? null,
      nextServiceKm: data.nextServiceKm,
      nextServiceHours: data.nextServiceHours,
      nextServiceDays: data.nextServiceDays,
    };

    try {
      if (editingMaintenanceLog) {
        await updateMaintenanceMutation.mutateAsync({ id: editingMaintenanceLog.id, data: payload });
        notify.success('Maintenance log updated');
      } else {
        await createMaintenanceMutation.mutateAsync(payload);
        notify.success('Maintenance log created');
      }
      setEditingMaintenanceLog(null);
    } catch (e) {
      notify.error('Failed to save maintenance log', e instanceof Error ? e.message : undefined);
      throw e;
    }
  }, [editingMaintenanceLog, createMaintenanceMutation, updateMaintenanceMutation]);

  const handleEditBreakdown = useCallback((breakdown: BreakdownReport) => {
    setEditingBreakdown(breakdown);
    setBreakdownModalOpen(true);
  }, []);

  const handleResolveBreakdown = useCallback(async (breakdownId: string, resolution: string) => {
    try {
      await updateBreakdownMutation.mutateAsync({
        id: breakdownId,
        data: { resolution, resolutionTime: new Date().toISOString() },
      });
      notify.success('Breakdown marked as resolved');
    } catch (e) {
      notify.error('Failed to resolve breakdown', e instanceof Error ? e.message : undefined);
    }
  }, [updateBreakdownMutation]);

  const handleDeleteBreakdown = useCallback(async (breakdownId: string) => {
    try {
      await deleteBreakdownMutation.mutateAsync(breakdownId);
      notify.success('Breakdown report deleted');
      if (editingBreakdown?.id === breakdownId) {
        setEditingBreakdown(null);
        setBreakdownModalOpen(false);
      }
    } catch (e) {
      notify.error('Failed to delete breakdown report', e instanceof Error ? e.message : undefined);
    }
  }, [deleteBreakdownMutation, editingBreakdown?.id]);

  const handleViewBreakdownOnMap = useCallback((breakdown: BreakdownReport) => {
    const addr = breakdown.location?.address || 'location';
    notify.info(`Map view for ${addr}`);
  }, []);

  const handleSaveBreakdownReport = useCallback(async (data: BreakdownReportFormData) => {
    const unitPayload = resolveUnitPayload(data);
    const assetCategory =
      data.assetCategory ||
      sanitizeWorkshopAssetCategory((unitPayload as { assetCategory?: string }).assetCategory);
    const payload = {
      ...unitPayload,
      assetCategory,
      failureSystem: data.failureSystem || null,
      driverId: data.driverId,
      driverName: data.driverName,
      tripId: data.tripId,
      location: data.location,
      breakdownTime: data.breakdownTime,
      resolutionTime: data.resolutionTime,
      severity: data.severity,
      description: data.description,
      cause: data.cause,
      resolution: data.resolution,
      downtimeHours: data.downtimeHours,
      towingCost: data.towingCost,
      repairCost: data.repairCost,
      totalCost: data.totalCost,
    };

    try {
      if (editingBreakdown) {
        await updateBreakdownMutation.mutateAsync({ id: editingBreakdown.id, data: payload });
        notify.success('Breakdown report updated');
      } else {
        await createBreakdownMutation.mutateAsync(payload);
        notify.success('Breakdown report created');
      }
      setEditingBreakdown(null);
    } catch (e) {
      notify.error('Failed to save breakdown report', e instanceof Error ? e.message : undefined);
      throw e;
    }
  }, [editingBreakdown, createBreakdownMutation, updateBreakdownMutation]);

  const handleInspectionModalChange = useCallback((open: boolean) => {
    setInspectionModalOpen(open);
    if (!open) setEditingInspection(null);
  }, []);

  const handleMaintenanceModalChange = useCallback((open: boolean) => {
    setMaintenanceModalOpen(open);
    if (!open) setEditingMaintenanceLog(null);
  }, []);

  const handleBreakdownModalChange = useCallback((open: boolean) => {
    setBreakdownModalOpen(open);
    if (!open) setEditingBreakdown(null);
  }, []);

  return (
    <AppLayout
      title="Workshop"
      subtitle="Vehicle maintenance, inspections, and breakdown tracking"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setInspectionModalOpen(true)}>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            New Inspection
          </Button>
          <Button variant="outline" onClick={() => setMaintenanceModalOpen(true)}>
            <Wrench className="h-4 w-4 mr-2" />
            Add Maintenance
          </Button>
          <Button variant="outline" onClick={() => setBreakdownModalOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Report Breakdown
          </Button>
        </div>

        <WorkshopKpiCards kpis={kpisData ?? {}} isLoading={isLoading} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Fleet Overview</TabsTrigger>
            <TabsTrigger value="inspections">Inspections</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance Jobs</TabsTrigger>
            <TabsTrigger value="breakdowns">Breakdowns</TabsTrigger>
            <TabsTrigger value="costing">Costing</TabsTrigger>
            <TabsTrigger value="reports" className="gap-1">
              <FileText className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <FleetMaintenanceTable
              vehicles={fleetSummary}
              onVehicleClick={handleVehicleClick}
              isLoading={isLoading}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MaintenanceCostChart logs={maintenanceLogs} vehicleSummaries={fleetSummary} />
              <InspectionTimeline
                inspections={inspections}
                onViewDetails={handleViewInspection}
                onEdit={handleEditInspection}
                onDelete={handleDeleteInspection}
                maxItems={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="inspections" className="mt-6">
            <InspectionTimeline
              inspections={inspections}
              onViewDetails={handleViewInspection}
              onEdit={handleEditInspection}
              onDelete={handleDeleteInspection}
              maxItems={20}
              showViewAll={false}
            />
          </TabsContent>

          <TabsContent value="maintenance" className="mt-6">
            <MaintenanceLogList
              logs={maintenanceLogs}
              onEditLog={handleEditMaintenanceLog}
              onCompleteLog={handleCompleteMaintenanceLog}
              onDeleteLog={handleDeleteMaintenanceLog}
            />
          </TabsContent>

          <TabsContent value="breakdowns" className="mt-6">
            <BreakdownAlerts
              breakdowns={breakdowns}
              onViewOnMap={handleViewBreakdownOnMap}
              onEditBreakdown={handleEditBreakdown}
              onResolveBreakdown={(id) => handleResolveBreakdown(id, 'Resolved via quick action')}
              onDeleteBreakdown={handleDeleteBreakdown}
            />
          </TabsContent>

          <TabsContent value="costing" className="mt-4 space-y-4">
            <WorkshopCostingPanel
              maintenance={maintenanceLogs as MaintLike[]}
              breakdowns={breakdowns as BreakLike[]}
            />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <WorkshopReportsInline />
          </TabsContent>
        </Tabs>
      </div>

      <PreDeliveryInspectionModal
        open={inspectionModalOpen}
        onOpenChange={handleInspectionModalChange}
        onSave={handleSaveInspection}
        drivers={driverOptions}
        defaultVehicleId={editingInspection?.vehicleId || selectedVehicleId}
        editData={editingInspection}
      />

      <MaintenanceLogModal
        open={maintenanceModalOpen}
        onOpenChange={handleMaintenanceModalChange}
        onSave={handleSaveMaintenanceLog}
        drivers={driverOptions}
        defaultVehicleId={editingMaintenanceLog?.vehicleId || selectedVehicleId}
        editData={editingMaintenanceLog ? maintenanceLogToFormData(editingMaintenanceLog) : null}
      />

      <BreakdownReportModal
        open={breakdownModalOpen}
        onOpenChange={handleBreakdownModalChange}
        onSave={handleSaveBreakdownReport}
        drivers={driverOptions}
        defaultVehicleId={editingBreakdown?.vehicleId || selectedVehicleId}
        editData={editingBreakdown ? breakdownToFormData(editingBreakdown) : null}
      />

      <InspectionDetailModal
        open={inspectionDetailModalOpen}
        onOpenChange={setInspectionDetailModalOpen}
        inspection={selectedInspection}
        onEdit={handleEditInspection}
        onDelete={handleDeleteInspection}
      />
    </AppLayout>
  );
}
