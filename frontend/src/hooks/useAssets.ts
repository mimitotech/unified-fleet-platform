import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: () => clientApi.getAssets(),
    refetchInterval: 30000,
  });
}

export function useAssetStatuses() {
  return useQuery({
    queryKey: ['assetStatuses'],
    queryFn: () => clientApi.getAssetStatuses(),
    refetchInterval: 10000,
  });
}

export function useDashboardKpis() {
  return useQuery({
    queryKey: ['dashboardKpis'],
    queryFn: () => clientApi.getKpis(),
    refetchInterval: 30000,
  });
}
