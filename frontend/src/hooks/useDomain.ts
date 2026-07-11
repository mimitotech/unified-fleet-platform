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

export function useDriverStats() {
  return useQuery({ queryKey: ['driverStats'], queryFn: () => clientApi.getDriverStats() });
}

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: () => clientApi.getRoutes(),
    refetchInterval: pollWhenVisible(LIVE_POLL.routes),
  });
}

export function useRouteStats() {
  return useQuery({ queryKey: ['routeStats'], queryFn: () => clientApi.getRouteStats() });
}

export function useTrips(limit = 50) {
  return useQuery({ queryKey: ['trips', limit], queryFn: () => clientApi.getTrips(limit) });
}

export function useFuelTransactions(enabled = true) {
  return useQuery({
    queryKey: ['fuelTransactions'],
    queryFn: async () => {
      const data = await clientApi.getFuelTransactions();
      return data.transactions ?? [];
    },
    enabled,
  });
}

export function useFuelKpis() {
  return useQuery({
    queryKey: ['fuelKpis'],
    queryFn: () => clientApi.getFuelKpis(),
    refetchInterval: pollWhenVisible(LIVE_POLL.fuel),
  });
}

export function useFuelTrend(enabled = true) {
  return useQuery({
    queryKey: ['fuelTrend'],
    queryFn: () => clientApi.getFuelTrend(),
    enabled,
  });
}

export function useWorkshopKpis() {
  return useQuery({ queryKey: ['workshopKpis'], queryFn: () => clientApi.getWorkshopKpis() });
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

export function useEmissionsMetrics() {
  return useQuery({ queryKey: ['emissionsMetrics'], queryFn: () => clientApi.getEmissionsMetrics() });
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

export function useGeofences() {
  return useQuery({
    queryKey: ['geofences'],
    queryFn: () => clientApi.getGeofences(),
    refetchInterval: pollWhenVisible(LIVE_POLL.geofences),
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
