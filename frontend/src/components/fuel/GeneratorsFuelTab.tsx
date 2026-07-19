import { StationaryFuelTab, type FuelTabDateRangeProps } from './StationaryFuelTab';

/** Generator-centric fuel & runtime view — same FLS report layout as vehicles. */
export function GeneratorsFuelTab(props: FuelTabDateRangeProps) {
  return <StationaryFuelTab stationaryType="generator" {...props} />;
}
