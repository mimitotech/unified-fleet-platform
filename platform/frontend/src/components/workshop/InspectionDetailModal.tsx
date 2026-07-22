/**
 * InspectionDetailModal - View Inspection Details
 */

import {
  ClipboardCheck, Truck, User, Gauge, Calendar, Check, X,
  ChevronDown, ChevronUp, MessageSquare, Pencil, Trash2,
} from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { VehicleInspection, ChecklistItem, InspectionStatus } from '@/types/workshop';

export interface InspectionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: VehicleInspection | null;
  onEdit?: (inspection: VehicleInspection) => void;
  onDelete?: (inspectionId: string) => void;
}

function StatusBadge({ status }: { status: InspectionStatus }) {
  const config = {
    pass: { label: 'Pass', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
    fail: { label: 'Fail', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    'needs-attention': { label: 'Needs Attention', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  };
  const { label, className } = config[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="py-2 border-b last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm flex-1">{item.name}</span>
        <div className="flex items-center gap-2">
          {item.status === 'ok' && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
              <Check className="h-3 w-3 mr-1" />
              OK
            </Badge>
          )}
          {item.status === 'issue' && (
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
              <X className="h-3 w-3 mr-1" />
              Issue
            </Badge>
          )}
          {item.status === 'na' && (
            <Badge variant="outline" className="text-muted-foreground">N/A</Badge>
          )}
        </div>
      </div>
      {item.comment && (
        <div className="mt-1 text-sm text-muted-foreground flex items-start gap-1">
          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
          {item.comment}
        </div>
      )}
    </div>
  );
}

export function InspectionDetailModal({
  open,
  onOpenChange,
  inspection,
  onEdit,
  onDelete,
}: InspectionDetailModalProps) {
  const [truckHeadOpen, setTruckHeadOpen] = useState(true);
  const [trailerOpen, setTrailerOpen] = useState(true);

  if (!inspection) return null;

  const truckHead = inspection.truckHeadChecklist ?? [];
  const trailer = inspection.trailerChecklist ?? [];
  const truckHeadIssues = truckHead.filter((i) => i.status === 'issue').length;
  const trailerIssues = trailer.filter((i) => i.status === 'issue').length;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClipboardCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">Inspection Details</DialogTitle>
                <DialogDescription>
                  {inspection.vehicleName} • {inspection.vehiclePlate}
                </DialogDescription>
              </div>
            </div>
            <StatusBadge status={inspection.overallStatus} />
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Date
                </div>
                <div className="text-sm font-medium">{formatDate(inspection.inspectionDate)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <ClipboardCheck className="h-3 w-3" /> Type
                </div>
                <div className="text-sm font-medium capitalize">
                  {inspection.inspectionType.replace('-', ' ')}
                </div>
              </div>
              {inspection.odometerReading > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> Odometer
                  </div>
                  <div className="text-sm font-medium">
                    {Number(inspection.odometerReading).toLocaleString()} km
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Inspector
                </div>
                <div className="text-sm font-medium">{inspection.inspectorName || 'N/A'}</div>
              </div>
            </div>

            {inspection.driverName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Driver:</span>
                <span className="font-medium">{inspection.driverName}</span>
              </div>
            )}

            {inspection.nextServiceMileage ? (
              <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg p-3">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Next Service Due:</span>
                <span className="font-medium">
                  {Number(inspection.nextServiceMileage).toLocaleString()} km
                </span>
              </div>
            ) : null}

            {truckHead.length > 0 && (
              <Collapsible open={truckHeadOpen} onOpenChange={setTruckHeadOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium">Truck Head Checklist</div>
                        <div className="text-xs text-muted-foreground">
                          {truckHead.length} items
                          {truckHeadIssues > 0 && (
                            <span className="text-destructive ml-2">• {truckHeadIssues} issues</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {truckHeadOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border border-t-0 rounded-b-lg px-4">
                  {truckHead.map((item) => (
                    <ChecklistItemRow key={item.id} item={item} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {trailer.length > 0 && (
              <Collapsible open={trailerOpen} onOpenChange={setTrailerOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium">Trailer & Safety Checklist</div>
                        <div className="text-xs text-muted-foreground">
                          {trailer.length} items
                          {trailerIssues > 0 && (
                            <span className="text-destructive ml-2">• {trailerIssues} issues</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {trailerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border border-t-0 rounded-b-lg px-4">
                  {trailer.map((item) => (
                    <ChecklistItemRow key={item.id} item={item} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {inspection.notes && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Notes</div>
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  {inspection.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-muted/20 flex justify-between">
          <div className="flex gap-2">
            {onEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(inspection);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Inspection</AlertDialogTitle>
                    <AlertDialogDescription>
                      Delete this inspection for {inspection.vehicleName}? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(inspection.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
