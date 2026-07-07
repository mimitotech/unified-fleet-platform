import { MetricCard } from '@/components/app/MetricCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Fuel, Truck, Zap, AlertTriangle, Droplets, Clock, Battery } from 'lucide-react';
import type { FuelFleetSummary } from '@/lib/fuelTypes';

type Props = {
  summary?: FuelFleetSummary;
  isLoading?: boolean;
  compact?: boolean;
};

export function FuelLiveSummary({ summary, isLoading, compact }: Props) {
  if (isLoading || !summary) {
    return (
      <div className={compact ? 'grid gap-2 grid-cols-2 md:grid-cols-4' : 'stat-strip-4'}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        <MetricCard title="Fleet units" value={summary.totalAssets} icon={Fuel} variant="primary" size="xxs" />
        <MetricCard title="With fuel level" value={summary.withFuelLevel} icon={Droplets} variant="primary" size="xxs" />
        <MetricCard title="Low tank" value={summary.lowTank} icon={AlertTriangle} variant="destructive" size="xxs" />
        <MetricCard title="Filling now" value={summary.fillingNow} icon={Battery} variant="info" size="xxs" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
      <MetricCard title="Fleet units" value={summary.totalAssets} icon={Fuel} variant="primary" size="xxs" />
      <MetricCard title="Vehicles" value={summary.vehicles} icon={Truck} variant="info" size="xxs" />
      <MetricCard title="Generators" value={summary.generators} icon={Zap} variant="warning" size="xxs" />
      <MetricCard title="With fuel level" value={summary.withFuelLevel} icon={Droplets} variant="primary" size="xxs" />
      <MetricCard title="No fuel sensor" value={summary.missingFuelLevel} icon={AlertTriangle} variant="destructive" size="xxs" />
      <MetricCard title="Stale (&gt;24h)" value={summary.staleReadings} icon={Clock} variant="warning" size="xxs" />
      <MetricCard title="Low tank (&lt;25%)" value={summary.lowTank} icon={AlertTriangle} variant="destructive" size="xxs" />
      <MetricCard title="Filling now" value={summary.fillingNow} icon={Battery} variant="info" size="xxs" />
    </div>
  );
}
