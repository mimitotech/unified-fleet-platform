import {
  useGenerators,
  useGeneratorsWithReports,
  useMachinery,
  useMachineryWithReports,
  useGeneratorFuelTransactions,
  useMachineryFuelTransactions,
} from '@/services/fleet';
import type { EnrichedGenerator, EnrichedMachinery, Generator, Machinery } from '@/types';

export type StationaryFuelType = 'generator' | 'machinery';

export function useStationaryAssets(type: StationaryFuelType = 'generator', enabled = true) {
  const generators = useGenerators({ enabled: enabled && type === 'generator' });
  const machinery = useMachinery({ enabled: enabled && type === 'machinery' });
  return type === 'generator' ? generators : machinery;
}

export function useStationaryWithReports(
  type: StationaryFuelType = 'generator',
  range?: { startDate?: string; endDate?: string },
) {
  const generators = useGeneratorsWithReports(type === 'generator' ? range : undefined);
  const machinery = useMachineryWithReports(type === 'machinery' ? range : undefined);
  return type === 'generator' ? generators : machinery;
}

export function useStationaryFuelTransactions(
  type: StationaryFuelType = 'generator',
  filters?: { startDate?: string; endDate?: string },
  enabled = true,
) {
  const gen = useGeneratorFuelTransactions(filters, { enabled: enabled && type === 'generator' });
  const mch = useMachineryFuelTransactions(filters, { enabled: enabled && type === 'machinery' });
  return type === 'generator' ? gen : mch;
}

export type StationaryAsset = Generator | Machinery;
export type EnrichedStationaryAsset = EnrichedGenerator | EnrichedMachinery;
