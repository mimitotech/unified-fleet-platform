import crypto from 'crypto';

export type PasswordPolicyResult = {
  ok: boolean;
  errors: string[];
};

// Policy (per user request):
// - at least 8 chars
// - at least one number
// - at least one symbol (non-alphanumeric)
// - at least one lowercase
// - at least one uppercase
const MIN_LEN = 8;
const LOWER_RE = /[a-z]/;
const UPPER_RE = /[A-Z]/;
const DIGIT_RE = /[0-9]/;
const SYMBOL_RE = /[^A-Za-z0-9]/;

export function validateStrongPassword(password: string): PasswordPolicyResult {
  const pw = String(password ?? '');
  const errors: string[] = [];

  if (pw.length < MIN_LEN) errors.push(`Must be at least ${MIN_LEN} characters`);
  if (!LOWER_RE.test(pw)) errors.push('Must include a lowercase letter (a-z)');
  if (!UPPER_RE.test(pw)) errors.push('Must include an uppercase letter (A-Z)');
  if (!DIGIT_RE.test(pw)) errors.push('Must include a number (0-9)');
  if (!SYMBOL_RE.test(pw)) errors.push('Must include a symbol (e.g. !@#$...)');

  return { ok: errors.length === 0, errors };
}

export function assertStrongPassword(password: string): void {
  const r = validateStrongPassword(password);
  if (!r.ok) {
    // Keep message stable for frontend; do not leak anything sensitive.
    throw new Error(r.errors[0] || 'Password does not meet policy');
  }
}

export function generateStrongPassword(opts?: { length?: number }): string {
  const length = Math.max(12, opts?.length ?? 16);

  // Ensure we include each required category at least once.
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^*-_+=?';

  const pick = (alphabet: string) => alphabet[crypto.randomInt(0, alphabet.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];

  // Fill remaining length with a mixed alphabet.
  const all = lower + upper + digits + symbols;
  const remaining = length - required.length;
  const rest = Array.from({ length: remaining }, () => pick(all));

  const chars = [...required, ...rest];
  // Shuffle so required chars are not in fixed positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** One-time sign-in code for forgot-password / emailed credentials (policy-compliant, email-friendly). */
export function generateOneTimePassword(opts?: { length?: number }): string {
  return generateStrongPassword({ length: Math.max(12, opts?.length ?? 12) });
}

