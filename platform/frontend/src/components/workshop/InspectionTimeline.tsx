/**
 * Inspection Timeline
 * 
 * Shows recent inspections with status and ability to view details.
 */

import { useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle,
  AlertCircle,
  XCircle,
  User,
  Truck,
  Calendar,
  Gauge,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { VehicleInspection, InspectionStatus, InspectionType } from '@/types/workshop';
import { format } from 'date-fns';

interface InspectionTimelineProps {
  inspections: VehicleInspection[];
  onViewDetails?: (inspection: VehicleInspection) => void;
  maxItems?: number;
  showViewAll?: boolean;
}

const getStatusConfig = (status: InspectionStatus) => {
  const config: Record<InspectionStatus, { icon: typeof CheckCircle; color: string; bgColor: string; label: string }> = {
    'pass': { icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/15', label: 'Passed' },
    'needs-attention': { icon: AlertCircle, color: 'text-warning', bgColor: 'bg-warning/15', label: 'Needs Attention' },
    'fail': { icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/15', label: 'Failed' },
  };
  return config[status];
};

const getTypeLabel = (type: InspectionType): string => {
  const labels: Record<InspectionType, string> = {
    'pre-trip': 'Pre-Trip',
    'post-trip': 'Post-Trip',
    'pre-delivery': 'Pre-Delivery',
    'scheduled': 'Scheduled',
  };
  return labels[type];
};

function InspectionCard({ 
  inspection, 
  onViewDetails 
}: { 
  inspection: VehicleInspection; 
  onViewDetails?: (inspection: VehicleInspection) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusConfig = getStatusConfig(inspection.overallStatus);
  const StatusIcon = statusConfig.icon;
  
  const truckHead = inspection.truckHeadChecklist ?? [];
  const trailer = inspection.trailerChecklist ?? [];
  const issueCount = [
    ...truckHead.filter(i => i.status === 'issue'),
    ...trailer.filter(i => i.status === 'issue'),
  ].length;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn(
        'border rounded-lg p-4 transition-all',
        isExpanded ? 'border-primary/50 bg-muted/30' : 'border-border hover:border-primary/30'
      )}>
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
                  <h4 className="font-medium">{inspection.vehicleName}</h4>
                  <Badge variant="outline" className="text-xs">{inspection.vehiclePlate}</Badge>
                  <Badge variant="secondary" className="text-xs">{getTypeLabel(inspection.inspectionType)}</Badge>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
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
                  {inspection.odometerReading > 0 && (
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5" />
                      {Number(inspection.odometerReading).toLocaleString()} km
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {issueCount > 0 && (
                  <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-700 bg-amber-500/10">
                    {issueCount} issue{issueCount > 1 ? 's' : ''}
                  </Badge>
                )}
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
            {/* Issues Summary */}
            {issueCount > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium text-warning">Issues Found:</p>
                <ul className="space-y-1">
                  {[...truckHead, ...trailer]
                    .filter(i => i.status === 'issue')
                    .map((item) => (
                      <li key={item.id} className="text-sm text-muted-foreground flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
                        <span>
                          <span className="font-medium">{item.name}</span>
                          {item.comment && <span className="text-muted-foreground"> — {item.comment}</span>}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            
            {/* Notes */}
            {inspection.notes && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-1">Notes:</p>
                <p className="text-sm text-muted-foreground">{inspection.notes}</p>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Inspector: {inspection.inspectorName || 'Not specified'}
              </p>
              <Button variant="outline" size="sm" onClick={() => onViewDetails?.(inspection)}>
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                View Full Report
              </Button>
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
  maxItems = 5,
  showViewAll = true,
}: InspectionTimelineProps) {
  const [showAll, setShowAll] = useState(false);

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
            Pre-trip, post-trip, and delivery inspections
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
            />
          ))
        )}
      </div>

      {showViewAll && hasMore && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            onClick={() => setShowAll(!showAll)}
            className="text-sm"
          >
            {showAll ? 'Show Less' : `View All ${inspections.length} Inspections`}
          </Button>
        </div>
      )}
    </div>
  );
}

