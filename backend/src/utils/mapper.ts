/** Convert snake_case DB row keys to camelCase for API responses. */
export function toCamelCase<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as T;
}

export function toCamelRows<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => toCamelCase<T>(r));
}
