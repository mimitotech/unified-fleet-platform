import { CoreFuelTab, type CoreFuelTabProps } from './CoreFuelTab';

export type FuelTabDateRangeProps = Omit<CoreFuelTabProps, 'assetCategory'>;

export function VehiclesFuelTab(props: FuelTabDateRangeProps) {
  return <CoreFuelTab {...props} assetCategory="vehicle" />;
}
