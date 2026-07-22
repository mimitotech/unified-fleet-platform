/**
 * Workshop KPI Cards
 *
 * Displays key performance indicators for the workshop/maintenance section.
 */

import {
  Wrench,
  AlertTriangle,
  Clock,
  CheckCircle,
  TrendingUp,
  Truck,
} from 'lucide-react';
import type { WorkshopKpis as DomainWorkshopKpis } from '@/types/workshop';
import type { WorkshopKpis as ApiWorkshopKpis } from '@/lib/api';

type WorkshopKpiInput = Partial<DomainWorkshopKpis & ApiWorkshopKpis>;

interface WorkshopKpiCardsProps {
  kpis: WorkshopKpiInput;
  isLoading?: boolean;
}

/** MySQL DECIMAL often arrives as string — always coerce before math/UI. */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
};

export function WorkshopKpiCards({ kpis, isLoading = false }: WorkshopKpiCardsProps) {
  const safeKpis = {
    totalMaintenanceCost: num(kpis?.totalMaintenanceCost),
    totalBreakdownCost: num(kpis?.totalBreakdownCost),
    vehiclesNeedingService: num(kpis?.vehiclesNeedingService ?? kpis?.inspectionsDue),
    activeMaintenanceJobs: num(kpis?.activeMaintenanceJobs ?? kpis?.pendingMaintenance),
    avgRepairTime: num(kpis?.avgRepairTime),
    inspectionPassRate: num(kpis?.inspectionPassRate),
    fleetHealthScore: num(kpis?.fleetHealthScore),
  };

  const healthScore = safeKpis.fleetHealthScore;

  const cards = [
    {
      title: 'Total Maintenance Cost',
      value: formatCurrency(safeKpis.totalMaintenanceCost),
      subtitle: 'All recorded jobs',
      icon: Wrench,
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
    },
    {
      title: 'Breakdown Cost',
      value: formatCurrency(safeKpis.totalBreakdownCost),
      subtitle: `${safeKpis.activeMaintenanceJobs} active jobs`,
      icon: AlertTriangle,
      iconBg: 'bg-destructive/15',
      iconColor: 'text-destructive',
    },
    {
      title: 'Vehicles Needing Service',
      value: safeKpis.vehiclesNeedingService.toString(),
      subtitle: 'Due for maintenance',
      icon: Truck,
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Avg Repair Time',
      value: `${safeKpis.avgRepairTime.toFixed(1)}h`,
      subtitle: 'Per maintenance job',
      icon: Clock,
      iconBg: 'bg-sky-500/15',
      iconColor: 'text-sky-600',
    },
    {
      title: 'Inspection Pass Rate',
      value: `${safeKpis.inspectionPassRate}%`,
      subtitle: 'Last 90 days',
      icon: CheckCircle,
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Fleet Health Score',
      value: `${healthScore}%`,
      subtitle: 'Overall condition',
      icon: TrendingUp,
      iconBg: healthScore >= 80 ? 'bg-emerald-500/15' : healthScore >= 60 ? 'bg-amber-500/15' : 'bg-destructive/15',
      iconColor: healthScore >= 80 ? 'text-emerald-600' : healthScore >= 60 ? 'text-amber-600' : 'text-destructive',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div key={card.title} className="fleet-card flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${card.iconBg} flex items-center justify-center`}>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{card.title}</p>
            {isLoading ? (
              <div className="h-7 w-24 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <>
                <p className="text-xl font-semibold mt-1">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
