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
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function getVisibleFuelColumns(
  cfg:
    | {
        visibleColumns?: string[];
        columnsByCategory?: Partial<Record<string, string[]>>;
      }
    | undefined,
  assetCategory?: string,
): string[] {
  if (assetCategory && cfg?.columnsByCategory?.[assetCategory]?.length) {
    return cfg.columnsByCategory[assetCategory] as string[];
  }
  const list = cfg?.visibleColumns;
  if (!list?.length) return DEFAULT_FUEL_VISIBLE_COLUMNS;
  return list;
}

/** Variance tab appears when variance column is enabled for any asset category. */
export function isFuelVarianceEnabled(
  cfg:
    | {
        visibleColumns?: string[];
        columnsByCategory?: Partial<Record<string, string[]>>;
      }
    | undefined,
): boolean {
  if (!cfg) return false;
  if (cfg.visibleColumns?.includes('variance')) return true;
  const byCat = cfg.columnsByCategory;
  if (!byCat) return false;
  return Object.values(byCat).some((cols) => cols?.includes('variance'));
}

