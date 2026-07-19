import { useMemo } from 'react';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import { useFuelFleetSummary } from '@/services/fleet';
import { useFleetUnits } from '@/hooks/useFleetUnits';

export type FleetAssetProfile = {
  /** Primary label for KPI strip, e.g. Generators, Vehicles, Assets */
  primaryLabel: string;
  /** Singular unit noun for lists */
  unitLabel: string;
  /** Plural unit noun */
  unitLabelPlural: string;
  /** Total units in primary scope */
  total: number;
  vehicles: number;
  generators: number;
  machinery: number;
  /** Dominant asset type when account is homogeneous */
  primaryType: FuelAssetCategory | 'mixed';
  isGeneratorOnly: boolean;
  isVehicleOnly: boolean;
  isMixed: boolean;
  subtitle: string;
};

export function useFleetAssetProfile(): FleetAssetProfile {
  const { data: summary } = useFuelFleetSummary();
  const { counts } = useFleetUnits();

  return useMemo((): FleetAssetProfile => {
    const vehicles = summary?.vehicles ?? 0;
    const generators = summary?.generators ?? 0;
    const machinery = summary?.machinery ?? 0;
    const total = summary?.totalAssets ?? counts.total;
    const isGeneratorOnly = generators > 0 && vehicles === 0 && machinery === 0;
    const isVehicleOnly = vehicles > 0 && generators === 0 && machinery === 0;
    const isMachineryOnly = machinery > 0 && vehicles === 0 && generators === 0;
    const isMixed = !isGeneratorOnly && !isVehicleOnly && !isMachineryOnly;

    if (isGeneratorOnly) {
      return {
        primaryLabel: 'Generators',
        unitLabel: 'Generator',
        unitLabelPlural: 'generators',
        total: generators,
        vehicles,
        generators,
        machinery,
        primaryType: 'generator',
        isGeneratorOnly: true,
        isVehicleOnly: false,
        isMixed: false,
        subtitle: 'Generator operations overview',
      };
    }

    if (isMachineryOnly) {
      return {
        primaryLabel: 'Machinery',
        unitLabel: 'Unit',
        unitLabelPlural: 'machinery units',
        total: machinery,
        vehicles,
        generators,
        machinery,
        primaryType: 'machinery',
        isGeneratorOnly: false,
        isVehicleOnly: false,
        isMixed: false,
        subtitle: 'Machinery operations overview',
      };
    }

    if (isVehicleOnly) {
      return {
        primaryLabel: 'Vehicles',
        unitLabel: 'Vehicle',
        unitLabelPlural: 'vehicles',
        total: vehicles,
        vehicles,
        generators,
        machinery,
        primaryType: 'vehicle',
        isGeneratorOnly: false,
        isVehicleOnly: true,
        isMixed: false,
        subtitle: 'Fleet operations overview',
      };
    }

    const parts: string[] = [];
    if (vehicles > 0) parts.push(`${vehicles} vehicle${vehicles === 1 ? '' : 's'}`);
    if (generators > 0) parts.push(`${generators} generator${generators === 1 ? '' : 's'}`);
    if (machinery > 0) parts.push(`${machinery} machinery`);

    return {
      primaryLabel: 'Assets',
      unitLabel: 'Unit',
      unitLabelPlural: 'units',
      total,
      vehicles,
      generators,
      machinery,
      primaryType: 'mixed',
      isGeneratorOnly: false,
      isVehicleOnly: false,
      isMixed: true,
      subtitle: parts.length ? `Mixed fleet · ${parts.join(', ')}` : 'Fleet operations overview',
    };
  }, [summary, counts.total]);
}
