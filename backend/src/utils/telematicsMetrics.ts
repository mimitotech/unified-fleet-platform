/** Coerce telematics metric fields that may arrive as numbers or { value: number } objects. */
export function coerceMetricNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return coerceMetricNumber((value as { value: unknown }).value);
  }
  return null;
}
