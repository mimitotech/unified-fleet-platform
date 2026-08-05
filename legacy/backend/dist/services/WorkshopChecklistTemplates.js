/**
 * Standard workshop inspection checklists by asset category.
 * Seeded into workshop_checklist_templates and used as API fallback.
 */
export const WORKSHOP_ASSET_CATEGORIES = [
    'vehicle',
    'generator',
    'machinery',
];
export function sanitizeWorkshopAssetCategory(value) {
    const s = String(value ?? '')
        .trim()
        .toLowerCase();
    if (s === 'generator' || s === 'genset' || s === 'gensets')
        return 'generator';
    if (s === 'machinery' || s === 'equipment' || s === 'plant')
        return 'machinery';
    return 'vehicle';
}
const VEHICLE_SECTIONS = [
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
const GENERATOR_SECTIONS = [
    {
        id: 'engine',
        title: 'Engine & Lubrication',
        items: [
            { name: 'Engine oil level and condition', category: 'engine' },
            { name: 'Oil leaks under/around engine', category: 'engine' },
            { name: 'Air filter condition / restriction indicator', category: 'engine' },
            { name: 'Fuel filter / water separator drained', category: 'engine' },
            { name: 'Belts and hoses (cracks, tension, leaks)', category: 'engine' },
            { name: 'Unusual noise / vibration at idle and load', category: 'engine' },
            { name: 'Engine hours meter reading recorded', category: 'engine' },
        ],
    },
    {
        id: 'fuel-cooling',
        title: 'Fuel, Cooling & Exhaust',
        items: [
            { name: 'Fuel level adequate for planned run', category: 'fuel' },
            { name: 'Fuel tank / lines free of leaks', category: 'fuel' },
            { name: 'Coolant level and radiator condition', category: 'cooling' },
            { name: 'Cooling fan / radiator fins clear of debris', category: 'cooling' },
            { name: 'Exhaust system secure; no excessive smoke', category: 'exhaust' },
            { name: 'Battery electrolyte / terminals clean and tight', category: 'electrical' },
        ],
    },
    {
        id: 'electrical-output',
        title: 'Electrical Output & Controls',
        items: [
            { name: 'Control panel indicators / alarms normal', category: 'electrical' },
            { name: 'Voltage / frequency within rated range under load', category: 'electrical' },
            { name: 'ATS / changeover switch (if fitted) status OK', category: 'electrical' },
            { name: 'Emergency stop functional', category: 'safety' },
            { name: 'Grounding / earthing connections secure', category: 'electrical' },
            { name: 'Enclosure / canopy doors and weather seals', category: 'general' },
        ],
    },
    {
        id: 'safety-site',
        title: 'Safety & Site',
        items: [
            { name: 'Fire extinguisher present and charged', category: 'safety' },
            { name: 'Area clear of flammables / adequate ventilation', category: 'safety' },
            { name: 'Spill kit / drip tray available', category: 'safety' },
            { name: 'Warning signs / restricted access observed', category: 'safety' },
            { name: 'Unit clean and free of excessive oil/dirt', category: 'general' },
        ],
    },
];
const MACHINERY_SECTIONS = [
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
export const DEFAULT_CHECKLIST_BY_CATEGORY = {
    vehicle: VEHICLE_SECTIONS,
    generator: GENERATOR_SECTIONS,
    machinery: MACHINERY_SECTIONS,
};
export const TEMPLATE_META = {
    vehicle: {
        name: 'Vehicle pre-delivery / trip inspection',
        description: 'Standard truck / vehicle and trailer safety checklist',
    },
    generator: {
        name: 'Generator pre-start / service inspection',
        description: 'Genset engine, fuel, cooling, electrical output, and site safety',
    },
    machinery: {
        name: 'Machinery pre-use / service inspection',
        description: 'Plant equipment powertrain, hydraulics, structure, and operator safety',
    },
};
/** Common failure systems for breakdown forms by category */
export const FAILURE_SYSTEMS = {
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
