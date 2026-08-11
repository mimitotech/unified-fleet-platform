/**
 * Evaluate Wialon sensor parameter expressions against last-message params.
 *
 * Examples (from Hosting sensor config):
 *   Engine_Hours/const3600  → 1787370 / 3600 = 496.49 h
 *   io_29/const10           → 36 / 10 = 3.6 V
 *   pwr_ext                 → 27.868
 *   const100
 */

function coerceNumeric(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(String(raw).replace(/,/g, '').replace(/[^\d.eE+-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function lookupParam(
  name: string,
  params: Record<string, string | number | null | undefined>,
): number | null {
  if (!name) return null;
  if (Object.prototype.hasOwnProperty.call(params, name)) {
    return coerceNumeric(params[name]);
  }
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(params)) {
    if (k.toLowerCase() === lower) return coerceNumeric(v);
  }
  return null;
}

function resolveToken(
  token: string,
  params: Record<string, string | number | null | undefined>,
): number | null {
  const t = token.trim();
  if (!t) return null;
  const constMatch = /^const(-?\d+(?:\.\d+)?)$/i.exec(t);
  if (constMatch) return Number(constMatch[1]);
  // Bare numeric literal (rare in Wialon, but harmless)
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return lookupParam(t, params);
}

/**
 * Left-to-right evaluation of + - * / over Wialon param / constN tokens.
 * Matches how Hosting resolves simple sensor parameter formulas.
 */
export function evaluateWialonParamExpression(
  expr: string | undefined | null,
  params: Record<string, string | number | null | undefined>,
): number | null {
  if (expr == null) return null;
  const cleaned = String(expr).trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  // Fast path: exact / case-insensitive key
  const direct = lookupParam(cleaned, params) ?? lookupParam(String(expr).trim(), params);
  if (direct != null && !/[+\-*/]/.test(cleaned)) return direct;

  const constOnly = /^const(-?\d+(?:\.\d+)?)$/i.exec(cleaned);
  if (constOnly) return Number(constOnly[1]);

  // Tokenize: names (letters/digits/_), constN, operators
  const parts = cleaned.split(/([+\-*/])/);
  if (parts.length === 1) return resolveToken(parts[0], params);
  if (parts.length < 3 || parts.length % 2 === 0) return null;

  let acc = resolveToken(parts[0], params);
  if (acc == null) return null;

  for (let i = 1; i < parts.length - 1; i += 2) {
    const op = parts[i];
    const rhs = resolveToken(parts[i + 1], params);
    if (rhs == null) return null;
    if (op === '+') acc += rhs;
    else if (op === '-') acc -= rhs;
    else if (op === '*') acc *= rhs;
    else if (op === '/') {
      if (rhs === 0) return null;
      acc /= rhs;
    } else return null;
    if (!Number.isFinite(acc)) return null;
  }
  return acc;
}

/** Build a flat param map from lmsg.p and/or prms.v. */
export function collectUnitParamMap(item: {
  lmsg?: { p?: Record<string, unknown>; params?: Record<string, unknown> };
  prms?: Record<string, { v?: unknown } | unknown>;
}): Record<string, string | number | null | undefined> {
  const out: Record<string, string | number | null | undefined> = {};
  const lmsg = item.lmsg?.p || item.lmsg?.params;
  if (lmsg && typeof lmsg === 'object') {
    for (const [k, v] of Object.entries(lmsg)) {
      if (v != null && v !== '') out[k] = v as string | number;
    }
  }
  if (item.prms && typeof item.prms === 'object') {
    for (const [k, entry] of Object.entries(item.prms)) {
      if (out[k] != null) continue;
      if (entry && typeof entry === 'object' && 'v' in (entry as object)) {
        const v = (entry as { v?: unknown }).v;
        if (v != null && v !== '') out[k] = v as string | number;
      } else if (entry != null && typeof entry !== 'object') {
        out[k] = entry as string | number;
      }
    }
  }
  return out;
}

export function roundSensorReading(n: number): number {
  if (!Number.isFinite(n)) return n;
  // Prefer one decimal for typical Hosting display (496.49 → 496.5)
  return Math.round(n * 100) / 100;
}
