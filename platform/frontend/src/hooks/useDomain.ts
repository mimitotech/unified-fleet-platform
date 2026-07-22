import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: () => clientApi.getDrivers(),
    refetchInterval: pollWhenVisible(LIVE_POLL.drivers),
  });
}

export function useDriverStats(enabled = true) {
  return useQuery({
    queryKey: ['driverStats'],
    queryFn: () => clientApi.getDriverStats(),
    enabled,
  });
}

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: () => clientApi.getRoutes(),
    refetchInterval: pollWhenVisible(LIVE_POLL.routes),
  });
}

export function useRouteStats(enabled = true) {
  return useQuery({
    queryKey: ['routeStats'],
    queryFn: () => clientApi.getRouteStats(),
    enabled,
  });
}

export function useTrips(limit = 50) {
  return useQuery({ queryKey: ['trips', limit], queryFn: () => clientApi.getTrips(limit) });
}

export function useFuelTransactions(
  enabled = true,
  opts?: { from?: string; to?: string },
) {
  const from = opts?.from;
  const to = opts?.to;
  return useQuery({
    queryKey: ['fuelTransactions', from || 'all', to || 'all'],
    queryFn: async () => {
      const data = await clientApi.getFuelTransactions(from, to);
      return (data.transactions ?? []) as unknown as import('@/types/entities').FuelTransaction[];
    },
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useFuelKpis(
  enabled = true,
  opts?: { from?: string; to?: string },
) {
  const fallbackFrom = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);
  const fallbackTo = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = opts?.from || fallbackFrom;
  const to = opts?.to || fallbackTo;

  return useQuery({
    queryKey: ['fuelKpis', from, to],
    queryFn: () => clientApi.getFuelKpis(from, to),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.fuel) : false,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useFuelTrend(
  enabled = true,
  opts?: { from?: string; to?: string },
) {
  const from = opts?.from;
  const to = opts?.to;

  return useQuery({
    queryKey: ['fuelTrend', from || 'all', to || 'all'],
    queryFn: async () => {
      const rows = await clientApi.getFuelTrend();
      const list = safeArray<{ month?: string; filled?: number; consumed?: number }>(rows);
      if (!from && !to) return list;
      return list.filter((r) => {
        const m = String(r.month || '');
        if (!/^\d{4}-\d{2}$/.test(m)) return true;
        const monthStart = `${m}-01`;
        const [y, mo] = m.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const monthEnd = `${m}-${String(lastDay).padStart(2, '0')}`;
        if (from && monthEnd < from) return false;
        if (to && monthStart > to) return false;
        return true;
      });
    },
    enabled,
  });
}

export function useWorkshopKpis(enabled = true) {
  return useQuery({
    queryKey: ['workshopKpis'],
    queryFn: () => clientApi.getWorkshopKpis(),
    enabled,
  });
}

export function useInspections() {
  return useQuery({ queryKey: ['inspections'], queryFn: () => clientApi.getInspections() });
}

export function useMaintenanceLogs() {
  return useQuery({ queryKey: ['maintenanceLogs'], queryFn: () => clientApi.getMaintenanceLogs() });
}

export function useBreakdowns() {
  return useQuery({ queryKey: ['breakdowns'], queryFn: () => clientApi.getBreakdowns() });
}

export function useCreateInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createInspection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useUpdateInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      clientApi.updateInspection(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useDeleteInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientApi.deleteInspection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createMaintenance,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceLogs'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      clientApi.updateMaintenance(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceLogs'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientApi.deleteMaintenance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceLogs'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useCreateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createBreakdown,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['breakdowns'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useUpdateBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      clientApi.updateBreakdown(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['breakdowns'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useDeleteBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientApi.deleteBreakdown(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['breakdowns'] });
      qc.invalidateQueries({ queryKey: ['workshopKpis'] });
    },
  });
}

export function useCreateGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createGeofence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  });
}

export function useDeleteGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.deleteGeofence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  });
}

export function useEmissionsMetrics(enabled = true) {
  return useQuery({
    queryKey: ['emissionsMetrics'],
    queryFn: () => clientApi.getEmissionsMetrics(),
    enabled,
  });
}

export function useEmissionsByVehicle() {
  return useQuery({ queryKey: ['emissionsByVehicle'], queryFn: () => clientApi.getEmissionsByVehicle() });
}

export function useEcoViolations() {
  return useQuery({ queryKey: ['ecoViolations'], queryFn: () => clientApi.getEcoViolations() });
}

export function useVideoStreams(enabled = true) {
  return useQuery({
    queryKey: ['videoStreams'],
    queryFn: () => clientApi.getVideoStreams(),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.video) : false,
    staleTime: LIVE_POLL.video,
    placeholderData: (prev) => prev,
    select: (d) => safeArray(d),
  });
}

export function useSurveillanceViolations(enabled = true, unitId?: number) {
  return useQuery({
    queryKey: ['surveillanceViolations', unitId],
    queryFn: () => clientApi.getSurveillanceViolations(unitId),
    enabled,
    select: (d) => safeArray(d),
  });
}

export function useGeofences(enabled = true) {
  return useQuery({
    queryKey: ['geofences'],
    queryFn: () => clientApi.getGeofences(),
    enabled,
    refetchInterval: enabled ? pollWhenVisible(LIVE_POLL.geofences) : false,
  });
}

export function useReportTypes() {
  return useQuery({ queryKey: ['reportTypes'], queryFn: () => clientApi.getReportTypes() });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createDriver,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof clientApi.updateDriver>[1] }) =>
      clientApi.updateDriver(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientApi.createRoute,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['routeStats'] });
    },
  });
}

export function useUpdateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof clientApi.updateRoute>[1] }) =>
      clientApi.updateRoute(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });
}
