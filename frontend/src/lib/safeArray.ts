/** Coerce unknown API values to arrays — prevents `.length` / `.map` crashes. */
export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}
