import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useFleetReady } from '@/contexts/FleetContext';

export type FuelReportSlot = {
  key: 'vehicle.group' | 'vehicle.unit' | 'generator.group' | 'generator.unit';
  family: 'vehicle' | 'generator';
  role: 'group' | 'unit';
  expectedName: string;
  available: boolean;
  matchedName: string | null;
  resourceId: number | null;
  templateId: number | null;
};

export type FuelReportCapability = {
  module: string;
  available: boolean;
  groupTemplateCount: number;
  unitTemplateCount: number;
  templates: Array<{
    resourceId: number;
    resourceName: string;
    templateId: number;
    templateName: string;
    isGroupReport: boolean;
    fuelFamily?: string;
  }>;
};

export function useFuelReportCapabilities() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: ['fuel', 'reportCapabilities'],
    queryFn: () => clientApi.getWialonFuelReportCapabilities(),
    enabled: isReady,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}
