/**
 * Category-aware workshop checklists (mirrors backend WorkshopChecklistTemplates).
 * Used as instant fallback while /checklist-templates loads.
 */

import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSection,
  WorkshopAssetCategory,
} from '@/types/workshop';

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

const VEHICLE_SECTIONS: ChecklistSection[] = [
  {
    id: 'truck-head',
    title: 'Truck / Vehicle Systems',
    items: [
      { id: 'th-0', name: 'Engine Compartment', category: 'truck-head', status: 'pending' },
      { id: 'th-1', name: 'Radiator Level', category: 'truck-head', status: 'pending' },
      { id: 'th-2', name: 'Brake Fluid Level', category: 'truck-head', status: 'pending' },
      { id: 'th-3', name: 'Power Steering Fluid Level', category: 'truck-head', status: 'pending' },
      { id: 'th-4', name: 'Tyres and Wheels', category: 'truck-head', status: 'pending' },
      { id: 'th-5', name: 'Tyre Tread Depth (including spares)', category: 'truck-head', status: 'pending' },
      { id: 'th-6', name: 'Tyre Pressure', category: 'truck-head', status: 'pending' },
      { id: 'th-7', name: 'Tyres: Check for visible damage or punctures', category: 'truck-head', status: 'pending' },
      { id: 'th-8', name: 'Hoist Operation', category: 'truck-head', status: 'pending' },
      { id: 'th-9', name: 'Headlamps (high and low beams)', category: 'truck-head', status: 'pending' },
      { id: 'th-10', name: 'Brake Lights (front and rear indicators)', category: 'truck-head', status: 'pending' },
      { id: 'th-11', name: 'Reverse Lights', category: 'truck-head', status: 'pending' },
      { id: 'th-12', name: 'Reflectors (supplied)', category: 'truck-head', status: 'pending' },
      { id: 'th-13', name: 'Chassis: Check for visible damage or corrosion', category: 'truck-head', status: 'pending' },
      { id: 'th-14', name: 'T-Back Visuals', category: 'truck-head', status: 'pending' },
      { id: 'th-15', name: 'Brake Pads and Discs/Drums', category: 'truck-head', status: 'pending' },
      { id: 'th-16', name: 'Suspension System', category: 'truck-head', status: 'pending' },
      { id: 'th-17', name: 'Shock Absorbers: check for wear, damage, or leaks', category: 'truck-head', status: 'pending' },
      { id: 'th-18', name: 'Test Steering for smooth operation', category: 'truck-head', status: 'pending' },
      { id: 'th-19', name: 'Transmission Fluid Level (if applicable)', category: 'truck-head', status: 'pending' },
      { id: 'th-20', name: 'Differential Oil Level (if applicable)', category: 'truck-head', status: 'pending' },
    ],
  },
  {
    id: 'trailer-safety',
    title: 'Trailer & Safety',
    items: [
      { id: 'tr-0', name: 'Body and Structure: Check for visible damage or leaks', category: 'trailer', status: 'pending' },
      { id: 'tr-1', name: 'Ensure hose connections are secure', category: 'trailer', status: 'pending' },
      { id: 'tr-2', name: 'Verify additional equipment is properly stowed and secured', category: 'trailer', status: 'pending' },
      { id: 'tr-3', name: 'Fifth Wheel greased and in good condition', category: 'trailer', status: 'pending' },
      { id: 'tr-4', name: 'Safety chains properly attached and not dragging', category: 'trailer', status: 'pending' },
      { id: 'tr-5', name: 'All side lights (brake lights, turn signals, reflectors)', category: 'trailer', status: 'pending' },
      { id: 'tr-6', name: 'Electrical connector secure', category: 'trailer', status: 'pending' },
      { id: 'tr-7', name: 'Trailer Tyre Tread Depth (including spare)', category: 'trailer', status: 'pending' },
      { id: 'tr-8', name: 'Check for cracked wheels', category: 'trailer', status: 'pending' },
      { id: 'tr-9', name: 'Inspect tyres for visible damage or punctures', category: 'trailer', status: 'pending' },
      { id: 'tr-10', name: 'Brake system proper operation', category: 'trailer', status: 'pending' },
      { id: 'tr-11', name: 'Air/electrical lines', category: 'trailer', status: 'pending' },
      { id: 'tr-12', name: 'Trailer frame for damage or corrosion', category: 'trailer', status: 'pending' },
      { id: 'tr-13', name: 'Fire Extinguisher', category: 'safety', status: 'pending' },
      { id: 'tr-14', name: 'First Aid Kits', category: 'safety', status: 'pending' },
      { id: 'tr-15', name: 'Wheel Chocks', category: 'safety', status: 'pending' },
      { id: 'tr-16', name: 'Suspension', category: 'trailer', status: 'pending' },
      { id: 'tr-17', name: 'Cabin clean (inside and outside)', category: 'general', status: 'pending' },
      { id: 'tr-18', name: 'Truck clean', category: 'general', status: 'pending' },
    ],
  },
];

