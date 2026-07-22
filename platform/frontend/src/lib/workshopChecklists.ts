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
      { id: 'th-0', name: 'Engine Compartment', category: 'truck-head', status: 'na' },
      { id: 'th-1', name: 'Radiator Level', category: 'truck-head', status: 'na' },
      { id: 'th-2', name: 'Brake Fluid Level', category: 'truck-head', status: 'na' },
      { id: 'th-3', name: 'Power Steering Fluid Level', category: 'truck-head', status: 'na' },
      { id: 'th-4', name: 'Tyres and Wheels', category: 'truck-head', status: 'na' },
      { id: 'th-5', name: 'Tyre Tread Depth (including spares)', category: 'truck-head', status: 'na' },
      { id: 'th-6', name: 'Tyre Pressure', category: 'truck-head', status: 'na' },
      { id: 'th-7', name: 'Tyres: Check for visible damage or punctures', category: 'truck-head', status: 'na' },
      { id: 'th-8', name: 'Hoist Operation', category: 'truck-head', status: 'na' },
      { id: 'th-9', name: 'Headlamps (high and low beams)', category: 'truck-head', status: 'na' },
      { id: 'th-10', name: 'Brake Lights (front and rear indicators)', category: 'truck-head', status: 'na' },
      { id: 'th-11', name: 'Reverse Lights', category: 'truck-head', status: 'na' },
      { id: 'th-12', name: 'Reflectors (supplied)', category: 'truck-head', status: 'na' },
      { id: 'th-13', name: 'Chassis: Check for visible damage or corrosion', category: 'truck-head', status: 'na' },
      { id: 'th-14', name: 'T-Back Visuals', category: 'truck-head', status: 'na' },
      { id: 'th-15', name: 'Brake Pads and Discs/Drums', category: 'truck-head', status: 'na' },
      { id: 'th-16', name: 'Suspension System', category: 'truck-head', status: 'na' },
      { id: 'th-17', name: 'Shock Absorbers: check for wear, damage, or leaks', category: 'truck-head', status: 'na' },
      { id: 'th-18', name: 'Test Steering for smooth operation', category: 'truck-head', status: 'na' },
      { id: 'th-19', name: 'Transmission Fluid Level (if applicable)', category: 'truck-head', status: 'na' },
      { id: 'th-20', name: 'Differential Oil Level (if applicable)', category: 'truck-head', status: 'na' },
    ],
  },
  {
    id: 'trailer-safety',
    title: 'Trailer & Safety',
    items: [
      { id: 'tr-0', name: 'Body and Structure: Check for visible damage or leaks', category: 'trailer', status: 'na' },
      { id: 'tr-1', name: 'Ensure hose connections are secure', category: 'trailer', status: 'na' },
      { id: 'tr-2', name: 'Verify additional equipment is properly stowed and secured', category: 'trailer', status: 'na' },
      { id: 'tr-3', name: 'Fifth Wheel greased and in good condition', category: 'trailer', status: 'na' },
      { id: 'tr-4', name: 'Safety chains properly attached and not dragging', category: 'trailer', status: 'na' },
      { id: 'tr-5', name: 'All side lights (brake lights, turn signals, reflectors)', category: 'trailer', status: 'na' },
      { id: 'tr-6', name: 'Electrical connector secure', category: 'trailer', status: 'na' },
      { id: 'tr-7', name: 'Trailer Tyre Tread Depth (including spare)', category: 'trailer', status: 'na' },
      { id: 'tr-8', name: 'Check for cracked wheels', category: 'trailer', status: 'na' },
      { id: 'tr-9', name: 'Inspect tyres for visible damage or punctures', category: 'trailer', status: 'na' },
      { id: 'tr-10', name: 'Brake system proper operation', category: 'trailer', status: 'na' },
      { id: 'tr-11', name: 'Air/electrical lines', category: 'trailer', status: 'na' },
      { id: 'tr-12', name: 'Trailer frame for damage or corrosion', category: 'trailer', status: 'na' },
      { id: 'tr-13', name: 'Fire Extinguisher', category: 'safety', status: 'na' },
      { id: 'tr-14', name: 'First Aid Kits', category: 'safety', status: 'na' },
      { id: 'tr-15', name: 'Wheel Chocks', category: 'safety', status: 'na' },
      { id: 'tr-16', name: 'Suspension', category: 'trailer', status: 'na' },
      { id: 'tr-17', name: 'Cabin clean (inside and outside)', category: 'general', status: 'na' },
      { id: 'tr-18', name: 'Truck clean', category: 'general', status: 'na' },
    ],
  },
];

