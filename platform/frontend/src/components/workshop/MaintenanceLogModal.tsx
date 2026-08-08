/**
 * MaintenanceLogModal - Add/Edit Maintenance Log Entry
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Wrench, User, Calendar, Clock, Plus, Trash2,
  Loader2, Package, Gauge, Route,
} from 'lucide-react';
import { UgxPrefix } from '@/components/shared/UgxAffix';
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
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { Badge } from '@/components/ui/badge';
import {
  isStationaryUnit,
  resolveWorkshopAssetCategory,
  workshopAssetLabel,
  workshopOperatorLabel,
  workshopMeterLabel,
} from '@/lib/workshopUnit';
import type { FleetUnit } from '@/lib/fleetUnits';
import type {
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenancePart,
  WorkshopAssetCategory,
} from '@/types/workshop';

export interface MaintenanceLogFormData {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  assetCategory: WorkshopAssetCategory;
  driverId: string | null;
  driverName: string;
  inspectionId?: string;
  breakdownId?: string;
  maintenanceType: MaintenanceType;
  priority: MaintenancePriority;
  description: string;
  mechanicName: string;
  startDate: string;
  endDate?: string;
  laborHours: number;
  laborCost: number;
  partsCost: number;
  totalCost: number;
  partsUsed: MaintenancePart[];
  status: MaintenanceStatus;
  notes: string;
  odometerReading?: number;
  engineHours?: number;
  nextServiceKm?: number;
  nextServiceHours?: number;
  nextServiceDays?: number;
  unit?: FleetUnit | null;
}

interface DriverOption {
  id: string;
  name: string;
}

export interface MaintenanceLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: MaintenanceLogFormData) => Promise<void> | void;
  drivers?: DriverOption[];
  defaultVehicleId?: string;
  linkedInspectionId?: string;
  linkedBreakdownId?: string;
  editData?: MaintenanceLogFormData | null;
}

interface PartRowProps {
  part: MaintenancePart;
  onChange: (part: MaintenancePart) => void;
  onRemove: () => void;
  disabled?: boolean;
}

function PartRow({ part, onChange, onRemove, disabled }: PartRowProps) {
  const handleQuantityChange = (quantity: number) => {
    onChange({ ...part, quantity, totalCost: quantity * part.unitCost });
  };
  const handleUnitCostChange = (unitCost: number) => {
    onChange({ ...part, unitCost, totalCost: part.quantity * unitCost });
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b last:border-b-0">
      <div className="col-span-4">
        <Input
          placeholder="Part name"
          value={part.name}
          onChange={(e) => onChange({ ...part, name: e.target.value })}
          disabled={disabled}
          className="text-sm"
        />
      </div>
      <div className="col-span-2">
        <Input
          placeholder="Part #"
          value={part.partNumber || ''}
          onChange={(e) => onChange({ ...part, partNumber: e.target.value })}
          disabled={disabled}
          className="text-sm"
        />
      </div>
      <div className="col-span-1">
        <Input
          type="number"
          min={1}
          value={part.quantity}
          onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10) || 1)}
          disabled={disabled}
          className="text-sm"
        />
      </div>
      <div className="col-span-2 relative">
        <Input
          type="number"
          min={0}
          value={part.unitCost}
          onChange={(e) => handleUnitCostChange(parseInt(e.target.value, 10) || 0)}
          disabled={disabled}
          className="text-sm pl-10"
        />
        <UgxPrefix className="left-2 text-[10px]" />
      </div>
      <div className="col-span-2 text-right text-sm font-medium">
        {part.totalCost.toLocaleString()} UGX
      </div>
      <div className="col-span-1 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled}
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const initialFormState: MaintenanceLogFormData = {
  vehicleId: '',
  vehicleName: '',
  vehiclePlate: '',
  assetCategory: 'vehicle',
  driverId: null,
  driverName: '',
  maintenanceType: 'repair',
  priority: 'medium',
  description: '',
  mechanicName: '',
  startDate: new Date().toISOString().split('T')[0],
  laborHours: 0,
  laborCost: 0,
  partsCost: 0,
  totalCost: 0,
  partsUsed: [],
  status: 'pending',
  notes: '',
  odometerReading: undefined,
  engineHours: undefined,
  nextServiceKm: undefined,
  nextServiceHours: undefined,
  nextServiceDays: undefined,
};

export function MaintenanceLogModal({
  open,
  onOpenChange,
  onSave,
  drivers = [],
  defaultVehicleId,
  linkedInspectionId,
  linkedBreakdownId,
  editData,
}: MaintenanceLogModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<MaintenanceLogFormData>(initialFormState);
  const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { units } = useFleetUnits();
  const isEditMode = !!editData;

  useEffect(() => {
    if (open && !isInitialized) {
      if (editData) {
        setFormData({ ...editData, partsUsed: editData.partsUsed ?? [] });
        setSelectedUnit(null);
      } else {
        setFormData({
          ...initialFormState,
          vehicleId: defaultVehicleId || '',
          inspectionId: linkedInspectionId,
          breakdownId: linkedBreakdownId,
          maintenanceType: linkedBreakdownId ? 'breakdown' : 'repair',
          startDate: new Date().toISOString().split('T')[0],
        });
        setSelectedUnit(null);
      }
      setIsInitialized(true);
    } else if (!open) {
      setIsInitialized(false);
    }
  }, [open, isInitialized, editData, defaultVehicleId, linkedInspectionId, linkedBreakdownId]);

  const matchedUnit = useMemo(() => {
    if (selectedUnit) return selectedUnit;
    const id = formData.vehicleId;
    if (!id) return null;
    return units.find((u) => u.id === id || String(u.wialonId) === id) || null;
  }, [selectedUnit, formData.vehicleId, units]);
  const assetCategory = resolveWorkshopAssetCategory(matchedUnit, formData.assetCategory);
  const stationary = isStationaryUnit(matchedUnit) || assetCategory !== 'vehicle';
  const assetLabel = workshopAssetLabel(assetCategory, { hasSelection: Boolean(matchedUnit) });
  const operatorLabel = workshopOperatorLabel(assetCategory);
  const handleClose = useCallback(() => {
    if (!isSubmitting) onOpenChange(false);
  }, [onOpenChange, isSubmitting]);

  const handleUnitChange = (unitId: string, unit: FleetUnit) => {
    setSelectedUnit(unit);
    const category = resolveWorkshopAssetCategory(unit);
    setFormData((prev) => ({
      ...prev,
      vehicleId: unitId,
      vehicleName: unit.name,
      vehiclePlate: unit.plate || '',
      assetCategory: category,
      unit,
    }));
  };

  const handleDriverChange = (driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    setFormData((prev) => ({
      ...prev,
      driverId,
      driverName: driver?.name || '',
    }));
  };

  useEffect(() => {
    const partsCost = formData.partsUsed.reduce((sum, p) => sum + p.totalCost, 0);
    const totalCost = partsCost + formData.laborCost;
    setFormData((prev) => ({ ...prev, partsCost, totalCost }));
  }, [formData.partsUsed, formData.laborCost]);

  const addPart = () => {
    const newPart: MaintenancePart = {
      id: `part-${Date.now()}`,
      name: '',
      partNumber: '',
      quantity: 1,
      unitCost: 0,
      totalCost: 0,
    };
    setFormData((prev) => ({ ...prev, partsUsed: [...prev.partsUsed, newPart] }));
  };

  const updatePart = (index: number, part: MaintenancePart) => {
    setFormData((prev) => ({
      ...prev,
      partsUsed: prev.partsUsed.map((p, i) => (i === index ? part : p)),
    }));
  };

  const removePart = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      partsUsed: prev.partsUsed.filter((_, i) => i !== index),
    }));
  };

  const isFormValid = useMemo(() => {
    return (
      Boolean(formData.vehicleId || formData.vehicleName) &&
      formData.description.trim() !== '' &&
      formData.mechanicName.trim() !== ''
    );
  }, [formData]);

  const handleSave = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        assetCategory,
        unit: selectedUnit ?? matchedUnit,
      });
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
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {isEditMode
                  ? 'Edit Maintenance Log'
                  : linkedBreakdownId
                    ? 'Log Breakdown Repair'
                    : 'Add Maintenance Log'}
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? `Update ${assetLabel.toLowerCase()} maintenance details, parts, and costs`
                  : `Record ${assetLabel.toLowerCase()} maintenance work, parts used, and costs`}
              </DialogDescription>
            </div>
            <Badge variant="outline" className="capitalize shrink-0 ml-auto">
              {assetCategory}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Asset *</Label>
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
                <Label htmlFor="driver">{operatorLabel}</Label>
                <Select
                  value={formData.driverId || ''}
                  onValueChange={handleDriverChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="driver">
                    <SelectValue placeholder={`Select ${operatorLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mechanic">Mechanic *</Label>
                <div className="relative">
                  <Input
                    id="mechanic"
                    placeholder="Enter mechanic name"
                    value={formData.mechanicName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mechanicName: e.target.value }))}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenanceType">Maintenance Type</Label>
                <Select
                  value={formData.maintenanceType}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, maintenanceType: v as MaintenanceType }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="maintenanceType"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled Service</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="breakdown">Breakdown Repair</SelectItem>
                    <SelectItem value="preventive">Preventive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, priority: v as MaintenancePriority }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, status: v as MaintenanceStatus }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <div className="relative">
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            {formData.maintenanceType === 'scheduled' && (
              <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Route className="h-4 w-4" />
                  Scheduled Service Details
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!stationary && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="odometerReading">{workshopMeterLabel('vehicle')}</Label>
                        <div className="relative">
                          <Input
                            id="odometerReading"
                            type="number"
                            min={0}
                            placeholder="e.g., 145320"
                            value={formData.odometerReading || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                odometerReading: parseInt(e.target.value, 10) || undefined,
                              }))
                            }
                            className="pl-9"
                            disabled={isSubmitting}
                          />
                          <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nextServiceKm">Next Service (km)</Label>
                        <div className="relative">
                          <Input
                            id="nextServiceKm"
                            type="number"
                            min={0}
                            placeholder="e.g., 150000"
                            value={formData.nextServiceKm || ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                nextServiceKm: parseInt(e.target.value, 10) || undefined,
                              }))
                            }
                            className="pl-9"
                            disabled={isSubmitting}
                          />
                          <Route className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </>
                  )}
                  {stationary && (
                    <div className="space-y-2">
                      <Label htmlFor="engineHours">{workshopMeterLabel(assetCategory)}</Label>
                      <div className="relative">
                        <Input
                          id="engineHours"
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder="e.g., 1245.5"
                          value={formData.engineHours || ''}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              engineHours: parseFloat(e.target.value) || undefined,
                            }))
                          }
                          className="pl-9"
                          disabled={isSubmitting}
                        />
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="nextServiceHours">Next Service (hours)</Label>
                    <div className="relative">
                      <Input
                        id="nextServiceHours"
                        type="number"
                        min={0}
                        placeholder="e.g., 500"
                        value={formData.nextServiceHours || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            nextServiceHours: parseInt(e.target.value, 10) || undefined,
                          }))
                        }
                        className="pl-9"
                        disabled={isSubmitting}
                      />
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextServiceDays">Next Service (days)</Label>
                    <div className="relative">
                      <Input
                        id="nextServiceDays"
                        type="number"
                        min={0}
                        placeholder="e.g., 90"
                        value={formData.nextServiceDays || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            nextServiceDays: parseInt(e.target.value, 10) || undefined,
                          }))
                        }
                        className="pl-9"
                        disabled={isSubmitting}
                      />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the maintenance work..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="laborHours">Labor Hours</Label>
                <div className="relative">
                  <Input
                    id="laborHours"
                    type="number"
                    min={0}
                    step={0.5}
                    value={formData.laborHours || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        laborHours: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="laborCost">Labor Cost (UGX)</Label>
                <div className="relative">
                  <Input
                    id="laborCost"
                    type="number"
                    min={0}
                    value={formData.laborCost || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        laborCost: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="pl-11"
                    disabled={isSubmitting}
                  />
                  <UgxPrefix />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Parts Used
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addPart} disabled={isSubmitting}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Part
                </Button>
              </div>
              {formData.partsUsed.length > 0 ? (
                <div className="border rounded-lg p-3">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <div className="col-span-4">Name</div>
                    <div className="col-span-2">Part #</div>
                    <div className="col-span-1">Qty</div>
                    <div className="col-span-2">Unit (UGX)</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>
                  {formData.partsUsed.map((part, index) => (
                    <PartRow
                      key={part.id}
                      part={part}
                      onChange={(p) => updatePart(index, p)}
                      onRemove={() => removePart(index)}
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No parts added yet</p>
                </div>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Parts Cost:</span>
                <span>{formData.partsCost.toLocaleString()} UGX</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Labor Cost:</span>
                <span>{formData.laborCost.toLocaleString()} UGX</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total Cost:</span>
                <span>{formData.totalCost.toLocaleString()} UGX</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-semibold">{formData.totalCost.toLocaleString()} UGX</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSubmitting || !isFormValid}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isEditMode ? (
                  'Update Maintenance Log'
                ) : (
                  'Save Maintenance Log'
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
