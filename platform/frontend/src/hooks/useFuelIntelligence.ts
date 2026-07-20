import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useFleetReady } from '@/contexts/FleetContext';
import type { FuelAssetCategory } from '@/lib/fuelTypes';

export function useFuelIntelligence(
  from: string,
  to: string,
  assetCategory?: FuelAssetCategory,
  unitId?: number,
  enabled = true,
) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: ['fuel', 'intelligence', from, to, assetCategory ?? 'all', unitId ?? 'all'],
    queryFn: () => clientApi.getWialonFuelIntelligence(from, to, false, assetCategory, unitId),
    enabled: enabled && isReady && Boolean(from) && Boolean(to),
    staleTime: 60_000,
  });
}

