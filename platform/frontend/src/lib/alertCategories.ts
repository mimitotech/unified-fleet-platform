/** Same Inbox category buckets used on the Alerts page filters. */

export type AlertCategoryDef = {
  id: string;
  label: string;
  match: (type?: string) => boolean;
};

/** Order matters — first match wins (same as Inbox). */
export const ALERT_CATEGORY_DEFS: AlertCategoryDef[] = [
  {
    id: 'safety',
    label: 'Driving',
    match: (t) => !!t && /harsh_|speeding|eco_violation|idling|towing|sos/.test(t),
  },
  { id: 'fuel', label: 'Fuel', match: (t) => !!t && /fuel_/.test(t) },
  {
    id: 'power',
    label: 'Power',
    match: (t) => !!t && /generator|power_cut|power_restore|battery/.test(t),
  },
  { id: 'geofence', label: 'Geofence', match: (t) => t === 'geofence' },
  { id: 'engine', label: 'Engine', match: (t) => !!t && /ignition_/.test(t) },
  {
    id: 'workshop',
    label: 'Workshop',
    match: (t) => !!t && /workshop_/.test(t),
  },
  {
    id: 'sensors',
    label: 'Sensors',
    match: (t) =>
      !!t && /sensor|temperature|door|connection|maintenance/.test(t) && !/workshop_/.test(t),
  },
];

export function categoryOfAlertType(type?: string): string {
  const found = ALERT_CATEGORY_DEFS.find((c) => c.match(type));
  return found ? found.id : 'other';
}

export function categoryLabel(categoryId?: string): string {
  if (!categoryId || categoryId === 'other') return 'Other';
  return ALERT_CATEGORY_DEFS.find((c) => c.id === categoryId)?.label || 'Other';
}

/** Client-facing label for a classified alert type (matches Inbox row badge). */
export function prettyAlertType(type?: string): string {
  if (!type) return 'Fleet event';
  return (
    type
      .replace(/^wialon[_-]?/i, '')
      .replace(/^fleet[_-]?/i, 'fleet ')
      .replace(/_/g, ' ')
      .trim() || 'Fleet event'
  );
}
