/**
 * Standard workshop inspection checklists by asset category.
 * Seeded into workshop_checklist_templates and used as API fallback.
 */

export type WorkshopAssetCategory = 'vehicle' | 'generator' | 'machinery';

export type ChecklistItemDef = {
  name: string;
  category: string;
};

export type ChecklistSectionDef = {
  id: string;
  title: string;
  items: ChecklistItemDef[];
};

export const WORKSHOP_ASSET_CATEGORIES: WorkshopAssetCategory[] = [
  'vehicle',
  'generator',
  'machinery',
];

export function sanitizeWorkshopAssetCategory(value: unknown): WorkshopAssetCategory {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === 'generator' || s === 'genset' || s === 'gensets') return 'generator';
  if (s === 'machinery' || s === 'equipment' || s === 'plant') return 'machinery';
  return 'vehicle';
}

const VEHICLE_SECTIONS: ChecklistSectionDef[] = [
  {
    id: 'truck-head',
    title: 'Truck / Vehicle Systems',
    items: [
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
    ],
  },
  {
    id: 'trailer-safety',
    title: 'Trailer & Safety',
    items: [
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
    ],
  },
];

/** Daily inspection only — used on the Inspection tab for generators. */
export const GENERATOR_DAILY_SECTIONS: ChecklistSectionDef[] = [
  {
    id: 'daily-ops',
    title: 'Daily inspection',
    items: [
      { name: 'Generator control panel operating normally', category: 'daily' },
      { name: 'No active alarms or fault indications', category: 'daily' },
      { name: 'Genset running hours recorded', category: 'daily' },
      { name: 'Fuel level recorded', category: 'daily' },
      { name: 'Battery voltage recorded', category: 'daily' },
      { name: 'Number of engine starts recorded', category: 'daily' },
      { name: 'Engine oil level OK', category: 'daily' },
      { name: 'Coolant level OK', category: 'daily' },
      { name: 'No fuel leakage', category: 'daily' },
      { name: 'No engine oil leakage', category: 'daily' },
      { name: 'Fuel monitoring system functioning', category: 'daily' },
      { name: 'Generator room is clean and accessible', category: 'daily' },
    ],
  },
];

/** Monthly PM — used on the Maintenance tab for generators (not Inspection). */
export const GENERATOR_MONTHLY_PM_SECTIONS: ChecklistSectionDef[] = [
  {
    id: 'monthly-pm',
    title: 'Monthly preventive maintenance',
    items: [
      { name: 'Check generator control panel for alarms and fault indications', category: 'monthly' },
      { name: 'Test automatic start and stop (AMF) operation', category: 'monthly' },
      { name: 'Check engine oil level and condition', category: 'monthly' },
      { name: 'Check coolant level and condition', category: 'monthly' },
      { name: 'Inspect radiator and cooling fan', category: 'monthly' },
      { name: 'Inspect fuel tank condition', category: 'monthly' },
      { name: 'Inspect fuel lines, hoses, and fittings for leaks', category: 'monthly' },
      { name: 'Record fuel level', category: 'monthly' },
      { name: 'Check battery voltage and condition', category: 'monthly' },
      { name: 'Clean battery terminals and apply protection if required', category: 'monthly' },
      { name: 'Verify battery charger operation', category: 'monthly' },
      { name: 'Inspect alternator condition', category: 'monthly' },
      { name: 'Inspect electrical terminal connections and tighten if necessary', category: 'monthly' },
      { name: 'Inspect engine belts for wear and correct tension', category: 'monthly' },
      { name: 'Inspect coolant hoses and clamps for damage or leaks', category: 'monthly' },
      { name: 'Inspect the exhaust system for leaks or damage', category: 'monthly' },
      { name: 'Check engine mountings and supports', category: 'monthly' },
      { name: 'Tighten loose bolts, nuts, and fasteners where necessary', category: 'monthly' },
      { name: 'Verify instrument panel/dashboard indicators are functioning correctly', category: 'monthly' },
      { name: 'Record generator running hours', category: 'monthly' },
      { name: 'Check for abnormal noise or excessive vibration during operation', category: 'monthly' },
      { name: 'Clean the generator exterior and surrounding area', category: 'monthly' },
      { name: 'Remove any oil, fuel, or coolant spills', category: 'monthly' },
      { name: 'Inspect and secure fuel tank covers / reservoirs', category: 'monthly' },
      { name: 'Ensure all generator access doors are locked after inspection', category: 'monthly' },
    ],
  },
];

