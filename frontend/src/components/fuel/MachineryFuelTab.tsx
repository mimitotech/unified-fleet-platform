import { StationaryFuelTab, type FuelTabDateRangeProps } from './StationaryFuelTab';

/** Machinery / plant — same fuel pipeline and UI as vehicles and generators. */
export function MachineryFuelTab(props: FuelTabDateRangeProps) {
  return <StationaryFuelTab stationaryType="machinery" {...props} />;
}
