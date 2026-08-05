/** Uganda-style plates: UBM 966W, UBJ 336M */
export const UG_PLATE_RE = /^[A-Z]{2,3}\s+[A-Z0-9]{2,8}$/i;

export function extractPlateFromName(name: string): string | undefined {
  const trimmed = name.trim();
  return UG_PLATE_RE.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

/** Site / branch names (generators) — e.g. KAYUNGA PEARL BANK */
export function looksLikeSiteName(name: string): boolean {
  const trimmed = name.trim();
  if (UG_PLATE_RE.test(trimmed)) return false;
  return trimmed.split(/\s+/).length >= 2;
}
