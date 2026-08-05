/**
 * Client-facing formatters for live sensor / parameter readings.
 * Binary digital signals show as OFF/ON instead of 0/1.
 */

const DIGITAL_NAME_RE =
  /ignition|\bign\b|acc\b|engine\s*(?:status|state|operation)?|immobiliser|immobilizer|private\s*mode|door|alarm|panic|buzzer|siren|relay|block|lock|unlock|armed|disarm|power\s*cut|sos|input|output|\bin\d+\b|\bout\d+\b|\bio[_-]|\bdig(?:ital)?\b|boolean|switch|flag|on.?off|gps\s*status|gsm\s*status/i;

const DIGITAL_TYPE_RE =
  /digital|engine.?operation|ignition|private.?mode|alarm|immobili[sz]er|boolean|switch|flag|on.?off/i;

function isBinaryToken(value: unknown): value is '0' | '1' {
  const v = String(value ?? '').trim();
  return v === '0' || v === '1';
}

function looksDigital(nameOrKey: string, type?: string, unit?: string): boolean {
  const blob = `${nameOrKey} ${type || ''}`;
  if (DIGITAL_TYPE_RE.test(blob) || DIGITAL_NAME_RE.test(blob)) return true;
  // Never convert bare 0/1 for unknown keys — fuel/temp/sats can be 0 or 1.
  if (unit && /^(bool|flag|state|on\/?off)$/i.test(unit.trim())) return true;
  return false;
}

/** Map a reading to OFF/ON when it is a digital 0/1; otherwise leave as-is. */
export function formatReadingValue(
  nameOrKey: string,
  value: unknown,
  opts?: { unit?: string; type?: string; unitlessBinary?: boolean },
): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const digital =
    looksDigital(nameOrKey, opts?.type, opts?.unit) ||
    (opts?.unitlessBinary === true && isBinaryToken(raw) && !(opts.unit && opts.unit.trim()));

  if (isBinaryToken(raw) && digital) {
    return raw === '1' ? 'ON' : 'OFF';
  }

  if (opts?.unit && opts.unit.trim() && !raw.endsWith(opts.unit)) {
    return `${raw} ${opts.unit.trim()}`;
  }
  return raw;
}
