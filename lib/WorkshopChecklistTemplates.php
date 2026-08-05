<?php
/**
 * Workshop checklist templates — parity with WorkshopChecklistTemplates.ts
 * Generator = Daily inspection + Monthly preventive maintenance (one form).
 */
final class WorkshopChecklistTemplates
{
    /** @return list<string> */
    public static function categories(): array
    {
        return ['vehicle', 'generator', 'machinery'];
    }

    public static function sanitizeCategory(mixed $value): string
    {
        $s = strtolower(trim((string) $value));
        if (in_array($s, ['generator', 'genset', 'gensets'], true)) {
            return 'generator';
        }
        if (in_array($s, ['machinery', 'equipment', 'plant'], true)) {
            return 'machinery';
        }
        return 'vehicle';
    }

    /** @return list<array{id:string,title:string,items:list<array{name:string,category:string}>}> */
    public static function sectionsFor(string $category): array
    {
        $cat = self::sanitizeCategory($category);
        return match ($cat) {
            'generator' => self::generatorSections(),
            'machinery' => self::machinerySections(),
            default => self::vehicleSections(),
        };
    }

    /** @return array{name:string,description:string,assetCategory:string,sections:list} */
    public static function templateFor(string $category): array
    {
        $cat = self::sanitizeCategory($category);
        $meta = match ($cat) {
            'generator' => [
                'name' => 'Generator inspection',
                'description' => 'Daily inspection and monthly preventive maintenance checklist',
            ],
            'machinery' => [
                'name' => 'Machinery pre-use / service inspection',
                'description' => 'Plant equipment powertrain, hydraulics, structure, and operator safety',
            ],
            default => [
                'name' => 'Vehicle pre-delivery / trip inspection',
                'description' => 'Standard truck / vehicle and trailer safety checklist',
            ],
        };
        return [
            'assetCategory' => $cat,
            'name' => $meta['name'],
            'description' => $meta['description'],
            'sections' => self::sectionsFor($cat),
        ];
    }

    /** @return list<array{assetCategory:string,name:string,description:string,sections:list}> */
    public static function allTemplates(): array
    {
        return array_map(static fn(string $c): array => self::templateFor($c), self::categories());
    }

    /** @return list<array{id:string,title:string,items:list}> */
    private static function vehicleSections(): array
    {
        return [
            [
                'id' => 'truck-head',
                'title' => 'Truck / Vehicle Systems',
                'items' => self::items('truck-head', [
                    'Engine Compartment', 'Radiator Level', 'Brake Fluid Level', 'Power Steering Fluid Level',
                    'Tyres and Wheels', 'Tyre Tread Depth (including spares)', 'Tyre Pressure',
                    'Tyres: Check for visible damage or punctures', 'Hoist Operation',
                    'Headlamps (high and low beams)', 'Brake Lights (front and rear indicators)',
                    'Reverse Lights', 'Reflectors (supplied)', 'Chassis: Check for visible damage or corrosion',
                    'T-Back Visuals', 'Brake Pads and Discs/Drums', 'Suspension System',
                    'Shock Absorbers: check for wear, damage, or leaks', 'Test Steering for smooth operation',
                    'Transmission Fluid Level (if applicable)', 'Differential Oil Level (if applicable)',
                ]),
            ],
            [
                'id' => 'trailer-safety',
                'title' => 'Trailer & Safety',
                'items' => array_merge(
                    self::items('trailer', [
                        'Body and Structure: Check for visible damage or leaks',
                        'Ensure hose connections are secure',
                        'Verify additional equipment is properly stowed and secured',
                        'Fifth Wheel greased and in good condition',
                        'Safety chains properly attached and not dragging',
                        'All side lights (brake lights, turn signals, reflectors)',
                        'Electrical connector secure',
                        'Trailer Tyre Tread Depth (including spare)',
                        'Check for cracked wheels',
                        'Inspect tyres for visible damage or punctures',
                        'Brake system proper operation',
                        'Air/electrical lines',
                        'Trailer frame for damage or corrosion',
                        'Suspension',
                    ]),
                    self::items('safety', ['Fire Extinguisher', 'First Aid Kits', 'Wheel Chocks']),
                    self::items('general', ['Cabin clean (inside and outside)', 'Truck clean']),
                ),
            ],
        ];
    }

