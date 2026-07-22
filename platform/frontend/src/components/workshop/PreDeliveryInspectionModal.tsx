/**
 * PreDeliveryInspectionModal - Truck Pre-Delivery Inspection Form
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ClipboardCheck, Truck, User, Gauge, Check, X,
  AlertCircle, Loader2, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { cn } from '@/lib/utils';
import { isStationaryUnit } from '@/lib/workshopUnit';
import type { FleetUnit } from '@/lib/fleetUnits';
import type { InspectionType, ChecklistItem, ChecklistItemStatus } from '@/types/workshop';

const TRUCK_HEAD_CHECKLIST_ITEMS: Omit<ChecklistItem, 'id' | 'status' | 'comment'>[] = [
  { name: 'Engine Compartment', category: 'truck-head' },
  { name: 'Radiator Level', category: 'truck-head' },
  { name: 'Brake Fluid Level', category: 'truck-head' },
  { name: 'Power Steering Fluid Level', category: 'truck-head' },
  { name: 'Tyres and Wheels', category: 'truck-head' },
  { name: 'Tyre Tread Depth (including spares)', category: 'truck-head' },
  { name: 'Tyre Pressure', category: 'truck-head' },
  { name: 'Tyres: Check for visible damage or punctures', category: 'truck-head' },
  { name: 'Hoist Operation', category: 'truck-head' },
  { name: 'Headlamps (high and low beams)', category: 'truck-head' },
  { name: 'Brake Lights (front and rear indicators)', category: 'truck-head' },
  { name: 'Reverse Lights', category: 'truck-head' },
  { name: 'Reflectors (supplied)', category: 'truck-head' },
  { name: 'Chassis: Check for visible damage or corrosion', category: 'truck-head' },
  { name: 'T-Back Visuals', category: 'truck-head' },
  { name: 'Brake Pads and Discs/Drums', category: 'truck-head' },
  { name: 'Suspension System', category: 'truck-head' },
  { name: 'Shock Absorbers: check for wear, damage, or leaks', category: 'truck-head' },
  { name: 'Test Steering for smooth operation', category: 'truck-head' },
  { name: 'Transmission Fluid Level (if applicable)', category: 'truck-head' },
  { name: 'Differential Oil Level (if applicable)', category: 'truck-head' },
];

const TRAILER_CHECKLIST_ITEMS: Omit<ChecklistItem, 'id' | 'status' | 'comment'>[] = [
  { name: 'Body and Structure: Check for visible damage or leaks', category: 'trailer' },
  { name: 'Ensure hose connections are secure', category: 'trailer' },
  { name: 'Verify additional equipment is properly stowed and secured', category: 'trailer' },
  { name: 'Fifth Wheel greased and in good condition', category: 'trailer' },
  { name: 'Safety chains properly attached and not dragging', category: 'trailer' },
  { name: 'All side lights (brake lights, turn signals, reflectors)', category: 'trailer' },
  { name: 'Electrical connector secure', category: 'trailer' },
  { name: 'Trailer Tyre Tread Depth (including spare)', category: 'trailer' },
  { name: 'Check for cracked wheels', category: 'trailer' },
  { name: 'Inspect tyres for visible damage or punctures', category: 'trailer' },
  { name: 'Brake system proper operation', category: 'trailer' },
  { name: 'Air/electrical lines', category: 'trailer' },
  { name: 'Trailer frame for damage or corrosion', category: 'trailer' },
  { name: 'Fire Extinguisher', category: 'safety' },
  { name: 'First Aid Kits', category: 'safety' },
  { name: 'Wheel Chocks', category: 'safety' },
  { name: 'Suspension', category: 'trailer' },
  { name: 'Cabin clean (inside and outside)', category: 'general' },
  { name: 'Truck clean', category: 'general' },
];

export interface InspectionFormData {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  driverId: string | null;
  driverName: string;
  inspectionType: InspectionType;
  odometerReading: number;
  nextServiceMileage: number;
  truckHeadChecklist: ChecklistItem[];
  trailerChecklist: ChecklistItem[];
  notes: string;
  inspectorName: string;
  /** Selected fleet unit for assetId / vehicleId mapping */
  unit?: FleetUnit | null;
}

interface DriverOption {
  id: string;
  name: string;
}

export interface PreDeliveryInspectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: InspectionFormData) => Promise<void> | void;
  drivers?: DriverOption[];
  isLoading?: boolean;
  defaultVehicleId?: string;
  editData?: {
    vehicleId: string;
    vehicleName: string;
    vehiclePlate: string;
    driverId: string | null;
    driverName: string | null;
    inspectionType: InspectionType;
    odometerReading: number;
    nextServiceMileage?: number;
    truckHeadChecklist: ChecklistItem[];
    trailerChecklist: ChecklistItem[];
    notes?: string;
    inspectorName?: string;
  } | null;
}

interface ChecklistRowProps {
  item: ChecklistItem;
  onChange: (status: ChecklistItemStatus, comment?: string) => void;
  disabled?: boolean;
}

