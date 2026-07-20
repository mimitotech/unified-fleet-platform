import { MetricCard } from '@/components/app/MetricCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Droplets, Flame, Gauge, AlertTriangle, Truck, Fuel } from 'lucide-react';
import type { WialonFuelReportKpis } from '@/lib/fuelTypes';

type Props = {
  kpis?: Partial<WialonFuelReportKpis>;
  isLoading?: boolean;
};

export function FuelReportKpiCards({ kpis, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  const k = kpis ?? {};
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <MetricCard title="Total filled" value={`${k.totalFilled ?? 0} L`} icon={Droplets} variant="primary" size="xxs" />
      <MetricCard title="Total consumed" value={`${k.totalConsumed ?? 0} L`} icon={Flame} variant="warning" size="xxs" />
      <MetricCard title="Fill events" value={k.fillingCount ?? 0} icon={Fuel} variant="info" size="xxs" />
      <MetricCard title="Consumption rows" value={k.consumptionCount ?? 0} icon={Gauge} variant="info" size="xxs" />
      <MetricCard title="Theft events" value={k.theftCount ?? 0} icon={AlertTriangle} variant="destructive" size="xxs" />
      <MetricCard title="Units in report" value={k.vehiclesTracked ?? 0} icon={Truck} variant="primary" size="xxs" />
    </div>
  );
}