const GENERATOR_SECTIONS: ChecklistSection[] = [
  {
    id: 'engine',
    title: 'Engine & Lubrication',
    items: [
      { id: 'ge-0', name: 'Engine oil level and condition', category: 'engine', status: 'na' },
      { id: 'ge-1', name: 'Oil leaks under/around engine', category: 'engine', status: 'na' },
      { id: 'ge-2', name: 'Air filter condition / restriction indicator', category: 'engine', status: 'na' },
      { id: 'ge-3', name: 'Fuel filter / water separator drained', category: 'engine', status: 'na' },
      { id: 'ge-4', name: 'Belts and hoses (cracks, tension, leaks)', category: 'engine', status: 'na' },
      { id: 'ge-5', name: 'Unusual noise / vibration at idle and load', category: 'engine', status: 'na' },
      { id: 'ge-6', name: 'Engine hours meter reading recorded', category: 'engine', status: 'na' },
    ],
  },
  {
    id: 'fuel-cooling',
    title: 'Fuel, Cooling & Exhaust',
    items: [
      { id: 'gf-0', name: 'Fuel level adequate for planned run', category: 'fuel', status: 'na' },
      { id: 'gf-1', name: 'Fuel tank / lines free of leaks', category: 'fuel', status: 'na' },
      { id: 'gf-2', name: 'Coolant level and radiator condition', category: 'cooling', status: 'na' },
      { id: 'gf-3', name: 'Cooling fan / radiator fins clear of debris', category: 'cooling', status: 'na' },
      { id: 'gf-4', name: 'Exhaust system secure; no excessive smoke', category: 'exhaust', status: 'na' },
      { id: 'gf-5', name: 'Battery electrolyte / terminals clean and tight', category: 'electrical', status: 'na' },
    ],
  },
  {
    id: 'electrical-output',
    title: 'Electrical Output & Controls',
    items: [
      { id: 'gel-0', name: 'Control panel indicators / alarms normal', category: 'electrical', status: 'na' },
      { id: 'gel-1', name: 'Voltage / frequency within rated range under load', category: 'electrical', status: 'na' },
      { id: 'gel-2', name: 'ATS / changeover switch (if fitted) status OK', category: 'electrical', status: 'na' },
      { id: 'gel-3', name: 'Emergency stop functional', category: 'safety', status: 'na' },
      { id: 'gel-4', name: 'Grounding / earthing connections secure', category: 'electrical', status: 'na' },
      { id: 'gel-5', name: 'Enclosure / canopy doors and weather seals', category: 'general', status: 'na' },
    ],
  },
  {
    id: 'safety-site',
    title: 'Safety & Site',
    items: [
      { id: 'gs-0', name: 'Fire extinguisher present and charged', category: 'safety', status: 'na' },
      { id: 'gs-1', name: 'Area clear of flammables / adequate ventilation', category: 'safety', status: 'na' },
      { id: 'gs-2', name: 'Spill kit / drip tray available', category: 'safety', status: 'na' },
      { id: 'gs-3', name: 'Warning signs / restricted access observed', category: 'safety', status: 'na' },
      { id: 'gs-4', name: 'Unit clean and free of excessive oil/dirt', category: 'general', status: 'na' },
    ],
  },
];

