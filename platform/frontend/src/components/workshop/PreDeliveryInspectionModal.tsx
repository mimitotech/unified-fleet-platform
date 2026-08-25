/**
 * PreDeliveryInspectionModal — category-aware inspection form
 * (vehicle / generator / machinery checklists).
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ClipboardCheck, User, Gauge, Check, X,
  AlertCircle, Loader2, MessageSquare, ChevronDown, ChevronUp, Clock,
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
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FleetUnitSelect } from '@/components/fleet/FleetUnitSelect';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { cn } from '@/lib/utils';
import { clientApi } from '@/lib/api';
import {
  instantiateChecklistSections,
  legacyChecklistsFromSections,
  sectionsFromLegacy,
  flattenChecklistSections,
} from '@/lib/workshopChecklists';
import {
  emptySignOff,
  signOffFromUser,
  WorkshopSignOffFields,
  type WorkshopSignOffValue,
} from '@/components/workshop/WorkshopSignOffFields';
import { useAuth } from '@/providers/AuthProvider';
import {
  isStationaryUnit,
  resolveWorkshopAssetCategory,
  workshopAssetLabel,
  workshopOperatorLabel,
  workshopMeterLabel,
} from '@/lib/workshopUnit';
import type { FleetUnit } from '@/lib/fleetUnits';
import type {
  InspectionType,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSection,
  WorkshopAssetCategory,
  VehicleInspection,
} from '@/types/workshop';

export interface InspectionFormData {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  assetCategory: WorkshopAssetCategory;
  driverId: string | null;
  driverName: string;
  inspectionType: InspectionType;
  odometerReading: number;
  engineHours: number;
  nextServiceMileage: number;
  checklistSections: ChecklistSection[];
  /** Legacy dual-write (derived from sections on save) */
  truckHeadChecklist: ChecklistItem[];
  trailerChecklist: ChecklistItem[];
  notes: string;
  inspectorName: string;
  inspectorDate: string;
  inspectorSignature: string;
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
  editData?: VehicleInspection | null;
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
            title="OK"
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
            title="Issue"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={item.status === 'na' ? 'default' : 'outline'}
            className={cn(
              'h-8 px-2 text-[10px] font-semibold',
              item.status === 'na' && 'bg-slate-600 hover:bg-slate-600/90',
            )}
            onClick={() => onChange('na', item.comment)}
            disabled={disabled}
            title="Not applicable"
          >
            N/A
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

function emptyForm(defaultVehicleId?: string, loggedInName?: string): InspectionFormData {
  const sections = instantiateChecklistSections('vehicle');
  const legacy = legacyChecklistsFromSections(sections);
  const sign = signOffFromUser(loggedInName);
  return {
    vehicleId: defaultVehicleId || '',
    vehicleName: '',
    vehiclePlate: '',
    assetCategory: 'vehicle',
    driverId: null,
    driverName: sign.name,
    inspectionType: 'pre-delivery',
    odometerReading: 0,
    engineHours: 0,
    nextServiceMileage: 0,
    checklistSections: sections,
    truckHeadChecklist: legacy.truckHeadChecklist,
    trailerChecklist: legacy.trailerChecklist,
    notes: '',
    inspectorName: sign.name,
    inspectorDate: sign.date,
    inspectorSignature: sign.signature,
  };
}