    /** @return list<array{id:string,title:string,items:list}> */
    private static function generatorSections(): array
    {
        return [
            [
                'id' => 'daily-ops',
                'title' => 'Daily inspection',
                'items' => self::items('daily', [
                    'Generator control panel operating normally',
                    'No active alarms or fault indications',
                    'Genset running hours recorded',
                    'Fuel level recorded',
                    'Battery voltage recorded',
                    'Number of engine starts recorded',
                    'Engine oil level OK',
                    'Coolant level OK',
                    'No fuel leakage',
                    'No engine oil leakage',
                    'Fuel monitoring system functioning',
                    'Generator room is clean and accessible',
                ]),
            ],
            [
                'id' => 'monthly-pm',
                'title' => 'Monthly preventive maintenance',
                'items' => self::items('monthly', [
                    'Check generator control panel for alarms and fault indications',
                    'Test automatic start and stop (AMF) operation',
                    'Check engine oil level and condition',
                    'Check coolant level and condition',
                    'Inspect radiator and cooling fan',
                    'Inspect fuel tank condition',
                    'Inspect fuel lines, hoses, and fittings for leaks',
                    'Record fuel level',
                    'Check battery voltage and condition',
                    'Clean battery terminals and apply protection if required',
                    'Verify battery charger operation',
                    'Inspect alternator condition',
                    'Inspect electrical terminal connections and tighten if necessary',
                    'Inspect engine belts for wear and correct tension',
                    'Inspect coolant hoses and clamps for damage or leaks',
                    'Inspect the exhaust system for leaks or damage',
                    'Check engine mountings and supports',
                    'Tighten loose bolts, nuts, and fasteners where necessary',
                    'Verify instrument panel/dashboard indicators are functioning correctly',
                    'Record generator running hours',
                    'Check for abnormal noise or excessive vibration during operation',
                    'Clean the generator exterior and surrounding area',
                    'Remove any oil, fuel, or coolant spills',
                    'Inspect and secure fuel tank covers / reservoirs',
                    'Ensure all generator access doors are locked after inspection',
                ]),
            ],
        ];
    }

    /** @return list<array{id:string,title:string,items:list}> */
    private static function machinerySections(): array
    {
        return [
            [
                'id' => 'powertrain',
                'title' => 'Powertrain & Fluids',
                'items' => self::items('powertrain', [
                    'Engine oil level and condition', 'Hydraulic oil level and condition', 'Coolant level',
                    'Fuel level / leaks', 'Air filter condition', 'Belts, pulleys, and drive couplings',
                    'Engine hours / service meter recorded',
                ]),
            ],
            [
                'id' => 'hydraulics-structure',
                'title' => 'Hydraulics, Structure & Undercarriage',
                'items' => array_merge(
                    self::items('hydraulics', ['Hydraulic hoses, cylinders, and fittings (leaks/damage)']),
                    self::items('structural', [
                        'Boom / arm / implement pins and bushings',
                        'Bucket / blade / attachment condition and pins',
                        'Frame, guards, and covers secure',
                    ]),
                    self::items('undercarriage', ['Tracks / tyres / undercarriage wear and tension']),
                    self::items('general', ['Grease points lubricated as scheduled']),
                ),
            ],
            [
                'id' => 'controls-safety',
                'title' => 'Controls, Cab & Safety',
                'items' => array_merge(
                    self::items('controls', ['Operator controls and gauges responsive']),
                    self::items('safety', [
                        'Parking brake / lockout functional', 'Horn, lights, and reverse alarm',
                        'ROPS/FOPS / seat belt (if fitted)', 'Emergency stop / kill switch',
                        'Fire extinguisher present', 'Mirrors / camera / visibility aids',
                    ]),
                    self::items('general', ['Cab / operator station clean and clear']),
                ),
            ],
        ];
    }

    /**
     * @param list<string> $names
     * @return list<array{name:string,category:string}>
     */
    private static function items(string $category, array $names): array
    {
        $out = [];
        foreach ($names as $name) {
            $out[] = ['name' => $name, 'category' => $category];
        }
        return $out;
    }
}
