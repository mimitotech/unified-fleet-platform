/**
 * Inspection Timeline — list with view / edit / delete (full CRUD entry points).
 */

import { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle,
  AlertCircle,
  XCircle,
  User,
  Calendar,
  Gauge,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { flattenChecklistSections, sectionsFromLegacy } from '@/lib/workshopChecklists';
import { sanitizeWorkshopAssetCategory } from '@/lib/workshopUnit';
import type { VehicleInspection, InspectionStatus, InspectionType } from '@/types/workshop';
import { format } from 'date-fns';

interface InspectionTimelineProps {
  inspections: VehicleInspection[];
  onViewDetails?: (inspection: VehicleInspection) => void;
  onEdit?: (inspection: VehicleInspection) => void;
  onDelete?: (inspectionId: string) => void;
  maxItems?: number;
  showViewAll?: boolean;
}

const getStatusConfig = (status: InspectionStatus) => {
  const config: Record<
    InspectionStatus,
    { icon: typeof CheckCircle; color: string; bgColor: string; label: string }
  > = {
    pass: { icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/15', label: 'Passed' },
    'needs-attention': {
      icon: AlertCircle,
      color: 'text-warning',
      bgColor: 'bg-warning/15',
      label: 'Needs Attention',
    },
    fail: { icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/15', label: 'Failed' },
  };
  return config[status];
};

const getTypeLabel = (type: InspectionType): string => {
  const labels: Record<InspectionType, string> = {
    'pre-trip': 'Pre-Trip',
    'post-trip': 'Post-Trip',
    'pre-delivery': 'Pre-Delivery',
    scheduled: 'Scheduled',
  };
  return labels[type] || type;
};

function InspectionCard({
  inspection,
  onViewDetails,
  onEdit,
  onRequestDelete,
}: {
  inspection: VehicleInspection;
  onViewDetails?: (inspection: VehicleInspection) => void;
  onEdit?: (inspection: VehicleInspection) => void;
  onRequestDelete?: (inspection: VehicleInspection) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusConfig = getStatusConfig(inspection.overallStatus);
  const StatusIcon = statusConfig.icon;
  const category = sanitizeWorkshopAssetCategory(inspection.assetCategory);

  const issueItems = useMemo(() => {
    const sections =
      inspection.checklistSections && inspection.checklistSections.length > 0
        ? inspection.checklistSections
        : sectionsFromLegacy(
            inspection.truckHeadChecklist,
            inspection.trailerChecklist,
            category,
          );
    return flattenChecklistSections(sections).filter((i) => i.status === 'issue');
  }, [inspection, category]);

  const issueCount = issueItems.length;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={cn(
          'border rounded-lg p-4 transition-all',
          isExpanded ? 'border-primary/50 bg-muted/30' : 'border-border hover:border-primary/30',
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              statusConfig.bgColor,
            )}
          >
            <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium">{inspection.vehicleName}</h4>
                  {inspection.vehiclePlate ? (
                    <Badge variant="outline" className="text-xs">
                      {inspection.vehiclePlate}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="text-xs">
                    {getTypeLabel(inspection.inspectionType)}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {category}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(inspection.inspectionDate), 'MMM d, h:mm a')}
                  </span>
                  {inspection.driverName && (
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {inspection.driverName}
                    </span>
                  )}
                  {category === 'vehicle' && inspection.odometerReading > 0 && (
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5" />
                      {Number(inspection.odometerReading).toLocaleString()} km
                    </span>
                  )}
                  {category !== 'vehicle' && Number(inspection.engineHours ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {Number(inspection.engineHours).toLocaleString()} h
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {issueCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs border-amber-500/30 text-amber-700 bg-amber-500/10"
                  >
                    {issueCount} issue{issueCount > 1 ? 's' : ''}
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewDetails?.(inspection)}>
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit?.(inspection)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onRequestDelete?.(inspection)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-4 pt-4 border-t border-border">
            {issueCount > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium text-warning">Issues Found:</p>
                <ul className="space-y-1">
                  {issueItems.map((item) => (
                    <li key={item.id} className="text-sm text-muted-foreground flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
                      <span>
                        <span className="font-medium">{item.name}</span>
                        {item.comment && (
                          <span className="text-muted-foreground"> — {item.comment}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {inspection.notes && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-1">Notes:</p>
                <p className="text-sm text-muted-foreground">{inspection.notes}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Inspector: {inspection.inspectorName || 'Not specified'}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onViewDetails?.(inspection)}>
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  View Full Report
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEdit?.(inspection)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function InspectionTimeline({
  inspections,
  onViewDetails,
  onEdit,
  onDelete,
  maxItems = 5,
  showViewAll = true,
}: InspectionTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<VehicleInspection | null>(null);

  const displayedInspections = showAll ? inspections : inspections.slice(0, maxItems);
  const hasMore = inspections.length > maxItems;

  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            Recent Inspections
          </h3>
          <p className="text-sm text-muted-foreground">
            Pre-use, trip, and scheduled inspections across the fleet
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {displayedInspections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No inspections recorded yet</p>
          </div>
        ) : (
          displayedInspections.map((inspection) => (
            <InspectionCard
              key={inspection.id}
              inspection={inspection}
              onViewDetails={onViewDetails}
              onEdit={onEdit}
              onRequestDelete={setPendingDelete}
            />
          ))
        )}
      </div>

      {showViewAll && hasMore && (
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => setShowAll(!showAll)} className="text-sm">
            {showAll ? 'Show Less' : `View All ${inspections.length} Inspections`}
          </Button>
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the inspection for{' '}
              <span className="font-medium">{pendingDelete?.vehicleName}</span>
              {pendingDelete?.vehiclePlate ? ` (${pendingDelete.vehiclePlate})` : ''}. You can
              recreate it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete?.(pendingDelete.id);
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
