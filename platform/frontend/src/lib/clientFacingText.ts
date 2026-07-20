/**
 * Strip vendor / platform names from copy shown to client portal users.
 * Admin UI may still name integrations explicitly.
 */
export function clientFacingText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/\bWialon\b/gi, '')
    .replace(/\bLocoNav\b/gi, '')
    .replace(/\bTrackSolid(?:\s*Pro)?\b/gi, '')
    .replace(/\bJimilab\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/^[:\-\s]+/, '')
    .trim();
}
