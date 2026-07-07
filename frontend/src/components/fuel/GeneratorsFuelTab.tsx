import { StationaryFuelTab } from './StationaryFuelTab';

/** Generator-centric fuel & runtime view — same FLS report layout as vehicles. */
export function GeneratorsFuelTab() {
  return <StationaryFuelTab stationaryType="generator" />;
}