function ChecklistRow({ item, onChange, disabled }: ChecklistRowProps) {
  const [showComment, setShowComment] = useState(!!item.comment);

  return (
    <div className="py-2 border-b last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm flex-1">{item.name}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={item.status === 'ok' ? 'default' : 'outline'}
            className={cn('h-8 w-8 p-0', item.status === 'ok' && 'bg-emerald-600 hover:bg-emerald-600/90')}
            onClick={() => onChange('ok', item.comment)}
            disabled={disabled}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.status === 'issue' ? 'default' : 'outline'}
            className={cn('h-8 w-8 p-0', item.status === 'issue' && 'bg-destructive hover:bg-destructive/90')}
            onClick={() => {
              onChange('issue', item.comment);
              setShowComment(true);
            }}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setShowComment(!showComment)}
            disabled={disabled}
          >
            <MessageSquare className={cn('h-4 w-4', item.comment && 'text-primary')} />
          </Button>
        </div>
      </div>
      {showComment && (
        <Input
          placeholder="Add comment..."
          value={item.comment || ''}
          onChange={(e) => onChange(item.status, e.target.value)}
          className="mt-2 text-sm"
          disabled={disabled}
        />
      )}
    </div>
  );
}

function createInitialChecklist(
  items: Omit<ChecklistItem, 'id' | 'status' | 'comment'>[]
): ChecklistItem[] {
  return items.map((item, index) => ({
    ...item,
    id: `${item.category}-${index}`,
    status: 'na' as ChecklistItemStatus,
    comment: undefined,
  }));
}

