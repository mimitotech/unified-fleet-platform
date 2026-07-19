import { CoreFuelTab } from './CoreFuelTab';
import type { FuelTabDateRangeProps } from './fuelTabTypes';

export type { FuelTabDateRangeProps };

export function VehiclesFuelTab(props: FuelTabDateRangeProps) {
  return <CoreFuelTab {...props} assetCategory="vehicle" />;
}