const GENERATOR_SECTIONS: ChecklistSectionDef[] = GENERATOR_DAILY_SECTIONS;

const MACHINERY_SECTIONS: ChecklistSectionDef[] = [
  {
    id: 'powertrain',
    title: 'Powertrain & Fluids',
    items: [
      { name: 'Engine oil level and condition', category: 'powertrain' },
      { name: 'Hydraulic oil level and condition', category: 'hydraulics' },
      { name: 'Coolant level', category: 'cooling' },
      { name: 'Fuel level / leaks', category: 'fuel' },
      { name: 'Air filter condition', category: 'powertrain' },
      { name: 'Belts, pulleys, and drive couplings', category: 'powertrain' },
      { name: 'Engine hours / service meter recorded', category: 'powertrain' },
    ],
  },
  {
    id: 'hydraulics-structure',
    title: 'Hydraulics, Structure & Undercarriage',
    items: [
      { name: 'Hydraulic hoses, cylinders, and fittings (leaks/damage)', category: 'hydraulics' },
      { name: 'Boom / arm / implement pins and bushings', category: 'structural' },
      { name: 'Bucket / blade / attachment condition and pins', category: 'structural' },
      { name: 'Tracks / tyres / undercarriage wear and tension', category: 'undercarriage' },
      { name: 'Frame, guards, and covers secure', category: 'structural' },
      { name: 'Grease points lubricated as scheduled', category: 'general' },
    ],
  },
  {
    id: 'controls-safety',
    title: 'Controls, Cab & Safety',
    items: [
      { name: 'Operator controls and gauges responsive', category: 'controls' },
      { name: 'Parking brake / lockout functional', category: 'safety' },
      { name: 'Horn, lights, and reverse alarm', category: 'safety' },
      { name: 'ROPS/FOPS / seat belt (if fitted)', category: 'safety' },
      { name: 'Emergency stop / kill switch', category: 'safety' },
      { name: 'Fire extinguisher present', category: 'safety' },
      { name: 'Mirrors / camera / visibility aids', category: 'safety' },
      { name: 'Cab / operator station clean and clear', category: 'general' },
    ],
  },
];

export const DEFAULT_CHECKLIST_BY_CATEGORY: Record<WorkshopAssetCategory, ChecklistSectionDef[]> = {
  vehicle: VEHICLE_SECTIONS,
  generator: GENERATOR_SECTIONS,
  machinery: MACHINERY_SECTIONS,
};

/** Checklists for the Maintenance tab (generators get monthly PM). */
export const MAINTENANCE_CHECKLIST_BY_CATEGORY: Partial<
  Record<WorkshopAssetCategory, ChecklistSectionDef[]>
> = {
  generator: GENERATOR_MONTHLY_PM_SECTIONS,
};

export type ChecklistPurpose = 'inspection' | 'maintenance';

export const TEMPLATE_META: Record<
  WorkshopAssetCategory,
  { name: string; description: string }
> = {
  vehicle: {
    name: 'Vehicle pre-delivery / trip inspection',
    description: 'Standard truck / vehicle and trailer safety checklist',
  },
  generator: {
    name: 'Generator daily inspection',
    description: 'Daily generator inspection checklist',
  },
  machinery: {
    name: 'Machinery pre-use / service inspection',
    description: 'Plant equipment powertrain, hydraulics, structure, and operator safety',
  },
};

/** Common failure systems for breakdown forms by category */
export const FAILURE_SYSTEMS: Record<WorkshopAssetCategory, string[]> = {
  vehicle: [
    'Engine',
    'Transmission',
    'Brakes',
    'Electrical',
    'Tyres / Wheels',
    'Suspension / Steering',
    'Cooling',
    'Fuel system',
    'Body / Chassis',
    'Other',
  ],
  generator: [
    'Engine',
    'Fuel system',
    'Cooling',
    'Alternator / Output',
    'Control panel / ATS',
    'Battery / Starting',
    'Exhaust',
    'Enclosure',
    'Other',
  ],
  machinery: [
    'Engine',
    'Hydraulics',
    'Undercarriage / Tracks',
    'Boom / Attachment',
    'Electrical',
    'Controls',
    'Cooling',
    'Fuel system',
    'Structural',
    'Other',
  ],
};
