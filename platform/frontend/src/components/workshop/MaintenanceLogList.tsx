/**
 * Maintenance Log List
 * 
 * Displays maintenance jobs with status, cost, and ability to manage.
 */

import { useState } from 'react';
import {
  Wrench,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Truck,
  Calendar,
  MoreHorizontal,
  Filter,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { MaintenanceLog, MaintenanceStatus, MaintenanceType, MaintenancePriority } from '@/types/workshop';
import { format } from 'date-fns';

interface MaintenanceLogListProps {
  logs: MaintenanceLog[];
  onEditLog?: (log: MaintenanceLog) => void;
  onCompleteLog?: (logId: string) => void;
  onDeleteLog?: (logId: string) => void;
}

// Format currency for Uganda
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
};

const getStatusConfig = (status: MaintenanceStatus) => {
  const config: Record<MaintenanceStatus, { icon: typeof Clock; color: string; bgColor: string; label: string }> = {
    'pending': { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Pending' },
    'in-progress': { icon: Wrench, color: 'text-warning', bgColor: 'bg-warning/15', label: 'In Progress' },
    'completed': { icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/15', label: 'Completed' },
    'cancelled': { icon: XCircle, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Cancelled' },
  };
  return config[status];
};

const getPriorityBadge = (priority: MaintenancePriority) => {
  const config: Record<MaintenancePriority, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; className?: string }> = {
    'low': { variant: 'secondary' },
    'medium': { variant: 'default' },
    'high': { variant: 'outline', className: 'border-warning text-warning' },
    'critical': { variant: 'destructive' },
  };
  const { variant, className } = config[priority];
  return <Badge variant={variant} className={`text-xs capitalize ${className || ''}`}>{priority}</Badge>;
};

const getTypeLabel = (type: MaintenanceType): string => {
  const labels: Record<MaintenanceType, string> = {
    'scheduled': 'Scheduled',
    'repair': 'Repair',
    'breakdown': 'Breakdown',
    'preventive': 'Preventive',
  };
  return labels[type];
};

export function MaintenanceLogList({
  logs,
  onEditLog,
  onCompleteLog,
  onDeleteLog,
}: MaintenanceLogListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pendingDelete, setPendingDelete] = useState<MaintenanceLog | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchesType = typeFilter === 'all' || log.maintenanceType === typeFilter;
    return matchesStatus && matchesType;
  });

  // Sort by status (in-progress first, then pending, then completed)
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const order = { 'in-progress': 0, 'pending': 1, 'completed': 2, 'cancelled': 3 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="fleet-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Maintenance Jobs
          </h3>
          <p className="text-sm text-muted-foreground">
            Track repairs, scheduled services, and breakdowns
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="breakdown">Breakdown</SelectItem>
              <SelectItem value="preventive">Preventive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {sortedLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Wrench className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No maintenance jobs found</p>
          </div>
        ) : (
          sortedLogs.map((log) => {
            const statusConfig = getStatusConfig(log.status);
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={log.id}
                className="border rounded-lg p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Status Icon */}
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', statusConfig.bgColor)}>
                    <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium">{log.description}</h4>
                          {getPriorityBadge(log.priority)}
                          <Badge variant="outline" className="text-xs">{getTypeLabel(log.maintenanceType)}</Badge>
                          {log.assetCategory && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {log.assetCategory}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" />
                            {log.vehicleName} ({log.vehiclePlate})
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {log.mechanicName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(log.startDate), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditLog?.(log)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Job
                          </DropdownMenuItem>
                          {log.status !== 'completed' && (
                            <DropdownMenuItem onClick={() => onCompleteLog?.(log.id)}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Mark Complete
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setPendingDelete(log)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Job
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Cost Breakdown */}
                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{log.laborHours}h labor</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Parts:</span>{' '}
                        <span className="font-medium">{formatCurrency(log.partsCost)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Labor:</span>{' '}
                        <span className="font-medium">{formatCurrency(log.laborCost)}</span>
                      </div>
                      <div className="ml-auto">
                        <span className="text-muted-foreground">Total:</span>{' '}
                        <span className="font-semibold text-primary">{formatCurrency(log.totalCost)}</span>
                      </div>
                    </div>

                    {/* Parts Used */}
                    {(log.partsUsed?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(log.partsUsed ?? []).map((part) => (
                          <Badge key={part.id} variant="secondary" className="text-xs">
                            {part.name} x{part.quantity}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete maintenance job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{' '}
              <span className="font-medium">{pendingDelete?.description || 'this job'}</span>
              {pendingDelete?.vehicleName ? ` for ${pendingDelete.vehicleName}` : ''}. This action
              cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDeleteLog?.(pendingDelete.id);
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