const GENERATOR_DAILY_SECTIONS: ChecklistSection[] = [
  {
    id: 'daily-ops',
    title: 'Daily inspection',
    items: [
      { id: 'gd-0', name: 'Generator control panel operating normally', category: 'daily', status: 'pending' },
      { id: 'gd-1', name: 'No active alarms or fault indications', category: 'daily', status: 'pending' },
      { id: 'gd-2', name: 'Genset running hours recorded', category: 'daily', status: 'pending' },
      { id: 'gd-3', name: 'Fuel level recorded', category: 'daily', status: 'pending' },
      { id: 'gd-4', name: 'Battery voltage recorded', category: 'daily', status: 'pending' },
      { id: 'gd-5', name: 'Number of engine starts recorded', category: 'daily', status: 'pending' },
      { id: 'gd-6', name: 'Engine oil level OK', category: 'daily', status: 'pending' },
      { id: 'gd-7', name: 'Coolant level OK', category: 'daily', status: 'pending' },
      { id: 'gd-8', name: 'No fuel leakage', category: 'daily', status: 'pending' },
      { id: 'gd-9', name: 'No engine oil leakage', category: 'daily', status: 'pending' },
      { id: 'gd-10', name: 'Fuel monitoring system functioning', category: 'daily', status: 'pending' },
      { id: 'gd-11', name: 'Generator room is clean and accessible', category: 'daily', status: 'pending' },
    ],
  },
];

export const GENERATOR_MONTHLY_PM_SECTIONS: ChecklistSection[] = [
  {
    id: 'monthly-pm',
    title: 'Monthly preventive maintenance',
    items: [
      { id: 'gm-0', name: 'Check generator control panel for alarms and fault indications', category: 'monthly', status: 'pending' },
      { id: 'gm-1', name: 'Test automatic start and stop (AMF) operation', category: 'monthly', status: 'pending' },
      { id: 'gm-2', name: 'Check engine oil level and condition', category: 'monthly', status: 'pending' },
      { id: 'gm-3', name: 'Check coolant level and condition', category: 'monthly', status: 'pending' },
      { id: 'gm-4', name: 'Inspect radiator and cooling fan', category: 'monthly', status: 'pending' },
      { id: 'gm-5', name: 'Inspect fuel tank condition', category: 'monthly', status: 'pending' },
      { id: 'gm-6', name: 'Inspect fuel lines, hoses, and fittings for leaks', category: 'monthly', status: 'pending' },
      { id: 'gm-7', name: 'Record fuel level', category: 'monthly', status: 'pending' },
      { id: 'gm-8', name: 'Check battery voltage and condition', category: 'monthly', status: 'pending' },
      { id: 'gm-9', name: 'Clean battery terminals and apply protection if required', category: 'monthly', status: 'pending' },
      { id: 'gm-10', name: 'Verify battery charger operation', category: 'monthly', status: 'pending' },
      { id: 'gm-11', name: 'Inspect alternator condition', category: 'monthly', status: 'pending' },
      { id: 'gm-12', name: 'Inspect electrical terminal connections and tighten if necessary', category: 'monthly', status: 'pending' },
      { id: 'gm-13', name: 'Inspect engine belts for wear and correct tension', category: 'monthly', status: 'pending' },
      { id: 'gm-14', name: 'Inspect coolant hoses and clamps for damage or leaks', category: 'monthly', status: 'pending' },
      { id: 'gm-15', name: 'Inspect the exhaust system for leaks or damage', category: 'monthly', status: 'pending' },
      { id: 'gm-16', name: 'Check engine mountings and supports', category: 'monthly', status: 'pending' },
      { id: 'gm-17', name: 'Tighten loose bolts, nuts, and fasteners where necessary', category: 'monthly', status: 'pending' },
      { id: 'gm-18', name: 'Verify instrument panel/dashboard indicators are functioning correctly', category: 'monthly', status: 'pending' },
      { id: 'gm-19', name: 'Record generator running hours', category: 'monthly', status: 'pending' },
      { id: 'gm-20', name: 'Check for abnormal noise or excessive vibration during operation', category: 'monthly', status: 'pending' },
      { id: 'gm-21', name: 'Clean the generator exterior and surrounding area', category: 'monthly', status: 'pending' },
      { id: 'gm-22', name: 'Remove any oil, fuel, or coolant spills', category: 'monthly', status: 'pending' },
      { id: 'gm-23', name: 'Inspect and secure fuel tank covers / reservoirs', category: 'monthly', status: 'pending' },
      { id: 'gm-24', name: 'Ensure all generator access doors are locked after inspection', category: 'monthly', status: 'pending' },
    ],
  },
];