export function PreDeliveryInspectionModal({
  open,
  onOpenChange,
  onSave,
  drivers = [],
  defaultVehicleId,
  editData,
}: PreDeliveryInspectionModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [templateName, setTemplateName] = useState<string>('');
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const { units } = useFleetUnits();
  const isEditMode = !!editData;
  const loadToken = useRef(0);

  const [formData, setFormData] = useState<InspectionFormData>(() => emptyForm(defaultVehicleId));

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

  const applySections = useCallback((category: WorkshopAssetCategory, sections: ChecklistSection[]) => {
    const legacy = legacyChecklistsFromSections(sections);
    setFormData((prev) => ({
      ...prev,
      assetCategory: category,
      checklistSections: sections,
      truckHeadChecklist: legacy.truckHeadChecklist,
      trailerChecklist: legacy.trailerChecklist,
    }));
    setOpenSections(Object.fromEntries(sections.map((s, i) => [s.id, i < 2])));
  }, []);

  const loadTemplateForCategory = useCallback(
    async (category: WorkshopAssetCategory, preserveFilled = false) => {
      const token = ++loadToken.current;
      setLoadingTemplate(true);
      try {
        const tpl = await clientApi.getWorkshopChecklistTemplate(category, 'inspection');
        if (token !== loadToken.current) return;
        setTemplateName(tpl.name || '');
        if (preserveFilled) return;
        applySections(category, instantiateChecklistSections(category, tpl.sections, 'inspection'));
      } catch {
        if (token !== loadToken.current) return;
        setTemplateName('');
        if (!preserveFilled) {
          applySections(category, instantiateChecklistSections(category, undefined, 'inspection'));
        }
      } finally {
        if (token === loadToken.current) setLoadingTemplate(false);
      }
    },
    [applySections],
  );

  useEffect(() => {
    if (open && !isInitialized) {
      if (editData) {
        const cat = sanitizeFromInspection(editData);
        const sections =
          editData.checklistSections && editData.checklistSections.length > 0
            ? instantiateChecklistSections(cat, editData.checklistSections)
            : sectionsFromLegacy(editData.truckHeadChecklist, editData.trailerChecklist, cat);
        const legacy = legacyChecklistsFromSections(sections);
        setFormData({
          vehicleId: editData.vehicleId,
          vehicleName: editData.vehicleName,
          vehiclePlate: editData.vehiclePlate,
          assetCategory: cat,
          driverId: editData.driverId,
          driverName: editData.driverName || '',
          inspectionType: editData.inspectionType,
          odometerReading: editData.odometerReading,
          engineHours: Number(editData.engineHours ?? 0),
          nextServiceMileage: editData.nextServiceMileage || 0,
          checklistSections: sections,
          truckHeadChecklist: legacy.truckHeadChecklist,
          trailerChecklist: legacy.trailerChecklist,
          notes: editData.notes || '',
          inspectorName: editData.inspectorName || '',
          inspectorDate: editData.inspectorDate || emptySignOff().date,
          inspectorSignature:
            editData.inspectorSignature ||
            (editData.inspectorName || '').trim().toLowerCase(),
        });
        setOpenSections(Object.fromEntries(sections.map((s, i) => [s.id, i < 2])));
        setSelectedUnit(null);
        void loadTemplateForCategory(cat, true);
      } else {
        setFormData(emptyForm(defaultVehicleId, user?.fullName));
        setSelectedUnit(null);
        setTemplateName('');
        setOpenSections({});
      }
      setIsInitialized(true);
    } else if (!open) {
      setIsInitialized(false);
    }
  }, [open, isInitialized, editData, defaultVehicleId, loadTemplateForCategory]);

  const handleClose = useCallback(() => {
    if (!isSubmitting) onOpenChange(false);
  }, [onOpenChange, isSubmitting]);

  const handleUnitChange = (unitId: string, unit: FleetUnit | null) => {
    if (!unit) {
      setSelectedUnit(undefined);
      setFormData((prev) => ({
        ...prev,
        vehicleId: '',
        vehicleName: '',
        vehiclePlate: '',
        unit: undefined,
      }));
      return;
    }
    setSelectedUnit(unit);
    const category = resolveWorkshopAssetCategory(unit);
    setFormData((prev) => ({
      ...prev,
      vehicleId: unitId,
      vehicleName: unit.name,
      vehiclePlate: unit.plate || '',
      assetCategory: category,
      unit,
      odometerReading: category === 'vehicle' ? prev.odometerReading : 0,
      engineHours: category !== 'vehicle' ? prev.engineHours : 0,
      inspectionType: category === 'generator' ? 'pre-trip' : prev.inspectionType,
    }));
    void loadTemplateForCategory(category, false);
  };

  const handleSignOffChange = (sign: WorkshopSignOffValue) => {
    setFormData((prev) => ({
      ...prev,
      inspectorName: sign.name,
      inspectorDate: sign.date,
      inspectorSignature: sign.signature,
    }));
  };

  const updateSectionItem = (
    sectionId: string,
    index: number,
    status: ChecklistItemStatus,
    comment?: string,
  ) => {
    setFormData((prev) => {
      const checklistSections = prev.checklistSections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: section.items.map((item, i) =>
            i === index ? { ...item, status, comment } : item,
          ),
        };
      });
      const legacy = legacyChecklistsFromSections(checklistSections);
      return {
        ...prev,
        checklistSections,
        truckHeadChecklist: legacy.truckHeadChecklist,
        trailerChecklist: legacy.trailerChecklist,
      };
    });
  };

  const sectionStats = useCallback((section: ChecklistSection) => {
    const completed = section.items.filter((i) => i.status !== 'pending').length;
    const issues = section.items.filter((i) => i.status === 'issue').length;
    const na = section.items.filter((i) => i.status === 'na').length;
    return { completed, total: section.items.length, issues, na };
  }, []);

  const totalIssues = useMemo(
    () => flattenChecklistSections(formData.checklistSections).filter((i) => i.status === 'issue').length,
    [formData.checklistSections],
  );

  const isFormValid = useMemo(() => {
    const hasAsset = Boolean(formData.vehicleId || formData.vehicleName);
    const hasInspector = formData.inspectorName.trim() !== '';
    if (!hasAsset || !hasInspector) return false;
    if (isEditMode || stationary) return true;
    return formData.odometerReading > 0;
  }, [formData, stationary, isEditMode]);

  const handleSave = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      const legacy = legacyChecklistsFromSections(formData.checklistSections);
      await onSave({
        ...formData,
        assetCategory,
        truckHeadChecklist: legacy.truckHeadChecklist,
        trailerChecklist: legacy.trailerChecklist,
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
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold">
                {isEditMode ? 'Edit Inspection' : `${assetLabel} Inspection`}
              </DialogTitle>
              <DialogDescription>
                {templateName ||
                  (isEditMode
                    ? 'Update inspection details and checklist'
                    : `Checklist adapts to the selected ${assetLabel.toLowerCase()}`)}
              </DialogDescription>
            </div>
            <Badge variant="outline" className="capitalize shrink-0">
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
                <Input
                  id="driver"
                  placeholder={`Type ${operatorLabel.toLowerCase()} name`}
                  value={formData.driverName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      driverId: null,
                      driverName: e.target.value,
                    }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inspectionType">
                  {assetCategory === 'generator' ? 'Inspection type' : 'Inspection Type'}
                </Label>
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
                    {assetCategory === 'generator' ? (
                      <SelectItem value="pre-trip">Daily inspection</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="pre-delivery">Pre-Delivery / Pre-Use</SelectItem>
                        <SelectItem value="pre-trip">Pre-Trip / Pre-Start</SelectItem>
                        <SelectItem value="post-trip">Post-Trip / After Run</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <WorkshopSignOffFields
                  label="Inspected by"
                  required
                  value={{
                    name: formData.inspectorName,
                    date: formData.inspectorDate,
                    signature: formData.inspectorSignature,
                  }}
                  onChange={handleSignOffChange}
                />
              </div>

              {!stationary ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="odometer">{workshopMeterLabel('vehicle')} *</Label>
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
              ) : (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="engineHours">{workshopMeterLabel(assetCategory)}</Label>
                  <div className="relative max-w-sm">
                    <Input
                      id="engineHours"
                      type="number"
                      step="0.1"
                      placeholder="e.g., 1245.5"
                      value={formData.engineHours || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          engineHours: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="pl-9"
                      disabled={isSubmitting}
                    />
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {loadingTemplate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading {assetLabel.toLowerCase()} checklist…
              </div>
            )}

            {formData.checklistSections.map((section) => {
              const stats = sectionStats(section);
              const isOpen = openSections[section.id] ?? true;
              return (
                <Collapsible
                  key={section.id}
                  open={isOpen}
                  onOpenChange={(next) =>
                    setOpenSections((prev) => ({ ...prev, [section.id]: next }))
                  }
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-4 h-auto border rounded-lg">
                      <div className="flex items-center gap-3">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <div className="font-medium">{section.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {stats.completed}/{stats.total} checked
                            {stats.na > 0 && (
                              <span className="text-slate-500 ml-2">• {stats.na} N/A</span>
                            )}
                            {stats.issues > 0 && (
                              <span className="text-destructive ml-2">• {stats.issues} issues</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border border-t-0 rounded-b-lg px-4">
                    {section.items.map((item, index) => (
                      <ChecklistRow
                        key={item.id}
                        item={item}
                        onChange={(status, comment) =>
                          updateSectionItem(section.id, index, status, comment)
                        }
                        disabled={isSubmitting}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

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
              {totalIssues > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {totalIssues} issues found
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

function sanitizeFromInspection(insp: VehicleInspection): WorkshopAssetCategory {
  return resolveWorkshopAssetCategory(null, insp.assetCategory);
}
