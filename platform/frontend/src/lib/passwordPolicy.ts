export type PasswordPolicyChecks = {
  minLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
};

export function getPasswordPolicyChecks(password: string): PasswordPolicyChecks {
  const pw = String(password ?? '');
  return {
    minLength: pw.length >= 8,
    hasLower: /[a-z]/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
    hasSymbol: /[^A-Za-z0-9]/.test(pw),
  };
}

export function isStrongPassword(password: string): boolean {
  const c = getPasswordPolicyChecks(password);
  return c.minLength && c.hasLower && c.hasUpper && c.hasNumber && c.hasSymbol;
}