const GENERATOR_SECTIONS: ChecklistSection[] = GENERATOR_DAILY_SECTIONS;

const MACHINERY_SECTIONS: ChecklistSection[] = [
  {
    id: 'powertrain',
    title: 'Powertrain & Fluids',
    items: [
      { id: 'mp-0', name: 'Engine oil level and condition', category: 'powertrain', status: 'pending' },
      { id: 'mp-1', name: 'Hydraulic oil level and condition', category: 'hydraulics', status: 'pending' },
      { id: 'mp-2', name: 'Coolant level', category: 'cooling', status: 'pending' },
      { id: 'mp-3', name: 'Fuel level / leaks', category: 'fuel', status: 'pending' },
      { id: 'mp-4', name: 'Air filter condition', category: 'powertrain', status: 'pending' },
      { id: 'mp-5', name: 'Belts, pulleys, and drive couplings', category: 'powertrain', status: 'pending' },
      { id: 'mp-6', name: 'Engine hours / service meter recorded', category: 'powertrain', status: 'pending' },
    ],
  },
  {
    id: 'hydraulics-structure',
    title: 'Hydraulics, Structure & Undercarriage',
    items: [
      { id: 'mh-0', name: 'Hydraulic hoses, cylinders, and fittings (leaks/damage)', category: 'hydraulics', status: 'pending' },
      { id: 'mh-1', name: 'Boom / arm / implement pins and bushings', category: 'structural', status: 'pending' },
      { id: 'mh-2', name: 'Bucket / blade / attachment condition and pins', category: 'structural', status: 'pending' },
      { id: 'mh-3', name: 'Tracks / tyres / undercarriage wear and tension', category: 'undercarriage', status: 'pending' },
      { id: 'mh-4', name: 'Frame, guards, and covers secure', category: 'structural', status: 'pending' },
      { id: 'mh-5', name: 'Grease points lubricated as scheduled', category: 'general', status: 'pending' },
    ],
  },
  {
    id: 'controls-safety',
    title: 'Controls, Cab & Safety',
    items: [
      { id: 'mc-0', name: 'Operator controls and gauges responsive', category: 'controls', status: 'pending' },
      { id: 'mc-1', name: 'Parking brake / lockout functional', category: 'safety', status: 'pending' },
      { id: 'mc-2', name: 'Horn, lights, and reverse alarm', category: 'safety', status: 'pending' },
      { id: 'mc-3', name: 'ROPS/FOPS / seat belt (if fitted)', category: 'safety', status: 'pending' },
      { id: 'mc-4', name: 'Emergency stop / kill switch', category: 'safety', status: 'pending' },
      { id: 'mc-5', name: 'Fire extinguisher present', category: 'safety', status: 'pending' },
      { id: 'mc-6', name: 'Mirrors / camera / visibility aids', category: 'safety', status: 'pending' },
      { id: 'mc-7', name: 'Cab / operator station clean and clear', category: 'general', status: 'pending' },
    ],
  },
];

