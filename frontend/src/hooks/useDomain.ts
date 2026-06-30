import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';

export function useDrivers() {
  return useQuery({ queryKey: ['drivers'], queryFn: () => clientApi.getDrivers() });
}

export function useDriverStats() {
  return useQuery({ queryKey: ['driverStats'], queryFn: () => clientApi.getDriverStats() });
}

export function useRoutes() {
  return useQuery({ queryKey: ['routes'], queryFn: () => clientApi.getRoutes() });
}

export function useRouteStats() {
  return useQuery({ queryKey: ['routeStats'], queryFn: () => clientApi.getRouteStats() });
}

export function useTrips(limit = 50) {
  return useQuery({ queryKey: ['trips', limit], queryFn: () => clientApi.getTrips(limit) });
}

export function useFuelTransactions() {
  return useQuery({ queryKey: ['fuelTransactions'], queryFn: () => clientApi.getFuelTransactions() });
}

export function useFuelKpis() {
  return useQuery({ queryKey: ['fuelKpis'], queryFn: () => clientApi.getFuelKpis() });
}

export function useFuelTrend() {
  return useQuery({ queryKey: ['fuelTrend'], queryFn: () => clientApi.getFuelTrend() });
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

export function useEmissionsMetrics() {
  return useQuery({ queryKey: ['emissionsMetrics'], queryFn: () => clientApi.getEmissionsMetrics() });
}

export function useEmissionsByVehicle() {
  return useQuery({ queryKey: ['emissionsByVehicle'], queryFn: () => clientApi.getEmissionsByVehicle() });
}

export function useEcoViolations() {
  return useQuery({ queryKey: ['ecoViolations'], queryFn: () => clientApi.getEcoViolations() });
}

export function useVideoStreams() {
  return useQuery({ queryKey: ['videoStreams'], queryFn: () => clientApi.getVideoStreams(), refetchInterval: 30000 });
}

export function useSurveillanceViolations() {
  return useQuery({ queryKey: ['surveillanceViolations'], queryFn: () => clientApi.getSurveillanceViolations() });
}

export function useGeofences() {
  return useQuery({ queryKey: ['geofences'], queryFn: () => clientApi.getGeofences() });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
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
