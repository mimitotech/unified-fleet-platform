import { StationaryFuelTab, type FuelTabDateRangeProps } from './StationaryFuelTab';

/** Machinery / plant equipment — same stationary fuel report layout as generators. */
export function MachineryFuelTab(props: FuelTabDateRangeProps) {
  return <StationaryFuelTab stationaryType="machinery" {...props} />;
}
