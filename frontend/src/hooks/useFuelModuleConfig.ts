import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useFleetReady } from '@/contexts/FleetContext';
import { DEFAULT_FUEL_VISIBLE_COLUMNS } from '@/lib/fuelModuleConfig';

export function useFuelModuleConfig() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: ['fuel', 'moduleConfig'],
    queryFn: () => clientApi.getWialonFuelModuleConfig(),
    enabled: isReady,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function getVisibleFuelColumns(
  cfg: { visibleColumns?: string[] } | undefined,
): string[] {
  const list = cfg?.visibleColumns;
  if (!list?.length) return DEFAULT_FUEL_VISIBLE_COLUMNS;
  return list;
}

