/**
 * BreakdownReportModal - Report Vehicle Breakdown
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  AlertTriangle, MapPin, Clock, Loader2, Calendar,
} from 'lucide-react';
import { UgxLabelIcon, UgxPrefix } from '@/components/shared/UgxAffix';
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
import { Badge } from '@/components/ui/badge';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { FAILURE_SYSTEMS } from '@/lib/workshopChecklists';
import {
  resolveWorkshopAssetCategory,
  workshopAssetLabel,
  workshopOperatorLabel,
  isStationaryUnit,
} from '@/lib/workshopUnit';
import type { FleetUnit } from '@/lib/fleetUnits';
import type { BreakdownSeverity, WorkshopAssetCategory } from '@/types/workshop';

export interface BreakdownReportFormData {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  assetCategory: WorkshopAssetCategory;
  failureSystem: string;
  driverId: string | null;
  driverName: string;
  tripId?: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  breakdownTime: string;
  resolutionTime?: string;
  severity: BreakdownSeverity;
  description: string;
  cause: string;
  resolution: string;
  downtimeHours: number;
  towingCost: number;
  repairCost: number;
  totalCost: number;
  unit?: FleetUnit | null;
}

interface DriverOption {
  id: string;
  name: string;
}

export interface BreakdownReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: BreakdownReportFormData) => Promise<void> | void;
  drivers?: DriverOption[];
  defaultVehicleId?: string;
  editData?: BreakdownReportFormData | null;
}

function SeverityBadge({ severity }: { severity: BreakdownSeverity }) {
  const config = {
    minor: { label: 'Minor', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    major: { label: 'Major', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    critical: { label: 'Critical', className: 'bg-red-100 text-red-800 border-red-200' },
  };
  const { label, className } = config[severity];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

const initialFormState: BreakdownReportFormData = {
  vehicleId: '',
  vehicleName: '',
  vehiclePlate: '',
  assetCategory: 'vehicle',
  failureSystem: '',
  driverId: null,
  driverName: '',
  location: { lat: 0, lng: 0, address: '' },
  breakdownTime: new Date().toISOString().slice(0, 16),
  severity: 'minor',
  description: '',
  cause: '',
  resolution: '',
  downtimeHours: 0,
  towingCost: 0,
  repairCost: 0,
  totalCost: 0,
};

export function BreakdownReportModal({
  open,
  onOpenChange,
  onSave,
  drivers = [],
  defaultVehicleId,
  editData,
}: BreakdownReportModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BreakdownReportFormData>(initialFormState);
  const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { units } = useFleetUnits();
  const isEditMode = !!editData;

  useEffect(() => {
    if (open && !isInitialized) {
      if (editData) {
        setFormData({
          ...editData,
          location: editData.location || { lat: 0, lng: 0, address: '' },
        });
        setSelectedUnit(null);
      } else {
        setFormData({
          ...initialFormState,
          vehicleId: defaultVehicleId || '',
          breakdownTime: new Date().toISOString().slice(0, 16),
        });
        setSelectedUnit(null);
      }
      setIsInitialized(true);
    } else if (!open) {
      setIsInitialized(false);
    }
  }, [open, isInitialized, editData, defaultVehicleId]);

  const matchedUnit = useMemo(() => {
    if (selectedUnit) return selectedUnit;
    const id = formData.vehicleId;
    if (!id) return null;
    return units.find((u) => u.id === id || String(u.wialonId) === id) || null;
  }, [selectedUnit, formData.vehicleId, units]);
  const assetCategory = resolveWorkshopAssetCategory(matchedUnit, formData.assetCategory);
  const stationary = isStationaryUnit(matchedUnit) || assetCategory !== 'vehicle';
  const assetLabel = workshopAssetLabel(assetCategory);
  const operatorLabel = workshopOperatorLabel(assetCategory);
  const failureOptions = FAILURE_SYSTEMS[assetCategory];

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
      failureSystem: '',
      location: {
        ...prev.location,
        lat: unit.lat ?? prev.location.lat,
        lng: unit.lng ?? prev.location.lng,
      },
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

  useEffect(() => {
    const totalCost = formData.towingCost + formData.repairCost;
    setFormData((prev) => ({ ...prev, totalCost }));
  }, [formData.towingCost, formData.repairCost]);

  const isFormValid = useMemo(() => {
    return (
      Boolean(formData.vehicleId || formData.vehicleName) &&
      formData.description.trim() !== '' &&
      formData.location.address.trim() !== ''
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
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {isEditMode ? 'Edit Breakdown Report' : `Report ${assetLabel} Breakdown`}
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? 'Update breakdown details and resolution'
                  : `Record ${assetLabel.toLowerCase()} failure details and costs`}
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
                <Label htmlFor="breakdownTime">Breakdown Time</Label>
                <div className="relative">
                  <Input
                    id="breakdownTime"
                    type="datetime-local"
                    value={formData.breakdownTime}
                    onChange={(e) => setFormData((prev) => ({ ...prev, breakdownTime: e.target.value }))}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity">Severity</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, severity: v as BreakdownSeverity }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="severity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor - Can continue with caution</SelectItem>
                    <SelectItem value="major">Major - Requires immediate attention</SelectItem>
                    <SelectItem value="critical">
                      Critical - Asset immobilized
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="failureSystem">Failed system</Label>
                <Select
                  value={formData.failureSystem || ''}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, failureSystem: v }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="failureSystem">
                    <SelectValue placeholder="Select system / area" />
                  </SelectTrigger>
                  <SelectContent>
                    {failureOptions.map((sys) => (
                      <SelectItem key={sys} value={sys}>
                        {sys}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location / Address *</Label>
              <div className="relative">
                <Input
                  id="location"
                  placeholder="e.g., Jinja Highway, Mukono"
                  value={formData.location.address}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      location: { ...prev.location, address: e.target.value },
                    }))
                  }
                  className="pl-9"
                  disabled={isSubmitting}
                />
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe what happened..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cause">Cause</Label>
                <Input
                  id="cause"
                  placeholder="e.g., Radiator hose burst"
                  value={formData.cause}
                  onChange={(e) => setFormData((prev) => ({ ...prev, cause: e.target.value }))}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="downtimeHours">Downtime (hours)</Label>
                <div className="relative">
                  <Input
                    id="downtimeHours"
                    type="number"
                    min={0}
                    step={0.5}
                    value={formData.downtimeHours || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        downtimeHours: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Textarea
                id="resolution"
                placeholder="How was the issue resolved?"
                value={formData.resolution}
                onChange={(e) => setFormData((prev) => ({ ...prev, resolution: e.target.value }))}
                rows={2}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <UgxLabelIcon />
                Costs (UGX)
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="towingCost" className="text-sm text-muted-foreground">
                    {stationary ? 'Recovery / Call-out Cost (UGX)' : 'Towing Cost (UGX)'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="towingCost"
                      type="number"
                      min={0}
                      value={formData.towingCost || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          towingCost: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      className="pl-11"
                      disabled={isSubmitting}
                    />
                    <UgxPrefix />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repairCost" className="text-sm text-muted-foreground">Repair Cost (UGX)</Label>
                  <div className="relative">
                    <Input
                      id="repairCost"
                      type="number"
                      min={0}
                      value={formData.repairCost || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          repairCost: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      className="pl-11"
                      disabled={isSubmitting}
                    />
                    <UgxPrefix />
                  </div>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between font-semibold">
                  <span>Total Cost:</span>
                  <span>{formData.totalCost.toLocaleString()} UGX</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <SeverityBadge severity={formData.severity} />
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSubmitting || !isFormValid}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isEditMode ? (
                  'Update Breakdown'
                ) : (
                  'Report Breakdown'
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