export function PreDeliveryInspectionModal({
  open,
  onOpenChange,
  onSave,
  drivers = [],
  defaultVehicleId,
  editData,
}: PreDeliveryInspectionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [truckHeadOpen, setTruckHeadOpen] = useState(true);
  const [trailerOpen, setTrailerOpen] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { units } = useFleetUnits();
  const isEditMode = !!editData;

  const [formData, setFormData] = useState<InspectionFormData>(() => ({
    vehicleId: defaultVehicleId || '',
    vehicleName: '',
    vehiclePlate: '',
    driverId: null,
    driverName: '',
    inspectionType: 'pre-delivery',
    odometerReading: 0,
    nextServiceMileage: 0,
    truckHeadChecklist: createInitialChecklist(TRUCK_HEAD_CHECKLIST_ITEMS),
    trailerChecklist: createInitialChecklist(TRAILER_CHECKLIST_ITEMS),
    notes: '',
    inspectorName: '',
  }));

  const matchedUnit = useMemo(() => {
    if (selectedUnit) return selectedUnit;
    const id = formData.vehicleId;
    if (!id) return null;
    return units.find((u) => u.id === id || String(u.wialonId) === id) || null;
  }, [selectedUnit, formData.vehicleId, units]);
  const stationary = isStationaryUnit(matchedUnit);
  useEffect(() => {
    if (open && !isInitialized) {
      if (editData) {
        setFormData({
          vehicleId: editData.vehicleId,
          vehicleName: editData.vehicleName,
          vehiclePlate: editData.vehiclePlate,
          driverId: editData.driverId,
          driverName: editData.driverName || '',
          inspectionType: editData.inspectionType,
          odometerReading: editData.odometerReading,
          nextServiceMileage: editData.nextServiceMileage || 0,
          truckHeadChecklist: editData.truckHeadChecklist?.length
            ? editData.truckHeadChecklist
            : createInitialChecklist(TRUCK_HEAD_CHECKLIST_ITEMS),
          trailerChecklist: editData.trailerChecklist?.length
            ? editData.trailerChecklist
            : createInitialChecklist(TRAILER_CHECKLIST_ITEMS),
          notes: editData.notes || '',
          inspectorName: editData.inspectorName || '',
        });
        setSelectedUnit(null);
      } else {
        setFormData({
          vehicleId: defaultVehicleId || '',
          vehicleName: '',
          vehiclePlate: '',
          driverId: null,
          driverName: '',
          inspectionType: 'pre-delivery',
          odometerReading: 0,
          nextServiceMileage: 0,
          truckHeadChecklist: createInitialChecklist(TRUCK_HEAD_CHECKLIST_ITEMS),
          trailerChecklist: createInitialChecklist(TRAILER_CHECKLIST_ITEMS),
          notes: '',
          inspectorName: '',
        });
        setSelectedUnit(null);
      }
      setIsInitialized(true);
    } else if (!open) {
      setIsInitialized(false);
    }
  }, [open, isInitialized, editData, defaultVehicleId]);

  const handleClose = useCallback(() => {
    if (!isSubmitting) onOpenChange(false);
  }, [onOpenChange, isSubmitting]);

  const handleUnitChange = (unitId: string, unit: FleetUnit) => {
    setSelectedUnit(unit);
    setFormData((prev) => ({
      ...prev,
      vehicleId: unitId,
      vehicleName: unit.name,
      vehiclePlate: unit.plate || '',
      unit,
    }));
  };

  const handleDriverChange = (driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    setFormData((prev) => ({
      ...prev,
      driverId: driverId || null,
      driverName: driver?.name || '',
    }));
  };

  const updateTruckHeadItem = (index: number, status: ChecklistItemStatus, comment?: string) => {
    setFormData((prev) => ({
      ...prev,
      truckHeadChecklist: prev.truckHeadChecklist.map((item, i) =>
        i === index ? { ...item, status, comment } : item
      ),
    }));
  };

  const updateTrailerItem = (index: number, status: ChecklistItemStatus, comment?: string) => {
    setFormData((prev) => ({
      ...prev,
      trailerChecklist: prev.trailerChecklist.map((item, i) =>
        i === index ? { ...item, status, comment } : item
      ),
    }));
  };

  const truckHeadStats = useMemo(() => {
    const completed = formData.truckHeadChecklist.filter((i) => i.status !== 'na').length;
    const issues = formData.truckHeadChecklist.filter((i) => i.status === 'issue').length;
    return { completed, total: formData.truckHeadChecklist.length, issues };
  }, [formData.truckHeadChecklist]);

  const trailerStats = useMemo(() => {
    const completed = formData.trailerChecklist.filter((i) => i.status !== 'na').length;
    const issues = formData.trailerChecklist.filter((i) => i.status === 'issue').length;
    return { completed, total: formData.trailerChecklist.length, issues };
  }, [formData.trailerChecklist]);

  const isFormValid = useMemo(() => {
    return (
      Boolean(formData.vehicleId || formData.vehicleName) &&
      formData.inspectorName.trim() !== '' &&
      (stationary || formData.odometerReading > 0 || isEditMode)
    );
  }, [formData, stationary, isEditMode]);

  const handleSave = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      await onSave({ ...formData, unit: selectedUnit ?? matchedUnit });
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {isEditMode ? 'Edit Inspection' : 'Pre-Delivery Inspection'}
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? 'Update the inspection details and checklist'
                  : 'Complete the vehicle inspection checklist before delivery'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle *</Label>
                <FleetUnitSelect
                  value={selectedUnit?.id || (isEditMode ? undefined : formData.vehicleId) || undefined}
                  onValueChange={handleUnitChange}
                />
                {isEditMode && !selectedUnit && formData.vehicleName && (
                  <p className="text-xs text-muted-foreground">
                    Current: {formData.vehicleName}
                    {formData.vehiclePlate ? ` · ${formData.vehiclePlate}` : ''}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver">Driver</Label>
                <Select
                  value={formData.driverId || ''}
                  onValueChange={handleDriverChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="driver">
                    <SelectValue placeholder="Select driver (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inspectionType">Inspection Type</Label>
                <Select
                  value={formData.inspectionType}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, inspectionType: v as InspectionType }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="inspectionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre-delivery">Pre-Delivery</SelectItem>
                    <SelectItem value="pre-trip">Pre-Trip</SelectItem>
                    <SelectItem value="post-trip">Post-Trip</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inspector">Inspector Name *</Label>
                <div className="relative">
                  <Input
                    id="inspector"
                    placeholder="Enter inspector name"
                    value={formData.inspectorName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, inspectorName: e.target.value }))}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {!stationary && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="odometer">Odometer Reading (km) *</Label>
                    <div className="relative">
                      <Input
                        id="odometer"
                        type="number"
                        placeholder="e.g., 145320"
                        value={formData.odometerReading || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            odometerReading: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="pl-9"
                        disabled={isSubmitting}
                      />
                      <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nextService">Next Service Mileage (km)</Label>
                    <Input
                      id="nextService"
                      type="number"
                      placeholder="e.g., 150000"
                      value={formData.nextServiceMileage || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          nextServiceMileage: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}
            </div>

            <Collapsible open={truckHeadOpen} onOpenChange={setTruckHeadOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-4 h-auto border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Truck className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <div className="font-medium">Truck Head Checklist</div>
                      <div className="text-xs text-muted-foreground">
                        {truckHeadStats.completed}/{truckHeadStats.total} completed
                        {truckHeadStats.issues > 0 && (
                          <span className="text-destructive ml-2">• {truckHeadStats.issues} issues</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {truckHeadOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border border-t-0 rounded-b-lg px-4">
                {formData.truckHeadChecklist.map((item, index) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    onChange={(status, comment) => updateTruckHeadItem(index, status, comment)}
                    disabled={isSubmitting}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={trailerOpen} onOpenChange={setTrailerOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-4 h-auto border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Truck className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <div className="font-medium">Trailer & Safety Checklist</div>
                      <div className="text-xs text-muted-foreground">
                        {trailerStats.completed}/{trailerStats.total} completed
                        {trailerStats.issues > 0 && (
                          <span className="text-destructive ml-2">• {trailerStats.issues} issues</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {trailerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border border-t-0 rounded-b-lg px-4">
                {formData.trailerChecklist.map((item, index) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    onChange={(status, comment) => updateTrailerItem(index, status, comment)}
                    disabled={isSubmitting}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional observations or comments..."
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {truckHeadStats.issues + trailerStats.issues > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {truckHeadStats.issues + trailerStats.issues} issues found
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting || !isFormValid}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isEditMode ? (
                  'Update Inspection'
                ) : (
                  'Save Inspection'
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