export const DEFAULT_CHECKLIST_BY_CATEGORY: Record<WorkshopAssetCategory, ChecklistSection[]> = {
  vehicle: VEHICLE_SECTIONS,
  generator: GENERATOR_SECTIONS,
  machinery: MACHINERY_SECTIONS,
};

/** Maintenance-tab checklists (generators → monthly PM). */
export const MAINTENANCE_CHECKLIST_BY_CATEGORY: Partial<
  Record<WorkshopAssetCategory, ChecklistSection[]>
> = {
  generator: GENERATOR_MONTHLY_PM_SECTIONS,
};

export type ChecklistPurpose = 'inspection' | 'maintenance';

export function filterSectionsForPurpose(
  sections: ChecklistSection[],
  purpose: ChecklistPurpose,
): ChecklistSection[] {
  if (purpose === 'inspection') {
    return sections.filter((s) => s.id !== 'monthly-pm');
  }
  return sections.filter((s) => s.id === 'monthly-pm' || s.title.toLowerCase().includes('monthly'));
}

type TemplateSectionRaw = {
  id?: string;
  title?: string;
  items?: Array<{ name?: string; category?: string; id?: string; status?: string; comment?: string }>;
};

/** Build editable checklist sections from a template definition (API or builtin). */
export function instantiateChecklistSections(
  category: WorkshopAssetCategory,
  rawSections?: unknown,
  purpose: ChecklistPurpose = 'inspection',
): ChecklistSection[] {
  const builtin =
    purpose === 'maintenance'
      ? MAINTENANCE_CHECKLIST_BY_CATEGORY[category] || []
      : DEFAULT_CHECKLIST_BY_CATEGORY[category];
  const source =
    Array.isArray(rawSections) && rawSections.length > 0
      ? (rawSections as TemplateSectionRaw[])
      : builtin;

  const mapped = source.map((section, sIdx) => {
    const sid = String(section.id || `section-${sIdx}`);
    const items = (section.items || []).map((item, iIdx) => {
      const status = (item.status as ChecklistItemStatus) || 'pending';
      return {
        id: String(item.id || `${sid}-${iIdx}`),
        name: String(item.name || `Item ${iIdx + 1}`),
        category: String(item.category || sid),
        status:
          status === 'ok' || status === 'issue' || status === 'na' || status === 'pending'
            ? status
            : 'pending',
        comment: item.comment ? String(item.comment) : undefined,
      } satisfies ChecklistItem;
    });
    return {
      id: sid,
      title: String(section.title || `Section ${sIdx + 1}`),
      items,
    };
  });

  return filterSectionsForPurpose(mapped, purpose);
}

/** Convert legacy truck/trailer arrays into sections when checklist_sections is empty. */
export function sectionsFromLegacy(
  truckHead: ChecklistItem[] | undefined,
  trailer: ChecklistItem[] | undefined,
  category: WorkshopAssetCategory = 'vehicle',
): ChecklistSection[] {
  if ((truckHead?.length || 0) + (trailer?.length || 0) === 0) {
    return instantiateChecklistSections(category);
  }
  if (category !== 'vehicle') {
    // Prefer stored flat lists as a single section when category was mis-saved historically
    const items = [...(truckHead || []), ...(trailer || [])];
    return [{ id: 'checklist', title: 'Inspection checklist', items }];
  }
  return [
    ...(truckHead?.length
      ? [{ id: 'truck-head', title: 'Truck / Vehicle Systems', items: truckHead }]
      : []),
    ...(trailer?.length
      ? [{ id: 'trailer-safety', title: 'Trailer & Safety', items: trailer }]
      : []),
  ];
}

export function flattenChecklistSections(sections: ChecklistSection[]): ChecklistItem[] {
  return sections.flatMap((s) => s.items);
}

export function legacyChecklistsFromSections(sections: ChecklistSection[]): {
  truckHeadChecklist: ChecklistItem[];
  trailerChecklist: ChecklistItem[];
} {
  if (sections.length === 0) {
    return { truckHeadChecklist: [], trailerChecklist: [] };
  }
  if (sections.length === 1) {
    return { truckHeadChecklist: sections[0].items, trailerChecklist: [] };
  }
  return {
    truckHeadChecklist: sections[0].items,
    trailerChecklist: sections.slice(1).flatMap((s) => s.items),
  };
}
