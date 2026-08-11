/**
 * Breakdown Alerts
 * 
 * Shows recent breakdowns with location, cost, and resolution status.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  MapPin,
  Clock,
  Truck,
  User,
  CheckCircle,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2, Printer,
} from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { printWorkshopReport } from '@/components/workshop/WorkshopPrintReport';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { BreakdownReport, BreakdownSeverity } from '@/types/workshop';
import { formatDistanceToNow } from 'date-fns';

interface BreakdownAlertsProps {
  breakdowns: BreakdownReport[];
  onViewDetails?: (breakdown: BreakdownReport) => void;
  onViewOnMap?: (breakdown: BreakdownReport) => void;
  onEditBreakdown?: (breakdown: BreakdownReport) => void;
  onResolveBreakdown?: (breakdownId: string) => void;
  onDeleteBreakdown?: (breakdownId: string) => void;
}

// Format currency for Uganda
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
};

const getSeverityConfig = (severity: BreakdownSeverity) => {
  const config: Record<BreakdownSeverity, { color: string; bgColor: string; label: string }> = {
    'minor': { color: 'text-warning', bgColor: 'bg-warning/15', label: 'Minor' },
    'major': { color: 'text-orange-500', bgColor: 'bg-orange-500/15', label: 'Major' },
    'critical': { color: 'text-destructive', bgColor: 'bg-destructive/15', label: 'Critical' },
  };
  return config[severity];
};

export function BreakdownAlerts({
  breakdowns,
  onViewOnMap,
  onEditBreakdown,
  onResolveBreakdown,
  onDeleteBreakdown,
}: BreakdownAlertsProps) {
  const branding = useTenantBranding();
  const handlePrint = async (breakdown: BreakdownReport) => {
    try {
      await printWorkshopReport({ kind: 'breakdown', branding, breakdown });
    } catch (e) {
      notify.error('Print failed', e instanceof Error ? e.message : undefined);
    }
  };

  const [pendingDelete, setPendingDelete] = useState<BreakdownReport | null>(null);

  // Sort by most recent first, unresolved first
  const sortedBreakdowns = [...breakdowns].sort((a, b) => {
    // Unresolved first
    if (!a.resolutionTime && b.resolutionTime) return -1;
    if (a.resolutionTime && !b.resolutionTime) return 1;
    // Then by time (newest first)
    return new Date(b.breakdownTime).getTime() - new Date(a.breakdownTime).getTime();
  });

  if (breakdowns.length === 0) {
    return (
      <div className="fleet-card">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h3 className="text-lg font-semibold">Breakdown Reports</h3>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle className="w-12 h-12 mx-auto mb-2 text-success opacity-50" />
          <p>No breakdowns recorded this month</p>
          <p className="text-sm">Your fleet is running smoothly!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Breakdown Reports
          </h3>
          <p className="text-sm text-muted-foreground">
            {breakdowns.filter(b => !b.resolutionTime).length} unresolved breakdowns
          </p>
        </div>
        <Badge variant="destructive" className="text-xs">
          {breakdowns.length} total
        </Badge>
      </div>
      
      <div className="space-y-3">
        {sortedBreakdowns.map((breakdown) => {
          const severityConfig = getSeverityConfig(breakdown.severity);
          const isResolved = !!breakdown.resolutionTime;
          
          return (
            <div 
              key={breakdown.id}
              className={cn(
                'border rounded-lg p-4 transition-colors',
                isResolved ? 'border-border bg-muted/30' : 'border-destructive/30 bg-destructive/5'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Severity Icon */}
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', severityConfig.bgColor)}>
                  <AlertTriangle className={cn('w-5 h-5', severityConfig.color)} />
                </div>
                
                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{breakdown.description}</h4>
                        <Badge
                          variant={isResolved ? 'outline' : 'destructive'}
                          className={isResolved ? 'text-xs border-success text-success' : 'text-xs'}
                        >
                          {isResolved ? 'Resolved' : 'Active'}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {severityConfig.label}
                        </Badge>
                        {breakdown.assetCategory && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {breakdown.assetCategory}
                          </Badge>
                        )}
                        {breakdown.failureSystem && (
                          <Badge variant="secondary" className="text-xs">
                            {breakdown.failureSystem}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5" />
                          {breakdown.vehicleName} ({breakdown.vehiclePlate})
                        </span>
                        {breakdown.driverName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {breakdown.driverName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDistanceToNow(new Date(breakdown.breakdownTime), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePrint(breakdown)}>
                          <Printer className="w-4 h-4 mr-2" />
                          Print report
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditBreakdown?.(breakdown)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {!isResolved && (
                          <DropdownMenuItem onClick={() => onResolveBreakdown?.(breakdown.id)}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark Resolved
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setPendingDelete(breakdown)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  {/* Location & Cost */}
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{breakdown.location?.address || 'Location not specified'}</span>
                      {breakdown.location?.lat ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onViewOnMap?.(breakdown)}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Map
                        </Button>
                      ) : null}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      {breakdown.downtimeHours > 0 && (
                        <span>
                          <span className="text-muted-foreground">Downtime:</span>{' '}
                          <span className="font-medium">{breakdown.downtimeHours}h</span>
                        </span>
                      )}
                      <span>
                        <span className="text-muted-foreground">Cost:</span>{' '}
                        <span className="font-semibold text-destructive">{formatCurrency(breakdown.totalCost)}</span>
                      </span>
                    </div>
                  </div>
                  
                  {/* Resolution */}
                  {breakdown.resolution && (
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">Resolution:</span>{' '}
                      <span>{breakdown.resolution}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete breakdown report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the report for{' '}
              <span className="font-medium">{pendingDelete?.vehicleName}</span>
              {pendingDelete?.description ? `: “${pendingDelete.description}”` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDeleteBreakdown?.(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

