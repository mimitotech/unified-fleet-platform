/**
 * Fleet Maintenance Table
 * 
 * Vehicle-centric view showing maintenance status for each vehicle in the fleet.
 */

import { useState } from 'react';
import {
  Truck,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
  ChevronRight,
  Search,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { VehicleMaintenanceSummary, InspectionStatus } from '@/types/workshop';

interface FleetMaintenanceTableProps {
  vehicles: VehicleMaintenanceSummary[];
  onVehicleClick?: (vehicleId: string) => void;
  isLoading?: boolean;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Format currency for Uganda
const formatCurrency = (amount: unknown) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(num(amount));
};

const getStatusBadge = (status: InspectionStatus | null) => {
  if (!status) return <Badge variant="outline">No Inspection</Badge>;
  
  const config: Record<InspectionStatus, { className: string; label: string }> = {
    'pass': { className: 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10', label: 'Passed' },
    'needs-attention': { className: 'border-amber-500/30 text-amber-700 bg-amber-500/10', label: 'Needs Attention' },
    'fail': { className: 'border-destructive/30 text-destructive bg-destructive/10', label: 'Failed' },
  };

  const { className, label } = config[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
};

const getHealthScoreColor = (score: number) => {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
};

const getHealthScoreProgressColor = (score: number) => {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-warning';
  return 'bg-destructive';
};

export function FleetMaintenanceTable({ 
  vehicles, 
  onVehicleClick,
  isLoading = false 
}: FleetMaintenanceTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('health');

  // Filter and sort vehicles
  const filteredVehicles = vehicles
    .filter((v) => {
      const matchesSearch = 
        v.vehicleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.vehiclePlate.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (statusFilter === 'all') return matchesSearch;
      if (statusFilter === 'needs-service') return matchesSearch && v.pendingMaintenanceCount > 0;
      if (statusFilter === 'healthy') return matchesSearch && v.healthScore >= 80;
      if (statusFilter === 'attention') return matchesSearch && v.healthScore < 80;
      return matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'health': return a.healthScore - b.healthScore; // Worst first
        case 'cost': return b.totalMaintenanceCost - a.totalMaintenanceCost;
        case 'service': return (a.nextServiceDue ?? Infinity) - a.currentMileage - ((b.nextServiceDue ?? Infinity) - b.currentMileage);
        default: return 0;
      }
    });

  return (
    <div className="fleet-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Fleet Maintenance Status
          </h3>
          <p className="text-sm text-muted-foreground">
            Asset-by-asset maintenance overview
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              <SelectItem value="needs-service">Needs Service</SelectItem>
              <SelectItem value="healthy">Healthy (80%+)</SelectItem>
              <SelectItem value="attention">Needs Attention</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health">Health Score</SelectItem>
              <SelectItem value="cost">Total Cost</SelectItem>
              <SelectItem value="service">Service Due</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Asset</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Inspection</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Next Service</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Maintenance Cost</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Issues</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Health</th>
              <th className="text-right py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={7} className="py-4 px-4">
                    <div className="h-10 bg-muted animate-pulse rounded" />
                  </td>
                </tr>
              ))
            ) : filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No assets found matching your criteria
                </td>
              </tr>
            ) : (
              filteredVehicles.map((vehicle) => {
                const serviceDueIn = vehicle.nextServiceDue ? vehicle.nextServiceDue - vehicle.currentMileage : null;
                const isServiceDueSoon = serviceDueIn !== null && serviceDueIn < 5000;

                return (
                  <tr
                    key={vehicle.vehicleId}
                    className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onVehicleClick?.(vehicle.vehicleId)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          <Truck className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{vehicle.vehicleName}</p>
                          <p className="text-xs text-muted-foreground">{vehicle.vehiclePlate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        {getStatusBadge(vehicle.lastInspectionStatus)}
                        {vehicle.lastInspectionDate && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(vehicle.lastInspectionDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {serviceDueIn !== null ? (
                        <div className={cn('flex items-center gap-1.5', isServiceDueSoon && 'text-warning')}>
                          {isServiceDueSoon && <Clock className="w-3.5 h-3.5" />}
                          <span className="text-sm font-medium">
                            {serviceDueIn.toLocaleString()} km
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Current: {num(vehicle.currentMileage).toLocaleString()} km
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium">{formatCurrency(vehicle.totalMaintenanceCost)}</p>
                      <p className="text-xs text-muted-foreground">
                        Avg {num(vehicle.avgRepairTime).toFixed(1)}h/job
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {vehicle.pendingMaintenanceCount > 0 && (
                          <div className="flex items-center gap-1 text-warning">
                            <Wrench className="w-3.5 h-3.5" />
                            <span className="text-sm">{vehicle.pendingMaintenanceCount}</span>
                          </div>
                        )}
                        {vehicle.breakdownCount > 0 && (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-sm">{vehicle.breakdownCount}</span>
                          </div>
                        )}
                        {vehicle.pendingMaintenanceCount === 0 && vehicle.breakdownCount === 0 && (
                          <CheckCircle className="w-4 h-4 text-success" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <Progress
                          value={vehicle.healthScore}
                          className="h-2 flex-1"
                          indicatorClassName={getHealthScoreProgressColor(vehicle.healthScore)}
                        />
                        <span className={cn('text-sm font-medium w-10', getHealthScoreColor(vehicle.healthScore))}>
                          {vehicle.healthScore}%
                        </span>
                      </div>
                    </td>
                    {/* <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </td> */}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