const MACHINERY_SECTIONS: ChecklistSection[] = [
  {
    id: 'powertrain',
    title: 'Powertrain & Fluids',
    items: [
      { id: 'mp-0', name: 'Engine oil level and condition', category: 'powertrain', status: 'na' },
      { id: 'mp-1', name: 'Hydraulic oil level and condition', category: 'hydraulics', status: 'na' },
      { id: 'mp-2', name: 'Coolant level', category: 'cooling', status: 'na' },
      { id: 'mp-3', name: 'Fuel level / leaks', category: 'fuel', status: 'na' },
      { id: 'mp-4', name: 'Air filter condition', category: 'powertrain', status: 'na' },
      { id: 'mp-5', name: 'Belts, pulleys, and drive couplings', category: 'powertrain', status: 'na' },
      { id: 'mp-6', name: 'Engine hours / service meter recorded', category: 'powertrain', status: 'na' },
    ],
  },
  {
    id: 'hydraulics-structure',
    title: 'Hydraulics, Structure & Undercarriage',
    items: [
      { id: 'mh-0', name: 'Hydraulic hoses, cylinders, and fittings (leaks/damage)', category: 'hydraulics', status: 'na' },
      { id: 'mh-1', name: 'Boom / arm / implement pins and bushings', category: 'structural', status: 'na' },
      { id: 'mh-2', name: 'Bucket / blade / attachment condition and pins', category: 'structural', status: 'na' },
      { id: 'mh-3', name: 'Tracks / tyres / undercarriage wear and tension', category: 'undercarriage', status: 'na' },
      { id: 'mh-4', name: 'Frame, guards, and covers secure', category: 'structural', status: 'na' },
      { id: 'mh-5', name: 'Grease points lubricated as scheduled', category: 'general', status: 'na' },
    ],
  },
  {
    id: 'controls-safety',
    title: 'Controls, Cab & Safety',
    items: [
      { id: 'mc-0', name: 'Operator controls and gauges responsive', category: 'controls', status: 'na' },
      { id: 'mc-1', name: 'Parking brake / lockout functional', category: 'safety', status: 'na' },
      { id: 'mc-2', name: 'Horn, lights, and reverse alarm', category: 'safety', status: 'na' },
      { id: 'mc-3', name: 'ROPS/FOPS / seat belt (if fitted)', category: 'safety', status: 'na' },
      { id: 'mc-4', name: 'Emergency stop / kill switch', category: 'safety', status: 'na' },
      { id: 'mc-5', name: 'Fire extinguisher present', category: 'safety', status: 'na' },
      { id: 'mc-6', name: 'Mirrors / camera / visibility aids', category: 'safety', status: 'na' },
      { id: 'mc-7', name: 'Cab / operator station clean and clear', category: 'general', status: 'na' },
    ],
  },
];

export const DEFAULT_CHECKLIST_BY_CATEGORY: Record<WorkshopAssetCategory, ChecklistSection[]> = {
  vehicle: VEHICLE_SECTIONS,
  generator: GENERATOR_SECTIONS,
  machinery: MACHINERY_SECTIONS,
};

type TemplateSectionRaw = {
  id?: string;
  title?: string;
  items?: Array<{ name?: string; category?: string; id?: string; status?: string; comment?: string }>;
};

/** Build editable checklist sections from a template definition (API or builtin). */
export function instantiateChecklistSections(
  category: WorkshopAssetCategory,
  rawSections?: unknown,
): ChecklistSection[] {
  const source =
    Array.isArray(rawSections) && rawSections.length > 0
      ? (rawSections as TemplateSectionRaw[])
      : DEFAULT_CHECKLIST_BY_CATEGORY[category];

  return source.map((section, sIdx) => {
    const sid = String(section.id || `section-${sIdx}`);
    const items = (section.items || []).map((item, iIdx) => {
      const status = (item.status as ChecklistItemStatus) || 'na';
      return {
        id: String(item.id || `${sid}-${iIdx}`),
        name: String(item.name || `Item ${iIdx + 1}`),
        category: String(item.category || sid),
        status: status === 'ok' || status === 'issue' || status === 'na' ? status : 'na',
        comment: item.comment ? String(item.comment) : undefined,
      } satisfies ChecklistItem;
    });
    return {
      id: sid,
      title: String(section.title || `Section ${sIdx + 1}`),
      items,
    };
  });
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
