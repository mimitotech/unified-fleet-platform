import { CoreFuelTab } from './CoreFuelTab';
import type { FuelTabDateRangeProps } from './fuelTabTypes';
import type { StationaryFuelType } from './useStationaryFuelHooks';

export type { FuelTabDateRangeProps };

interface StationaryFuelTabProps extends FuelTabDateRangeProps {
  stationaryType: StationaryFuelType;
}

export function StationaryFuelTab({ stationaryType, ...range }: StationaryFuelTabProps) {
  const assetCategory = stationaryType === 'generator' ? 'generator' : 'machinery';
  return <CoreFuelTab {...range} assetCategory={assetCategory} />;
}
